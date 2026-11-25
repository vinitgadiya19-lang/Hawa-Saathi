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
import {
  computeCombinedImpactAfterSteps,
  computeWhatIfScenarios,
  type ScenarioCost,
  type ScenarioEffort,
  type WhatIfScenario,
} from './familyWhatIf.ts';
import {
  buildTailoredIndoorHacks,
  calculateCadrRecommendation,
  getCleanestForecastHour,
  type CadrCalculationResult,
  type IndoorHackItem,
} from './indoorHacks.ts';

export {
  buildTailoredIndoorHacks,
  calculateCadrRecommendation,
  computeCombinedImpactAfterSteps,
  computeWhatIfScenarios,
  getCleanestForecastHour,
};
export type {
  CadrCalculationResult,
  IndoorHackItem,
  ScenarioCost,
  ScenarioEffort,
  WhatIfScenario,
};

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
  const safeChars = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127 && ch !== '<' && ch !== '>';
    })
    .join('');
  return safeChars.replace(/\s+/g, ' ').trim().slice(0, maxLen);
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

function parseTimeAndMode(
  rawTimeInput: unknown,
  rawModeInput: unknown,
  errors: string[]
): { timeOfDay: string; travelMode: TravelModeId } {
  const rawTime = typeof rawTimeInput === 'string' ? rawTimeInput.trim() : '08:00';
  const timeMatch = rawTime.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!timeMatch) errors.push('Choose a valid time of day (HH:MM).');
  const timeOfDay = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : '08:00';

  const rawMode = typeof rawModeInput === 'string' ? rawModeInput : '';
  const isKnownMode = Object.prototype.hasOwnProperty.call(TRAVEL_MODE_FACTORS, rawMode);
  if (!isKnownMode) errors.push('Choose a valid travel mode.');

  return {
    timeOfDay,
    travelMode: isKnownMode ? (rawMode as TravelModeId) : 'bus',
  };
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

  const rawDist = Number(input.distanceKm);
  if (!Number.isFinite(rawDist) || rawDist < 0 || rawDist > MAX_DISTANCE_KM) {
    errors.push(`Distance must be between 0 and ${MAX_DISTANCE_KM} km.`);
  }

  const rawDays = Number(input.daysPerWeek);
  if (!Number.isFinite(rawDays) || rawDays < 0 || rawDays > MAX_DAYS_PER_WEEK) {
    errors.push(`Days per week must be between 0 and ${MAX_DAYS_PER_WEEK}.`);
  }

  const { timeOfDay, travelMode } = parseTimeAndMode(
    input.timeOfDay,
    input.travelMode,
    errors
  );

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
  return members.slice(0, MAX_FAMILY_MEMBERS).map((m, idx) => {
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
}

function parseHourFromTimeString(timeStr: string): number | null {
  const isoMatch = timeStr.match(/T(\d{2}):/);
  if (isoMatch) return Number(isoMatch[1]);

  const hhmmMatch = timeStr.match(/^(\d{1,2}):\d{2}$/);
  if (hhmmMatch) return Number(hhmmMatch[1]);

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
    // Match exact hour or nearest circular 24-hour slot
    let bestPt: HourlyAirQualityPoint | null = null;
    let bestDiff = Infinity;
    for (const pt of hourly24) {
      if (typeof pt.us_aqi !== 'number') continue;
      const h =
        parseHourFromTimeString(pt.time) ??
        parseHourFromTimeString(pt.hourLabel);
      if (h === null) continue;
      if (h === targetHour) return Math.round(pt.us_aqi);
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

export function getMemberVulnerabilityFactor(member: FamilyMember): number {
  const ageFactor = AGE_VULNERABILITY_FACTORS[member.ageGroup]?.multiplier ?? 1.0;
  const healthFactor =
    HEALTH_VULNERABILITY_FACTORS[member.healthNote]?.multiplier ?? 1.0;
  return Number((ageFactor * healthFactor).toFixed(2));
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function computeSingleTrip(
  rawTrip: FamilyTrip,
  member: FamilyMember,
  hourly24: HourlyAirQualityPoint[],
  liveAqi: number | null
): CalculatedTripResult {
  const { from, to, distanceKm, daysPerWeek, timeOfDay, travelMode } =
    validateTripInput(rawTrip).sanitized;
  const factor = TRAVEL_MODE_FACTORS[travelMode];
  const durationMinutes =
    distanceKm > 0 ? Math.max(1, Math.round((distanceKm / factor.avgSpeedKmh) * 60)) : 0;
  const slotAqi = getSlotAqiForTime(timeOfDay, hourly24, liveAqi);
  const tripCo2Grams = Math.round(distanceKm * factor.co2GramsPerPassengerKm);
  const weeklyCo2Kg = round1((tripCo2Grams * daysPerWeek) / 1000);
  const vulnerabilityFactor = getMemberVulnerabilityFactor(member);
  const tripExposureScore =
    slotAqi !== null
      ? Math.round(slotAqi * durationMinutes * factor.pm25ExposureFactor * vulnerabilityFactor)
      : null;

  return {
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
    slotBand: getTimeSlotBand(slotAqi),
    tripCo2Grams,
    weeklyCo2Kg,
    vulnerabilityFactor,
    tripExposureScore,
    weeklyExposureScore: tripExposureScore !== null ? tripExposureScore * daysPerWeek : null,
  };
}

function buildSortedMemberTotals(
  members: FamilyMember[],
  calculatedTrips: CalculatedTripResult[],
  hasLiveAqi: boolean
): MemberTotalResult[] {
  const totals = new Map<string, { co2: number; exposure: number | null; count: number }>();
  for (const m of members) {
    totals.set(m.id, { co2: 0, exposure: hasLiveAqi ? 0 : null, count: 0 });
  }
  for (const t of calculatedTrips) {
    const entry = totals.get(t.memberId);
    if (!entry) continue;
    entry.co2 = round1(entry.co2 + t.weeklyCo2Kg);
    entry.count += 1;
    if (t.weeklyExposureScore !== null) {
      entry.exposure = (entry.exposure ?? 0) + t.weeklyExposureScore;
    }
  }

  return members
    .map((m) => {
      const agg = totals.get(m.id) ?? { co2: 0, exposure: null, count: 0 };
      return {
        memberId: m.id,
        name: m.name,
        ageGroup: m.ageGroup,
        ageLabel: AGE_VULNERABILITY_FACTORS[m.ageGroup].label,
        healthNote: m.healthNote,
        healthLabel: HEALTH_VULNERABILITY_FACTORS[m.healthNote].label,
        isChildOrSenior: m.ageGroup === 'child_under_12' || m.ageGroup === 'senior',
        hasHealthCondition: m.healthNote !== 'none',
        vulnerabilityFactor: getMemberVulnerabilityFactor(m),
        tripCount: agg.count,
        weeklyCo2Kg: agg.co2,
        weeklyExposureScore: agg.exposure,
      };
    })
    .sort((a, b) => {
      const expA = a.weeklyExposureScore ?? -1;
      const expB = b.weeklyExposureScore ?? -1;
      return expB !== expA ? expB - expA : b.weeklyCo2Kg - a.weeklyCo2Kg;
    });
}

export function calculateFamilyImpact(params: {
  members: FamilyMember[];
  trips: FamilyTrip[];
  home: HomeDetails;
  hourly24: HourlyAirQualityPoint[];
  liveAqi: number | null;
}): FamilyCalculationSummary {
  const members = validateMembersList(params.members);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const cleanest = getCleanestForecastHour(params.hourly24);
  const hasLiveAqi =
    (typeof params.liveAqi === 'number' && Number.isFinite(params.liveAqi)) ||
    cleanest.aqi !== null;

  const calculatedTrips: CalculatedTripResult[] = [];
  for (const rawTrip of params.trips) {
    const member = memberById.get(rawTrip.memberId) ?? members[0];
    if (member) {
      calculatedTrips.push(computeSingleTrip(rawTrip, member, params.hourly24, params.liveAqi));
    }
  }

  const memberTotals = buildSortedMemberTotals(members, calculatedTrips, hasLiveAqi);
  const weeklyTravelCo2Kg = round1(calculatedTrips.reduce((sum, t) => sum + t.weeklyCo2Kg, 0));
  const weeklyCookingCo2Kg = COOKING_FUEL_FACTORS[params.home.cookingFuel]?.weeklyCo2Kg ?? 10.1;
  const weeklyTotalCo2Kg = round1(weeklyTravelCo2Kg + weeklyCookingCo2Kg);
  const weeklyTotalExposure = hasLiveAqi
    ? calculatedTrips.reduce((sum, t) => sum + (t.weeklyExposureScore ?? 0), 0)
    : null;

  return {
    trips: calculatedTrips,
    memberTotals,
    weeklyTravelCo2Kg,
    weeklyCookingCo2Kg,
    weeklyTotalCo2Kg,
    weeklyTotalExposure,
    hasAnyHealthNote: members.some((m) => m.healthNote !== 'none'),
    hasLiveAqi,
    cleanestHourLabel: cleanest.hourLabel,
    cleanestHourAqi: cleanest.aqi,
    scenarios: computeWhatIfScenarios({
      trips: calculatedTrips,
      members: memberTotals,
      home: params.home,
      weeklyTotalCo2Kg,
      weeklyTotalExposure,
      cleanestHourLabel: cleanest.hourLabel,
      cleanestHourAqi: cleanest.aqi,
    }),
  };
}

export function createSampleFamilyState(): {
  members: FamilyMember[];
  trips: FamilyTrip[];
  home: HomeDetails;
} {
  return {
    members: [
      { id: 'm-aarav', name: 'Aarav', ageGroup: 'child_under_12', healthNote: 'asthma' },
      { id: 'm-ramesh', name: 'Dada Ramesh', ageGroup: 'senior', healthNote: 'heart_condition' },
      { id: 'm-priya', name: 'Priya', ageGroup: 'adult', healthNote: 'none' },
      { id: 'm-rohan', name: 'Rohan', ageGroup: 'adult', healthNote: 'none' },
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
