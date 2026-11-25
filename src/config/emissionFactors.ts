/**
 * Approximate transport emission factors, PM2.5 exposure weights,
 * vulnerability multipliers, and cooking fuel factors for Hawa Saathi Family Plan.
 *
 * Every calculated result using these constants is an ESTIMATE, not a measured outcome.
 */

export type TravelModeId =
  | 'walk'
  | 'cycle'
  | 'bike_petrol'
  | 'ev_two_wheeler'
  | 'auto'
  | 'car_petrol_diesel'
  | 'bus'
  | 'metro_train'
  | 'e_rickshaw';

export type AgeGroupId = 'child_under_12' | 'teen' | 'adult' | 'senior';

export type HealthNoteId = 'none' | 'asthma' | 'heart_condition' | 'pregnancy';

export type CookingFuelId = 'lpg' | 'induction' | 'firewood_biomass' | 'png';

export interface TravelModeFactor {
  id: TravelModeId;
  label: string;
  /** Estimated lifecycle tailpipe + grid CO2 equivalent in grams per passenger-km. */
  co2GramsPerPassengerKm: number;
  /**
   * Relative PM2.5 inhalation exposure multiplier vs ambient background AQI.
   * Accounts for road-lane proximity, open vs enclosed cabin, and breathing rate.
   */
  pm25ExposureFactor: number;
  /** Typical urban door-to-door speed used to convert trip km into minutes. */
  avgSpeedKmh: number;
  /** Human-readable citation shown in "How we calculate". */
  source: string;
}

export const TRAVEL_MODE_FACTORS: Record<TravelModeId, TravelModeFactor> = {
  walk: {
    id: 'walk',
    label: 'Walk',
    // Source: Zero tailpipe emissions (IPCC / WRI India Urban Transport Guidelines, 0 g direct CO2/pkm).
    co2GramsPerPassengerKm: 0,
    // Source: Slightly elevated breathing rate during walking near roadside air (WHO / Cepeda et al., Lancet Public Health 2017 ~1.15x).
    pm25ExposureFactor: 1.15,
    avgSpeedKmh: 4.5,
    source: 'Zero tailpipe CO2; ~1.15x breathing weight near streets (WHO / Cepeda et al. 2017)',
  },
  cycle: {
    id: 'cycle',
    label: 'Cycle',
    // Source: Zero tailpipe emissions (IPCC / WRI India Urban Transport Guidelines, 0 g direct CO2/pkm).
    co2GramsPerPassengerKm: 0,
    // Source: Higher minute ventilation while cycling in urban air (~1.35x; Cepeda et al., Lancet Public Health 2017).
    pm25ExposureFactor: 1.35,
    avgSpeedKmh: 13,
    source: 'Zero tailpipe CO2; ~1.35x active cycling inhalation weight (Cepeda et al. 2017)',
  },
  bike_petrol: {
    id: 'bike_petrol',
    label: 'Bike / scooter (petrol)',
    // Source: India GHG Program / WRI India Road Transport v3 (~38 g CO2/km ÷ ~1.15 avg riders ≈ 33 g CO2/pkm).
    co2GramsPerPassengerKm: 33,
    // Source: Open-air riding directly in mixed vehicle exhaust plumes (IIT Delhi / Goel et al. 2015 ~1.5x ambient).
    pm25ExposureFactor: 1.5,
    avgSpeedKmh: 24,
    source: 'India GHG Program (WRI India) petrol 2-wheeler; open-plume riding ~1.5x (IIT Delhi 2015)',
  },
  ev_two_wheeler: {
    id: 'ev_two_wheeler',
    label: 'Electric two-wheeler',
    // Source: CEA India CO2 Baseline Database v19 (~0.716 kg CO2/kWh) × ~0.025 kWh/km ÷ 1.15 riders ≈ 16 g CO2/pkm.
    co2GramsPerPassengerKm: 16,
    // Source: Same open-road traffic plume position as petrol two-wheeler without own tailpipe (~1.4x ambient, IIT Delhi).
    pm25ExposureFactor: 1.4,
    avgSpeedKmh: 24,
    source: 'CEA India grid factor (~0.72 kg/kWh); open-road exposure ~1.4x (IIT Delhi)',
  },
  auto: {
    id: 'auto',
    label: 'Auto-rickshaw',
    // Source: India GHG Program / TERI CNG-petrol 3-wheeler (~72 g CO2/km ÷ ~1.5 avg passengers ≈ 48 g CO2/pkm).
    co2GramsPerPassengerKm: 48,
    // Source: Semi-open cabin idling at signalised intersections (Apte et al., Environ. Sci. Technol. 2011 ~1.45x).
    pm25ExposureFactor: 1.45,
    avgSpeedKmh: 20,
    source: 'India GHG Program 3-wheeler avg; open-cabin signal exposure ~1.45x (Apte et al. 2011)',
  },
  car_petrol_diesel: {
    id: 'car_petrol_diesel',
    label: 'Car (petrol / diesel)',
    // Source: India GHG Program passenger car blended petrol/diesel (~156 g CO2/km ÷ ~1.25 avg occupancy ≈ 125 g CO2/pkm).
    co2GramsPerPassengerKm: 125,
    // Source: Enclosed cabin with partial AC filtration reduces peak spikes vs open road (Goel et al. 2015 ~0.75x).
    pm25ExposureFactor: 0.75,
    avgSpeedKmh: 24,
    source: 'India GHG Program passenger car (1.25 occupancy); enclosed cabin ~0.75x (Goel et al. 2015)',
  },
  bus: {
    id: 'bus',
    label: 'Bus',
    // Source: WRI India / NITI Aayog urban city bus diesel/CNG per passenger-km (~28 g CO2/pkm at typical urban load).
    co2GramsPerPassengerKm: 28,
    // Source: Non-AC/semi-open city bus stops & doors opening in traffic lanes (Goel et al. 2015 ~1.1x).
    pm25ExposureFactor: 1.1,
    avgSpeedKmh: 18,
    source: 'NITI Aayog / WRI India city bus avg; urban stop exposure ~1.1x (Goel et al. 2015)',
  },
  metro_train: {
    id: 'metro_train',
    label: 'Metro or train',
    // Source: DMRC / IEA Rail electricity factor (~0.716 kg/kWh × urban metro kWh/pkm ≈ 14 g CO2/pkm).
    co2GramsPerPassengerKm: 14,
    // Source: Air-conditioned filtered coaches separated from tailpipes (Goel et al., Atmos. Environ. 2015 ~0.55x).
    pm25ExposureFactor: 0.55,
    avgSpeedKmh: 32,
    source: 'DMRC / CEA grid rail avg; filtered AC coach ~0.55x (Goel et al. 2015)',
  },
  e_rickshaw: {
    id: 'e_rickshaw',
    label: 'E-rickshaw',
    // Source: CEA India grid factor × ~0.07 kWh/km ÷ ~2.5 avg passengers ≈ 20 g CO2/pkm.
    co2GramsPerPassengerKm: 20,
    // Source: Open sides moving slowly on crowded last-mile roads (~1.35x ambient, Apte et al. 2011 analog).
    pm25ExposureFactor: 1.35,
    avgSpeedKmh: 15,
    source: 'CEA India grid e-rickshaw avg (2.5 riders); open last-mile ~1.35x',
  },
};

export const TRAVEL_MODE_ORDER: TravelModeId[] = [
  'walk',
  'cycle',
  'bike_petrol',
  'ev_two_wheeler',
  'auto',
  'car_petrol_diesel',
  'bus',
  'metro_train',
  'e_rickshaw',
];

export interface VulnerabilityFactorInfo {
  label: string;
  multiplier: number;
  source: string;
}

export const AGE_VULNERABILITY_FACTORS: Record<AgeGroupId, VulnerabilityFactorInfo> = {
  child_under_12: {
    label: 'Child (under 12)',
    // Source: Children breathe more air per kg body weight while lungs develop (WHO Air Pollution & Child Health 2018).
    multiplier: 1.35,
    source: 'Higher ventilation per kg body weight (WHO 2018)',
  },
  teen: {
    label: 'Teen (12–17)',
    // Source: Active outdoor commuting during school/sports years (WHO / US EPA AirNow sensitive group guidance).
    multiplier: 1.1,
    source: 'Developing lungs & active commutes (WHO / EPA)',
  },
  adult: {
    label: 'Adult (18–59)',
    multiplier: 1.0,
    source: 'Baseline adult exposure weight',
  },
  senior: {
    label: 'Senior (60+)',
    // Source: Higher cardiovascular and respiratory sensitivity to PM2.5 (WHO AQG 2021 / EPA Sensitive Groups).
    multiplier: 1.35,
    source: 'Elevated cardiopulmonary sensitivity (WHO AQG 2021)',
  },
};

export const HEALTH_VULNERABILITY_FACTORS: Record<HealthNoteId, VulnerabilityFactorInfo> = {
  none: {
    label: 'None',
    multiplier: 1.0,
    source: 'No added health sensitivity multiplier',
  },
  asthma: {
    label: 'Asthma',
    // Source: Airway inflammation & bronchodilator trigger risk from PM2.5/NO2/O3 (WHO / GINA guidelines).
    multiplier: 1.4,
    source: 'Elevated airway sensitivity (WHO / GINA)',
  },
  heart_condition: {
    label: 'Heart condition',
    // Source: Fine particulate vascular & cardiac load sensitivity (AHA Scientific Statement on PM2.5, 2010/2020).
    multiplier: 1.35,
    source: 'Cardiovascular PM2.5 sensitivity (AHA)',
  },
  pregnancy: {
    label: 'Pregnancy',
    // Source: Maternal and fetal sensitivity to fine particulate & CO exposure (WHO / ACOG).
    multiplier: 1.35,
    source: 'Maternal-fetal air sensitivity (WHO)',
  },
};

export interface CookingFuelFactor {
  id: CookingFuelId;
  label: string;
  /** Approximate household cooking CO2e in kg per week for an average 3–4 person home. */
  weeklyCo2Kg: number;
  /** Relative indoor PM2.5 contribution risk rating. */
  indoorRiskNote: string;
  source: string;
}

export const COOKING_FUEL_FACTORS: Record<CookingFuelId, CookingFuelFactor> = {
  lpg: {
    id: 'lpg',
    label: 'LPG cylinder',
    // Source: PPAC / IPCC LPG emission factor (~2.98 kg CO2/kg LPG; ~3.4 kg/week ≈ 10.1 kg CO2/week).
    weeklyCo2Kg: 10.1,
    indoorRiskNote: 'Produces NO2 & ultrafine particles unless vented with an exhaust or chimney.',
    source: 'IPCC / PPAC India (~3.4 kg LPG/week × 2.98 kg CO2/kg)',
  },
  induction: {
    id: 'induction',
    label: 'Electric induction',
    // Source: CEA grid avg (~0.716 kg CO2/kWh × ~9 kWh/week electric cooking ≈ 6.4 kg CO2/week, zero indoor NO2).
    weeklyCo2Kg: 6.4,
    indoorRiskNote: 'Zero indoor combustion fumes (lowest indoor NO2 & soot; grid CO2 only).',
    source: 'CEA India grid (~9 kWh/week × 0.72 kg CO2/kWh; zero indoor fumes)',
  },
  firewood_biomass: {
    id: 'firewood_biomass',
    label: 'Firewood / biomass',
    // Source: WHO / IPCC non-renewable biomass household cooking estimate (~28 kg wood/week, high incomplete-combustion PM2.5).
    weeklyCo2Kg: 24.0,
    indoorRiskNote: 'Very high indoor PM2.5 & CO hazard; priority switch to LPG or induction.',
    source: 'WHO / IPCC household biomass cooking estimate (very high indoor smoke)',
  },
  png: {
    id: 'png',
    label: 'Piped natural gas (PNG)',
    // Source: IPCC natural gas emission factor (~8.6 kg CO2/week for typical household cooking).
    weeklyCo2Kg: 8.6,
    indoorRiskNote: 'Cleaner than biomass, still emits indoor NO2 — keep exhaust fan on.',
    source: 'IPCC natural gas household cooking estimate',
  },
};
