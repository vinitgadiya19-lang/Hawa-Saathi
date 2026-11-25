import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearOpenMeteoCache,
  fetchAirQuality,
  searchCities,
} from './openMeteo.ts';

test('fetchAirQuality rejects invalid coordinates without calling fetch', async () => {
  clearOpenMeteoCache();
  let calls = 0;
  const mockFetch = (async () => {
    calls += 1;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  await assert.rejects(
    () => fetchAirQuality(95, 77.2, undefined, mockFetch),
    /Invalid coordinates/
  );
  await assert.rejects(
    () => fetchAirQuality(28.6, 185, undefined, mockFetch),
    /Invalid coordinates/
  );
  assert.equal(calls, 0);
});

test('fetchAirQuality surfaces HTTP 503 failure honestly', async () => {
  clearOpenMeteoCache();
  const mockFetch = (async () =>
    new Response('Service Unavailable', { status: 503 })) as typeof fetch;

  await assert.rejects(
    () => fetchAirQuality(28.65, 77.23, undefined, mockFetch),
    /status 503/
  );
});

test('fetchAirQuality surfaces network error honestly', async () => {
  clearOpenMeteoCache();
  const mockFetch = (async () => {
    throw new TypeError('Network unreachable');
  }) as typeof fetch;

  await assert.rejects(
    () => fetchAirQuality(28.65, 77.23, undefined, mockFetch),
    /Network unreachable/
  );
});

test('fetchAirQuality rejects incomplete reading missing us_aqi', async () => {
  clearOpenMeteoCache();
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        latitude: 28.65,
        longitude: 77.23,
        current: { time: '2026-11-24T12:00', pm2_5: 42 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  await assert.rejects(
    () => fetchAirQuality(28.65, 77.23, undefined, mockFetch),
    /Incomplete live air quality reading/
  );
});

test('fetchAirQuality caches repeated lookups for same coordinates', async () => {
  clearOpenMeteoCache();
  let calls = 0;
  const payload = {
    latitude: 28.65,
    longitude: 77.23,
    timezone: 'Asia/Kolkata',
    current: {
      time: '2026-11-24T12:00',
      us_aqi: 184,
      pm2_5: 92.4,
      pm10: 140.1,
      nitrogen_dioxide: 35,
      ozone: 42,
      carbon_monoxide: 550,
    },
    hourly: {
      time: ['2026-11-24T12:00', '2026-11-24T13:00'],
      us_aqi: [184, 170],
      pm2_5: [92.4, 80.0],
      pm10: [140.1, 120.0],
      nitrogen_dioxide: [35, 30],
      ozone: [42, 48],
      carbon_monoxide: [550, 500],
    },
  };

  const mockFetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const first = await fetchAirQuality(28.6512, 77.2314, undefined, mockFetch);
  const second = await fetchAirQuality(28.6514, 77.2311, undefined, mockFetch);

  assert.equal(calls, 1);
  assert.equal(first.us_aqi, 184);
  assert.equal(second.us_aqi, 184);
  assert.equal(first.hourly24.length, 2);
});

test('searchCities handles short queries, empty results, API failures, and caches hits', async () => {
  clearOpenMeteoCache();
  let calls = 0;
  const failingFetch = (async () =>
    new Response('Bad Gateway', { status: 502 })) as typeof fetch;

  const shortResult = await searchCities('a', undefined, failingFetch);
  assert.deepEqual(shortResult, []);

  await assert.rejects(
    () => searchCities('Delhi', undefined, failingFetch),
    /City search failed/
  );

  const emptyFetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const empty = await searchCities('NowhereCity', undefined, emptyFetch);
  assert.deepEqual(empty, []);
  // Cached empty result avoids duplicate API call
  const cachedEmpty = await searchCities('nowherecity', undefined, emptyFetch);
  assert.deepEqual(cachedEmpty, []);
  assert.equal(calls, 1);
});
