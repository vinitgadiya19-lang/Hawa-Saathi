import type {
  AqiBandInfo,
  HourlyAirQualityPoint,
  MainPollutantInfo,
  PollutantReadings,
  RoleDefinition,
  WorkerRoleId,
} from '../types/airQuality.ts';

export const WORKER_ROLES: RoleDefinition[] = [
  {
    id: 'delivery',
    label: 'Delivery Rider',
    shortLabel: 'Delivery Rider',
    tagline: 'Two-wheeler & cycle couriers riding through traffic',
    cardBg: 'bg-[#EAD6FF]',
  },
  {
    id: 'driver',
    label: 'Cab / Auto Driver',
    shortLabel: 'Cab/Auto Driver',
    tagline: 'Auto-rickshaw, taxi & commercial drivers on main roads',
    cardBg: 'bg-[#FFF3B0]',
  },
  {
    id: 'vendor',
    label: 'Street Vendor',
    shortLabel: 'Street Vendor',
    tagline: 'Roadside stall owners & hawkers standing for long hours',
    cardBg: 'bg-[#FFE0EA]',
  },
  {
    id: 'police',
    label: 'Traffic Police',
    shortLabel: 'Traffic Police',
    tagline: 'Officers & marshals managing busy intersections',
    cardBg: 'bg-[#D2F5E3]',
  },
  {
    id: 'general',
    label: 'General',
    shortLabel: 'General',
    tagline: 'Walkers, commuters, runners & families heading outdoors',
    cardBg: 'bg-[#D6EEFF]',
  },
];

export function getRoleDefinition(roleId: WorkerRoleId): RoleDefinition {
  return WORKER_ROLES.find((r) => r.id === roleId) ?? WORKER_ROLES[4];
}

export function getAqiBand(aqi: number): AqiBandInfo {
  if (aqi <= 50) {
    return {
      level: 'good',
      label: 'Good',
      rangeText: '0 – 50 US AQI',
      summary: 'Clean air. Safe for full outdoor shifts and heavy work.',
      bgClass: 'bg-[#6EE7B7]',
      barColor: '#34D399',
      textColorClass: 'text-[#141414]',
      badgeBgClass: 'bg-[#141414]',
      badgeTextClass: 'text-[#FFFFFF]',
    };
  }
  if (aqi <= 100) {
    return {
      level: 'moderate',
      label: 'Moderate',
      rangeText: '51 – 100 US AQI',
      summary: 'Acceptable air, though sensitive lungs may feel mild irritation.',
      bgClass: 'bg-[#FFD23F]',
      barColor: '#FACC15',
      textColorClass: 'text-[#141414]',
      badgeBgClass: 'bg-[#141414]',
      badgeTextClass: 'text-[#FFFFFF]',
    };
  }
  if (aqi <= 150) {
    return {
      level: 'sensitive',
      label: 'Unhealthy for sensitive',
      rangeText: '101 – 150 US AQI',
      summary: 'Long outdoor shifts can trigger throat irritation or fatigue.',
      bgClass: 'bg-[#FDBA74]',
      barColor: '#FB923C',
      textColorClass: 'text-[#141414]',
      badgeBgClass: 'bg-[#141414]',
      badgeTextClass: 'text-[#FFFFFF]',
    };
  }
  if (aqi <= 200) {
    return {
      level: 'unhealthy',
      label: 'Unhealthy',
      rangeText: '151 – 200 US AQI',
      summary: 'Everyone outdoors feels strain. Mask protection is strongly advised.',
      bgClass: 'bg-[#FF8FA3]',
      barColor: '#FB7185',
      textColorClass: 'text-[#141414]',
      badgeBgClass: 'bg-[#141414]',
      badgeTextClass: 'text-[#FFFFFF]',
    };
  }
  if (aqi <= 300) {
    return {
      level: 'very_unhealthy',
      label: 'Very Unhealthy',
      rangeText: '201 – 300 US AQI',
      summary: 'High health risk. Cut outdoor exposure and wear a tight N95 mask.',
      bgClass: 'bg-[#D8B4FE]',
      barColor: '#C084FC',
      textColorClass: 'text-[#141414]',
      badgeBgClass: 'bg-[#141414]',
      badgeTextClass: 'text-[#FFFFFF]',
    };
  }
  return {
    level: 'hazardous',
    label: 'Hazardous',
    rangeText: '301+ US AQI',
    summary: 'Emergency air quality. Avoid outdoor work if at all possible.',
    bgClass: 'bg-[#991B1B]',
    barColor: '#DC2626',
    textColorClass: 'text-[#FFFFFF]',
    badgeBgClass: 'bg-[#FFFDF2]',
    badgeTextClass: 'text-[#141414]',
  };
}

const POLLUTANT_META: Record<
  keyof PollutantReadings,
  {
    symbol: string;
    name: string;
    unit: string;
    referenceThreshold: number;
    sourceNote: string;
  }
> = {
  pm2_5: {
    symbol: 'PM2.5',
    name: 'Fine Dust',
    unit: 'µg/m³',
    referenceThreshold: 35.4,
    sourceNote: 'Tiny smoke & exhaust particles that enter deep into lungs.',
  },
  pm10: {
    symbol: 'PM10',
    name: 'Coarse Dust',
    unit: 'µg/m³',
    referenceThreshold: 154,
    sourceNote: 'Road dust, construction grit, and vehicle tyre wear.',
  },
  nitrogen_dioxide: {
    symbol: 'NO₂',
    name: 'Nitrogen Dioxide',
    unit: 'µg/m³',
    referenceThreshold: 188,
    sourceNote: 'Fresh tailpipe gas from diesel trucks, autos, and traffic jams.',
  },
  ozone: {
    symbol: 'O₃',
    name: 'Ground Ozone',
    unit: 'µg/m³',
    referenceThreshold: 140,
    sourceNote: 'Afternoon smog formed when sunlight hits vehicle fumes.',
  },
  carbon_monoxide: {
    symbol: 'CO',
    name: 'Carbon Monoxide',
    unit: 'µg/m³',
    referenceThreshold: 10000,
    sourceNote: 'Idling engine exhaust that reduces oxygen in your blood.',
  },
};

export function getPollutantDetails(
  key: keyof PollutantReadings,
  value: number | null
): MainPollutantInfo {
  const meta = POLLUTANT_META[key];
  return {
    key,
    symbol: meta.symbol,
    name: meta.name,
    value,
    unit: meta.unit,
    sourceNote: meta.sourceNote,
  };
}

export function getMainPollutant(
  pollutants: PollutantReadings
): MainPollutantInfo | null {
  const keys = Object.keys(POLLUTANT_META) as (keyof PollutantReadings)[];
  let bestKey: keyof PollutantReadings | null = null;
  let bestRatio = -1;

  for (const key of keys) {
    const val = pollutants[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      const ratio = val / POLLUTANT_META[key].referenceThreshold;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestKey = key;
      }
    }
  }

  if (!bestKey) return null;
  return getPollutantDetails(bestKey, pollutants[bestKey]);
}

export interface RoleCoachingResult {
  headline: string;
  tips: string[];
  bestWindowText: string | null;
}

function findCleanestWindowText(hourly24: HourlyAirQualityPoint[]): string | null {
  const validHours = hourly24.filter((h) => typeof h.us_aqi === 'number');
  if (validHours.length < 3) return null;

  let lowestAvg = Infinity;
  let bestStartIdx = 0;
  for (let i = 0; i <= hourly24.length - 3; i++) {
    const slice = hourly24.slice(i, i + 3);
    if (slice.every((item) => typeof item.us_aqi === 'number')) {
      const avg = slice.reduce((sum, item) => sum + (item.us_aqi ?? 0), 0) / 3;
      if (avg < lowestAvg) {
        lowestAvg = avg;
        bestStartIdx = i;
      }
    }
  }
  if (!Number.isFinite(lowestAvg)) return null;
  const startHour = hourly24[bestStartIdx].hourLabel;
  const endHour = hourly24[bestStartIdx + 2].hourLabel;
  return `Cleanest upcoming window: ${startHour} – ${endHour} (avg ~${Math.round(lowestAvg)} US AQI)`;
}

function formatPollutantTip(mainPollutant: MainPollutantInfo | null): string {
  if (mainPollutant?.key === 'pm2_5' || mainPollutant?.key === 'pm10') {
    return `Main culprit right now is ${mainPollutant.symbol} dust — cloth scarves do not block fine particles.`;
  }
  if (mainPollutant?.key === 'ozone') {
    return 'Ground ozone rises with afternoon sun; shade and water breaks help reduce lung strain.';
  }
  if (mainPollutant) {
    return `${mainPollutant.symbol} is elevated near heavy traffic lanes.`;
  }
  return 'Check air conditions before starting long shifts.';
}

type RoleTipsRecord = Record<
  WorkerRoleId,
  Record<AqiBandInfo['level'], { headline: string; tips: string[] }>
>;

const ROLE_TIPS_STATIC: Record<
  WorkerRoleId,
  Record<AqiBandInfo['level'], { headline: string; tips: (string | '__POLLUTANT_TIP__')[] }>
> = {
  delivery: {
    good: {
      headline: 'Smooth riding conditions today',
      tips: [
        'Good air for full delivery shifts without mask fatigue.',
        'Keep your visor down on dusty highway stretches to protect your eyes.',
        'Drink water every 60–90 minutes on the road.',
      ],
    },
    moderate: {
      headline: 'Easy shift, watch heavy junctions',
      tips: [
        'Safe for regular deliveries; avoid idling right behind buses or trucks.',
        'Use side streets over main highways when waiting for orders.',
        '__POLLUTANT_TIP__',
      ],
    },
    sensitive: {
      headline: 'Wear a snug mask on busy routes',
      tips: [
        'Keep an N95/FFP2 mask under your helmet on high-traffic corridors.',
        'Wait for new orders inside shaded side lanes instead of next to signals.',
        '__POLLUTANT_TIP__',
      ],
    },
    unhealthy: {
      headline: 'N95 mask mandatory for riding',
      tips: [
        'Wear a well-fitted N95 mask — two-wheeler riding pulls polluted air deep into your lungs.',
        'Avoid riding fast without a visor; rinse eyes and face at every tea break.',
        'Take short indoor breaks between peak lunch and dinner rushes.',
      ],
    },
    very_unhealthy: {
      headline: 'High lung strain — shorten road exposure',
      tips: [
        'Wear a double-strap N95 mask and seal nose clip tightly under your helmet.',
        'Pause shifts if you feel chest tightness, dizziness, or coughing.',
        'Stay inside shops or shaded hubs while waiting for pings.',
      ],
    },
    hazardous: {
      headline: 'Unsafe for two-wheeler shifts',
      tips: [
        'Avoid riding outdoors if possible; air is hazardous for active work.',
        'If a trip is unavoidable, wear a sealed N95/N99 mask and keep rides brief.',
        'Flush nose and throat with clean water immediately after returning indoors.',
      ],
    },
  },
  driver: {
    good: {
      headline: 'Fresh air — open windows welcome',
      tips: [
        'Keep windows cracked for natural fresh airflow in the cabin.',
        'Great day for long highway or airport runs.',
        'Turn off engine during long passenger waits to keep air clean.',
      ],
    },
    moderate: {
      headline: 'Manage cabin airflow at signals',
      tips: [
        'Close windows and switch cab AC to recirculate when stuck behind diesel trucks.',
        'Open windows again on tree-lined or open stretches.',
        '__POLLUTANT_TIP__',
      ],
    },
    sensitive: {
      headline: 'Switch to cabin recirculation in traffic',
      tips: [
        'Keep AC on recirculate mode in slow traffic; auto drivers should wear an N95 mask at junctions.',
        'Park away from exhaust plumes while waiting for rides.',
        '__POLLUTANT_TIP__',
      ],
    },
    unhealthy: {
      headline: 'Block outside traffic smoke',
      tips: [
        'Cabs: keep windows rolled up and AC on recirculate. Autos: wear a fitted N95 mask.',
        'Wipe dashboard dust with a damp cloth instead of dry dusting.',
        'Rest inside away from main stand exhaust during midday lulls.',
      ],
    },
    very_unhealthy: {
      headline: 'Keep cabin sealed and protect lungs',
      tips: [
        'Use N95 mask in open auto-rickshaws at all times during shifts.',
        'Keep cab windows shut and avoid idling near busy bus depots.',
        'Cut shift hours short if you notice wheezing or burning eyes.',
      ],
    },
    hazardous: {
      headline: 'Severe risk for open-cab drivers',
      tips: [
        'Open auto drivers face extreme exposure — pause driving outdoors if feasible.',
        'Keep cab windows sealed with AC recirculating and wear an N95 mask inside.',
        'Seek clean indoor air immediately if breathing feels heavy.',
      ],
    },
  },
  vendor: {
    good: {
      headline: 'Good day for full stall hours',
      tips: [
        'Comfortable air for standing outdoors all day.',
        'Set up slightly back from the curb to avoid sudden tailpipe puffs.',
        'Keep drinking water handy throughout your shift.',
      ],
    },
    moderate: {
      headline: 'Mind road dust near your stall',
      tips: [
        'Sprinkle a little water on dry dirt near your cart to keep dust down.',
        'Step a few feet back from idling vehicles when traffic backs up.',
        '__POLLUTANT_TIP__',
      ],
    },
    sensitive: {
      headline: 'Reduce curbside exhaust exposure',
      tips: [
        'Keep an N95 mask handy during morning and evening rush hours.',
        'Angle your workspace away from the road edge where smoke gathers.',
        '__POLLUTANT_TIP__',
      ],
    },
    unhealthy: {
      headline: 'Wear an N95 mask at your stall',
      tips: [
        'Standing near traffic for hours adds up — wear an N95 mask during peak traffic.',
        'Cover open food/goods well and wet-wipe surfaces instead of sweeping dry dust.',
        'Take 10-minute breaks inside a nearby shop every 2 hours.',
      ],
    },
    very_unhealthy: {
      headline: 'Limit standing hours by the road',
      tips: [
        'Wear a tight N95 mask continuously while tending your stall.',
        'Consider opening later or closing early during the worst traffic peaks.',
        'Drink warm water and avoid dry sweeping near your cart.',
      ],
    },
    hazardous: {
      headline: 'Hazardous to stand roadside today',
      tips: [
        'Avoid full-day outdoor vending today if you can.',
        'If you must open, wear a fitted N95/N99 mask and keep shifts as short as possible.',
        'Watch out for headaches, coughing, or chest discomfort.',
      ],
    },
  },
  police: {
    good: {
      headline: 'Clear air for intersection duty',
      tips: [
        'Safe air quality for normal traffic control shifts.',
        'Stay hydrated during sunny afternoon duty.',
        'Rotate spots naturally between center island and curb.',
      ],
    },
    moderate: {
      headline: 'Step clear of idling exhaust plumes',
      tips: [
        'Stand upwind of stalled bus or truck queues whenever safe to do so.',
        'Keep hydrated to soothe mild throat dryness.',
        '__POLLUTANT_TIP__',
      ],
    },
    sensitive: {
      headline: 'Use N95 mask at busy junctions',
      tips: [
        'Wear an N95 mask at high-volume intersections during peak commute hours.',
        'Rotate off the center traffic island every 60–90 minutes if possible.',
        '__POLLUTANT_TIP__',
      ],
    },
    unhealthy: {
      headline: 'Continuous N95 protection advised',
      tips: [
        'Wear a fitted N95 mask on duty — center-lane air is heavier than sidewalk air.',
        'Use whistle signals or hand gestures to avoid shouting with heavy breaths.',
        'Rotate personnel frequently into indoor booths or side streets.',
      ],
    },
    very_unhealthy: {
      headline: 'High risk at intersections — rotate shifts',
      tips: [
        'Mandatory N95/FFP2 mask with snug nose seal for the entire outdoor posting.',
        'Request shorter rotation intervals at major bottlenecks.',
        'Wash face and rinse eyes with clean water after every rotation.',
      ],
    },
    hazardous: {
      headline: 'Emergency duty precautions needed',
      tips: [
        'Minimize continuous intersection standing time; rotate indoors every 30–45 minutes.',
        'Wear N95/N99 respirator and protective glasses against heavy particulate haze.',
        'Report any breathing difficulty or chest pain immediately.',
      ],
    },
  },
  general: {
    good: {
      headline: 'Great air to be outdoors',
      tips: [
        'Ideal conditions for walking, jogging, cycling, and kids playing outside.',
        'Open house windows to air out rooms naturally.',
        'Enjoy outdoor errands at any time today.',
      ],
    },
    moderate: {
      headline: 'Safe for most outdoor plans',
      tips: [
        'Normal outdoor activities are fine for most people.',
        'If you have asthma or heart issues, take brisk walks on quieter lanes.',
        '__POLLUTANT_TIP__',
      ],
    },
    sensitive: {
      headline: 'Take it easy on main roads',
      tips: [
        'Children, elders, and people with asthma should shorten heavy outdoor exercise.',
        'Choose parks or backstreets over busy traffic corridors.',
        '__POLLUTANT_TIP__',
      ],
    },
    unhealthy: {
      headline: 'Cut outdoor time and mask up',
      tips: [
        'Move workouts indoors and keep outdoor errands short.',
        'Wear a well-fitted N95 mask if walking or commuting near traffic.',
        'Keep home windows closed during peak traffic hours.',
      ],
    },
    very_unhealthy: {
      headline: 'Stay indoors as much as possible',
      tips: [
        'Avoid outdoor exercise and keep children and elderly family members inside.',
        'Wear an N95 mask for any essential trip outside.',
        'Keep doors and windows shut; wet-mop floors instead of dry sweeping.',
      ],
    },
    hazardous: {
      headline: 'Health emergency — remain indoors',
      tips: [
        'Cancel outdoor plans and stay inside with windows tightly closed.',
        'Use an N95/N99 mask if stepping outside is unavoidable.',
        'Seek medical help quickly if anyone experiences shortness of breath.',
      ],
    },
  },
};

export function getRoleCoaching(
  role: WorkerRoleId,
  aqi: number,
  mainPollutant: MainPollutantInfo | null,
  hourly24: HourlyAirQualityPoint[]
): RoleCoachingResult {
  const band = getAqiBand(aqi);
  const pollutantTip = formatPollutantTip(mainPollutant);
  const specific = (ROLE_TIPS_STATIC as unknown as RoleTipsRecord)[role][band.level];

  return {
    headline: specific.headline,
    tips: specific.tips.map((tip) => (tip === '__POLLUTANT_TIP__' ? pollutantTip : tip)),
    bestWindowText: findCleanestWindowText(hourly24),
  };
}
