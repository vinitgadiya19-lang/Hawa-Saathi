import { useMemo } from 'react';
import { AlertTriangle, Download, HeartPulse, Leaf, Wind } from 'lucide-react';
import type { FamilyCalculationSummary } from '../../services/familyPlanCalc';
import type { FamilyPlanLanguage } from '../../services/familyPlanApi';

interface AfterImpactTotals {
  afterCo2Kg: number;
  totalCo2SavedKg: number;
  afterExposure: number | null;
  totalExposureSaved: number;
}

interface ImpactInsightsSectionProps {
  summary: FamilyCalculationSummary;
  afterImpact: AfterImpactTotals;
  selectedStepCount: number;
  planLanguage: FamilyPlanLanguage;
  summaryText: string;
  usedFallback: boolean;
  onChangeLanguage: (lang: FamilyPlanLanguage) => void;
  onDownloadPlan: () => void;
}

function Co2ComparisonCard({
  summary,
  afterImpact,
  selectedStepCount,
}: {
  summary: FamilyCalculationSummary;
  afterImpact: AfterImpactTotals;
  selectedStepCount: number;
}) {
  const co2ChartMax = Math.max(1, summary.weeklyTotalCo2Kg);
  const nowBarPct = Math.min(100, Math.round((summary.weeklyTotalCo2Kg / co2ChartMax) * 100));
  const afterBarPct = Math.min(100, Math.round((afterImpact.afterCo2Kg / co2ChartMax) * 100));

  return (
    <div className="rounded-2xl border-2 border-[#141414] bg-white p-4 sm:p-5 flex flex-col justify-between space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-extrabold text-[#141414]">
          <Leaf className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Weekly CO2 (estimate): Now vs After Chosen Steps</span>
        </div>
        <table className="sr-only">
          <caption>Weekly CO2 comparison before and after chosen steps</caption>
          <thead>
            <tr>
              <th scope="col">Scenario</th>
              <th scope="col">Estimated Weekly CO2 (kg)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Now (current routine)</td>
              <td>{summary.weeklyTotalCo2Kg.toFixed(1)} kg CO2</td>
            </tr>
            <tr>
              <td>After {selectedStepCount} chosen step(s)</td>
              <td>{afterImpact.afterCo2Kg.toFixed(1)} kg CO2</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 space-y-3" aria-hidden="true">
          <div>
            <div className="flex justify-between text-xs font-extrabold text-[#141414] mb-1">
              <span>Now (weekly estimate)</span>
              <span className="font-mono tabular-nums">{summary.weeklyTotalCo2Kg.toFixed(1)} kg CO2</span>
            </div>
            <div className="h-7 w-full rounded-lg border-2 border-[#141414] bg-[#FFFDF2] overflow-hidden">
              <div className="h-full bg-[#FF8FA3]" style={{ width: `${nowBarPct}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-extrabold text-[#141414] mb-1">
              <span>After {selectedStepCount} chosen step(s)</span>
              <span className="font-mono tabular-nums">{afterImpact.afterCo2Kg.toFixed(1)} kg CO2</span>
            </div>
            <div className="h-7 w-full rounded-lg border-2 border-[#141414] bg-[#FFFDF2] overflow-hidden">
              <div className="h-full bg-[#34D399]" style={{ width: `${afterBarPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border-2 border-[#141414] bg-[#FFFDF2] px-3.5 py-2.5 text-xs sm:text-sm font-bold text-[#141414] font-mono tabular-nums">
        Travel: {summary.weeklyTravelCo2Kg.toFixed(1)} kg + Cooking: {summary.weeklyCookingCo2Kg.toFixed(1)} kg ={' '}
        {summary.weeklyTotalCo2Kg.toFixed(1)} kg/wk (saves {afterImpact.totalCo2SavedKg.toFixed(1)} kg/wk)
      </div>
    </div>
  );
}

function WeekTwoWaysCard({
  summary,
  afterImpact,
}: {
  summary: FamilyCalculationSummary;
  afterImpact: AfterImpactTotals;
}) {
  return (
    <div className="rounded-2xl border-2 border-[#141414] bg-white p-4 sm:p-5 flex flex-col justify-between space-y-4">
      <div>
        <h3 className="font-serif text-xl font-bold text-[#141414]">Your week, two ways</h3>
        <p className="text-xs sm:text-sm font-semibold text-[#3F3F46] mt-0.5">
          Compare your current week against applying your ticked steps from Section 2.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-[#141414] bg-[#FFE0EA] p-3.5 space-y-1.5">
          <div className="text-xs font-extrabold uppercase tracking-wide text-[#141414]">
            Current Week (Est.)
          </div>
          <div className="font-mono text-2xl font-bold text-[#141414] tabular-nums">
            {summary.weeklyTotalCo2Kg.toFixed(1)} kg CO2
          </div>
          <div className="font-mono text-sm font-bold text-[#141414] tabular-nums">
            Exposure:{' '}
            {summary.weeklyTotalExposure !== null
              ? summary.weeklyTotalExposure.toLocaleString()
              : 'Needs city AQI'}
          </div>
        </div>

        <div className="rounded-xl border-2 border-[#141414] bg-[#D2F5E3] p-3.5 space-y-1.5">
          <div className="text-xs font-extrabold uppercase tracking-wide text-[#141414]">
            With Chosen Steps (Est.)
          </div>
          <div className="font-mono text-2xl font-bold text-[#141414] tabular-nums">
            {afterImpact.afterCo2Kg.toFixed(1)} kg CO2
          </div>
          <div className="font-mono text-sm font-bold text-[#141414] tabular-nums">
            Exposure:{' '}
            {afterImpact.afterExposure !== null
              ? afterImpact.afterExposure.toLocaleString()
              : 'Needs city AQI'}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberExposureRankingCard({ summary }: { summary: FamilyCalculationSummary }) {
  const maxMemberExposure = useMemo(() => {
    const nums = summary.memberTotals
      .map((m) => m.weeklyExposureScore ?? 0)
      .filter((n) => n > 0);
    return nums.length > 0 ? Math.max(...nums) : 1;
  }, [summary.memberTotals]);

  return (
    <div className="rounded-2xl border-2 border-[#141414] bg-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wind className="w-5 h-5 text-[#141414]" aria-hidden="true" />
          <h3 className="font-serif text-xl font-bold text-[#141414]">
            Exposure score per family member (highest first)
          </h3>
        </div>
        <span className="text-xs font-bold text-[#3F3F46]">All scores are modelled estimates</span>
      </div>

      <div className="space-y-3">
        {summary.memberTotals.map((m) => {
          const score = m.weeklyExposureScore;
          const pct =
            score !== null && maxMemberExposure > 0
              ? Math.max(4, Math.min(100, Math.round((score / maxMemberExposure) * 100)))
              : 0;

          return (
            <div
              key={m.memberId}
              className={`rounded-xl border-2 border-[#141414] p-3.5 space-y-2 ${
                m.isChildOrSenior ? 'bg-[#FFF3B0]' : 'bg-[#FFFDF2]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-extrabold text-[#141414]">{m.name}</span>
                  <span className="text-xs font-bold text-[#3F3F46]">
                    {m.ageLabel}
                    {m.hasHealthCondition ? ` · ${m.healthLabel}` : ''}
                  </span>
                  {m.isChildOrSenior && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-[#141414] bg-[#141414] text-[#FFFDF2] px-2 py-0.5 text-[11px] font-extrabold">
                      <HeartPulse className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>
                        {m.ageGroup === 'child_under_12' ? 'Child priority' : 'Senior priority'}
                      </span>
                    </span>
                  )}
                </div>

                <div className="font-mono text-sm font-extrabold text-[#141414] tabular-nums">
                  {score !== null
                    ? `${score.toLocaleString()} exposure pts (est.)`
                    : 'Load city AQI for score'}{' '}
                  · {m.weeklyCo2Kg.toFixed(1)} kg CO2
                </div>
              </div>

              {score !== null && (
                <div
                  role="img"
                  aria-label={`${m.name} estimated weekly exposure score ${score.toLocaleString()} points`}
                  className="h-4 w-full rounded-md border border-[#141414] bg-white overflow-hidden"
                >
                  <div
                    className={m.isChildOrSenior ? 'h-full bg-[#FF4D8D]' : 'h-full bg-[#60A5FA]'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryAndDisclaimerCards({
  planLanguage,
  summaryText,
  usedFallback,
  hasAnyHealthNote,
  onChangeLanguage,
}: {
  planLanguage: FamilyPlanLanguage;
  summaryText: string;
  usedFallback: boolean;
  hasAnyHealthNote: boolean;
  onChangeLanguage: (lang: FamilyPlanLanguage) => void;
}) {
  return (
    <>
      <div className="rounded-2xl border-2 border-[#141414] bg-white p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-xl font-bold text-[#141414]">Plain-language summary</h3>
            {usedFallback && (
              <span className="inline-flex items-center rounded-md border-2 border-[#141414] bg-[#FFD23F] px-2.5 py-0.5 text-xs font-extrabold text-[#141414]">
                Basic plan (AI unavailable)
              </span>
            )}
          </div>

          <div
            role="group"
            aria-label="Choose summary language"
            className="inline-flex rounded-xl border-2 border-[#141414] bg-[#FFFDF2] p-0.5 gap-0.5"
          >
            {(
              [
                { id: 'en', label: 'English' },
                { id: 'hi', label: 'Hindi' },
                { id: 'mr', label: 'Marathi' },
              ] as const
            ).map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => onChangeLanguage(lang.id)}
                aria-pressed={planLanguage === lang.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] whitespace-nowrap cursor-pointer ${
                  planLanguage === lang.id
                    ? 'bg-[#141414] text-[#FFFDF2]'
                    : 'text-[#141414] hover:bg-[#FFF3B0]'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <p aria-live="polite" className="text-base font-semibold text-[#141414] leading-relaxed">
          {summaryText}
        </p>
      </div>

      <div className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 sm:p-5 space-y-2.5 text-sm">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#141414]" aria-hidden="true" />
          <div>
            <p className="font-extrabold text-[#141414]">
              Confidence note (what this estimate includes &amp; cannot know)
            </p>
            <p className="mt-1 font-medium text-[#262626]">
              Includes modeled regional hourly Open-Meteo AQI, distance-based transport CO2 and
              PM2.5 exposure factors, and age/health sensitivity weights. Cannot know live street
              traffic jams, actual indoor PM2.5 levels inside your rooms, or individual medical
              conditions.
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-[#141414]/15 font-bold text-[#141414]">
          Guidance only, not medical advice.{' '}
          {hasAnyHealthNote && (
            <span className="underline">Talk to your doctor about specific care.</span>
          )}
        </div>
      </div>
    </>
  );
}

export function ImpactInsightsSection({
  summary,
  afterImpact,
  selectedStepCount,
  planLanguage,
  summaryText,
  usedFallback,
  onChangeLanguage,
  onDownloadPlan,
}: ImpactInsightsSectionProps) {
  return (
    <section
      id="fp-section-4"
      aria-labelledby="fp-sec4-heading"
      className="brutal-card bg-[#D2F5E3] rounded-3xl p-5 sm:p-7 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-[#141414]/15">
        <div>
          <h2 id="fp-sec4-heading" className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]">
            4. Impact Insights
          </h2>
          <p className="text-sm font-semibold text-[#141414] mt-0.5">
            Weekly CO2 and member exposure estimates (never measured medical outcomes).
          </p>
        </div>

        <button
          type="button"
          onClick={onDownloadPlan}
          className="brutal-btn bg-[#FFD23F] text-[#141414] font-extrabold text-sm sm:text-base px-5 py-3 rounded-2xl inline-flex items-center justify-center gap-2 min-h-[48px] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>Download my plan</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <Co2ComparisonCard
          summary={summary}
          afterImpact={afterImpact}
          selectedStepCount={selectedStepCount}
        />
        <WeekTwoWaysCard summary={summary} afterImpact={afterImpact} />
      </div>

      <MemberExposureRankingCard summary={summary} />

      <SummaryAndDisclaimerCards
        planLanguage={planLanguage}
        summaryText={summaryText}
        usedFallback={usedFallback}
        hasAnyHealthNote={summary.hasAnyHealthNote}
        onChangeLanguage={onChangeLanguage}
      />
    </section>
  );
}
