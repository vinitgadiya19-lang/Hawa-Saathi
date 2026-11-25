import {
  COOKING_FUEL_FACTORS,
  TRAVEL_MODE_FACTORS,
  type TravelModeId,
} from '../config/emissionFactors.ts';
import type {
  CalculatedTripResult,
  FamilyCalculationSummary,
  HomeDetails,
  MemberTotalResult,
} from './familyPlanCalc.ts';

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

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function buildShiftCleanerHourScenario(input: {
  trips: CalculatedTripResult[];
  members: MemberTotalResult[];
  totalCo2: number;
  totalExp: number | null;
  cleanestHourLabel: string | null;
  cleanestHourAqi: number | null;
}): WhatIfScenario {
  const topExpTrip = [...input.trips]
    .filter((t) => t.weeklyExposureScore !== null && t.slotAqi !== null)
    .sort((a, b) => (b.weeklyExposureScore ?? 0) - (a.weeklyExposureScore ?? 0))[0];

  if (
    topExpTrip &&
    input.cleanestHourAqi !== null &&
    topExpTrip.slotAqi !== null &&
    topExpTrip.slotAqi > input.cleanestHourAqi &&
    topExpTrip.weeklyExposureScore !== null &&
    input.totalExp !== null
  ) {
    // Scale weekly trip exposure proportionally to cleanest forecast hour AQI
    const ratio = input.cleanestHourAqi / Math.max(1, topExpTrip.slotAqi);
    const newTripWeeklyExp = Math.round(topExpTrip.weeklyExposureScore * ratio);
    const expSaved = Math.max(0, topExpTrip.weeklyExposureScore - newTripWeeklyExp);

    return {
      id: 'shift_cleaner_hour',
      title: `Shift ${topExpTrip.memberName}'s ${topExpTrip.from} → ${topExpTrip.to} trip to ${input.cleanestHourLabel ?? 'the cleanest hour'}`,
      description: `Moving this trip from ${topExpTrip.timeOfDay} (est. ${topExpTrip.slotAqi} AQI) to ${input.cleanestHourLabel ?? 'cleanest hour'} (est. ${input.cleanestHourAqi} AQI) cuts breathing exposure with zero cost.`,
      whoBenefits: topExpTrip.memberName,
      effort: 'easy',
      cost: 'free',
      applicable: expSaved > 0,
      beforeCo2Kg: input.totalCo2,
      afterCo2Kg: input.totalCo2,
      co2SavedKg: 0,
      beforeExposure: input.totalExp,
      afterExposure: Math.max(0, input.totalExp - expSaved),
      exposureSaved: expSaved,
    };
  }

  return {
    id: 'shift_cleaner_hour',
    title: 'Move outdoor errands to the cleanest forecast hour',
    description:
      'Shifting trips away from rush-hour smog peaks reduces inhaled pollution even when travel distance stays the same.',
    whoBenefits: input.members[0]?.name ?? 'Whole family',
    effort: 'easy',
    cost: 'free',
    applicable: false,
    beforeCo2Kg: input.totalCo2,
    afterCo2Kg: input.totalCo2,
    co2SavedKg: 0,
    beforeExposure: input.totalExp,
    afterExposure: input.totalExp,
    exposureSaved: 0,
  };
}

function buildShortTripsWalkScenario(input: {
  trips: CalculatedTripResult[];
  members: MemberTotalResult[];
  totalCo2: number;
  totalExp: number | null;
}): WhatIfScenario {
  const shortMotorized = input.trips.filter(
    (t) =>
      t.distanceKm > 0 &&
      t.distanceKm <= 2 &&
      t.travelMode !== 'walk' &&
      t.travelMode !== 'cycle'
  );
  if (shortMotorized.length === 0) {
    return {
      id: 'walk_or_cycle_short_trips',
      title: 'Walk or cycle short trips under 2 km',
      description:
        'Use walking or cycling for short neighborhood errands instead of firing up a petrol vehicle.',
      whoBenefits: 'Whole family',
      effort: 'easy',
      cost: 'free',
      applicable: false,
      beforeCo2Kg: input.totalCo2,
      afterCo2Kg: input.totalCo2,
      co2SavedKg: 0,
      beforeExposure: input.totalExp,
      afterExposure: input.totalExp,
      exposureSaved: 0,
    };
  }

  const co2Saved = round1(
    shortMotorized.reduce((sum, t) => sum + t.weeklyCo2Kg, 0)
  );
  let newExpTotal = input.totalExp ?? 0;
  if (input.totalExp !== null) {
    const cycleFactor = TRAVEL_MODE_FACTORS.cycle;
    for (const t of shortMotorized) {
      const newMin = Math.max(
        1,
        Math.round((t.distanceKm / cycleFactor.avgSpeedKmh) * 60)
      );
      const vuln =
        input.members.find((m) => m.memberId === t.memberId)
          ?.vulnerabilityFactor ?? 1.0;
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
    input.totalExp !== null ? Math.max(0, input.totalExp - newExpTotal) : 0;
  const names = Array.from(
    new Set(shortMotorized.map((t) => t.memberName))
  ).join(', ');

  return {
    id: 'walk_or_cycle_short_trips',
    title: `Walk or cycle short trips under 2 km (${shortMotorized.length} trip${shortMotorized.length > 1 ? 's' : ''})`,
    description:
      'Replacing short motorized rides under 2 km eliminates cold-engine tailpipe smoke near your home.',
    whoBenefits: names || 'Whole family',
    effort: 'easy',
    cost: 'free',
    applicable: true,
    beforeCo2Kg: input.totalCo2,
    afterCo2Kg: round1(Math.max(0, input.totalCo2 - co2Saved)),
    co2SavedKg: co2Saved,
    beforeExposure: input.totalExp,
    afterExposure:
      input.totalExp !== null ? Math.max(0, input.totalExp - expSaved) : null,
    exposureSaved: expSaved,
  };
}

function buildTransitScenario(input: {
  trips: CalculatedTripResult[];
  members: MemberTotalResult[];
  totalCo2: number;
  totalExp: number | null;
}): WhatIfScenario {
  const bestCandidate = [...input.trips]
    .filter(
      (t) =>
        t.travelMode === 'car_petrol_diesel' ||
        t.travelMode === 'bike_petrol' ||
        t.travelMode === 'auto'
    )
    .sort((a, b) => b.weeklyCo2Kg - a.weeklyCo2Kg)[0];

  if (!bestCandidate) {
    return {
      id: 'switch_to_metro_or_bus',
      title: 'Use metro or city bus for longer commutes',
      description:
        'Public transit avoids dense roadside tailpipe plumes on congested corridors.',
      whoBenefits: 'Commuters & community',
      effort: 'medium',
      cost: 'low',
      applicable: false,
      beforeCo2Kg: input.totalCo2,
      afterCo2Kg: input.totalCo2,
      co2SavedKg: 0,
      beforeExposure: input.totalExp,
      afterExposure: input.totalExp,
      exposureSaved: 0,
    };
  }

  const targetMode: TravelModeId =
    bestCandidate.distanceKm >= 4 ? 'metro_train' : 'bus';
  const targetFactor = TRAVEL_MODE_FACTORS[targetMode];
  const newWeeklyCo2 = round1(
    (bestCandidate.distanceKm *
      targetFactor.co2GramsPerPassengerKm *
      bestCandidate.daysPerWeek) /
      1000
  );
  const co2Saved = round1(
    Math.max(0, bestCandidate.weeklyCo2Kg - newWeeklyCo2)
  );

  let expSaved = 0;
  if (
    input.totalExp !== null &&
    bestCandidate.weeklyExposureScore !== null &&
    bestCandidate.slotAqi !== null
  ) {
    const newMin = Math.max(
      1,
      Math.round((bestCandidate.distanceKm / targetFactor.avgSpeedKmh) * 60)
    );
    const vuln =
      input.members.find((m) => m.memberId === bestCandidate.memberId)
        ?.vulnerabilityFactor ?? 1.0;
    const newWeeklyExp =
      Math.round(
        bestCandidate.slotAqi *
          newMin *
          targetFactor.pm25ExposureFactor *
          vuln
      ) * bestCandidate.daysPerWeek;
    expSaved = Math.max(0, bestCandidate.weeklyExposureScore - newWeeklyExp);
  }

  return {
    id: 'switch_to_metro_or_bus',
    title: `Switch ${bestCandidate.memberName}'s ${bestCandidate.from} → ${bestCandidate.to} trip to ${targetFactor.label}`,
    description: `Moving this ${bestCandidate.distanceKm} km ${bestCandidate.travelModeLabel.toLowerCase()} commute to ${targetFactor.label.toLowerCase()} cuts per-passenger CO2 and traffic exhaust exposure.`,
    whoBenefits: bestCandidate.memberName,
    effort: 'medium',
    cost: 'low',
    applicable: co2Saved > 0 || expSaved > 0,
    beforeCo2Kg: input.totalCo2,
    afterCo2Kg: round1(Math.max(0, input.totalCo2 - co2Saved)),
    co2SavedKg: co2Saved,
    beforeExposure: input.totalExp,
    afterExposure:
      input.totalExp !== null ? Math.max(0, input.totalExp - expSaved) : null,
    exposureSaved: expSaved,
  };
}

function buildCarpoolAndCookingScenarios(input: {
  trips: CalculatedTripResult[];
  home: HomeDetails;
  totalCo2: number;
  totalExp: number | null;
}): WhatIfScenario[] {
  const carTrips = input.trips.filter(
    (t) => t.travelMode === 'car_petrol_diesel' && t.weeklyCo2Kg > 0
  );
  const carpoolScenario: WhatIfScenario =
    carTrips.length > 0
      ? (() => {
          const carCo2 = carTrips.reduce((sum, t) => sum + t.weeklyCo2Kg, 0);
          const co2Saved = round1(carCo2 * 0.5);
          const names = Array.from(
            new Set(carTrips.map((t) => t.memberName))
          ).join(', ');
          return {
            id: 'carpool_car_trips',
            title: 'Carpool or share school and office car rides',
            description:
              'Sharing existing car trips with one neighbor or coworker cuts per-person car CO2 roughly in half with zero extra hardware.',
            whoBenefits: names || 'Car commuters',
            effort: 'easy',
            cost: 'free',
            applicable: true,
            beforeCo2Kg: input.totalCo2,
            afterCo2Kg: round1(Math.max(0, input.totalCo2 - co2Saved)),
            co2SavedKg: co2Saved,
            beforeExposure: input.totalExp,
            afterExposure: input.totalExp,
            exposureSaved: 0,
          };
        })()
      : {
          id: 'carpool_car_trips',
          title: 'Carpool or share rides with neighbors',
          description:
            'Pairing up on recurring school or office routes halves per-person fuel burn and local traffic congestion.',
          whoBenefits: 'Whole family',
          effort: 'easy',
          cost: 'free',
          applicable: false,
          beforeCo2Kg: input.totalCo2,
          afterCo2Kg: input.totalCo2,
          co2SavedKg: 0,
          beforeExposure: input.totalExp,
          afterExposure: input.totalExp,
          exposureSaved: 0,
        };

  const inductionScenario: WhatIfScenario =
    input.home.cookingFuel !== 'induction'
      ? (() => {
          const currentCook = COOKING_FUEL_FACTORS[input.home.cookingFuel];
          const co2Saved = round1(
            Math.max(
              0,
              currentCook.weeklyCo2Kg - COOKING_FUEL_FACTORS.induction.weeklyCo2Kg
            )
          );
          return {
            id: 'switch_to_induction',
            title: `Switch daily cooking from ${currentCook.label} to electric induction`,
            description: `Replaces indoor burner combustion (NO2 & soot) with electric induction, reducing weekly kitchen CO2e by an estimated ${co2Saved} kg.`,
            whoBenefits: 'Everyone at home (especially children & seniors)',
            effort: 'medium',
            cost: 'medium',
            applicable: co2Saved > 0,
            beforeCo2Kg: input.totalCo2,
            afterCo2Kg: round1(Math.max(0, input.totalCo2 - co2Saved)),
            co2SavedKg: co2Saved,
            beforeExposure: input.totalExp,
            afterExposure: input.totalExp,
            exposureSaved: 0,
          };
        })()
      : {
          id: 'switch_to_induction',
          title: 'Keep using electric induction with lidded pots',
          description:
            'You already use induction — covering pans cuts cooking energy and indoor steam dispersion.',
          whoBenefits: 'Everyone at home',
          effort: 'easy',
          cost: 'free',
          applicable: false,
          beforeCo2Kg: input.totalCo2,
          afterCo2Kg: input.totalCo2,
          co2SavedKg: 0,
          beforeExposure: input.totalExp,
          afterExposure: input.totalExp,
          exposureSaved: 0,
        };

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
  const expSavedErrands =
    input.totalExp !== null ? Math.round(roadExp * 0.08) : 0;

  const errandsScenario: WhatIfScenario = {
    id: 'combine_errands_idle_off',
    title: 'Combine errands into one loop and switch engines off at long signals',
    description:
      'Cutting unnecessary cold-start trips and avoiding idling >20 seconds saves ~10% fuel CO2 and reduces exhaust plumes around riders.',
    whoBenefits: 'Whole family & neighborhood',
    effort: 'easy',
    cost: 'free',
    applicable: roadMotorized.length > 0,
    beforeCo2Kg: input.totalCo2,
    afterCo2Kg: round1(Math.max(0, input.totalCo2 - co2SavedErrands)),
    co2SavedKg: co2SavedErrands,
    beforeExposure: input.totalExp,
    afterExposure:
      input.totalExp !== null ? Math.max(0, input.totalExp - expSavedErrands) : null,
    exposureSaved: expSavedErrands,
  };

  return [carpoolScenario, inductionScenario, errandsScenario];
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
  const common = {
    trips: input.trips,
    members: input.members,
    totalCo2: input.weeklyTotalCo2Kg,
    totalExp: input.weeklyTotalExposure,
  };
  return [
    buildShiftCleanerHourScenario({
      ...common,
      cleanestHourLabel: input.cleanestHourLabel,
      cleanestHourAqi: input.cleanestHourAqi,
    }),
    buildShortTripsWalkScenario(common),
    buildTransitScenario(common),
    ...buildCarpoolAndCookingScenarios({ ...common, home: input.home }),
  ];
}

/**
 * Sum selected step savings while capping combined reduction at 85%
 * so overlapping step toggles never produce negative totals.
 */
export function computeCombinedImpactAfterSteps(
  summary: FamilyCalculationSummary,
  selectedSavings: Array<{ co2SavedKg: number; exposureSaved: number }>
): {
  afterCo2Kg: number;
  totalCo2SavedKg: number;
  afterExposure: number | null;
  totalExposureSaved: number;
} {
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
