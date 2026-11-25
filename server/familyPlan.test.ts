import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuleBasedFamilyPlan,
  generateFamilyPlanWithFallback,
  validateAndGroundGeminiFamilyPlan,
  type FamilyPlanRequestPayload,
} from './familyPlan.ts';
import {
  calculateFamilyImpact,
  createSampleFamilyState,
} from '../src/services/familyPlanCalc.ts';
import type { HourlyAirQualityPoint } from '../src/types/airQuality.ts';

function makeHourlyPoint(
  time: string,
  hourLabel: string,
  us_aqi: number,
  pm2_5: number
): HourlyAirQualityPoint {
  return {
    time,
    hourLabel,
    us_aqi,
    pm2_5,
    pm10: null,
    nitrogen_dioxide: null,
    ozone: null,
    carbon_monoxide: null,
  };
}

function makePayload(language: 'en' | 'hi' | 'mr' = 'en'): FamilyPlanRequestPayload {
  const sample = createSampleFamilyState();
  const hourly24: HourlyAirQualityPoint[] = [
    makeHourlyPoint('2026-11-25T06:00', '6 AM', 48, 12),
    makeHourlyPoint('2026-11-25T08:00', '8 AM', 160, 70),
    makeHourlyPoint('2026-11-25T18:00', '6 PM', 175, 80),
  ];
  const summary = calculateFamilyImpact({
    members: sample.members,
    trips: sample.trips,
    home: sample.home,
    hourly24,
    liveAqi: 160,
  });

  return {
    language,
    cityName: 'Delhi',
    aqi: 160,
    aqiBand: 'Unhealthy',
    home: sample.home,
    summary,
  };
}

test('validateAndGroundGeminiFamilyPlan rejects invented savings and snaps to deterministic values', () => {
  const payload = makePayload('en');
  const scenario = payload.summary.scenarios.find((s) => s.id === 'switch_to_metro_or_bus')!;

  const fakeGeminiJson = JSON.stringify({
    steps: [
      {
        scenarioId: 'switch_to_metro_or_bus',
        change: 'Take Metro to office',
        whoBenefits: 'Priya',
        effort: 'medium',
        cost: 'low',
        // Attempted hallucinated numbers that must be ignored:
        co2SavedKg: 9999,
        exposureSaved: 88888,
      },
    ],
    summarySentences:
      'Your family produces 21.8 kg CO2 weekly. Switching Priya to metro helps right away. Start with one metro day.',
  });

  const grounded = validateAndGroundGeminiFamilyPlan(fakeGeminiJson, payload);
  assert.ok(grounded);
  assert.equal(grounded.steps.length, 5);
  assert.equal(grounded.steps[0].scenarioId, 'switch_to_metro_or_bus');
  assert.equal(grounded.steps[0].co2SavedKg, scenario.co2SavedKg);
  assert.equal(grounded.steps[0].exposureSaved, scenario.exposureSaved);
});

test('generateFamilyPlanWithFallback uses rule-based plan when Gemini hits quota/fallback', async () => {
  const payload = makePayload('hi');

  const res = await generateFamilyPlanWithFallback(payload, async () => ({
    answer: 'fallback text',
    model: 'rule-based-fallback',
    usedFallback: true,
    cached: false,
    attempts: [],
  }));

  assert.equal(res.usedFallback, true);
  assert.equal(res.model, 'rule-based-fallback');
  assert.equal(res.steps.length, 5);
  assert.ok(res.summarySentences.includes('CO2'));
  assert.ok(res.summarySentences.includes('किग्रा'));
});

test('generateFamilyPlanWithFallback falls back safely on malformed JSON from Gemini', async () => {
  const payload = makePayload('mr');

  const res = await generateFamilyPlanWithFallback(payload, async () => ({
    answer: 'not valid json {{{',
    model: 'gemini-3.5-flash',
    usedFallback: false,
    cached: false,
    attempts: [],
  }));

  assert.equal(res.usedFallback, true);
  assert.equal(res.model, 'rule-based-fallback');
  assert.equal(res.steps.length, 5);
  assert.ok(res.summarySentences.includes('किलो'));
});

test('buildRuleBasedFamilyPlan always returns 5 ranked steps', () => {
  const payload = makePayload('en');
  const plan = buildRuleBasedFamilyPlan(payload);
  assert.equal(plan.steps.length, 5);
  assert.equal(plan.steps[0].rank, 1);
  assert.equal(plan.steps[4].rank, 5);
});
