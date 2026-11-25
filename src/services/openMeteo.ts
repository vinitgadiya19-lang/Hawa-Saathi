import {
  GeocodingCity,
  HourlyAirQualityPoint,
  LiveAirQualityData,
} from '../types/airQuality';

const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export async function searchCities(
  query: string,
  signal?: AbortSignal
): Promise<GeocodingCity[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const url = new URL(GEOCODING_BASE);
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', '6');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), { signal });
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

  if (!Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((item) => ({
    id: item.id,
    name: item.name,
    latitude: item.latitude,
    longitude: item.longitude,
    country: item.country ?? '',
    admin1: item.admin1,
  }));
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

export async function fetchAirQuality(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<LiveAirQualityData> {
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

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    throw new Error(`Air quality service returned status ${response.status}`);
  }

  const json = (await response.json()) as {
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
  };

  if (!json.current || typeof json.current.us_aqi !== 'number' || !Number.isFinite(json.current.us_aqi)) {
    throw new Error('Incomplete live air quality reading');
  }

  const times = json.hourly?.time ?? [];
  const currentTime = json.current.time ?? '';
  const currentHourPrefix = currentTime.slice(0, 13); // "YYYY-MM-DDTHH"

  let startIndex = times.findIndex((t) => t.slice(0, 13) >= currentHourPrefix);
  if (startIndex < 0) {
    startIndex = 0;
  }

  const hourly24: HourlyAirQualityPoint[] = [];
  for (let i = startIndex; i < Math.min(startIndex + 24, times.length); i++) {
    hourly24.push({
      time: times[i],
      hourLabel: i === startIndex ? 'Now' : formatHourLabel(times[i]),
      us_aqi: safeNumber(json.hourly?.us_aqi?.[i]),
      pm2_5: safeNumber(json.hourly?.pm2_5?.[i]),
      pm10: safeNumber(json.hourly?.pm10?.[i]),
      nitrogen_dioxide: safeNumber(json.hourly?.nitrogen_dioxide?.[i]),
      ozone: safeNumber(json.hourly?.ozone?.[i]),
      carbon_monoxide: safeNumber(json.hourly?.carbon_monoxide?.[i]),
    });
  }

  return {
    latitude: json.latitude ?? latitude,
    longitude: json.longitude ?? longitude,
    timezone: json.timezone ?? 'Local time',
    currentTime,
    us_aqi: Math.round(json.current.us_aqi),
    pollutants: {
      pm2_5: safeNumber(json.current.pm2_5),
      pm10: safeNumber(json.current.pm10),
      nitrogen_dioxide: safeNumber(json.current.nitrogen_dioxide),
      ozone: safeNumber(json.current.ozone),
      carbon_monoxide: safeNumber(json.current.carbon_monoxide),
    },
    hourly24,
  };
}
