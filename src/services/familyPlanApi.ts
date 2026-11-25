import type { HourlyAirQualityPoint } from '../types/airQuality';
import type {
  FamilyCalculationSummary,
  FamilyMember,
  FamilyTrip,
  HomeDetails,
  IndoorHackItem,
} from './familyPlanCalc';

export type FamilyPlanLanguage = 'en' | 'hi' | 'mr';

export interface RankedLowEmissionStep {
  rank: number;
  scenarioId: string;
  change: string;
  whoBenefits: string;
  effort: 'easy' | 'medium' | 'hard';
  cost: 'free' | 'low' | 'medium';
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

export async function fetchFamilyPlan(
  payload: {
    language: FamilyPlanLanguage;
    cityName: string;
    aqi: number | null;
    aqiBand: string;
    members: FamilyMember[];
    trips: FamilyTrip[];
    home: HomeDetails;
    hourly24: HourlyAirQualityPoint[];
    selectedScenarioIds: string[];
  },
  signal?: AbortSignal
): Promise<FamilyPlanApiResponse> {
  const res = await fetch('/api/family-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: payload.language,
      cityName: payload.cityName,
      aqi: payload.aqi,
      aqiBand: payload.aqiBand,
      liveAqi: payload.aqi,
      members: payload.members,
      trips: payload.trips,
      home: payload.home,
      hourly24: payload.hourly24.map((h) => ({
        time: h.time,
        hourLabel: h.hourLabel,
        us_aqi: h.us_aqi,
      })),
      selectedScenarioIds: payload.selectedScenarioIds,
    }),
    signal,
  });

  const data = (await res.json().catch(() => null)) as
    | (FamilyPlanApiResponse & { error?: string })
    | null;

  if (!res.ok) {
    throw new Error(data?.error || `Family plan request failed (${res.status})`);
  }
  if (!data) {
    throw new Error('Empty response from server');
  }
  return data;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadPrintableFamilyPlan(params: {
  cityName: string;
  liveAqi: number | null;
  aqiBandLabel: string;
  summary: FamilyCalculationSummary;
  steps: RankedLowEmissionStep[];
  selectedStepIds: string[];
  afterImpact: {
    afterCo2Kg: number;
    totalCo2SavedKg: number;
    afterExposure: number | null;
    totalExposureSaved: number;
  };
  checkedHackIds: string[];
  indoorHacks: IndoorHackItem[];
  summarySentences: string;
}): void {
  const chosenSteps = params.steps.filter((s) =>
    params.selectedStepIds.includes(s.scenarioId)
  );
  const chosenHacks = params.indoorHacks.filter((h) =>
    params.checkedHackIds.includes(h.id)
  );

  const memberRows = params.summary.memberTotals
    .map(
      (m) => `
      <tr>
        <td>${escapeHtml(m.name)}${m.isChildOrSenior ? ' <strong>(Priority: Child/Senior)</strong>' : ''}</td>
        <td>${escapeHtml(m.ageLabel)}</td>
        <td>${escapeHtml(m.healthLabel)}</td>
        <td>${m.weeklyCo2Kg.toFixed(1)} kg (est.)</td>
        <td>${m.weeklyExposureScore !== null ? `${m.weeklyExposureScore.toLocaleString()} (est.)` : 'Live AQI needed'}</td>
      </tr>`
    )
    .join('');

  const stepRows = chosenSteps
    .map(
      (s) => `
      <li>
        <strong>${escapeHtml(s.change)}</strong> — Benefits: ${escapeHtml(s.whoBenefits)} |
        Effort: ${escapeHtml(s.effort)} | Cost: ${escapeHtml(s.cost)} |
        Est. saved: ${s.co2SavedKg.toFixed(1)} kg CO2/wk, ${s.exposureSaved.toLocaleString()} exposure pts
      </li>`
    )
    .join('');

  const hackRows = chosenHacks
    .map(
      (h) => `
      <li>
        <strong>[${escapeHtml(h.tierLabel)}] ${escapeHtml(h.title)}</strong>
        — Benefit: ${escapeHtml(h.expectedBenefit)} (${escapeHtml(h.limits)})
      </li>`
    )
    .join('');

  const healthNoteLine = params.summary.hasAnyHealthNote
    ? '<p><strong>Medical note:</strong> Talk to your doctor about specific care.</p>'
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Hawa Saathi — Family Plan (${escapeHtml(params.cityName)})</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #141414; max-width: 820px; margin: 24px auto; padding: 0 16px; line-height: 1.5; }
    h1, h2 { margin: 18px 0 8px; }
    .box { border: 2px solid #141414; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #141414; padding: 8px; text-align: left; font-size: 14px; }
    th { background: #FFF3B0; }
    .print-btn { padding: 10px 16px; border: 2px solid #141414; background: #FFD23F; font-weight: 700; cursor: pointer; border-radius: 8px; margin-bottom: 16px; }
    @media print { .print-btn { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print or Save as PDF</button>
  <h1>Hawa Saathi — Family Air Quality &amp; Low-Emission Plan</h1>
  <p><strong>City:</strong> ${escapeHtml(params.cityName)} · <strong>Live AQI:</strong> ${
    params.liveAqi !== null ? `${params.liveAqi} (${escapeHtml(params.aqiBandLabel)})` : 'Not loaded'
  } · <em>All calculations are estimates, not measured health outcomes.</em></p>

  <div class="box">
    <h2>Summary</h2>
    <p>${escapeHtml(params.summarySentences)}</p>
    <p><strong>Weekly CO2 (estimate):</strong> ${params.summary.weeklyTotalCo2Kg.toFixed(1)} kg now → ${params.afterImpact.afterCo2Kg.toFixed(1)} kg after chosen steps (saving ${params.afterImpact.totalCo2SavedKg.toFixed(1)} kg/week).</p>
    <p><strong>Weekly Exposure Score (estimate):</strong> ${
      params.summary.weeklyTotalExposure !== null && params.afterImpact.afterExposure !== null
        ? `${params.summary.weeklyTotalExposure.toLocaleString()} now → ${params.afterImpact.afterExposure.toLocaleString()} after chosen steps`
        : 'Load live city AQI in the app for exposure totals'
    }</p>
  </div>

  <div class="box">
    <h2>Family Members (Sorted Highest Exposure First)</h2>
    <table>
      <thead>
        <tr><th>Member</th><th>Age Group</th><th>Health Note</th><th>Weekly CO2</th><th>Weekly Exposure</th></tr>
      </thead>
      <tbody>${memberRows}</tbody>
    </table>
  </div>

  <div class="box">
    <h2>Chosen Low-Emission Steps (${chosenSteps.length})</h2>
    ${chosenSteps.length > 0 ? `<ol>${stepRows}</ol>` : '<p>No low-emission steps ticked yet.</p>'}
  </div>

  <div class="box">
    <h2>Indoor Air Checklist (${chosenHacks.length} ticked)</h2>
    ${chosenHacks.length > 0 ? `<ul>${hackRows}</ul>` : '<p>No indoor hacks ticked yet.</p>'}
    <p><strong>Safety notes:</strong> Never buy ozone-generating purifiers. Indoor plants do not meaningfully clean air. Protect children and seniors first (put the purifier in their bedroom).</p>
  </div>

  <div class="box">
    <h2>Confidence &amp; Disclaimer</h2>
    <p>Includes modeled regional hourly Open-Meteo AQI, distance-based transport CO2 and PM2.5 exposure factors, and age/health vulnerability multipliers. Cannot know real-time street traffic jams, actual indoor PM2.5 levels, or individual medical sensitivity.</p>
    <p><strong>Disclaimer:</strong> Guidance only, not medical advice.</p>
    ${healthNoteLine}
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hawa-saathi-family-plan.html';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
