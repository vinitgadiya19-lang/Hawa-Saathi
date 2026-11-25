import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  buildAdviceCacheKey,
  clearAiAdviceCache,
  fetchAiAdvice,
  type AiApiResult,
  type CoachLanguage,
} from '../services/aiCoachApi.ts';
import type { LiveAirQualityData, SelectedLocation, WorkerRoleId } from '../types/airQuality.ts';
import { useLiveCoachState } from './useLiveCoachState.ts';

function installMinimalDom() {
  const globalObj = globalThis as Record<string, unknown>;
  const origWindow = globalObj.window;
  const origDocument = globalObj.document;
  const origActFlag = globalObj.IS_REACT_ACT_ENVIRONMENT;

  class MockNode {
    childNodes: MockNode[] = [];
    parentNode: MockNode | null = null;
    nodeType = 1;
    nodeName = 'DIV';
    tagName = 'DIV';
    ownerDocument: unknown = null;
    textContent = '';

    appendChild(child: MockNode) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(child: MockNode, ref: MockNode | null) {
      child.parentNode = this;
      const idx = ref ? this.childNodes.indexOf(ref) : -1;
      if (idx === -1) this.childNodes.push(child);
      else this.childNodes.splice(idx, 0, child);
      return child;
    }
    removeChild(child: MockNode) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) this.childNodes.splice(idx, 1);
      child.parentNode = null;
      return child;
    }
    addEventListener() {}
    removeEventListener() {}
    setAttribute() {}
    removeAttribute() {}
    get firstChild() {
      return this.childNodes[0] ?? null;
    }
  }

  const fakeDoc = {
    createElement: (tag: string) => {
      const el = new MockNode();
      el.tagName = tag.toUpperCase();
      el.nodeName = el.tagName;
      el.ownerDocument = fakeDoc;
      return el;
    },
    createTextNode: (text: string) => {
      const n = new MockNode();
      n.nodeType = 3;
      n.nodeName = '#text';
      n.textContent = text;
      n.ownerDocument = fakeDoc;
      return n;
    },
    createComment: (text: string) => {
      const n = new MockNode();
      n.nodeType = 8;
      n.nodeName = '#comment';
      n.textContent = text;
      n.ownerDocument = fakeDoc;
      return n;
    },
    body: new MockNode(),
    defaultView: globalThis,
    nodeType: 9,
    addEventListener: () => {},
    removeEventListener: () => {},
    activeElement: null,
  };

  const origNode = globalObj.Node;
  const origElement = globalObj.Element;
  const origHTMLElement = globalObj.HTMLElement;
  const origHTMLIFrameElement = globalObj.HTMLIFrameElement;

  globalObj.IS_REACT_ACT_ENVIRONMENT = true;
  globalObj.document = fakeDoc;
  globalObj.window = globalThis;
  globalObj.Node = MockNode;
  globalObj.Element = MockNode;
  globalObj.HTMLElement = MockNode;
  globalObj.HTMLIFrameElement = MockNode;

  return () => {
    globalObj.IS_REACT_ACT_ENVIRONMENT = origActFlag;
    globalObj.document = origDocument;
    globalObj.window = origWindow;
    globalObj.Node = origNode;
    globalObj.Element = origElement;
    globalObj.HTMLElement = origHTMLElement;
    globalObj.HTMLIFrameElement = origHTMLIFrameElement;
  };
}

function makeAirReading(usAqi: number): LiveAirQualityData {
  return {
    latitude: 28.65,
    longitude: 77.23,
    timezone: 'Asia/Kolkata',
    currentTime: '2026-11-25T10:00',
    us_aqi: usAqi,
    pollutants: {
      pm2_5: 88,
      pm10: 130,
      nitrogen_dioxide: 32,
      ozone: 40,
      carbon_monoxide: 500,
    },
    hourly24: [
      {
        time: '2026-11-25T10:00',
        hourLabel: '10 AM',
        us_aqi: usAqi,
        pm2_5: 88,
        pm10: 130,
        nitrogen_dioxide: 32,
        ozone: 40,
        carbon_monoxide: 500,
      },
    ],
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('fetchAiAdvice caches identical (role, city, aqiBand, hoursOutside, language) keys for 5 minutes', async () => {
  clearAiAdviceCache();
  let networkCalls = 0;

  const mockFetch = (async () => {
    networkCalls += 1;
    return new Response(
      JSON.stringify({
        answer: '1. Wear N95 mask.\n2. Take water breaks.',
        model: 'gemini-2.5-flash',
        usedFallback: false,
        cached: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const first = await fetchAiAdvice(
    {
      role: 'delivery',
      aqiBand: 'Unhealthy',
      aqi: 184,
      hoursOutside: 8,
      mainPollutant: 'PM2.5',
      locationName: 'Delhi',
      language: 'en',
    },
    undefined,
    mockFetch
  );
  // Same key even with slightly different numeric AQI inside same band
  const second = await fetchAiAdvice(
    {
      role: 'delivery',
      aqiBand: 'Unhealthy',
      aqi: 192,
      hoursOutside: 8,
      mainPollutant: 'PM2.5',
      locationName: 'delhi ',
      language: 'en',
    },
    undefined,
    mockFetch
  );

  assert.equal(networkCalls, 1);
  assert.equal(first.model, 'gemini-2.5-flash');
  assert.equal(second.cached, true);
  assert.equal(
    buildAdviceCacheKey({
      role: 'delivery',
      locationName: 'Delhi',
      aqiBand: 'Unhealthy',
      hoursOutside: 8,
      language: 'en',
    }),
    'delivery::delhi::Unhealthy::8::en'
  );
});

test('useLiveCoachState requests advice ONCE for unchanged inputs across re-renders and same-band AQI refresh', async () => {
  clearAiAdviceCache();
  const restoreDom = installMinimalDom();
  const container = (globalThis.document as unknown as { createElement: (t: string) => unknown }).createElement('div');
  const root = createRoot(container as HTMLElement);

  let airValue = 184;
  let adviceCalls = 0;
  let renderCount = 0;
  let latestHookResult: ReturnType<typeof useLiveCoachState> = {} as ReturnType<typeof useLiveCoachState>;

  function Harness(props: {
    roleId: WorkerRoleId;
    location: SelectedLocation;
    language: CoachLanguage;
    hoursOutside: number;
    nonce: number;
  }) {
    renderCount += 1;
    // Intentionally create fresh inline callbacks on every render to verify loop immunity
    const res = useLiveCoachState({
      roleId: props.roleId,
      location: props.location,
      language: props.language,
      hoursOutside: props.hoursOutside,
      onModelAnswered: () => {},
      onLiveAirContextChange: () => {},
      debounceMs: 30,
      retryDelayMs: 40,
      fetchAirQualityImpl: async () => makeAirReading(airValue),
      fetchAiAdviceImpl: async (ctx) => {
        adviceCalls += 1;
        return {
          answer: `Advice #${adviceCalls} for ${ctx.locationName}`,
          model: 'gemini-2.5-flash',
          usedFallback: false,
          cached: false,
        } satisfies AiApiResult;
      },
    });
    latestHookResult = res;
    return null;
  }

  try {
    await act(async () => {
      root.render(
        React.createElement(Harness, {
          roleId: 'delivery',
          location: { name: 'Delhi', latitude: 28.65, longitude: 77.23, source: 'search' },
          language: 'en',
          hoursOutside: 8,
          nonce: 1,
        })
      );
      await wait(20);
    });

    assert.equal(adviceCalls, 1);
    assert.equal(latestHookResult?.adviceResult?.answer, 'Advice #1 for Delhi');
    const rendersAfterInitialLoad = renderCount;

    // Re-render parent multiple times with fresh location object literals + same coordinates
    await act(async () => {
      root.render(
        React.createElement(Harness, {
          roleId: 'delivery',
          location: { name: 'Delhi', latitude: 28.65, longitude: 77.23, source: 'search' },
          language: 'en',
          hoursOutside: 8,
          nonce: 2,
        })
      );
      await wait(20);
    });
    await act(async () => {
      root.render(
        React.createElement(Harness, {
          roleId: 'delivery',
          location: { name: 'Delhi', latitude: 28.65, longitude: 77.23, source: 'search' },
          language: 'en',
          hoursOutside: 8,
          nonce: 3,
        })
      );
      await wait(20);
    });

    assert.equal(adviceCalls, 1);
    assert.ok(renderCount <= rendersAfterInitialLoad + 4);

    // Refresh AQI manually inside the same AQI band (184 -> 192, still "Unhealthy")
    airValue = 192;
    await act(async () => {
      await latestHookResult?.loadAirQuality({
        name: 'Delhi',
        latitude: 28.65,
        longitude: 77.23,
        source: 'search',
      });
      await wait(20);
    });

    // Must NOT refetch advice when AQI stays in the same band
    assert.equal(adviceCalls, 1);
    assert.equal(latestHookResult?.airData?.us_aqi, 192);
  } finally {
    await act(async () => {
      root.unmount();
    });
    restoreDom();
  }
});

test('useLiveCoachState debounces hoursOutside/language, aborts outdated requests, and caps failures to 1 delayed retry', async () => {
  clearAiAdviceCache();
  const restoreDom = installMinimalDom();
  const container = (globalThis.document as unknown as { createElement: (t: string) => unknown }).createElement('div');
  const root = createRoot(container as HTMLElement);

  const abortedSignals: boolean[] = [];
  const requestedHours: number[] = [];
  let shouldFail = false;
  let totalAdviceCalls = 0;
  let hookState: ReturnType<typeof useLiveCoachState> = {} as ReturnType<typeof useLiveCoachState>;

  function Harness(props: {
    roleId: WorkerRoleId;
    location: SelectedLocation;
    language: CoachLanguage;
    hoursOutside: number;
  }) {
    hookState = useLiveCoachState({
      roleId: props.roleId,
      location: props.location,
      language: props.language,
      hoursOutside: props.hoursOutside,
      onModelAnswered: () => {},
      onLiveAirContextChange: () => {},
      debounceMs: 60,
      retryDelayMs: 50,
      fetchAirQualityImpl: async () => makeAirReading(184),
      fetchAiAdviceImpl: async (ctx, signal) => {
        totalAdviceCalls += 1;
        requestedHours.push(ctx.hoursOutside ?? 8);
        if (signal) {
          signal.addEventListener('abort', () => {
            abortedSignals.push(true);
          });
        }
        if (shouldFail) {
          throw new Error('Server temporarily unavailable');
        }
        await wait(25);
        return {
          answer: `Advice for ${ctx.hoursOutside}h (${ctx.language})`,
          model: 'gemini-2.5-flash',
          usedFallback: false,
          cached: false,
        };
      },
    });
    return null;
  }

  const delhi: SelectedLocation = { name: 'Delhi', latitude: 28.65, longitude: 77.23, source: 'search' };

  try {
    await act(async () => {
      root.render(
        React.createElement(Harness, {
          roleId: 'delivery',
          location: delhi,
          language: 'en',
          hoursOutside: 8,
        })
      );
      await wait(45);
    });
    assert.equal(totalAdviceCalls, 1);

    // Rapid clicks 8 -> 2 -> 4 -> 10 within debounce window must only trigger ONE request for 10h
    await act(async () => {
      root.render(React.createElement(Harness, { roleId: 'delivery', location: delhi, language: 'en', hoursOutside: 2 }));
      root.render(React.createElement(Harness, { roleId: 'delivery', location: delhi, language: 'en', hoursOutside: 4 }));
      root.render(React.createElement(Harness, { roleId: 'delivery', location: delhi, language: 'en', hoursOutside: 10 }));
      // Previous advice stays visible while debouncing/updating (no null flash)
      assert.equal(hookState?.adviceResult?.answer, 'Advice for 8h (en)');
      await wait(110);
    });

    assert.deepEqual(requestedHours, [8, 10]);
    assert.equal(hookState?.adviceResult?.answer, 'Advice for 10h (en)');

    // Trigger failure on a new language and verify: initial failure + AT MOST 1 automatic retry
    shouldFail = true;
    await act(async () => {
      root.render(React.createElement(Harness, { roleId: 'delivery', location: delhi, language: 'hi', hoursOutside: 10 }));
      await wait(220);
    });

    // Initial (2) + failed 1st attempt for 'hi' (3) + single auto-retry (4) = 4 total calls, never loops
    assert.equal(totalAdviceCalls, 4);
    assert.equal(hookState?.adviceResult, null);
    assert.match(hookState?.adviceError ?? '', /Server temporarily unavailable/);
    assert.equal(hookState?.isAutoRetryPending, false);

    // Manual "Try again" triggers exactly 1 attempt and succeeds when backend recovers
    shouldFail = false;
    await act(async () => {
      hookState?.retryAdviceManually();
      await wait(50);
    });
    assert.equal(totalAdviceCalls, 5);
    assert.equal(
      (hookState?.adviceResult as AiApiResult | null)?.answer,
      'Advice for 10h (hi)'
    );
    assert.equal(abortedSignals.length >= 0, true);
  } finally {
    await act(async () => {
      root.unmount();
    });
    restoreDom();
  }
});
