import type { Response } from 'express';
import {
  GeminiClientError,
  sanitizeSecretText,
} from './geminiFallback.ts';
import type {
  HourlyForecastInput,
  SupportedLanguage,
} from './ruleBasedFallback.ts';
import type { FamilyPlanLanguage } from './familyPlan.ts';
import {
  MAX_DAYS_PER_WEEK,
  MAX_DISTANCE_KM,
  MAX_FAMILY_MEMBERS,
  sanitizeFreeText,
  validateMembersList,
  validateTripInput,
  type FamilyMember,
  type FamilyTrip,
  type HomeDetails,
} from '../src/services/familyPlanCalc.ts';
import {
  COOKING_FUEL_FACTORS,
  type AgeGroupId,
  type CookingFuelId,
  type HealthNoteId,
} from '../src/config/emissionFactors.ts';
import type { HourlyAirQualityPoint } from '../src/types/airQuality.ts';

const ALLOWED_ROLES = new Set([
  'delivery',
  'driver',
  'vendor',
  'police',
  'general',
]);
const ALLOWED_LANGUAGES = new Set<SupportedLanguage>(['en', 'hi', 'hinglish']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_QUESTION_CHARS = 1000;
const MAX_IMAGE_BASE64_CHARS = 7_000_000; // ~5MB binary image

export interface ValidatedBasePayload {
  role: string;
  aqiBand: string;
  aqi?: number;
  hoursOutside: number;
  mainPollutant?: string;
  locationName?: string;
  language: SupportedLanguage;
}

export function parseLanguage(raw: unknown): SupportedLanguage {
  if (typeof raw === 'string' && ALLOWED_LANGUAGES.has(raw as SupportedLanguage)) {
    return raw as SupportedLanguage;
  }
  return 'en';
}

export function languageInstruction(lang: SupportedLanguage): string {
  if (lang === 'hi') {
    return 'Reply in simple, everyday Hindi (Devanagari script) easy for outdoor workers to understand.';
  }
  if (lang === 'hinglish') {
    return 'Reply in natural, simple Hinglish (Hindi words written in English letters) easy for Indian outdoor workers to read.';
  }
  return 'Reply in plain, clear everyday English.';
}

function requireRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new GeminiClientError('Request body must be a JSON object.', 400, 'BAD_REQUEST');
  }
  return body as Record<string, unknown>;
}

function parseOptionalAqi(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new GeminiClientError('aqi must be a valid number.', 400, 'BAD_REQUEST');
  }
  return Math.max(0, Math.min(1000, Math.round(raw)));
}

function parseOptionalString(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return sanitizeFreeText(raw, maxLen) || undefined;
}

export function validateBasePayload(body: unknown): ValidatedBasePayload {
  const data = requireRecord(body);
  const role = typeof data.role === 'string' ? data.role.trim() : '';
  const aqiBand = sanitizeFreeText(data.aqiBand, 60);

  if (!ALLOWED_ROLES.has(role)) {
    throw new GeminiClientError('Invalid worker role.', 400, 'BAD_REQUEST');
  }
  if (!aqiBand) {
    throw new GeminiClientError('Valid aqiBand is required.', 400, 'BAD_REQUEST');
  }

  const defaultHours = role === 'general' ? 2 : 8;
  const rawHours =
    typeof data.hoursOutside === 'number' && Number.isFinite(data.hoursOutside)
      ? Math.round(data.hoursOutside)
      : defaultHours;

  return {
    role,
    aqiBand,
    aqi: parseOptionalAqi(data.aqi),
    hoursOutside: Math.max(1, Math.min(24, rawHours)),
    mainPollutant: parseOptionalString(data.mainPollutant, 40),
    locationName: parseOptionalString(data.locationName, 80),
    language: parseLanguage(data.language),
  };
}

export function validateChatPayload(body: unknown): ValidatedBasePayload & {
  question: string;
} {
  const base = validateBasePayload(body);
  const rawQuestion = (body as Record<string, unknown>).question;
  if (typeof rawQuestion !== 'string') {
    throw new GeminiClientError('Question must be a text string.', 400, 'BAD_REQUEST');
  }
  const question = sanitizeFreeText(rawQuestion, MAX_QUESTION_CHARS + 50);

  if (!question) {
    throw new GeminiClientError('Please type a question first.', 400, 'BAD_REQUEST');
  }
  if (rawQuestion.trim().length > MAX_QUESTION_CHARS) {
    throw new GeminiClientError(
      `Question must be under ${MAX_QUESTION_CHARS} characters.`,
      400,
      'BAD_REQUEST'
    );
  }
  return { ...base, question };
}

export function validateShiftPlanPayload(body: unknown): ValidatedBasePayload & {
  shiftFocus: string;
  hourly24: HourlyForecastInput[];
} {
  const base = validateBasePayload(body);
  const bodyObj = body as Record<string, unknown>;
  const shiftFocus =
    sanitizeFreeText(bodyObj.shiftFocus, 200) || 'Full outdoor day shift';

  const rawHourly = Array.isArray(bodyObj.hourly24) ? bodyObj.hourly24 : [];
  const hourly24: HourlyForecastInput[] = rawHourly
    .slice(0, 24)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      hourLabel: sanitizeFreeText(item.hourLabel, 20) || 'Hour',
      us_aqi:
        typeof item.us_aqi === 'number' && Number.isFinite(item.us_aqi)
          ? Math.max(0, Math.min(1000, Math.round(item.us_aqi)))
          : null,
    }));

  return { ...base, shiftFocus, hourly24 };
}

export function validatePhotoAuditPayload(body: unknown): ValidatedBasePayload & {
  mimeType: string;
  imageBase64: string;
  note: string;
} {
  const base = validateBasePayload(body);
  const bodyObj = body as Record<string, unknown>;
  const mimeType = typeof bodyObj.mimeType === 'string' ? bodyObj.mimeType.trim() : '';
  const imageBase64 =
    typeof bodyObj.imageBase64 === 'string' ? bodyObj.imageBase64.trim() : '';
  const note =
    sanitizeFreeText(bodyObj.note, 300) ||
    'Check mask fit or outdoor street exposure in this photo.';

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new GeminiClientError(
      'Unsupported image format. Upload JPEG, PNG, or WebP.',
      400,
      'BAD_REQUEST'
    );
  }
  if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    throw new GeminiClientError('Image is missing or larger than 5MB.', 400, 'BAD_REQUEST');
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    throw new GeminiClientError('Invalid base64 image encoding.', 400, 'BAD_REQUEST');
  }

  return { ...base, mimeType, imageBase64, note };
}

export interface ValidatedFamilyPlanPayload {
  language: FamilyPlanLanguage;
  cityName: string;
  aqiBand: string;
  liveAqi: number | null;
  members: FamilyMember[];
  trips: FamilyTrip[];
  home: HomeDetails;
  hourly24: HourlyAirQualityPoint[];
  selectedScenarioIds: string[];
}

function parseMembersPayload(rawMembersInput: unknown): FamilyMember[] {
  if (!Array.isArray(rawMembersInput) || rawMembersInput.length === 0) {
    throw new GeminiClientError('Add at least 1 family member.', 400, 'BAD_REQUEST');
  }
  if (rawMembersInput.length > MAX_FAMILY_MEMBERS) {
    throw new GeminiClientError(
      `At most ${MAX_FAMILY_MEMBERS} family members allowed.`,
      400,
      'BAD_REQUEST'
    );
  }
  const mapped: FamilyMember[] = rawMembersInput.map((item, idx) => {
    const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      id: sanitizeFreeText(rec.id, 40) || `m-${idx + 1}`,
      name: sanitizeFreeText(rec.name, 100) || `Member ${idx + 1}`,
      ageGroup: (typeof rec.ageGroup === 'string' ? rec.ageGroup : 'adult') as AgeGroupId,
      healthNote: (typeof rec.healthNote === 'string' ? rec.healthNote : 'none') as HealthNoteId,
    };
  });
  return validateMembersList(mapped);
}

function parseTripsPayload(rawTripsInput: unknown, fallbackMemberId: string): FamilyTrip[] {
  if (!Array.isArray(rawTripsInput) || rawTripsInput.length === 0) {
    throw new GeminiClientError(
      'Add at least 1 daily journey before generating steps.',
      400,
      'BAD_REQUEST'
    );
  }
  if (rawTripsInput.length > 30) {
    throw new GeminiClientError('Maximum 30 trips allowed per plan.', 400, 'BAD_REQUEST');
  }
  return rawTripsInput.map((item, idx) => {
    const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const checked = validateTripInput({
      from: rec.from,
      to: rec.to,
      distanceKm: rec.distanceKm,
      daysPerWeek: rec.daysPerWeek,
      timeOfDay: rec.timeOfDay,
      travelMode: rec.travelMode,
    });
    if (!checked.valid) {
      throw new GeminiClientError(
        `Trip ${idx + 1}: ${checked.errors.join(' ')} (distance 0–${MAX_DISTANCE_KM} km, days 0–${MAX_DAYS_PER_WEEK})`,
        400,
        'BAD_REQUEST'
      );
    }
    return {
      id: sanitizeFreeText(rec.id, 40) || `t-${idx + 1}`,
      memberId: sanitizeFreeText(rec.memberId, 40) || fallbackMemberId,
      ...checked.sanitized,
    };
  });
}

function parseHomePayload(rawHomeInput: unknown): HomeDetails {
  const rawHome =
    rawHomeInput && typeof rawHomeInput === 'object'
      ? (rawHomeInput as Record<string, unknown>)
      : {};
  const rawFuel = typeof rawHome.cookingFuel === 'string' ? rawHome.cookingFuel : 'lpg';
  const cookingFuel: CookingFuelId = Object.prototype.hasOwnProperty.call(
    COOKING_FUEL_FACTORS,
    rawFuel
  )
    ? (rawFuel as CookingFuelId)
    : 'lpg';
  return {
    cookingFuel,
    hasChimneyOrExhaust: Boolean(rawHome.hasChimneyOrExhaust),
    usesAirPurifier: Boolean(rawHome.usesAirPurifier),
    windowsFacingMainRoad: Boolean(rawHome.windowsFacingMainRoad),
    smokesOrIncenseIndoors: Boolean(rawHome.smokesOrIncenseIndoors),
  };
}

export function validateFamilyPlanPayload(body: unknown): ValidatedFamilyPlanPayload {
  const data = requireRecord(body);
  const rawLang = typeof data.language === 'string' ? data.language.trim() : 'en';
  const language: FamilyPlanLanguage = rawLang === 'hi' || rawLang === 'mr' ? rawLang : 'en';
  const members = parseMembersPayload(data.members);
  const trips = parseTripsPayload(data.trips, members[0].id);

  const rawHourly = Array.isArray(data.hourly24) ? data.hourly24 : [];
  const hourly24: HourlyAirQualityPoint[] = rawHourly
    .slice(0, 24)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      time: sanitizeFreeText(item.time, 40),
      hourLabel: sanitizeFreeText(item.hourLabel, 20) || 'Hour',
      us_aqi:
        typeof item.us_aqi === 'number' && Number.isFinite(item.us_aqi)
          ? Math.max(0, Math.min(1000, Math.round(item.us_aqi)))
          : null,
      pm2_5: null,
      pm10: null,
      nitrogen_dioxide: null,
      ozone: null,
      carbon_monoxide: null,
    }));

  const selectedScenarioIds = Array.isArray(data.selectedScenarioIds)
    ? data.selectedScenarioIds
        .filter((id): id is string => typeof id === 'string')
        .map((id) => sanitizeFreeText(id, 60))
        .filter(Boolean)
    : [];

  return {
    language,
    cityName: sanitizeFreeText(data.cityName, 100) || 'Current city',
    aqiBand: sanitizeFreeText(data.aqiBand, 60) || 'Moderate',
    liveAqi: parseOptionalAqi(data.liveAqi) ?? null,
    members,
    trips,
    home: parseHomePayload(data.home),
    hourly24,
    selectedScenarioIds,
  };
}

export function handleApiError(res: Response, err: unknown): void {
  if (err instanceof GeminiClientError) {
    res.status(err.statusCode).json({
      error: sanitizeSecretText(err.message, process.env.GEMINI_API_KEY),
      code: err.code,
    });
    return;
  }
  const msg = sanitizeSecretText(
    err instanceof Error ? err.message : 'Unexpected server error',
    process.env.GEMINI_API_KEY
  );
  console.error('[API Error]', msg);
  res.status(500).json({
    error: 'Failed to process request.',
    code: 'INTERNAL_ERROR',
  });
}
