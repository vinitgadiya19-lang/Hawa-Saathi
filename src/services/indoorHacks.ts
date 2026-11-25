import { COOKING_FUEL_FACTORS } from '../config/emissionFactors.ts';
import type { HourlyAirQualityPoint } from '../types/airQuality.ts';
import type { HomeDetails } from './familyPlanCalc.ts';

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

export interface CadrCalculationResult {
  volumeCubicMeters: number;
  recommendedCadrM3h: number;
  recommendedCadrCfm: number;
  targetAch: number;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function clamp(raw: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

/** Find the hour with the lowest forecast US AQI for natural airing windows. */
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

function buildFreeTierHacks(
  home: HomeDetails,
  cleanest: { hourLabel: string | null; aqi: number | null },
  highOutdoorAqi: boolean
): IndoorHackItem[] {
  const cleanestText = cleanest.hourLabel
    ? `${cleanest.hourLabel}${cleanest.aqi !== null ? ` (~${cleanest.aqi} AQI)` : ''}`
    : 'early afternoon (1–4 PM when inversion lifts)';
  const fuelLabel = COOKING_FUEL_FACTORS[home.cookingFuel].label;

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
        home.cookingFuel === 'firewood_biomass' || !home.hasChimneyOrExhaust ? 'high' : 'medium',
      limits:
        'Reduces cooking PM2.5 and NO2 spikes significantly, but does not filter outdoor traffic smoke entering from other rooms.',
      tailoredReason: !home.hasChimneyOrExhaust
        ? `Your home uses ${fuelLabel} without a chimney/exhaust — venting cooking fumes is a top priority.`
        : `Running your chimney keeps ${fuelLabel} fumes from spreading to bedrooms.`,
      isUrgentForHome: !home.hasChimneyOrExhaust || home.cookingFuel === 'firewood_biomass',
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
  ];
}

function buildLowAndInvestHacks(
  home: HomeDetails,
  highOutdoorAqi: boolean
): IndoorHackItem[] {
  return [
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

/** Build ordered indoor air actions (Free -> Low cost -> Invest) tailored to home risks and AQI. */
export function buildTailoredIndoorHacks(
  home: HomeDetails,
  hourly24: HourlyAirQualityPoint[],
  liveAqi: number | null
): IndoorHackItem[] {
  const cleanest = getCleanestForecastHour(hourly24);
  const highOutdoorAqi = typeof liveAqi === 'number' && liveAqi > 100;
  return [
    ...buildFreeTierHacks(home, cleanest, highOutdoorAqi),
    ...buildLowAndInvestHacks(home, highOutdoorAqi),
  ];
}

/**
 * Calculate required purifier CADR targeting 4.8 air changes per hour (AHAM / polluted-city HEPA sizing).
 */
export function calculateCadrRecommendation(
  length: number,
  width: number,
  height: number,
  unit: 'ft' | 'm'
): CadrCalculationResult {
  const safeL = clamp(length, 1, 100, 12);
  const safeW = clamp(width, 1, 100, 10);
  const safeH = clamp(height, 1, 30, 9);

  const factorToMeters = unit === 'ft' ? 0.3048 : 1;
  const volumeCubicMeters = round1(
    safeL * factorToMeters * (safeW * factorToMeters) * (safeH * factorToMeters)
  );
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
