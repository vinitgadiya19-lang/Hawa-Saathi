import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTailoredIndoorHacks,
  calculateCadrRecommendation,
  calculateFamilyImpact,
  computeCombinedImpactAfterSteps,
  createSampleFamilyState,
  getSlotAqiForTime,
  getTimeSlotBand,
  MAX_DAYS_PER_WEEK,
  MAX_DISTANCE_KM,
  MAX_FAMILY_MEMBERS,
  MAX_FREE_TEXT_LENGTH,
  sanitizeFreeText,
  validateMembersList,
  validateTripInput,
  type FamilyMember,
  type FamilyTrip,
  type HomeDetails,
} from './familyPlanCalc.ts';
import {
  COOKING_FUEL_FACTORS,
  TRAVEL_MODE_FACTORS,
} from '../config/emissionFactors.ts';
import type { HourlyAirQualityPoint } from '../types/airQuality.ts';

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

function makeSampleHourly(): HourlyAirQualityPoint[] {
  return [
    makeHourlyPoint('2026-11-25T06:00', '6 AM', 45, 11),
    makeHourlyPoint('2026-11-25T08:00', '8 AM', 165, 72),
    makeHourlyPoint('2026-11-25T14:00', '2 PM', 82, 27),
    makeHourlyPoint('2026-11-25T19:00', '7 PM', 188, 90),
  ];
}

const DEFAULT_HOME: HomeDetails = {
  cookingFuel: 'lpg',
  hasChimneyOrExhaust: false,
  usesAirPurifier: false,
  windowsFacingMainRoad: true,
  smokesOrIncenseIndoors: true,
};

test('validateTripInput enforces 0..200 km, 0..7 days, valid mode, and 100-char sanitized labels', () => {
  const longText = `${'A'.repeat(120)} <script>alert(1)</script>`;
  const clean = sanitizeFreeText(longText, MAX_FREE_TEXT_LENGTH);
  assert.equal(clean.length, MAX_FREE_TEXT_LENGTH);
  assert.equal(clean.includes('<'), false);
  assert.equal(clean.includes('>'), false);

  const valid = validateTripInput({
    from: '  Home  ',
    to: 'School <North>',
    distanceKm: 4.5,
    daysPerWeek: 5,
    timeOfDay: '8:05',
    travelMode: 'car_petrol_diesel',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.sanitized.from, 'Home');
  assert.equal(valid.sanitized.to, 'School North');
  assert.equal(valid.sanitized.timeOfDay, '08:05');

  const invalid = validateTripInput({
    from: '',
    to: 'Office',
    distanceKm: MAX_DISTANCE_KM + 50,
    daysPerWeek: MAX_DAYS_PER_WEEK + 2,
    timeOfDay: '25:99',
    travelMode: 'teleport',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length >= 4);
  assert.equal(invalid.sanitized.distanceKm, MAX_DISTANCE_KM);
  assert.equal(invalid.sanitized.daysPerWeek, MAX_DAYS_PER_WEEK);
  assert.equal(invalid.sanitized.travelMode, 'bus');

  const negative = validateTripInput({
    from: 'Home',
    to: 'Market',
    distanceKm: -5,
    daysPerWeek: -1,
    timeOfDay: '10:00',
    travelMode: 'walk',
  });
  assert.equal(negative.valid, false);
  assert.equal(negative.sanitized.distanceKm, 0);
  assert.equal(negative.sanitized.daysPerWeek, 0);
});

test('validateMembersList caps family size at 6 members and sanitizes names', () => {
  const many: FamilyMember[] = Array.from({ length: 9 }, (_, i) => ({
    id: `m-${i}`,
    name: `Member <b>${i + 1}</b>`,
    ageGroup: 'adult',
    healthNote: 'none',
  }));
  const capped = validateMembersList(many);
  assert.equal(capped.length, MAX_FAMILY_MEMBERS);
  assert.equal(capped[0].name, 'Member b1/b');
});

test('hourly AQI slot lookup and green/yellow/red banding work accurately', () => {
  const hourly = makeSampleHourly();
  assert.equal(getSlotAqiForTime('06:00', hourly, 120), 45);
  assert.equal(getSlotAqiForTime('14:00', hourly, 120), 82);
  assert.equal(getSlotAqiForTime('19:00', hourly, 120), 188);

  assert.equal(getTimeSlotBand(45), 'green');
  assert.equal(getTimeSlotBand(82), 'yellow');
  assert.equal(getTimeSlotBand(188), 'red');
  assert.equal(getTimeSlotBand(null), 'unknown');
});

test('calculateFamilyImpact computes deterministic CO2, exposure score, vulnerability sorting, and cooking CO2', () => {
  const hourly = makeSampleHourly();
  const members: FamilyMember[] = [
    { id: 'adult-1', name: 'Rohan', ageGroup: 'adult', healthNote: 'none' },
    { id: 'child-1', name: 'Aarav', ageGroup: 'child_under_12', healthNote: 'asthma' },
  ];
  const trips: FamilyTrip[] = [
    {
      id: 't1',
      memberId: 'child-1',
      from: 'Home',
      to: 'School',
      distanceKm: 6,
      timeOfDay: '08:00',
      travelMode: 'car_petrol_diesel',
      daysPerWeek: 5,
    },
    {
      id: 't2',
      memberId: 'adult-1',
      from: 'Home',
      to: 'Office',
      distanceKm: 10,
      timeOfDay: '08:00',
      travelMode: 'metro_train',
      daysPerWeek: 5,
    },
  ];

  const summary = calculateFamilyImpact({
    members,
    trips,
    home: DEFAULT_HOME,
    hourly24: hourly,
    liveAqi: 150,
  });

  // Trip 1: 6 km * 125 g/km = 750 g/trip -> 5 days = 3.8 kg CO2
  const t1 = summary.trips.find((t) => t.tripId === 't1');
  assert.ok(t1);
  assert.equal(t1.slotAqi, 165);
  assert.equal(t1.slotBand, 'red');
  assert.equal(
    t1.tripCo2Grams,
    Math.round(6 * TRAVEL_MODE_FACTORS.car_petrol_diesel.co2GramsPerPassengerKm)
  );
  assert.equal(t1.weeklyCo2Kg, 3.8);
  // Vulnerability for child (1.35) * asthma (1.4) = 1.89
  assert.equal(t1.vulnerabilityFactor, 1.89);
  // Duration = round((6 / 24) * 60) = 15 min -> 165 * 15 * 0.75 * 1.89
  assert.equal(t1.tripExposureScore, Math.round(165 * 15 * 0.75 * 1.89));
  assert.equal(t1.weeklyExposureScore, t1.tripExposureScore * 5);

  // Trip 2: 10 km * 14 g/km = 140 g/trip -> 5 days = 0.7 kg CO2
  const t2 = summary.trips.find((t) => t.tripId === 't2');
  assert.ok(t2);
  assert.equal(t2.weeklyCo2Kg, 0.7);

  // Cooking CO2 (LPG = 10.1 kg/wk) + travel CO2 (3.8 + 0.7 = 4.5 kg/wk) = 14.6 kg
  assert.equal(summary.weeklyCookingCo2Kg, COOKING_FUEL_FACTORS.lpg.weeklyCo2Kg);
  assert.equal(summary.weeklyTravelCo2Kg, 4.5);
  assert.equal(summary.weeklyTotalCo2Kg, 14.6);
  assert.equal(summary.hasAnyHealthNote, true);
  assert.equal(summary.cleanestHourLabel, '6 AM');
  assert.equal(summary.cleanestHourAqi, 45);

  // Member sorting: highest exposure first -> child Aarav should be first
  assert.equal(summary.memberTotals[0].memberId, 'child-1');
  assert.equal(summary.memberTotals[0].isChildOrSenior, true);
});

test('computeWhatIfScenarios computes before/after numbers for cleaner hour, short walk, transit, carpool, and induction', () => {
  const sample = createSampleFamilyState();
  const hourly = makeSampleHourly();
  const summary = calculateFamilyImpact({
    members: sample.members,
    trips: sample.trips,
    home: sample.home,
    hourly24: hourly,
    liveAqi: 160,
  });

  const shift = summary.scenarios.find((s) => s.id === 'shift_cleaner_hour');
  const walkShort = summary.scenarios.find((s) => s.id === 'walk_or_cycle_short_trips');
  const transit = summary.scenarios.find((s) => s.id === 'switch_to_metro_or_bus');
  const carpool = summary.scenarios.find((s) => s.id === 'carpool_car_trips');
  const induction = summary.scenarios.find((s) => s.id === 'switch_to_induction');

  assert.ok(shift && shift.applicable && shift.exposureSaved > 0);
  assert.ok(walkShort && walkShort.applicable && walkShort.co2SavedKg > 0);
  assert.ok(transit && transit.applicable && transit.co2SavedKg > 0);
  assert.ok(carpool && carpool.applicable && carpool.co2SavedKg > 0);
  assert.ok(induction && induction.applicable && induction.co2SavedKg > 0);

  const combined = computeCombinedImpactAfterSteps(
    summary,
    summary.scenarios.filter((s) => s.applicable)
  );
  assert.ok(combined.afterCo2Kg < summary.weeklyTotalCo2Kg);
  assert.ok(combined.afterExposure !== null && summary.weeklyTotalExposure !== null);
  assert.ok((combined.afterExposure ?? 0) < (summary.weeklyTotalExposure ?? 0));
});

test('indoor hacks tailor to home details and CADR calculator returns sensible target', () => {
  const hourly = makeSampleHourly();
  const hacks = buildTailoredIndoorHacks(DEFAULT_HOME, hourly, 165);
  assert.equal(hacks[0].tier, 'free');
  assert.ok(hacks.some((h) => h.id === 'stop_incense_smoke' && h.isUrgentForHome));
  assert.ok(hacks.some((h) => h.id === 'seal_road_windows' && h.isUrgentForHome));
  assert.ok(hacks.some((h) => h.id === 'diy_corsi_rosenthal' && h.tier === 'low'));

  const cadr = calculateCadrRecommendation(12, 10, 9, 'ft');
  // 12x10x9 ft = ~30.6 m3; 30.6 * 4.8 ACH = ~147 m3/h
  assert.ok(cadr.volumeCubicMeters > 29 && cadr.volumeCubicMeters < 32);
  assert.equal(cadr.targetAch, 4.8);
  assert.ok(cadr.recommendedCadrM3h >= 140 && cadr.recommendedCadrM3h <= 155);
  assert.ok(cadr.recommendedCadrCfm >= 80 && cadr.recommendedCadrCfm <= 95);
});
