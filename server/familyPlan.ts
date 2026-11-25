import { Type } from '@google/genai';
import {
  callGeminiWithFallback,
  type FallbackRequest,
  type FallbackResponse,
} from './geminiFallback.ts';
import {
  sanitizeFreeText,
  type FamilyCalculationSummary,
  type HomeDetails,
  type ScenarioCost,
  type ScenarioEffort,
  type WhatIfScenario,
} from '../src/services/familyPlanCalc.ts';

export type FamilyPlanLanguage = 'en' | 'hi' | 'mr';

export interface RankedLowEmissionStep {
  rank: number;
  scenarioId: string;
  change: string;
  whoBenefits: string;
  effort: ScenarioEffort;
  cost: ScenarioCost;
  co2SavedKg: number;
  exposureSaved: number;
}

export interface FamilyPlanApiResponse {
  steps: RankedLowEmissionStep[];
  summarySentences: string;
  model: string;
  usedFallback: boolean;
  cached: boolean;
}

export interface FamilyPlanRequestPayload {
  language: FamilyPlanLanguage;
  cityName: string;
  aqi: number | null;
  aqiBand: string;
  home: HomeDetails;
  summary: FamilyCalculationSummary;
  afterCo2Kg?: number;
  afterExposure?: number | null;
}

const VALID_EFFORTS = new Set<ScenarioEffort>(['easy', 'medium', 'hard']);
const VALID_COSTS = new Set<ScenarioCost>(['free', 'low', 'medium']);

export const FAMILY_PLAN_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: Type.OBJECT,
  properties: {
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scenarioId: { type: Type.STRING },
          change: { type: Type.STRING },
          whoBenefits: { type: Type.STRING },
          effort: { type: Type.STRING },
          cost: { type: Type.STRING },
        },
        required: ['scenarioId', 'change', 'whoBenefits', 'effort', 'cost'],
      },
    },
    summarySentences: { type: Type.STRING },
  },
  required: ['steps', 'summarySentences'],
};

function sortScenariosForRanking(scenarios: WhatIfScenario[]): WhatIfScenario[] {
  const effortRank: Record<ScenarioEffort, number> = {
    easy: 0,
    medium: 1,
    hard: 2,
  };
  const costRank: Record<ScenarioCost, number> = {
    free: 0,
    low: 1,
    medium: 2,
  };

  return [...scenarios].sort((a, b) => {
    if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
    const scoreA =
      (a.exposureSaved > 0 ? 3 : 0) + (a.co2SavedKg > 0 ? 2 : 0) - effortRank[a.effort] - costRank[a.cost];
    const scoreB =
      (b.exposureSaved > 0 ? 3 : 0) + (b.co2SavedKg > 0 ? 2 : 0) - effortRank[b.effort] - costRank[b.cost];
    return scoreB - scoreA;
  });
}

function computeAfterExposure(
  payload: FamilyPlanRequestPayload,
  steps: RankedLowEmissionStep[]
): number | null {
  if (typeof payload.afterExposure === 'number') {
    return payload.afterExposure;
  }
  const totalExp = payload.summary.weeklyTotalExposure;
  if (totalExp === null) return null;
  const savedSum = steps.reduce((sum, step) => sum + step.exposureSaved, 0);
  return Math.max(0, totalExp - Math.round(Math.min(savedSum, totalExp * 0.85)));
}

function formatSummarySentences(
  language: FamilyPlanLanguage,
  currentCo2: number,
  afterCo2: number,
  totalExp: number | null,
  afterExp: number | null,
  topMemberName: string,
  topMemberExp: number | null | undefined,
  firstStep: string
): string {
  const hasScores = totalExp !== null && afterExp !== null;
  const memberScoreNote =
    topMemberExp !== null && topMemberExp !== undefined ? ` (${topMemberName}: ${topMemberExp})` : '';

  if (language === 'hi') {
    const expLine = hasScores
      ? `चुने हुए कदमों से परिवार का साप्ताहिक एक्सपोज़र स्कोर अनुमानित ${totalExp} से घटकर ${afterExp} हो सकता है${memberScoreNote}।`
      : `${topMemberName} के लिए साफ समय और कम प्रदूषण वाले यात्रा तरीके चुनना सबसे सुरक्षित रहेगा।`;
    return [
      `आपके परिवार का अनुमानित साप्ताहिक CO2 उत्सर्जन अभी ${currentCo2} किग्रा है जो इन कदमों के बाद लगभग ${afterCo2} किग्रा हो सकता है।`,
      expLine,
      `शुरुआत के लिए सबसे आसान बदलाव "${firstStep}" है।`,
    ].join(' ');
  }

  if (language === 'mr') {
    const expLine = hasScores
      ? `निवडलेल्या उपायांमुळे कुटुंबाचा साप्ताहिक एक्सपोजर स्कोअर अंदाजे ${totalExp} वरून ${afterExp} पर्यंत कमी होऊ शकतो${memberScoreNote}.`
      : `${topMemberName} साठी स्वच्छ वेळा आणि कमी प्रदूषणाचे प्रवास मार्ग निवडणे सर्वात उपयुक्त ठरेल.`;
    return [
      `तुमच्या कुटुंबाचे अंदाजे साप्ताहिक CO2 उत्सर्जन सध्या ${currentCo2} किलो आहे जे या उपायांनंतर सुमारे ${afterCo2} किलो होऊ शकते.`,
      expLine,
      `सुरुवात करण्यासाठी सर्वात सोपा बदल म्हणजे "${firstStep}".`,
    ].join(' ');
  }

  const engScoreNote =
    topMemberExp !== null && topMemberExp !== undefined ? ` (currently ${topMemberExp})` : '';
  const expSentence = hasScores
    ? `Following these steps can cut your estimated weekly exposure score from ${totalExp} to ${afterExp}, protecting ${topMemberName}${engScoreNote} first.`
    : `Prioritizing cleaner travel hours and low-emission modes helps protect ${topMemberName} most.`;
  return [
    `Your family's estimated footprint is ${currentCo2} kg CO2 per week, which could drop to about ${afterCo2} kg with these steps.`,
    expSentence,
    `Start with "${firstStep}" for an easy, practical win this week.`,
  ].join(' ');
}

export function buildRuleBasedFamilyPlan(
  payload: FamilyPlanRequestPayload
): Omit<FamilyPlanApiResponse, 'model' | 'usedFallback' | 'cached'> {
  const rankedScenarios = sortScenariosForRanking(payload.summary.scenarios).slice(0, 5);
  const steps: RankedLowEmissionStep[] = rankedScenarios.map((sc, idx) => ({
    rank: idx + 1,
    scenarioId: sc.id,
    change: sc.title,
    whoBenefits: sc.whoBenefits || 'Whole family',
    effort: sc.effort,
    cost: sc.cost,
    co2SavedKg: sc.co2SavedKg,
    exposureSaved: sc.exposureSaved,
  }));

  const currentCo2 = payload.summary.weeklyTotalCo2Kg;
  const applicableSaving = steps.reduce((sum, s) => sum + s.co2SavedKg, 0);
  const afterCo2 =
    typeof payload.afterCo2Kg === 'number'
      ? payload.afterCo2Kg
      : Math.round(Math.max(0, currentCo2 - Math.min(applicableSaving, currentCo2 * 0.85)) * 10) / 10;

  const topMember = payload.summary.memberTotals[0];
  const afterExp = computeAfterExposure(payload, steps);
  const firstStep = steps[0]?.change ?? 'shifting trips to cleaner hours';

  return {
    steps,
    summarySentences: formatSummarySentences(
      payload.language,
      currentCo2,
      afterCo2,
      payload.summary.weeklyTotalExposure,
      afterExp,
      topMember?.name || 'your family',
      topMember?.weeklyExposureScore,
      firstStep
    ),
  };
}

function cleanPlainText(raw: unknown, fallback: string, maxLen = 280): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .replace(/\*\*/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

function parseJsonObjectSafe(rawJsonText: string): Record<string, unknown> | null {
  try {
    const stripped = rawJsonText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(stripped) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function resolveMatchedScenario(
  rawId: string,
  scenarioMap: Map<string, WhatIfScenario>,
  fallbackSteps: RankedLowEmissionStep[],
  usedIds: Set<string>
): WhatIfScenario | undefined {
  if (rawId && scenarioMap.has(rawId) && !usedIds.has(rawId)) {
    return scenarioMap.get(rawId);
  }
  const fallbackCandidate = fallbackSteps.find((fb) => !usedIds.has(fb.scenarioId));
  return fallbackCandidate ? scenarioMap.get(fallbackCandidate.scenarioId) : undefined;
}

function groundSingleStep(
  rawStep: unknown,
  rank: number,
  scenarioMap: Map<string, WhatIfScenario>,
  fallbackSteps: RankedLowEmissionStep[],
  usedIds: Set<string>
): RankedLowEmissionStep | null {
  if (!rawStep || typeof rawStep !== 'object') return null;
  const item = rawStep as Record<string, unknown>;
  const rawId = typeof item.scenarioId === 'string' ? item.scenarioId.trim() : '';
  const matched = resolveMatchedScenario(rawId, scenarioMap, fallbackSteps, usedIds);
  if (!matched) return null;

  usedIds.add(matched.id);
  const effortRaw = typeof item.effort === 'string' ? item.effort.toLowerCase().trim() : '';
  const costRaw = typeof item.cost === 'string' ? item.cost.toLowerCase().trim() : '';

  return {
    rank,
    scenarioId: matched.id,
    change: cleanPlainText(item.change, matched.title, 180),
    whoBenefits: cleanPlainText(item.whoBenefits, matched.whoBenefits, 100),
    effort: VALID_EFFORTS.has(effortRaw as ScenarioEffort)
      ? (effortRaw as ScenarioEffort)
      : matched.effort,
    cost: VALID_COSTS.has(costRaw as ScenarioCost) ? (costRaw as ScenarioCost) : matched.cost,
    // Always snap numeric savings to the deterministic code calculation
    co2SavedKg: matched.co2SavedKg,
    exposureSaved: matched.exposureSaved,
  };
}

export function validateAndGroundGeminiFamilyPlan(
  rawJsonText: string,
  payload: FamilyPlanRequestPayload
): Omit<FamilyPlanApiResponse, 'model' | 'usedFallback' | 'cached'> | null {
  const obj = parseJsonObjectSafe(rawJsonText);
  if (!obj || !Array.isArray(obj.steps) || obj.steps.length === 0) return null;

  const scenarioMap = new Map(payload.summary.scenarios.map((sc) => [sc.id, sc]));
  const fallbackPlan = buildRuleBasedFamilyPlan(payload);
  const usedScenarioIds = new Set<string>();
  const validatedSteps: RankedLowEmissionStep[] = [];

  for (const rawStep of obj.steps.slice(0, 5)) {
    const grounded = groundSingleStep(
      rawStep,
      validatedSteps.length + 1,
      scenarioMap,
      fallbackPlan.steps,
      usedScenarioIds
    );
    if (grounded) validatedSteps.push(grounded);
  }

  for (const fb of fallbackPlan.steps) {
    if (validatedSteps.length >= 5) break;
    if (!usedScenarioIds.has(fb.scenarioId)) {
      usedScenarioIds.add(fb.scenarioId);
      validatedSteps.push({ ...fb, rank: validatedSteps.length + 1 });
    }
  }

  if (validatedSteps.length === 0) return null;

  return {
    steps: validatedSteps,
    summarySentences: cleanPlainText(obj.summarySentences, fallbackPlan.summarySentences, 600),
  };
}

export async function generateFamilyPlanWithFallback(
  payload: FamilyPlanRequestPayload,
  runner: (req: FallbackRequest) => Promise<FallbackResponse> = callGeminiWithFallback
): Promise<FamilyPlanApiResponse> {
  const langName =
    payload.language === 'hi'
      ? 'Hindi (Devanagari script)'
      : payload.language === 'mr'
        ? 'Marathi (Devanagari script)'
        : 'plain everyday English';

  const systemInstruction = [
    'You are Hawa Saathi, an honest family air-quality and low-emission planner.',
    'Return STRICT valid JSON only matching the requested schema.',
    'Rank 5 practical steps for this family preferring simple, free/low-cost actions first (e.g. moving school runs to cleaner hours, walking short trips, carpooling, combining errands, turning engines off at signals, or switching cooking fuel).',
    'CRITICAL: Use ONLY the scenarioId values and exact numbers provided in the prompt. NEVER invent or alter any CO2, AQI, or exposure number.',
    `Write the "change" and "whoBenefits" fields clearly in plain English (no ** symbols), and write "summarySentences" as exactly 3 plain-language sentences in ${langName} using ONLY the provided calculated numbers.`,
    'Guidance only, never medical diagnosis or medicine advice.',
  ].join(' ');

  const currentCo2 = payload.summary.weeklyTotalCo2Kg;
  const afterCo2 =
    typeof payload.afterCo2Kg === 'number'
      ? payload.afterCo2Kg
      : currentCo2;
  const currentExp = payload.summary.weeklyTotalExposure;
  const afterExp =
    payload.afterExposure !== undefined ? payload.afterExposure : currentExp;

  const prompt = JSON.stringify({
    city: sanitizeFreeText(payload.cityName, 100) || 'Current city',
    liveAqi: payload.aqi,
    aqiBand: payload.aqiBand,
    home: payload.home,
    totals: {
      weeklyTravelCo2Kg: payload.summary.weeklyTravelCo2Kg,
      weeklyCookingCo2Kg: payload.summary.weeklyCookingCo2Kg,
      weeklyTotalCo2Kg: currentCo2,
      afterSelectedStepsCo2Kg: afterCo2,
      weeklyTotalExposureScore: currentExp,
      afterSelectedStepsExposureScore: afterExp,
      cleanestHourLabel: payload.summary.cleanestHourLabel,
      cleanestHourAqi: payload.summary.cleanestHourAqi,
    },
    membersHighestExposureFirst: payload.summary.memberTotals.map((m) => ({
      name: m.name,
      ageGroup: m.ageLabel,
      healthNote: m.healthLabel,
      weeklyCo2Kg: m.weeklyCo2Kg,
      weeklyExposureScore: m.weeklyExposureScore,
    })),
    calculatedScenarios: payload.summary.scenarios.map((s) => ({
      scenarioId: s.id,
      title: s.title,
      whoBenefits: s.whoBenefits,
      effort: s.effort,
      cost: s.cost,
      applicable: s.applicable,
      co2SavedKg: s.co2SavedKg,
      exposureSaved: s.exposureSaved,
    })),
  });

  // Note: fallback cache key uses question string — pass full deterministic digest in question
  const geminiResult = await runner({
    feature: 'advice',
    role: 'general',
    aqiBand: payload.aqiBand,
    aqi: payload.aqi ?? undefined,
    language: payload.language === 'hi' ? 'hi' : 'en',
    question: `family_plan:${payload.language}:${prompt}`,
    systemInstruction,
    prompt,
    responseMimeType: 'application/json',
    responseSchema: FAMILY_PLAN_RESPONSE_SCHEMA,
  });

  if (geminiResult.usedFallback) {
    const fb = buildRuleBasedFamilyPlan(payload);
    return {
      ...fb,
      model: 'rule-based-fallback',
      usedFallback: true,
      cached: false,
    };
  }

  const grounded = validateAndGroundGeminiFamilyPlan(
    geminiResult.answer,
    payload
  );
  if (!grounded) {
    const fb = buildRuleBasedFamilyPlan(payload);
    return {
      ...fb,
      model: 'rule-based-fallback',
      usedFallback: true,
      cached: false,
    };
  }

  return {
    ...grounded,
    model: geminiResult.model,
    usedFallback: false,
    cached: geminiResult.cached,
  };
}
