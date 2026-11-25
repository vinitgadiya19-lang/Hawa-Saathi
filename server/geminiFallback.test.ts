import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeminiFallbackRunner,
  DEFAULT_GEMINI_MODELS,
  GeminiClientError,
  getConfiguredModels,
  sanitizeSecretText,
} from './geminiFallback.ts';

test('getConfiguredModels reads GEMINI_MODELS env var and defaults to 3 Flash-class models', () => {
  assert.deepEqual(getConfiguredModels({}), [...DEFAULT_GEMINI_MODELS]);
  assert.equal(DEFAULT_GEMINI_MODELS.length, 3);

  assert.deepEqual(
    getConfiguredModels({ GEMINI_MODELS: 'model-a, model-b , model-c' }),
    ['model-a', 'model-b', 'model-c']
  );
});

test('retries on HTTP 429 from first model and succeeds on second model', async () => {
  const calledModels: string[] = [];
  const runner = createGeminiFallbackRunner({
    env: {
      GEMINI_API_KEY: 'test-key-value',
      GEMINI_MODELS: 'model-a,model-b,model-c',
    },
    logger: { warn: () => {}, error: () => {} },
    invokeModel: async ({ model }) => {
      calledModels.push(model);
      if (model === 'model-a') {
        const err = new Error('RESOURCE_EXHAUSTED: 429 quota exceeded') as Error & {
          status: number;
        };
        err.status = 429;
        throw err;
      }
      return 'Wear an N95 mask at busy intersections.';
    },
  });

  const result = await runner.execute({
    feature: 'advice',
    role: 'delivery',
    aqiBand: 'Unhealthy',
    aqi: 172,
    mainPollutant: 'PM2.5',
    language: 'en',
    question: 'advice',
    systemInstruction: 'sys',
    prompt: 'prompt',
  });

  assert.deepEqual(calledModels, ['model-a', 'model-b']);
  assert.equal(result.model, 'model-b');
  assert.equal(result.usedFallback, false);
  assert.equal(result.cached, false);
  assert.equal(result.answer, 'Wear an N95 mask at busy intersections.');
});

test('marks 429 model as cooling down for 60 seconds and skips it on subsequent requests', async () => {
  let fakeNow = 1_000_000;
  const calledModels: string[] = [];

  const runner = createGeminiFallbackRunner({
    env: {
      GEMINI_API_KEY: 'test-key-value',
      GEMINI_MODELS: 'model-a,model-b,model-c',
    },
    now: () => fakeNow,
    cooldownMs: 60_000,
    logger: { warn: () => {}, error: () => {} },
    invokeModel: async ({ model }) => {
      calledModels.push(model);
      if (model === 'model-a' && fakeNow < 1_060_000) {
        const err = new Error('429 rate limit') as Error & { status: number };
        err.status = 429;
        throw err;
      }
      return `Answer from ${model}`;
    },
  });

  // Request 1 hits model-a (429), falls back to model-b
  const r1 = await runner.execute({
    feature: 'chat',
    role: 'driver',
    aqiBand: 'Moderate',
    language: 'en',
    question: 'Question 1',
    systemInstruction: 'sys',
    prompt: 'p1',
  });
  assert.equal(r1.model, 'model-b');
  assert.deepEqual(calledModels, ['model-a', 'model-b']);

  // Request 2 (30s later) should skip model-a completely
  fakeNow += 30_000;
  const r2 = await runner.execute({
    feature: 'chat',
    role: 'driver',
    aqiBand: 'Moderate',
    language: 'en',
    question: 'Question 2',
    systemInstruction: 'sys',
    prompt: 'p2',
  });
  assert.equal(r2.model, 'model-b');
  assert.deepEqual(calledModels, ['model-a', 'model-b', 'model-b']);

  // Request 3 (after 60s cooldown expires) tries model-a again and succeeds
  fakeNow += 31_000;
  const r3 = await runner.execute({
    feature: 'chat',
    role: 'driver',
    aqiBand: 'Moderate',
    language: 'en',
    question: 'Question 3',
    systemInstruction: 'sys',
    prompt: 'p3',
  });
  assert.equal(r3.model, 'model-a');
  assert.deepEqual(calledModels, ['model-a', 'model-b', 'model-b', 'model-a']);
});

test('retries on 503, 500, and timeout >15s, and returns rule-based fallback if all models fail', async () => {
  const calledModels: string[] = [];
  const runner = createGeminiFallbackRunner({
    env: {
      GEMINI_API_KEY: 'test-key-value',
      GEMINI_MODELS: 'model-a,model-b,model-c',
    },
    timeoutMs: 25,
    logger: { warn: () => {}, error: () => {} },
    invokeModel: async ({ model }) => {
      calledModels.push(model);
      if (model === 'model-a') {
        const err = new Error('503 overloaded') as Error & { status: number };
        err.status = 503;
        throw err;
      }
      if (model === 'model-b') {
        // Simulate hung request exceeding timeout
        await new Promise((resolve) => setTimeout(resolve, 60));
        return 'Too late';
      }
      const err = new Error('500 internal error') as Error & { status: number };
      err.status = 500;
      throw err;
    },
  });

  const result = await runner.execute({
    feature: 'shift_plan',
    role: 'vendor',
    aqiBand: 'Unhealthy',
    aqi: 185,
    mainPollutant: 'PM2.5',
    language: 'en',
    question: 'shift plan',
    hourly24: [
      { hourLabel: 'Now', us_aqi: 185 },
      { hourLabel: '2 PM', us_aqi: 110 },
      { hourLabel: '8 PM', us_aqi: 210 },
    ],
    systemInstruction: 'sys',
    prompt: 'prompt',
  });

  assert.deepEqual(calledModels, ['model-a', 'model-b', 'model-c']);
  assert.equal(result.usedFallback, true);
  assert.equal(result.model, 'rule-based-fallback');
  assert.match(result.answer, /Cleanest window/i);
  assert.match(result.answer, /2 PM/);
});

test('does not retry on 400 or 401 errors and throws GeminiClientError without leaking API key', async () => {
  const loggedErrors: string[] = [];
  const calledModels: string[] = [];
  const secretKey = 'AIzaSyTestSecretKey1234567890';

  const runner = createGeminiFallbackRunner({
    env: {
      GEMINI_API_KEY: secretKey,
      GEMINI_MODELS: 'model-a,model-b,model-c',
    },
    logger: {
      warn: () => {},
      error: (msg: string) => loggedErrors.push(msg),
    },
    invokeModel: async ({ model }) => {
      calledModels.push(model);
      const err = new Error(
        `401 UNAUTHENTICATED: invalid key ${secretKey}`
      ) as Error & { status: number };
      err.status = 401;
      throw err;
    },
  });

  await assert.rejects(
    () =>
      runner.execute({
        feature: 'chat',
        role: 'police',
        aqiBand: 'Good',
        language: 'en',
        question: 'Can I skip mask today?',
        systemInstruction: 'sys',
        prompt: 'prompt',
      }),
    (err: unknown) => {
      assert.ok(err instanceof GeminiClientError);
      assert.equal(err.statusCode, 401);
      assert.ok(!err.message.includes(secretKey));
      return true;
    }
  );

  // Confirmed no retry on model-b or model-c
  assert.deepEqual(calledModels, ['model-a']);
  assert.equal(loggedErrors.length, 1);
  assert.ok(!loggedErrors[0].includes(secretKey));
  assert.ok(!sanitizeSecretText(secretKey, secretKey).includes(secretKey));
});

test('caches identical requests (role, AQI band, language, question) for 5 minutes', async () => {
  let fakeNow = 500_000;
  let invokeCount = 0;

  const runner = createGeminiFallbackRunner({
    env: {
      GEMINI_API_KEY: 'test-key-value',
      GEMINI_MODELS: 'model-a,model-b',
    },
    now: () => fakeNow,
    cacheTtlMs: 5 * 60_000,
    logger: { warn: () => {}, error: () => {} },
    invokeModel: async ({ model }) => {
      invokeCount += 1;
      return `Live response #${invokeCount} from ${model}`;
    },
  });

  const baseReq = {
    feature: 'chat' as const,
    role: 'delivery',
    aqiBand: 'Moderate',
    language: 'hinglish' as const,
    question: 'Kya kapde ka mask chalega?',
    systemInstruction: 'sys',
    prompt: 'prompt',
  };

  const first = await runner.execute(baseReq);
  assert.equal(first.cached, false);
  assert.equal(invokeCount, 1);

  // 2 minutes later -> served from cache
  fakeNow += 2 * 60_000;
  const second = await runner.execute(baseReq);
  assert.equal(second.cached, true);
  assert.equal(second.answer, first.answer);
  assert.equal(second.model, first.model);
  assert.equal(invokeCount, 1);

  // Different language -> new call
  const diffLang = await runner.execute({ ...baseReq, language: 'hi' });
  assert.equal(diffLang.cached, false);
  assert.equal(invokeCount, 2);

  // After 5 minutes TTL expires -> fresh call
  fakeNow += 4 * 60_000;
  const expired = await runner.execute(baseReq);
  assert.equal(expired.cached, false);
  assert.equal(invokeCount, 3);
});

test('coalesces concurrent identical requests and logs handled 429 retries via info instead of stderr', async () => {
  const infoLogs: string[] = [];
  const warnLogs: string[] = [];
  const errorLogs: string[] = [];
  let invokeCount = 0;

  const runner = createGeminiFallbackRunner({
    env: {
      GEMINI_API_KEY: 'test-key-value',
      GEMINI_MODELS: 'model-a,model-b',
    },
    logger: {
      info: (msg: string) => infoLogs.push(msg),
      warn: (msg: string) => warnLogs.push(msg),
      error: (msg: string) => errorLogs.push(msg),
    },
    invokeModel: async ({ model }) => {
      invokeCount += 1;
      if (model === 'model-a') {
        const err = new Error('429 quota exceeded') as Error & { status: number };
        err.status = 429;
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return '1. Wear an N95 mask on busy roads.';
    },
  });

  const req = {
    feature: 'advice' as const,
    role: 'delivery',
    aqiBand: 'Moderate',
    hoursOutside: 8,
    language: 'en' as const,
    question: 'advice:delivery:Moderate:8',
    systemInstruction: 'sys',
    prompt: 'prompt',
  };

  const [first, second] = await Promise.all([
    runner.execute(req),
    runner.execute(req),
  ]);

  assert.equal(first.model, 'model-b');
  assert.equal(second.model, 'model-b');
  assert.equal(first.answer, second.answer);
  // 1 call to model-a (429) + 1 call to model-b (success) shared across both callers
  assert.equal(invokeCount, 2);
  assert.equal(infoLogs.length, 1);
  assert.equal(warnLogs.length, 0);
  assert.equal(errorLogs.length, 0);
});

