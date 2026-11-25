import { Users } from 'lucide-react';
import { useFamilyPlanController } from '../hooks/useFamilyPlanController';
import type { HourlyAirQualityPoint, SelectedLocation } from '../types/airQuality';
import { FamilyJourneySection } from './family/FamilyJourneySection';
import { ImpactInsightsSection } from './family/ImpactInsightsSection';
import { IndoorAirHacksSection } from './family/IndoorAirHacksSection';
import { LowEmissionStepsSection } from './family/LowEmissionStepsSection';

export interface FamilyPlanPageProps {
  location: SelectedLocation | null;
  liveAqi: number | null;
  aqiBandLabel: string;
  hourly24: HourlyAirQualityPoint[];
  defaultLanguage: 'en' | 'hi' | 'hinglish';
  onModelAnswered: (model: string) => void;
  onGoToLocationSetup: () => void;
}

function FamilyPlanHeroBanner({
  location,
  liveAqi,
  aqiBandLabel,
  hasFamilyAndJourney,
  onLoadSampleFamily,
  onGoToLocationSetup,
}: {
  location: SelectedLocation | null;
  liveAqi: number | null;
  aqiBandLabel: string;
  hasFamilyAndJourney: boolean;
  onLoadSampleFamily: () => void;
  onGoToLocationSetup: () => void;
}) {
  const sectionNavLinks = [
    { id: 'fp-section-1', label: '1. Family & Journey' },
    ...(hasFamilyAndJourney
      ? [
          { id: 'fp-section-2', label: '2. Low-Emission Steps' },
          { id: 'fp-section-4', label: '4. Impact Insights' },
        ]
      : []),
    { id: 'fp-section-3', label: '3. Indoor Air Hacks' },
  ];

  const jumpToSection = (sectionId: string) => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section className="brutal-card bg-[#EAD6FF] rounded-3xl p-5 sm:p-7">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#141414] bg-[#FFFDF2] px-3 py-1 text-xs font-extrabold text-[#141414] mb-2">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Session-only memory · Never saved on a server</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#141414] leading-tight">
            Family Low-Emission &amp; Clean Air Plan
          </h1>
          <p className="mt-1.5 text-sm sm:text-base font-semibold text-[#262626]">
            {location && liveAqi !== null ? (
              <>
                Using live air for <strong>{location.name}</strong> ({liveAqi} US AQI ·{' '}
                {aqiBandLabel})
              </>
            ) : (
              <>
                No city selected yet —{' '}
                <button
                  type="button"
                  onClick={onGoToLocationSetup}
                  className="underline font-extrabold text-[#141414] hover:text-[#3F3F46] cursor-pointer"
                >
                  pick your city in Live Coach
                </button>{' '}
                for live hourly AQI scores.
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onLoadSampleFamily}
          className="brutal-btn bg-[#FFD23F] text-[#141414] font-extrabold text-sm sm:text-base px-5 py-3 rounded-2xl min-h-[48px] whitespace-nowrap shrink-0 cursor-pointer"
        >
          Load sample family
        </button>
      </div>

      <nav aria-label="Jump to Family Plan section" className="mt-5 flex flex-wrap gap-2">
        {sectionNavLinks.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => jumpToSection(sec.id)}
            className="brutal-btn bg-[#FFFDF2] text-[#141414] hover:bg-[#FFF3B0] font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl min-h-[40px] cursor-pointer"
          >
            {sec.label}
          </button>
        ))}
      </nav>
    </section>
  );
}

export function FamilyPlanPage({
  location,
  liveAqi,
  aqiBandLabel,
  hourly24,
  defaultLanguage,
  onModelAnswered,
  onGoToLocationSetup,
}: FamilyPlanPageProps) {
  const ctrl = useFamilyPlanController({
    location,
    liveAqi,
    aqiBandLabel,
    hourly24,
    defaultLanguage,
    onModelAnswered,
  });

  return (
    <div className="space-y-6">
      <FamilyPlanHeroBanner
        location={location}
        liveAqi={liveAqi}
        aqiBandLabel={aqiBandLabel}
        hasFamilyAndJourney={ctrl.hasFamilyAndJourney}
        onLoadSampleFamily={ctrl.handleLoadSampleFamily}
        onGoToLocationSetup={onGoToLocationSetup}
      />

      <FamilyJourneySection
        members={ctrl.members}
        calculatedTrips={ctrl.summary.trips}
        home={ctrl.home}
        hasFamilyAndJourney={ctrl.hasFamilyAndJourney}
        memberError={ctrl.memberError}
        tripErrors={ctrl.tripErrors}
        tripMemberId={ctrl.tripMemberId}
        onChangeTripMemberId={ctrl.setTripMemberId}
        onAddMember={ctrl.handleAddMember}
        onRemoveMember={ctrl.handleRemoveMember}
        onAddTrip={ctrl.handleAddTrip}
        onRemoveTrip={ctrl.handleRemoveTrip}
        onChangeHome={ctrl.setHome}
      />

      {ctrl.hasFamilyAndJourney && (
        <LowEmissionStepsSection
          steps={ctrl.displayedSteps}
          selectedStepIds={ctrl.selectedStepIds}
          isGenerating={ctrl.isGeneratingPlan}
          usedFallback={ctrl.usedFallback}
          planError={ctrl.planError}
          hasTrips={ctrl.hasTrips}
          onRefreshSteps={ctrl.handleRefreshSteps}
          onToggleStep={ctrl.toggleStepSelection}
        />
      )}

      <IndoorAirHacksSection
        isOpen={ctrl.showIndoorHacks}
        onToggleOpen={() => ctrl.setShowIndoorHacks((prev) => !prev)}
        hacks={ctrl.indoorHacks}
        checkedHackIds={ctrl.checkedHackIds}
        onToggleHack={ctrl.toggleHackChecked}
      />

      {ctrl.hasFamilyAndJourney && (
        <ImpactInsightsSection
          summary={ctrl.summary}
          afterImpact={ctrl.afterImpact}
          selectedStepCount={ctrl.selectedStepIds.length}
          planLanguage={ctrl.planLanguage}
          summaryText={ctrl.activeSummaryText}
          usedFallback={ctrl.usedFallback}
          onChangeLanguage={ctrl.handleLanguageSwitch}
          onDownloadPlan={ctrl.handleDownloadPlan}
        />
      )}
    </div>
  );
}

export default FamilyPlanPage;
