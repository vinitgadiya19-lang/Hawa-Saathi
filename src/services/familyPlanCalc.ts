import {
  AGE_VULNERABILITY_FACTORS,
  COOKING_FUEL_FACTORS,
  HEALTH_VULNERABILITY_FACTORS,
  TRAVEL_MODE_FACTORS,
  type AgeGroupId,
  type CookingFuelId,
  type HealthNoteId,
  type TravelModeId,
} from '../config/emissionFactors.ts';
import type { HourlyAirQualityPoint } from '../types/airQuality.ts';

export const MAX_FAMILY_MEMBERS = 6;
export const MAX_FREE_TEXT_LENGTH = 100;
export const MAX_DISTANCE_KM = 200;
export const MAX_DAYS_PER_WEEK = 7;

export type TimeSlotBand = 'green' | 'yellow' | 'red' | 'unknown';

export interface FamilyMember {
  id: string;
  name: string;
  ageGroup: AgeGroupId;
  healthNote: HealthNoteId;
}

export interface FamilyTrip {
  id: string;
  memberId: string;
  from: string;
  to: string;
  distanceKm: number;
  timeOfDay: string; // HH:MM
  travelMode: TravelModeId;
  daysPerWeek: number;
}

export interface HomeDetails {
  cookingFuel: CookingFuelId;
  hasChimneyOrExhaust: boolean;
  usesAirPurifier: boolean;
  windowsFacingMainRoad: boolean;
  smokesOrIncenseIndoors: boolean;
}

export interface CalculatedTripResult {
  tripId: string;
  memberId: string;
  memberName: string;
  from: string;
  to: string;
  travelMode: TravelModeId;
  travelModeLabel: string;
  distanceKm: number;
  daysPerWeek: number;
  timeOfDay: string;
  durationMinutes: number;
  slotAqi: number | null;
  slotBand: TimeSlotBand;
  tripCo2Grams: number;
  weeklyCo2Kg: number;
  vulnerabilityFactor: number;
  tripExposureScore: number | null;
  weeklyExposureScore: number | null;
}

export interface MemberTotalResult {
  memberId: string;
  name: string;
  ageGroup: AgeGroupId;
  ageLabel: string;
  healthNote: HealthNoteId;
  healthLabel: string;
  isChildOrSenior: boolean;
  hasHealthCondition: boolean;
  vulnerabilityFactor: number;
  tripCount: number;
  weeklyCo2Kg: number;
  weeklyExposureScore: number | null;
}

export type ScenarioEffort = 'easy' | 'medium' | 'hard';
export type ScenarioCost = 'free' | 'low' | 'medium';

export interface WhatIfScenario {
  id: string;
  title: string;
  description: string;
  whoBenefits: string;
  effort: ScenarioEffort;
  cost: ScenarioCost;
  applicable: boolean;
  beforeCo2Kg: number;
  afterCo2Kg: number;
  co2SavedKg: number;
  beforeExposure: number | null;
  afterExposure: number | null;
  exposureSaved: number;
}

export interface FamilyCalculationSummary {
  trips: CalculatedTripResult[];
  memberTotals: MemberTotalResult[];
  weeklyTravelCo2Kg: number;
  weeklyCookingCo2Kg: number;
  weeklyTotalCo2Kg: number;
  weeklyTotalExposure: number | null;
  hasAnyHealthNote: boolean;
  hasLiveAqi: boolean;
  cleanestHourLabel: string | null;
  cleanestHourAqi: number | null;
  scenarios: WhatIfScenario[];
}

export function sanitizeFreeText(
  raw: unknown,
  maxLen: number = MAX_FREE_TEXT_LENGTH
): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function clampNumber(
  raw: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

export function validateTripInput(input: {
  from: unknown;
  to: unknown;
  distanceKm: unknown;
  daysPerWeek: unknown;
  timeOfDay: unknown;
  travelMode: unknown;
}): {
  valid: boolean;
  errors: string[];
  sanitized: {
    from: string;
    to: string;
    distanceKm: number;
    daysPerWeek: number;
    timeOfDay: string;
    travelMode: TravelModeId;
  };
} {
  const errors: string[] = [];
  const from = sanitizeFreeText(input.from, MAX_FREE_TEXT_LENGTH);
  const to = sanitizeFreeText(input.to, MAX_FREE_TEXT_LENGTH);

  if (!from) errors.push('Enter a start label (e.g. Home).');
  if (!to) errors.push('Enter a destination label (e.g. School).');

  const rawDist =
    typeof input.distanceKm === 'number'
      ? input.distanceKm
      : Number(input.distanceKm);
  if (!Number.isFinite(rawDist) || rawDist < 0 || rawDist > MAX_DISTANCE_KM) {
    errors.push(`Distance must be between 0 and ${MAX_DISTANCE_KM} km.`);
  }

  const rawDays =
    typeof input.daysPerWeek === 'number'
      ? input.daysPerWeek
      : Number(input.daysPerWeek);
  if (!Number.isFinite(rawDays) || rawDays < 0 || rawDays > MAX_DAYS_PER_WEEK) {
    errors.push(`Days per week must be between 0 and ${MAX_DAYS_PER_WEEK}.`);
  }

  const rawTime = typeof input.timeOfDay === 'string' ? input.timeOfDay.trim() : '08:00';
  const timeMatch = rawTime.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  const timeOfDay = timeMatch
    ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
    : '08:00';
  if (!timeMatch) {
    errors.push('Choose a valid time of day (HH:MM).');
  }

  const rawMode = typeof input.travelMode === 'string' ? input.travelMode : '';
  const travelMode: TravelModeId = Object.prototype.hasOwnProperty.call(
    TRAVEL_MODE_FACTORS,
    rawMode
  )
    ? (rawMode as TravelModeId)
    : 'bus';
  if (!Object.prototype.hasOwnProperty.call(TRAVEL_MODE_FACTORS, rawMode)) {
    errors.push('Choose a valid travel mode.');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      from,
      to,
      distanceKm: clampNumber(rawDist, 0, MAX_DISTANCE_KM, 0),
      daysPerWeek: Math.round(clampNumber(rawDays, 0, MAX_DAYS_PER_WEEK, 0)),
      timeOfDay,
      travelMode,
    },
  };
}

export function validateMembersList(members: FamilyMember[]): FamilyMember[] {
  const validList = members.slice(0, MAX_FAMILY_MEMBERS).map((m, idx) => {
    const name = sanitizeFreeText(m.name, MAX_FREE_TEXT_LENGTH) || `Member ${idx + 1}`;
    const ageGroup: AgeGroupId = Object.prototype.hasOwnProperty.call(
      AGE_VULNERABILITY_FACTORS,
      m.ageGroup
    )
      ? m.ageGroup
      : 'adult';
    const healthNote: HealthNoteId = Object.prototype.hasOwnProperty.call(
      HEALTH_VULNERABILITY_FACTORS,
      m.healthNote
    )
      ? m.healthNote
      : 'none';
    return {
      id: sanitizeFreeText(m.id, 40) || `member-${idx + 1}`,
      name,
      ageGroup,
      healthNote,
    };
  });
  return validList;
}

function parseHourFromTimeString(timeStr: string): number | null {
  // ISO timestamp e.g. "2026-11-25T08:00"
  const isoMatch = timeStr.match(/T(\d{2}):/);
  if (isoMatch) return Number(isoMatch[1]);

  // "HH:MM"
  const hhmmMatch = timeStr.match(/^(\d{1,2}):\d{2}$/);
  if (hhmmMatch) return Number(hhmmMatch[1]);

  // "8 AM" / "6 PM"
  const ampmMatch = timeStr.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hr = Number(ampmMatch[1]) % 12;
    if (ampmMatch[2].toUpperCase() === 'PM') hr += 12;
    return hr;
  }
  return null;
}

export function getTimeSlotBand(aqi: number | null): TimeSlotBand {
  if (aqi === null || !Number.isFinite(aqi)) return 'unknown';
  if (aqi <= 50) return 'green';
  if (aqi <= 100) return 'yellow';
  return 'red';
}

export function getSlotAqiForTime(
  timeOfDay: string,
  hourly24: HourlyAirQualityPoint[],
  fallbackLiveAqi: number | null
): number | null {
  const targetHour = parseHourFromTimeString(timeOfDay);
  if (targetHour !== null && hourly24.length > 0) {
    const exact = hourly24.find((pt) => {
      const h =
        parseHourFromTimeString(pt.time) ??
        parseHourFromTimeString(pt.hourLabel);
      return h === targetHour && typeof pt.us_aqi === 'number';
    });
    if (exact && typeof exact.us_aqi === 'number') {
      return Math.round(exact.us_aqi);
    }

    // Closest hour match if forecast doesn't contain exact hour
    let bestPt: HourlyAirQualityPoint | null = null;
    let bestDiff = Infinity;
    for (const pt of hourly24) {
      if (typeof pt.us_aqi !== 'number') continue;
      const h =
        parseHourFromTimeString(pt.time) ??
        parseHourFromTimeString(pt.hourLabel);
      if (h === null) continue;
      const diff = Math.abs(h - targetHour);
      const wrapDiff = Math.min(diff, 24 - diff);
      if (wrapDiff < bestDiff) {
        bestDiff = wrapDiff;
        bestPt = pt;
      }
    }
    if (bestPt && typeof bestPt.us_aqi === 'number') {
      return Math.round(bestPt.us_aqi);
    }
  }

  return typeof fallbackLiveAqi === 'number' && Number.isFinite(fallbackLiveAqi)
    ? Math.round(fallbackLiveAqi)
    : null;
}

export function getCleanestForecastHour(hourly24: HourlyAirQualityPoint[]): {
  hourLabel: string | null;
  aqi: number | null;
} {
  const valid = hourly24.filter(
    (h): h is HourlyAirQualityPoint & { us_aqi: number } =>
      typeof h.us_aqi === 'number' && Number.isFinite(h.us_aqi)
  );
  if (valid.length === 0) return { hourLabel: null, aqi: null };

  let best = valid[0];
  for (const pt of valid) {
    if (pt.us_aqi < best.us_aqi) best = pt;
  }
  return {
    hourLabel: best.hourLabel || best.time,
    aqi: Math.round(best.us_aqi),
  };
}

export function getMemberVulnerabilityFactor(member: FamilyMember): number {
  const ageFactor = AGE_VULNERABILITY_FACTORS[member.ageGroup]?.multiplier ?? 1.0;
  const healthFactor =
    HEALTH_VULNERABILITY_FACTORS[member.healthNote]?.multiplier ?? 1.0;
  return Number((ageFactor * healthFactor).toFixed(2));
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function calculateFamilyImpact(params: {
  members: FamilyMember[];
  trips: FamilyTrip[];
  home: HomeDetails;
  hourly24: HourlyAirQualityPoint[];
  liveAqi: number | null;
}): FamilyCalculationSummary {
  const members = validateMembersList(params.members);
  const memberById = new Map<string, FamilyMember>();
  for (const m of members) memberById.set(m.id, m);

  const cleanest = getCleanestForecastHour(params.hourly24);
  const hasLiveAqi =
    (typeof params.liveAqi === 'number' && Number.isFinite(params.liveAqi)) ||
    cleanest.aqi !== null;

  const calculatedTrips: CalculatedTripResult[] = [];
  const memberWeeklyCo2 = new Map<string, number>();
  const memberWeeklyExposure = new Map<string, number | null>();
  const memberTripCount = new Map<string, number>();

  for (const m of members) {
    memberWeeklyCo2.set(m.id, 0);
    memberWeeklyExposure.set(m.id, hasLiveAqi ? 0 : null);
    memberTripCount.set(m.id, 0);
  }

  for (const rawTrip of params.trips) {
    const member = memberById.get(rawTrip.memberId) ?? members[0];
    if (!member) continue;

    const checked = validateTripInput(rawTrip);
    const { from, to, distanceKm, daysPerWeek, timeOfDay, travelMode } =
      checked.sanitized;

    const factor = TRAVEL_MODE_FACTORS[travelMode];
    const durationMinutes =
      distanceKm > 0
        ? Math.max(1, Math.round((distanceKm / factor.avgSpeedKmh) * 60))
        : 0;
    const slotAqi = getSlotAqiForTime(
      timeOfDay,
      params.hourly24,
      params.liveAqi
    );
    const slotBand = getTimeSlotBand(slotAqi);

    const tripCo2Grams = Math.round(distanceKm * factor.co2GramsPerPassengerKm);
    const weeklyCo2Kg = round1((tripCo2Grams * daysPerWeek) / 1000);
    const vulnerabilityFactor = getMemberVulnerabilityFactor(member);

    const tripExposureScore =
      slotAqi !== null
        ? Math.round(
            slotAqi *
              durationMinutes *
              factor.pm25ExposureFactor *
              vulnerabilityFactor
          )
        : null;
    const weeklyExposureScore =
      tripExposureScore !== null ? tripExposureScore * daysPerWeek : null;

    calculatedTrips.push({
      tripId: rawTrip.id,
      memberId: member.id,
      memberName: member.name,
      from: from || 'Start',
      to: to || 'Destination',
      travelMode,
      travelModeLabel: factor.label,
      distanceKm,
      daysPerWeek,
      timeOfDay,
      durationMinutes,
      slotAqi,
      slotBand,
      tripCo2Grams,
      weeklyCo2Kg,
      vulnerabilityFactor,
      tripExposureScore,
      weeklyExposureScore,
    });

    memberWeeklyCo2.set(
      member.id,
      round1((memberWeeklyCo2.get(member.id) ?? 0) + weeklyCo2Kg)
    );
    memberTripCount.set(member.id, (memberTripCount.get(member.id) ?? 0) + 1);
    if (weeklyExposureScore !== null) {
      const prevExp = memberWeeklyExposure.get(member.id) ?? 0;
      memberWeeklyExposure.set(member.id, prevExp + weeklyExposureScore);
    }
  }

  const memberTotals: MemberTotalResult[] = members
    .map((m) => ({
      memberId: m.id,
      name: m.name,
      ageGroup: m.ageGroup,
      ageLabel: AGE_VULNERABILITY_FACTORS[m.ageGroup].label,
      healthNote: m.healthNote,
      healthLabel: HEALTH_VULNERABILITY_FACTORS[m.healthNote].label,
      isChildOrSenior: m.ageGroup === 'child_under_12' || m.ageGroup === 'senior',
      hasHealthCondition: m.healthNote !== 'none',
      vulnerabilityFactor: getMemberVulnerabilityFactor(m),
      tripCount: memberTripCount.get(m.id) ?? 0,
      weeklyCo2Kg: memberWeeklyCo2.get(m.id) ?? 0,
      weeklyExposureScore: memberWeeklyExposure.get(m.id) ?? null,
    }))
    .sort((a, b) => {
      const expA = a.weeklyExposureScore ?? -1;
      const expB = b.weeklyExposureScore ?? -1;
      if (expB !== expA) return expB - expA;
      return b.weeklyCo2Kg - a.weeklyCo2Kg;
    });

  const weeklyTravelCo2Kg = round1(
    calculatedTrips.reduce((sum, t) => sum + t.weeklyCo2Kg, 0)
  );
  const weeklyCookingCo2Kg =
    COOKING_FUEL_FACTORS[params.home.cookingFuel]?.weeklyCo2Kg ?? 10.1;
  const weeklyTotalCo2Kg = round1(weeklyTravelCo2Kg + weeklyCookingCo2Kg);

  const weeklyTotalExposure = hasLiveAqi
    ? calculatedTrips.reduce(
        (sum, t) => sum + (t.weeklyExposureScore ?? 0),
        0
      )
    : null;

  const hasAnyHealthNote = members.some((m) => m.healthNote !== 'none');

  const scenarios = computeWhatIfScenarios({
    trips: calculatedTrips,
    members: memberTotals,
    home: params.home,
    weeklyTotalCo2Kg,
    weeklyTotalExposure,
    cleanestHourLabel: cleanest.hourLabel,
    cleanestHourAqi: cleanest.aqi,
  });

  return {
    trips: calculatedTrips,
    memberTotals,
    weeklyTravelCo2Kg,
    weeklyCookingCo2Kg,
    weeklyTotalCo2Kg,
    weeklyTotalExposure,
    hasAnyHealthNote,
    hasLiveAqi,
    cleanestHourLabel: cleanest.hourLabel,
    cleanestHourAqi: cleanest.aqi,
    scenarios,
  };
}

export function computeWhatIfScenarios(input: {
  trips: CalculatedTripResult[];
  members: MemberTotalResult[];
  home: HomeDetails;
  weeklyTotalCo2Kg: number;
  weeklyTotalExposure: number | null;
  cleanestHourLabel: string | null;
  cleanestHourAqi: number | null;
}): WhatIfScenario[] {
  const scenarios: WhatIfScenario[] = [];
  const totalCo2 = input.weeklyTotalCo2Kg;
  const totalExp = input.weeklyTotalExposure;

  // 1. Shift highest-exposure trip to cleanest hour
  const shiftCandidates = [...input.trips]
    .filter((t) => t.weeklyExposureScore !== null && t.slotAqi !== null)
    .sort((a, b) => (b.weeklyExposureScore ?? 0) - (a.weeklyExposureScore ?? 0));
  const topExpTrip = shiftCandidates[0];

  if (
    topExpTrip &&
    input.cleanestHourAqi !== null &&
    topExpTrip.slotAqi !== null &&
    topExpTrip.slotAqi > input.cleanestHourAqi &&
    topExpTrip.weeklyExposureScore !== null &&
    totalExp !== null
  ) {
    const ratio = input.cleanestHourAqi / Math.max(1, topExpTrip.slotAqi);
    const newTripWeeklyExp = Math.round(topExpTrip.weeklyExposureScore * ratio);
    const expSaved = Math.max(0, topExpTrip.weeklyExposureScore - newTripWeeklyExp);
    scenarios.push({
      id: 'shift_cleaner_hour',
      title: `Shift ${topExpTrip.memberName}'s ${topExpTrip.from} → ${topExpTrip.to} trip to ${input.cleanestHourLabel ?? 'the cleanest hour'}`,
      description: `Moving this trip from ${topExpTrip.timeOfDay} (est. ${topExpTrip.slotAqi} AQI) to ${input.cleanestHourLabel ?? 'cleanest hour'} (est. ${input.cleanestHourAqi} AQI) cuts breathing exposure with zero cost.`,
      whoBenefits: topExpTrip.memberName,
      effort: 'easy',
      cost: 'free',
      applicable: expSaved > 0,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: totalCo2,
      co2SavedKg: 0,
      beforeExposure: totalExp,
      afterExposure: Math.max(0, totalExp - expSaved),
      exposureSaved: expSaved,
    });
  } else {
    scenarios.push({
      id: 'shift_cleaner_hour',
      title: 'Move outdoor errands to the cleanest forecast hour',
      description:
        'Shifting trips away from rush-hour smog peaks reduces inhaled pollution even when travel distance stays the same.',
      whoBenefits: input.members[0]?.name ?? 'Whole family',
      effort: 'easy',
      cost: 'free',
      applicable: false,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: totalCo2,
      co2SavedKg: 0,
      beforeExposure: totalExp,
      afterExposure: totalExp,
      exposureSaved: 0,
    });
  }

  // 2. Walk or cycle trips under 2 km
  const shortMotorized = input.trips.filter(
    (t) =>
      t.distanceKm > 0 &&
      t.distanceKm <= 2 &&
      t.travelMode !== 'walk' &&
      t.travelMode !== 'cycle'
  );
  if (shortMotorized.length > 0) {
    const co2Saved = round1(
      shortMotorized.reduce((sum, t) => sum + t.weeklyCo2Kg, 0)
    );
    // Note: walking is slower than motorized, so exposure may rise or fall depending on mode factor; track conservatively
    let newExpTotal = totalExp ?? 0;
    let oldExpTotal = 0;
    if (totalExp !== null) {
      for (const t of shortMotorized) {
        oldExpTotal += t.weeklyExposureScore ?? 0;
        const cycleFactor = TRAVEL_MODE_FACTORS.cycle;
        const newMin = Math.max(
          1,
          Math.round((t.distanceKm / cycleFactor.avgSpeedKmh) * 60)
        );
        const member = input.members.find((m) => m.memberId === t.memberId);
        const vuln = member?.vulnerabilityFactor ?? 1.0;
        const newWeeklyExp =
          t.slotAqi !== null
            ? Math.round(
                t.slotAqi * newMin * cycleFactor.pm25ExposureFactor * vuln
              ) * t.daysPerWeek
            : 0;
        newExpTotal = newExpTotal - (t.weeklyExposureScore ?? 0) + newWeeklyExp;
      }
    }
    const expSaved =
      totalExp !== null ? Math.max(0, totalExp - newExpTotal) : 0;
    const names = Array.from(new Set(shortMotorized.map((t) => t.memberName))).join(', ');

    scenarios.push({
      id: 'walk_or_cycle_short_trips',
      title: `Walk or cycle short trips under 2 km (${shortMotorized.length} trip${shortMotorized.length > 1 ? 's' : ''})`,
      description: `Replacing short motorized rides under 2 km eliminates cold-engine tailpipe smoke near your home.`,
      whoBenefits: names || 'Whole family',
      effort: 'easy',
      cost: 'free',
      applicable: true,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: round1(Math.max(0, totalCo2 - co2Saved)),
      co2SavedKg: co2Saved,
      beforeExposure: totalExp,
      afterExposure: totalExp !== null ? Math.max(0, totalExp - expSaved) : null,
      exposureSaved: expSaved,
    });
  } else {
    scenarios.push({
      id: 'walk_or_cycle_short_trips',
      title: 'Walk or cycle short trips under 2 km',
      description: 'Use walking or cycling for short neighborhood errands instead of firing up a petrol vehicle.',
      whoBenefits: 'Whole family',
      effort: 'easy',
      cost: 'free',
      applicable: false,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: totalCo2,
      co2SavedKg: 0,
      beforeExposure: totalExp,
      afterExposure: totalExp,
      exposureSaved: 0,
    });
  }

  // 3. Switch highest-CO2 private trip to Metro / Train (or Bus)
  const transitCandidates = [...input.trips]
    .filter(
      (t) =>
        t.travelMode === 'car_petrol_diesel' ||
        t.travelMode === 'bike_petrol' ||
        t.travelMode === 'auto'
    )
    .sort((a, b) => b.weeklyCo2Kg - a.weeklyCo2Kg);

  const bestTransitCandidate = transitCandidates[0];
  if (bestTransitCandidate) {
    const targetMode: TravelModeId =
      bestTransitCandidate.distanceKm >= 4 ? 'metro_train' : 'bus';
    const targetFactor = TRAVEL_MODE_FACTORS[targetMode];
    const newWeeklyCo2 = round1(
      (bestTransitCandidate.distanceKm *
        targetFactor.co2GramsPerPassengerKm *
        bestTransitCandidate.daysPerWeek) /
        1000
    );
    const co2Saved = round1(
      Math.max(0, bestTransitCandidate.weeklyCo2Kg - newWeeklyCo2)
    );

    let expSaved = 0;
    if (
      totalExp !== null &&
      bestTransitCandidate.weeklyExposureScore !== null &&
      bestTransitCandidate.slotAqi !== null
    ) {
      const newMin = Math.max(
        1,
        Math.round(
          (bestTransitCandidate.distanceKm / targetFactor.avgSpeedKmh) * 60
        )
      );
      const member = input.members.find(
        (m) => m.memberId === bestTransitCandidate.memberId
      );
      const vuln = member?.vulnerabilityFactor ?? 1.0;
      const newWeeklyExp =
        Math.round(
          bestTransitCandidate.slotAqi *
            newMin *
            targetFactor.pm25ExposureFactor *
            vuln
        ) * bestTransitCandidate.daysPerWeek;
      expSaved = Math.max(
        0,
        bestTransitCandidate.weeklyExposureScore - newWeeklyExp
      );
    }

    scenarios.push({
      id: 'switch_to_metro_or_bus',
      title: `Switch ${bestTransitCandidate.memberName}'s ${bestTransitCandidate.from} → ${bestTransitCandidate.to} trip to ${targetFactor.label}`,
      description: `Moving this ${bestTransitCandidate.distanceKm} km ${bestTransitCandidate.travelModeLabel.toLowerCase()} commute to ${targetFactor.label.toLowerCase()} cuts per-passenger CO2 and traffic exhaust exposure.`,
      whoBenefits: bestTransitCandidate.memberName,
      effort: 'medium',
      cost: 'low',
      applicable: co2Saved > 0 || expSaved > 0,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: round1(Math.max(0, totalCo2 - co2Saved)),
      co2SavedKg: co2Saved,
      beforeExposure: totalExp,
      afterExposure: totalExp !== null ? Math.max(0, totalExp - expSaved) : null,
      exposureSaved: expSaved,
    });
  } else {
    scenarios.push({
      id: 'switch_to_metro_or_bus',
      title: 'Use metro or city bus for longer commutes',
      description: 'Public transit avoids dense roadside tailpipe plumes on congested corridors.',
      whoBenefits: 'Commuters & community',
      effort: 'medium',
      cost: 'low',
      applicable: false,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: totalCo2,
      co2SavedKg: 0,
      beforeExposure: totalExp,
      afterExposure: totalExp,
      exposureSaved: 0,
    });
  }

  // 4. Carpool car trips (share rides -> 50% CO2 per passenger)
  const carTrips = input.trips.filter(
    (t) => t.travelMode === 'car_petrol_diesel' && t.weeklyCo2Kg > 0
  );
  if (carTrips.length > 0) {
    const carCo2 = carTrips.reduce((sum, t) => sum + t.weeklyCo2Kg, 0);
    const co2Saved = round1(carCo2 * 0.5);
    const names = Array.from(new Set(carTrips.map((t) => t.memberName))).join(', ');
    scenarios.push({
      id: 'carpool_car_trips',
      title: 'Carpool or share school and office car rides',
      description:
        'Sharing existing car trips with one neighbor or coworker cuts per-person car CO2 roughly in half with zero extra hardware.',
      whoBenefits: names || 'Car commuters',
      effort: 'easy',
      cost: 'free',
      applicable: true,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: round1(Math.max(0, totalCo2 - co2Saved)),
      co2SavedKg: co2Saved,
      beforeExposure: totalExp,
      afterExposure: totalExp,
      exposureSaved: 0,
    });
  } else {
    scenarios.push({
      id: 'carpool_car_trips',
      title: 'Carpool or share rides with neighbors',
      description:
        'Pairing up on recurring school or office routes halves per-person fuel burn and local traffic congestion.',
      whoBenefits: 'Whole family',
      effort: 'easy',
      cost: 'free',
      applicable: false,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: totalCo2,
      co2SavedKg: 0,
      beforeExposure: totalExp,
      afterExposure: totalExp,
      exposureSaved: 0,
    });
  }

  // 5. Switch cooking from LPG / firewood / PNG to Induction
  if (input.home.cookingFuel !== 'induction') {
    const currentCook = COOKING_FUEL_FACTORS[input.home.cookingFuel];
    const inductionCook = COOKING_FUEL_FACTORS.induction;
    const co2Saved = round1(
      Math.max(0, currentCook.weeklyCo2Kg - inductionCook.weeklyCo2Kg)
    );
    scenarios.push({
      id: 'switch_to_induction',
      title: `Switch daily cooking from ${currentCook.label} to electric induction`,
      description: `Replaces indoor burner combustion (NO2 & soot) with electric induction, reducing weekly kitchen CO2e by an estimated ${co2Saved} kg.`,
      whoBenefits: 'Everyone at home (especially children & seniors)',
      effort: 'medium',
      cost: 'medium',
      applicable: co2Saved > 0,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: round1(Math.max(0, totalCo2 - co2Saved)),
      co2SavedKg: co2Saved,
      beforeExposure: totalExp,
      afterExposure: totalExp,
      exposureSaved: 0,
    });
  } else {
    scenarios.push({
      id: 'switch_to_induction',
      title: 'Keep using electric induction with lidded pots',
      description:
        'You already use induction — covering pans cuts cooking energy and indoor steam dispersion.',
      whoBenefits: 'Everyone at home',
      effort: 'easy',
      cost: 'free',
      applicable: false,
      beforeCo2Kg: totalCo2,
      afterCo2Kg: totalCo2,
      co2SavedKg: 0,
      beforeExposure: totalExp,
      afterExposure: totalExp,
      exposureSaved: 0,
    });
  }

  // 6. Combine errands & turn engines off at long red signals
  const roadMotorized = input.trips.filter(
    (t) =>
      t.travelMode === 'car_petrol_diesel' ||
      t.travelMode === 'bike_petrol' ||
      t.travelMode === 'auto'
  );
  const roadCo2 = roadMotorized.reduce((sum, t) => sum + t.weeklyCo2Kg, 0);
  const co2SavedErrands = round1(roadCo2 * 0.1);
  const roadExp = roadMotorized.reduce(
    (sum, t) => sum + (t.weeklyExposureScore ?? 0),
    0
  );
  const expSavedErrands = totalExp !== null ? Math.round(roadExp * 0.08) : 0;

  scenarios.push({
    id: 'combine_errands_idle_off',
    title: 'Combine errands into one loop and switch engines off at long signals',
    description:
      'Cutting unnecessary cold-start trips and avoiding idling >20 seconds saves ~10% fuel CO2 and reduces exhaust plumes around riders.',
    whoBenefits: 'Whole family & neighborhood',
    effort: 'easy',
    cost: 'free',
    applicable: roadMotorized.length > 0,
    beforeCo2Kg: totalCo2,
    afterCo2Kg: round1(Math.max(0, totalCo2 - co2SavedErrands)),
    co2SavedKg: co2SavedErrands,
    beforeExposure: totalExp,
    afterExposure:
      totalExp !== null ? Math.max(0, totalExp - expSavedErrands) : null,
    exposureSaved: expSavedErrands,
  });

  return scenarios;
}

export function computeCombinedImpactAfterSteps(
  summary: FamilyCalculationSummary,
  selectedSavings: Array<{ co2SavedKg: number; exposureSaved: number }>
): {
  afterCo2Kg: number;
  totalCo2SavedKg: number;
  afterExposure: number | null;
  totalExposureSaved: number;
} {
  // Cap combined savings at realistic maximum (90% of travel+cooking delta / 85% exposure)
  // so overlapping step toggles never produce negative totals.
  const rawCo2Saved = selectedSavings.reduce(
    (sum, item) => sum + Math.max(0, item.co2SavedKg),
    0
  );
  const totalCo2SavedKg = round1(
    Math.min(rawCo2Saved, summary.weeklyTotalCo2Kg * 0.85)
  );
  const afterCo2Kg = round1(
    Math.max(0, summary.weeklyTotalCo2Kg - totalCo2SavedKg)
  );

  if (summary.weeklyTotalExposure === null) {
    return {
      afterCo2Kg,
      totalCo2SavedKg,
      afterExposure: null,
      totalExposureSaved: 0,
    };
  }

  const rawExpSaved = selectedSavings.reduce(
    (sum, item) => sum + Math.max(0, item.exposureSaved),
    0
  );
  const totalExposureSaved = Math.round(
    Math.min(rawExpSaved, summary.weeklyTotalExposure * 0.85)
  );
  const afterExposure = Math.max(
    0,
    summary.weeklyTotalExposure - totalExposureSaved
  );

  return {
    afterCo2Kg,
    totalCo2SavedKg,
    afterExposure,
    totalExposureSaved,
  };
}

export interface IndoorHackItem {
  id: string;
  tier: 'free' | 'low' | 'invest';
  tierLabel: 'Free' | 'Low cost' | 'Invest';
  title: string;
  action: string;
  expectedBenefit: 'low' | 'medium' | 'high';
  limits: string;
  tailoredReason: string;
  isUrgentForHome: boolean;
  steps?: string[];
  includesCadrCalculator?: boolean;
}

export function buildTailoredIndoorHacks(
  home: HomeDetails,
  hourly24: HourlyAirQualityPoint[],
  liveAqi: number | null
): IndoorHackItem[] {
  const cleanest = getCleanestForecastHour(hourly24);
  const cleanestText = cleanest.hourLabel
    ? `${cleanest.hourLabel}${cleanest.aqi !== null ? ` (~${cleanest.aqi} AQI)` : ''}`
    : 'early afternoon (1–4 PM when inversion lifts)';

  const highOutdoorAqi = typeof liveAqi === 'number' && liveAqi > 100;

  return [
    {
      id: 'ventilate_cleanest_hour',
      tier: 'free',
      tierLabel: 'Free',
      title: `Ventilate in the cleanest hour (${cleanestText})`,
      action:
        'Open cross-ventilation windows for 20–30 minutes only during the cleanest window, then keep windows closed during rush-hour and late-night smog.',
      expectedBenefit: 'medium',
      limits:
        'If outdoor AQI stays above 150 all day, keep natural window opening brief (10 min) and rely on indoor filtration.',
      tailoredReason: cleanest.hourLabel
        ? `Based on today's forecast, ${cleanest.hourLabel} is your cleanest airing window.`
        : 'Load a city above to pinpoint today’s exact cleanest airing hour.',
      isUrgentForHome: highOutdoorAqi,
    },
    {
      id: 'cook_with_exhaust',
      tier: 'free',
      tierLabel: 'Free',
      title: home.hasChimneyOrExhaust
        ? 'Run your kitchen chimney or exhaust fan on high every time you cook'
        : 'Open kitchen exhaust window or add a simple exhaust fan while cooking',
      action:
        'Switch the chimney/exhaust on 2 minutes before lighting the stove and keep it running 10 minutes after finishing. Cover pots with lids.',
      expectedBenefit:
        home.cookingFuel === 'firewood_biomass' || !home.hasChimneyOrExhaust
          ? 'high'
          : 'medium',
      limits:
        'Reduces cooking PM2.5 and NO2 spikes significantly, but does not filter outdoor traffic smoke entering from other rooms.',
      tailoredReason: !home.hasChimneyOrExhaust
        ? `Your home uses ${COOKING_FUEL_FACTORS[home.cookingFuel].label} without a chimney/exhaust — venting cooking fumes is a top priority.`
        : `Running your chimney keeps ${COOKING_FUEL_FACTORS[home.cookingFuel].label} fumes from spreading to bedrooms.`,
      isUrgentForHome:
        !home.hasChimneyOrExhaust || home.cookingFuel === 'firewood_biomass',
    },
    {
      id: 'damp_mop',
      tier: 'free',
      tierLabel: 'Free',
      title: 'Damp mop floors and wet-wipe shelves instead of dry sweeping',
      action:
        'Replace dry brooms and feather dusters with a wet cloth or damp mop so settled road dust and soot are trapped instead of kicked back into lung height.',
      expectedBenefit: 'low',
      limits:
        'Stops dust resuspension (PM10/coarse dust) right away, though it does not remove ultrafine smoke gases.',
      tailoredReason: home.windowsFacingMainRoad
        ? 'Your windows face a main road, so heavy coarse road dust settles quickly indoors.'
        : 'Prevents settled particles from being re-breathed by crawling children and elders.',
      isUrgentForHome: home.windowsFacingMainRoad,
    },
    {
      id: 'stop_incense_smoke',
      tier: 'free',
      tierLabel: 'Free',
      title: 'Stop burning incense, dhoop, mosquito coils, or smoking indoors',
      action:
        'Use liquid vaporizers/bed nets instead of mosquito coils, switch to electric lamps or unlit flowers for prayer, and keep all tobacco smoke strictly outside.',
      expectedBenefit: 'high',
      limits:
        'Zero-cost indoor source elimination can cut peak bedroom PM2.5 dramatically, though outdoor infiltration still needs window sealing.',
      tailoredReason: home.smokesOrIncenseIndoors
        ? 'Flagged in your home details: stopping indoor smoke or incense gives one of the largest immediate drops in indoor PM2.5.'
        : 'Keep indoor combustion at zero — one mosquito coil can equal dozens of cigarettes in fine smoke.',
      isUrgentForHome: home.smokesOrIncenseIndoors,
    },
    {
      id: 'seal_road_windows',
      tier: 'low',
      tierLabel: 'Low cost',
      title: 'Seal window and door gaps on the main-road side',
      action:
        'Stick low-cost foam weatherstripping tape along sliding window frames and add a fabric/rubber draft stopper under exterior doors.',
      expectedBenefit: home.windowsFacingMainRoad ? 'medium' : 'low',
      limits:
        'Slows outdoor exhaust infiltration by ~20–35%, but you still need clean ventilation or an indoor filter so CO2 does not build up.',
      tailoredReason: home.windowsFacingMainRoad
        ? 'Your windows face a main road — sealing frame gaps blocks peak diesel and dust gusts.'
        : 'Helpful low-cost barrier on windy, dusty evenings.',
      isUrgentForHome: home.windowsFacingMainRoad,
    },
    {
      id: 'diy_corsi_rosenthal',
      tier: 'low',
      tierLabel: 'Low cost',
      title: 'Build a DIY Corsi-Rosenthal box (box fan + 4 MERV-13 filters)',
      action:
        'Tape four MERV-13 pleated furnace filters into a cube with a standard 20-inch box fan on top blowing clean air upward.',
      expectedBenefit: 'high',
      limits:
        'Very effective high-airflow particle cleaning at lower cost than commercial purifiers, but noisier and does not remove cooking gases/NO2.',
      tailoredReason: !home.usesAirPurifier
        ? 'You do not have a commercial purifier yet — a DIY box gives strong bedroom PM2.5 filtration for a fraction of the price.'
        : 'Great low-cost backup unit for a second bedroom or living room.',
      isUrgentForHome: !home.usesAirPurifier && highOutdoorAqi,
      steps: [
        'Buy four 20×20-inch (or 50×50 cm) MERV-13 filters, one 20-inch box fan, and wide duct/painter tape.',
        'Stand the 4 filters in a square wall with all airflow arrows pointing INWARD toward the center.',
        'Tape every vertical seam tightly from top to bottom so unfiltered air cannot leak through gaps.',
        'Cut a square cardboard shroud for the bottom base and tape it flush to seal the floor side.',
        'Place the box fan flat on top blowing UPWARD (away from the cube), tape all 4 edges, and run on Medium or Low.',
      ],
    },
    {
      id: 'cadr_purifier_calc',
      tier: 'invest',
      tierLabel: 'Invest',
      title: 'Choose the right HEPA air purifier size using CADR',
      action:
        'Check the purifier’s Clean Air Delivery Rate (CADR) for your bedroom size before buying. Aim for 4.8 air changes per hour (ACH) in smoky cities.',
      expectedBenefit: 'high',
      limits:
        'True HEPA purifiers remove 99%+ of indoor PM2.5 in closed rooms, but require closing doors/windows and replacing filters every 6–12 months.',
      tailoredReason: home.usesAirPurifier
        ? 'Use the CADR check below to verify your current purifier actually covers your child or senior bedroom.'
        : 'Use the room size calculator below so you do not overpay for an undersized unit.',
      isUrgentForHome: !home.usesAirPurifier,
      includesCadrCalculator: true,
    },
  ];
}

export interface CadrCalculationResult {
  volumeCubicMeters: number;
  recommendedCadrM3h: number;
  recommendedCadrCfm: number;
  targetAch: number;
}

export function calculateCadrRecommendation(
  length: number,
  width: number,
  height: number,
  unit: 'ft' | 'm'
): CadrCalculationResult {
  const safeL = clampNumber(length, 1, 100, 12);
  const safeW = clampNumber(width, 1, 100, 10);
  const safeH = clampNumber(height, 1, 30, 9);

  const factorToMeters = unit === 'ft' ? 0.3048 : 1;
  const volumeCubicMeters = round1(
    safeL * factorToMeters * (safeW * factorToMeters) * (safeH * factorToMeters)
  );
  // Target 4.8 air changes per hour (AHAM / polluted-city HEPA sizing rule)
  const targetAch = 4.8;
  const recommendedCadrM3h = Math.max(50, Math.round(volumeCubicMeters * targetAch));
  const recommendedCadrCfm = Math.max(30, Math.round(recommendedCadrM3h * 0.5886));

  return {
    volumeCubicMeters,
    recommendedCadrM3h,
    recommendedCadrCfm,
    targetAch,
  };
}

export function createSampleFamilyState(): {
  members: FamilyMember[];
  trips: FamilyTrip[];
  home: HomeDetails;
} {
  return {
    members: [
      {
        id: 'm-aarav',
        name: 'Aarav',
        ageGroup: 'child_under_12',
        healthNote: 'asthma',
      },
      {
        id: 'm-ramesh',
        name: 'Dada Ramesh',
        ageGroup: 'senior',
        healthNote: 'heart_condition',
      },
      {
        id: 'm-priya',
        name: 'Priya',
        ageGroup: 'adult',
        healthNote: 'none',
      },
      {
        id: 'm-rohan',
        name: 'Rohan',
        ageGroup: 'adult',
        healthNote: 'none',
      },
    ],
    trips: [
      {
        id: 't-1',
        memberId: 'm-aarav',
        from: 'Home',
        to: 'Primary School',
        distanceKm: 1.6,
        timeOfDay: '08:00',
        travelMode: 'bike_petrol',
        daysPerWeek: 6,
      },
      {
        id: 't-2',
        memberId: 'm-priya',
        from: 'Home',
        to: 'Tech Park Office',
        distanceKm: 11,
        timeOfDay: '09:00',
        travelMode: 'car_petrol_diesel',
        daysPerWeek: 5,
      },
      {
        id: 't-3',
        memberId: 'm-rohan',
        from: 'Home',
        to: 'Wholesale Market',
        distanceKm: 6.5,
        timeOfDay: '18:00',
        travelMode: 'auto',
        daysPerWeek: 6,
      },
      {
        id: 't-4',
        memberId: 'm-ramesh',
        from: 'Home',
        to: 'Neighborhood Clinic & Park',
        distanceKm: 1.2,
        timeOfDay: '19:00',
        travelMode: 'auto',
        daysPerWeek: 4,
      },
    ],
    home: {
      cookingFuel: 'lpg',
      hasChimneyOrExhaust: false,
      usesAirPurifier: false,
      windowsFacingMainRoad: true,
      smokesOrIncenseIndoors: true,
    },
  };
}
