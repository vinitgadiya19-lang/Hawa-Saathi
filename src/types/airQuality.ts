export type WorkerRoleId =
  | 'delivery'
  | 'driver'
  | 'vendor'
  | 'police'
  | 'general';

export interface RoleDefinition {
  id: WorkerRoleId;
  label: string;
  shortLabel: string;
  tagline: string;
  cardBg: string;
}

export interface SelectedLocation {
  name: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
  source: 'gps' | 'search';
}

export interface GeocodingCity {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

export interface PollutantReadings {
  pm2_5: number | null;
  pm10: number | null;
  nitrogen_dioxide: number | null;
  ozone: number | null;
  carbon_monoxide: number | null;
}

export interface HourlyAirQualityPoint extends PollutantReadings {
  time: string;
  hourLabel: string;
  us_aqi: number | null;
}

export interface LiveAirQualityData {
  latitude: number;
  longitude: number;
  timezone: string;
  currentTime: string;
  us_aqi: number;
  pollutants: PollutantReadings;
  hourly24: HourlyAirQualityPoint[];
}

export type AqiBandLevel =
  | 'good'
  | 'moderate'
  | 'sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous';

export interface AqiBandInfo {
  level: AqiBandLevel;
  label: string;
  rangeText: string;
  summary: string;
  bgClass: string;
  barColor: string;
  textColorClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
}

export interface MainPollutantInfo {
  key: keyof PollutantReadings;
  symbol: string;
  name: string;
  value: number | null;
  unit: string;
  sourceNote: string;
}
