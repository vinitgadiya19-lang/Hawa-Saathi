import { Check, RefreshCw, Sparkles } from 'lucide-react';
import type { RankedLowEmissionStep } from '../../services/familyPlanApi';

interface LowEmissionStepsSectionProps {
  steps: RankedLowEmissionStep[];
  selectedStepIds: string[];
  isGenerating: boolean;
  usedFallback: boolean;
  planError: string | null;
  hasTrips: boolean;
  onRefreshSteps: () => void;
  onToggleStep: (scenarioId: string) => void;
}

export function LowEmissionStepsSection({
  steps,
  selectedStepIds,
  isGenerating,
  usedFallback,
  planError,
  hasTrips,
  onRefreshSteps,
  onToggleStep,
}: LowEmissionStepsSectionProps) {
  return (
    <section
      id="fp-section-2"
      aria-labelledby="fp-sec2-heading"
      className="brutal-card bg-[#FFF3B0] rounded-3xl p-5 sm:p-7 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-[#141414]/15">
        <div>
          <h2
            id="fp-sec2-heading"
            className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]"
          >
            2. Low-Emission Steps
          </h2>
          <p className="text-sm font-semibold text-[#262626] mt-0.5">
            5 ranked steps for your family using our deterministic CO2 and exposure estimates.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefreshSteps}
          disabled={isGenerating || !hasTrips}
          className="brutal-btn bg-[#141414] text-[#FFFDF2] font-extrabold text-sm sm:text-base px-5 py-3 rounded-2xl inline-flex items-center justify-center gap-2 min-h-[48px] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-55"
        >
          {isGenerating ? (
            <RefreshCw className="w-5 h-5 animate-spin shrink-0" aria-hidden="true" />
          ) : (
            <Sparkles className="w-5 h-5 shrink-0" aria-hidden="true" />
          )}
          <span>
            {isGenerating ? 'Ranking steps...' : 'Get 5 tailored steps'}
          </span>
        </button>
      </div>

      {usedFallback && (
        <div className="inline-flex items-center rounded-lg border-2 border-[#141414] bg-white px-3 py-1 text-xs font-extrabold text-[#141414]">
          Basic plan (AI unavailable)
        </div>
      )}

      {planError && (
        <div
          role="alert"
          className="rounded-xl border-2 border-[#141414] bg-[#FFE0EA] px-4 py-3 text-sm font-bold text-[#141414]"
        >
          {planError}
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step) => {
          const isChosen = selectedStepIds.includes(step.scenarioId);
          return (
            <div
              key={`${step.rank}-${step.scenarioId}`}
              className={`rounded-2xl border-2 border-[#141414] p-4 min-h-[104px] ${
                isChosen ? 'bg-white' : 'bg-[#FFFDF2]/85'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="w-8 h-8 rounded-xl bg-[#141414] text-[#FFFDF2] font-mono text-sm font-bold flex items-center justify-center shrink-0 mt-0.5"
                  >
                    {step.rank}
                  </span>
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-[#141414] leading-snug">
                      {step.change}
                    </h3>
                    <p className="mt-1 text-xs sm:text-sm font-semibold text-[#3F3F46]">
                      Who benefits: <strong className="text-[#141414]">{step.whoBenefits}</strong> · Effort:{' '}
                      <strong className="text-[#141414] capitalize">{step.effort}</strong> · Cost:{' '}
                      <strong className="text-[#141414] capitalize">{step.cost}</strong>
                    </p>
                    <p className="mt-1.5 font-mono text-xs sm:text-sm font-bold text-[#141414] tabular-nums">
                      Est. saved: {step.co2SavedKg.toFixed(1)} kg CO2/wk ·{' '}
                      {step.exposureSaved.toLocaleString()} exposure pts/wk
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleStep(step.scenarioId)}
                  aria-pressed={isChosen}
                  className={`brutal-btn px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer ${
                    isChosen
                      ? 'bg-[#6EE7B7] text-[#141414]'
                      : 'bg-[#FFFDF2] text-[#141414]'
                  }`}
                >
                  <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{isChosen ? 'Included in plan' : 'Include step'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
