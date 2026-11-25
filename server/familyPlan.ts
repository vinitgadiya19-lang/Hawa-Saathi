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
  const topMemberName = topMember?.name || 'your family';
  const topMemberExp = topMember?.weeklyExposureScore;
  const totalExp = payload.summary.weeklyTotalExposure;
  const afterExp =
    typeof payload.afterExposure === 'number'
      ? payload.afterExposure
      : totalExp !== null
        ? Math.max(
            0,
            totalExp -
              Math.round(
                Math.min(
                  steps.reduce((s, st) => s + st.exposureSaved, 0),
                  totalExp * 0.85
                )
              )
          )
        : null;

  const firstStep = steps[0]?.change ?? 'shifting trips to cleaner hours';

  if (payload.language === 'hi') {
    const expLine =
      totalExp !== null && afterExp !== null
        ? `चुने हुए कदमों से परिवार का साप्ताहिक एक्सपोज़र स्कोर अनुमानित ${totalExp} से घटकर ${afterExp} हो सकता है${topMemberExp !== null && topMemberExp !== undefined ? ` (${topMemberName}: ${topMemberExp})` : ''}।`
        : `${topMemberName} के लिए साफ समय और कम प्रदूषण वाले यात्रा तरीके चुनना सबसे सुरक्षित रहेगा।`;

    return {
      steps,
      summarySentences: [
        `आपके परिवार का अनुमानित साप्ताहिक CO2 उत्सर्जन अभी ${currentCo2} किग्रा है जो इन कदमों के बाद लगभग ${afterCo2} किग्रा हो सकता है।`,
        expLine,
        `शुरुआत के लिए सबसे आसान बदलाव "${firstStep}" है।`,
      ].join(' '),
    };
  }

  if (payload.language === 'mr') {
    const expLine =
      totalExp !== null && afterExp !== null
        ? `निवडलेल्या उपायांमुळे कुटुंबाचा साप्ताहिक एक्सपोजर स्कोअर अंदाजे ${totalExp} वरून ${afterExp} पर्यंत कमी होऊ शकतो${topMemberExp !== null && topMemberExp !== undefined ? ` (${topMemberName}: ${topMemberExp})` : ''}.`
        : `${topMemberName} साठी स्वच्छ वेळा आणि कमी प्रदूषणाचे प्रवास मार्ग निवडणे सर्वात उपयुक्त ठरेल.`;

    return {
      steps,
      summarySentences: [
        `तुमच्या कुटुंबाचे अंदाजे साप्ताहिक CO2 उत्सर्जन सध्या ${currentCo2} किलो आहे जे या उपायांनंतर सुमारे ${afterCo2} किलो होऊ शकते.`,
        expLine,
        `सुरुवात करण्यासाठी सर्वात सोपा बदल म्हणजे "${firstStep}".`,
      ].join(' '),
    };
  }

  const expSentence =
    totalExp !== null && afterExp !== null
      ? `Following these steps can cut your estimated weekly exposure score from ${totalExp} to ${afterExp}, protecting ${topMemberName}${topMemberExp !== null && topMemberExp !== undefined ? ` (currently ${topMemberExp})` : ''} first.`
      : `Prioritizing cleaner travel hours and low-emission modes helps protect ${topMemberName} most.`;

  return {
    steps,
    summarySentences: [
      `Your family's estimated footprint is ${currentCo2} kg CO2 per week, which could drop to about ${afterCo2} kg with these steps.`,
      expSentence,
      `Start with "${firstStep}" for an easy, practical win this week.`,
    ].join(' '),
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

export function validateAndGroundGeminiFamilyPlan(
  rawJsonText: string,
  payload: FamilyPlanRequestPayload
): Omit<FamilyPlanApiResponse, 'model' | 'usedFallback' | 'cached'> | null {
  let parsed: unknown;
  try {
    const stripped = rawJsonText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) return null;

  const scenarioMap = new Map<string, WhatIfScenario>();
  for (const sc of payload.summary.scenarios) {
    scenarioMap.set(sc.id, sc);
  }

  const fallbackPlan = buildRuleBasedFamilyPlan(payload);
  const usedScenarioIds = new Set<string>();
  const validatedSteps: RankedLowEmissionStep[] = [];

  for (let i = 0; i < Math.min(5, obj.steps.length); i++) {
    const rawStep = obj.steps[i];
    if (!rawStep || typeof rawStep !== 'object') continue;
    const item = rawStep as Record<string, unknown>;

    const rawId = typeof item.scenarioId === 'string' ? item.scenarioId.trim() : '';
    const matchedScenario =
      (rawId && scenarioMap.get(rawId)) ||
      fallbackPlan.steps.find((fb) => !usedScenarioIds.has(fb.scenarioId))
        ? scenarioMap.get(
            (rawId && scenarioMap.has(rawId) && !usedScenarioIds.has(rawId)
              ? rawId
              : fallbackPlan.steps.find((fb) => !usedScenarioIds.has(fb.scenarioId))
                  ?.scenarioId) ?? ''
          )
        : undefined;

    if (!matchedScenario) continue;
    usedScenarioIds.add(matchedScenario.id);

    const rawEffort =
      typeof item.effort === 'string' ? (item.effort.toLowerCase().trim() as ScenarioEffort) : matchedScenario.effort;
    const rawCost =
      typeof item.cost === 'string' ? (item.cost.toLowerCase().trim() as ScenarioCost) : matchedScenario.cost;

    validatedSteps.push({
      rank: validatedSteps.length + 1,
      scenarioId: matchedScenario.id,
      change: cleanPlainText(item.change, matchedScenario.title, 180),
      whoBenefits: cleanPlainText(item.whoBenefits, matchedScenario.whoBenefits, 100),
      effort: VALID_EFFORTS.has(rawEffort) ? rawEffort : matchedScenario.effort,
      cost: VALID_COSTS.has(rawCost) ? rawCost : matchedScenario.cost,
      // Always snap numeric savings to the deterministic code calculation
      co2SavedKg: matchedScenario.co2SavedKg,
      exposureSaved: matchedScenario.exposureSaved,
    });
  }

  // Top up to 5 steps from deterministic ranking if Gemini returned fewer
  for (const fb of fallbackPlan.steps) {
    if (validatedSteps.length >= 5) break;
    if (!usedScenarioIds.has(fb.scenarioId)) {
      usedScenarioIds.add(fb.scenarioId);
      validatedSteps.push({
        ...fb,
        rank: validatedSteps.length + 1,
      });
    }
  }

  if (validatedSteps.length === 0) return null;

  const summarySentences = cleanPlainText(
    obj.summarySentences,
    fallbackPlan.summarySentences,
    600
  );

  return {
    steps: validatedSteps,
    summarySentences,
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
