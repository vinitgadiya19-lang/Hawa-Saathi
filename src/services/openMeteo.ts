import type {
  GeocodingCity,
  HourlyAirQualityPoint,
  LiveAirQualityData,
} from '../types/airQuality.ts';

const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const CITY_CACHE_TTL_MS = 10 * 60_000;
const AQI_CACHE_TTL_MS = 5 * 60_000;

interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

const cityCache = new Map<string, CacheItem<GeocodingCity[]>>();
const aqiCache = new Map<string, CacheItem<LiveAirQualityData>>();
const inFlightAqi = new Map<string, Promise<LiveAirQualityData>>();
const inFlightCity = new Map<string, Promise<GeocodingCity[]>>();

/** Exposed for deterministic unit tests. */
export function clearOpenMeteoCache(): void {
  cityCache.clear();
  aqiCache.clear();
  inFlightAqi.clear();
  inFlightCity.clear();
}

export async function searchCities(
  query: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<GeocodingCity[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const key = trimmed.toLowerCase();
  const now = Date.now();
  const hit = cityCache.get(key);
  if (hit && now < hit.expiresAt) {
    return hit.value;
  }

  const pending = inFlightCity.get(key);
  if (pending && !signal) {
    return pending;
  }

  const url = new URL(GEOCODING_BASE);
  url.searchParams.set('name', trimmed.slice(0, 100));
  url.searchParams.set('count', '6');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const request = (async () => {
    const response = await fetchImpl(url.toString(), { signal });
    if (!response.ok) {
      throw new Error(`City search failed (${response.status})`);
    }

    const data = (await response.json()) as {
      results?: Array<{
        id: number;
        name: string;
        latitude: number;
        longitude: number;
        country?: string;
        admin1?: string;
      }>;
    };

    const mapped = Array.isArray(data.results)
      ? data.results.map((item) => ({
          id: item.id,
          name: item.name,
          latitude: item.latitude,
          longitude: item.longitude,
          country: item.country ?? '',
          admin1: item.admin1,
        }))
      : [];

    cityCache.set(key, { value: mapped, expiresAt: Date.now() + CITY_CACHE_TTL_MS });
    return mapped;
  })();

  if (!signal) {
    inFlightCity.set(key, request);
  }
  try {
    return await request;
  } finally {
    inFlightCity.delete(key);
  }
}

function formatHourLabel(isoTime: string): string {
  // Open-Meteo returns local time like "2026-11-24T14:00"
  const parts = isoTime.split('T');
  if (parts.length !== 2) return isoTime;
  const [hourStr] = parts[1].split(':');
  const hour = Number(hourStr);
  if (!Number.isFinite(hour)) return parts[1];
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function safeNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  return null;
}

interface OpenMeteoAirJson {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  current?: {
    time?: string;
    us_aqi?: number | null;
    pm2_5?: number | null;
    pm10?: number | null;
    nitrogen_dioxide?: number | null;
    ozone?: number | null;
    carbon_monoxide?: number | null;
  };
  hourly?: {
    time?: string[];
    us_aqi?: (number | null)[];
    pm2_5?: (number | null)[];
    pm10?: (number | null)[];
    nitrogen_dioxide?: (number | null)[];
    ozone?: (number | null)[];
    carbon_monoxide?: (number | null)[];
  };
}

function buildHourlyPoint(
  hourly: OpenMeteoAirJson['hourly'],
  time: string,
  index: number,
  isFirst: boolean
): HourlyAirQualityPoint {
  return {
    time,
    hourLabel: isFirst ? 'Now' : formatHourLabel(time),
    us_aqi: safeNumber(hourly?.us_aqi?.[index]),
    pm2_5: safeNumber(hourly?.pm2_5?.[index]),
    pm10: safeNumber(hourly?.pm10?.[index]),
    nitrogen_dioxide: safeNumber(hourly?.nitrogen_dioxide?.[index]),
    ozone: safeNumber(hourly?.ozone?.[index]),
    carbon_monoxide: safeNumber(hourly?.carbon_monoxide?.[index]),
  };
}

function parseAirQualityResponse(
  json: OpenMeteoAirJson,
  latitude: number,
  longitude: number
): LiveAirQualityData {
  const current = json.current;
  if (!current || typeof current.us_aqi !== 'number' || !Number.isFinite(current.us_aqi)) {
    throw new Error('Incomplete live air quality reading');
  }

  const times = json.hourly?.time ?? [];
  const currentTime = current.time ?? '';
  const currentHourPrefix = currentTime.slice(0, 13);
  const foundIdx = times.findIndex((t) => t.slice(0, 13) >= currentHourPrefix);
  const startIndex = foundIdx < 0 ? 0 : foundIdx;

  const hourly24: HourlyAirQualityPoint[] = [];
  for (let i = startIndex; i < Math.min(startIndex + 24, times.length); i++) {
    hourly24.push(buildHourlyPoint(json.hourly, times[i], i, i === startIndex));
  }

  return {
    latitude: json.latitude ?? latitude,
    longitude: json.longitude ?? longitude,
    timezone: json.timezone ?? 'Local time',
    currentTime,
    us_aqi: Math.round(current.us_aqi),
    pollutants: {
      pm2_5: safeNumber(current.pm2_5),
      pm10: safeNumber(current.pm10),
      nitrogen_dioxide: safeNumber(current.nitrogen_dioxide),
      ozone: safeNumber(current.ozone),
      carbon_monoxide: safeNumber(current.carbon_monoxide),
    },
    hourly24,
  };
}

export async function fetchAirQuality(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<LiveAirQualityData> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Invalid coordinates for air quality lookup.');
  }

  // Round to ~110 m grid so repeated checks reuse cached Open-Meteo data
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = aqiCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const pending = inFlightAqi.get(cacheKey);
  if (pending && !signal) {
    return pending;
  }

  const url = new URL(AIR_QUALITY_BASE);
  url.searchParams.set('latitude', latitude.toFixed(4));
  url.searchParams.set('longitude', longitude.toFixed(4));
  url.searchParams.set(
    'current',
    'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide'
  );
  url.searchParams.set(
    'hourly',
    'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide'
  );
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', 'auto');

  const request = (async () => {
    const response = await fetchImpl(url.toString(), { signal });
    if (!response.ok) {
      throw new Error(`Air quality service returned status ${response.status}`);
    }
    const json = (await response.json()) as OpenMeteoAirJson;
    const result = parseAirQualityResponse(json, latitude, longitude);
    aqiCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + AQI_CACHE_TTL_MS,
    });
    return result;
  })();

  if (!signal) {
    inFlightAqi.set(cacheKey, request);
  }
  try {
    return await request;
  } finally {
    inFlightAqi.delete(cacheKey);
  }
}
