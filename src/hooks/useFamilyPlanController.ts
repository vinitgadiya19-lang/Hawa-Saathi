import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgeGroupId, HealthNoteId } from '../config/emissionFactors';
import {
  buildTailoredIndoorHacks,
  calculateFamilyImpact,
  computeCombinedImpactAfterSteps,
  createSampleFamilyState,
  MAX_FAMILY_MEMBERS,
  MAX_FREE_TEXT_LENGTH,
  sanitizeFreeText,
  validateTripInput,
  type FamilyMember,
  type FamilyTrip,
  type HomeDetails,
} from '../services/familyPlanCalc';
import {
  downloadPrintableFamilyPlan,
  fetchFamilyPlan,
  type FamilyPlanApiResponse,
  type FamilyPlanLanguage,
  type RankedLowEmissionStep,
} from '../services/familyPlanApi';
import type { HourlyAirQualityPoint, SelectedLocation } from '../types/airQuality';
import type { TripDraftInput } from '../components/family/FamilyJourneySection';

const DEFAULT_HOME_DETAILS: HomeDetails = {
  cookingFuel: 'lpg',
  hasChimneyOrExhaust: false,
  usesAirPurifier: false,
  windowsFacingMainRoad: false,
  smokesOrIncenseIndoors: false,
};

export function pickDefaultStepIds(steps: RankedLowEmissionStep[]): string[] {
  return steps
    .filter((s) => s.co2SavedKg > 0 || s.exposureSaved > 0)
    .slice(0, 3)
    .map((s) => s.scenarioId);
}

export function buildFallbackSummary(
  planLanguage: FamilyPlanLanguage,
  weeklyTotalCo2Kg: number,
  afterCo2Kg: number,
  weeklyTotalExposure: number | null,
  afterExposure: number | null,
  topMemberName?: string
): string {
  const priorityName = topMemberName ?? 'vulnerable family members';
  if (planLanguage === 'hi') {
    const expText =
      weeklyTotalExposure !== null && afterExposure !== null
        ? `साप्ताहिक एक्सपोज़र स्कोर ${weeklyTotalExposure} से घटकर ${afterExposure} होने का अनुमान है।`
        : 'लाइव एक्सपोज़र स्कोर देखने के लिए ऊपर अपना शहर चुनें।';
    return `आपके परिवार का अनुमानित साप्ताहिक CO2 उत्सर्जन अभी ${weeklyTotalCo2Kg} किग्रा है जो चुने हुए कदमों से लगभग ${afterCo2Kg} किग्रा हो सकता है। ${expText} सबसे पहले ${topMemberName ?? 'परिवार के संवेदनशील सदस्यों'} की सुरक्षा पर ध्यान दें।`;
  }
  if (planLanguage === 'mr') {
    const expText =
      weeklyTotalExposure !== null && afterExposure !== null
        ? `साप्ताहिक एक्सपोजर स्कोअर ${weeklyTotalExposure} वरून ${afterExposure} पर्यंत कमी होण्याचा अंदाज आहे.`
        : 'लाइव्ह एक्सपोजर स्कोअर पाहण्यासाठी वर तुमचे शहर निवडा.';
    return `तुमच्या कुटुंबाचे अंदाजे साप्ताहिक CO2 उत्सर्जन सध्या ${weeklyTotalCo2Kg} किलो आहे जे निवडलेल्या उपायांनंतर सुमारे ${afterCo2Kg} किलो होऊ शकते. ${expText} प्रथम ${topMemberName ?? 'लहान मुले आणि ज्येष्ठ'} यांच्या संरक्षणास प्राधान्य द्या.`;
  }
  const expText =
    weeklyTotalExposure !== null && afterExposure !== null
      ? `Estimated weekly breathing exposure drops from ${weeklyTotalExposure.toLocaleString()} to ${afterExposure.toLocaleString()} points.`
      : 'Select a city in Live Coach to add live hourly AQI exposure scores.';
  return `Your household's estimated weekly footprint is ${weeklyTotalCo2Kg} kg CO2, which can drop to ${afterCo2Kg} kg CO2 with your selected steps. ${expText} Prioritize ${priorityName} first during high-AQI hours.`;
}

interface UseFamilyPlanControllerArgs {
  location: SelectedLocation | null;
  liveAqi: number | null;
  aqiBandLabel: string;
  hourly24: HourlyAirQualityPoint[];
  defaultLanguage: 'en' | 'hi' | 'hinglish';
  onModelAnswered: (model: string) => void;
}

function useFamilyPlanRequest({
  location,
  liveAqi,
  aqiBandLabel,
  hourly24,
  onModelAnswered,
  onPlanSuccess,
}: {
  location: SelectedLocation | null;
  liveAqi: number | null;
  aqiBandLabel: string;
  hourly24: HourlyAirQualityPoint[];
  onModelAnswered: (model: string) => void;
  onPlanSuccess: (result: FamilyPlanApiResponse) => void;
}) {
  const [aiPlan, setAiPlan] = useState<FamilyPlanApiResponse | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const planAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      planAbortRef.current?.abort();
    };
  }, []);

  const cancelPlanRequest = () => {
    planAbortRef.current?.abort();
  };

  const requestAiFamilyPlan = async (
    nextMembers: FamilyMember[],
    nextTrips: FamilyTrip[],
    nextHome: HomeDetails,
    nextLang: FamilyPlanLanguage,
    chosenScenarioIds: string[]
  ) => {
    if (nextTrips.length === 0) {
      setPlanError('Add at least 1 daily journey in Section 1 first.');
      return;
    }

    planAbortRef.current?.abort();
    const controller = new AbortController();
    planAbortRef.current = controller;
    setIsGeneratingPlan(true);
    setPlanError(null);

    try {
      const result = await fetchFamilyPlan(
        {
          language: nextLang,
          cityName: location?.name ?? 'Current city',
          aqi: liveAqi,
          aqiBand: aqiBandLabel,
          members: nextMembers,
          trips: nextTrips,
          home: nextHome,
          hourly24,
          selectedScenarioIds: chosenScenarioIds,
        },
        controller.signal
      );
      if (controller.signal.aborted) return;
      setAiPlan(result);
      onModelAnswered(result.model);
      onPlanSuccess(result);
      setIsGeneratingPlan(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      setIsGeneratingPlan(false);
      setPlanError(err instanceof Error ? err.message : 'Unable to generate tailored steps.');
    }
  };

  return {
    aiPlan,
    setAiPlan,
    isGeneratingPlan,
    planError,
    requestAiFamilyPlan,
    cancelPlanRequest,
  };
}

function mapScenariosToSteps(
  scenarios: ReturnType<typeof calculateFamilyImpact>['scenarios']
): RankedLowEmissionStep[] {
  return scenarios.slice(0, 5).map((sc, idx) => ({
    rank: idx + 1,
    scenarioId: sc.id,
    change: sc.title,
    whoBenefits: sc.whoBenefits,
    effort: sc.effort,
    cost: sc.cost,
    co2SavedKg: sc.co2SavedKg,
    exposureSaved: sc.exposureSaved,
  }));
}

export function useFamilyPlanController({
  location,
  liveAqi,
  aqiBandLabel,
  hourly24,
  defaultLanguage,
  onModelAnswered,
}: UseFamilyPlanControllerArgs) {
  // Session-only browser memory; starts empty so Sections 2 & 4 only unlock after input
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [trips, setTrips] = useState<FamilyTrip[]>([]);
  const [home, setHome] = useState<HomeDetails>(DEFAULT_HOME_DETAILS);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [tripMemberId, setTripMemberId] = useState<string>('');
  const [tripErrors, setTripErrors] = useState<string[]>([]);
  const [planLanguage, setPlanLanguage] = useState<FamilyPlanLanguage>(
    defaultLanguage === 'hi' ? 'hi' : 'en'
  );
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [showIndoorHacks, setShowIndoorHacks] = useState(false);
  const [checkedHackIds, setCheckedHackIds] = useState<string[]>([]);

  const {
    aiPlan,
    setAiPlan,
    isGeneratingPlan,
    planError,
    requestAiFamilyPlan,
    cancelPlanRequest,
  } = useFamilyPlanRequest({
    location,
    liveAqi,
    aqiBandLabel,
    hourly24,
    onModelAnswered,
    onPlanSuccess: (result) => setSelectedStepIds(pickDefaultStepIds(result.steps)),
  });

  const hasFamilyAndJourney = members.length > 0 && trips.length > 0;

  useEffect(() => {
    if (members.length === 0) {
      if (tripMemberId !== '') setTripMemberId('');
    } else if (!members.some((m) => m.id === tripMemberId)) {
      setTripMemberId(members[0].id);
    }
  }, [members, tripMemberId]);

  const summary = useMemo(() => {
    if (!hasFamilyAndJourney) {
      return calculateFamilyImpact({ members: [], trips: [], home, hourly24: [], liveAqi: null });
    }
    return calculateFamilyImpact({ members, trips, home, hourly24, liveAqi });
  }, [hasFamilyAndJourney, members, trips, home, hourly24, liveAqi]);

  const displayedSteps: RankedLowEmissionStep[] = useMemo(
    () => (aiPlan && aiPlan.steps.length > 0 ? aiPlan.steps : mapScenariosToSteps(summary.scenarios)),
    [aiPlan, summary.scenarios]
  );

  const afterImpact = useMemo(() => {
    if (!hasFamilyAndJourney) {
      return { afterCo2Kg: 0, totalCo2SavedKg: 0, afterExposure: null, totalExposureSaved: 0 };
    }
    const chosen = displayedSteps.filter((s) => selectedStepIds.includes(s.scenarioId));
    return computeCombinedImpactAfterSteps(summary, chosen);
  }, [hasFamilyAndJourney, summary, displayedSteps, selectedStepIds]);

  const indoorHacks = useMemo(
    () => (showIndoorHacks ? buildTailoredIndoorHacks(home, hourly24, liveAqi) : []),
    [showIndoorHacks, home, hourly24, liveAqi]
  );

  const handleLoadSampleFamily = () => {
    const sample = createSampleFamilyState();
    const initialIds = ['shift_cleaner_hour', 'walk_or_cycle_short_trips', 'switch_to_metro_or_bus'];
    setMembers(sample.members);
    setTrips(sample.trips);
    setHome(sample.home);
    setTripMemberId(sample.members[0].id);
    setMemberError(null);
    setTripErrors([]);
    setSelectedStepIds(initialIds);
    setCheckedHackIds(['cook_with_exhaust', 'stop_incense_smoke']);
    void requestAiFamilyPlan(sample.members, sample.trips, sample.home, planLanguage, initialIds);
  };

  const handleAddMember = (name: string, ageGroup: AgeGroupId, healthNote: HealthNoteId) => {
    setMemberError(null);
    if (members.length >= MAX_FAMILY_MEMBERS) {
      setMemberError(`Maximum ${MAX_FAMILY_MEMBERS} family members supported.`);
      return;
    }
    const cleanName = sanitizeFreeText(name, MAX_FREE_TEXT_LENGTH) || `Member ${members.length + 1}`;
    const newId = `m-${Date.now()}`;
    setMembers((prev) => [...prev, { id: newId, name: cleanName, ageGroup, healthNote }]);
    if (!tripMemberId) setTripMemberId(newId);
  };

  const handleRemoveMember = (id: string) => {
    setMemberError(null);
    const nextMembers = members.filter((m) => m.id !== id);
    const nextTrips = trips.filter((t) => t.memberId !== id);
    setMembers(nextMembers);
    setTrips(nextTrips);
    setAiPlan(null);
    if (nextMembers.length === 0 || nextTrips.length === 0) {
      setSelectedStepIds([]);
      cancelPlanRequest();
    }
  };

  const handleAddTrip = (draft: TripDraftInput): boolean => {
    if (members.length === 0) {
      setTripErrors(['Add at least 1 family member above before adding a journey.']);
      return false;
    }
    const checked = validateTripInput(draft);
    if (!checked.valid) {
      setTripErrors(checked.errors);
      return false;
    }
    setTripErrors([]);
    const newTrip: FamilyTrip = { id: `t-${Date.now()}`, memberId: draft.memberId || members[0].id, ...checked.sanitized };
    const nextTrips = [...trips, newTrip];
    setTrips(nextTrips);
    setAiPlan(null);
    const nextSummary = calculateFamilyImpact({ members, trips: nextTrips, home, hourly24, liveAqi });
    const topIds = nextSummary.scenarios.filter((s) => s.co2SavedKg > 0 || s.exposureSaved > 0).slice(0, 3).map((s) => s.id);
    setSelectedStepIds(topIds);
    void requestAiFamilyPlan(members, nextTrips, home, planLanguage, topIds);
    return true;
  };

  const handleRemoveTrip = (id: string) => {
    const nextTrips = trips.filter((t) => t.id !== id);
    setTrips(nextTrips);
    setAiPlan(null);
    if (nextTrips.length === 0) {
      setSelectedStepIds([]);
      cancelPlanRequest();
    }
  };

  const activeSummaryText =
    aiPlan?.summarySentences ||
    buildFallbackSummary(
      planLanguage,
      summary.weeklyTotalCo2Kg,
      afterImpact.afterCo2Kg,
      summary.weeklyTotalExposure,
      afterImpact.afterExposure,
      summary.memberTotals[0]?.name
    );

  return {
    members,
    home,
    setHome,
    memberError,
    tripMemberId,
    setTripMemberId,
    tripErrors,
    hasFamilyAndJourney,
    summary,
    displayedSteps,
    afterImpact,
    selectedStepIds,
    isGeneratingPlan,
    planError,
    usedFallback: aiPlan?.usedFallback ?? false,
    hasTrips: trips.length > 0,
    showIndoorHacks,
    setShowIndoorHacks,
    indoorHacks,
    checkedHackIds,
    planLanguage,
    activeSummaryText,
    handleLoadSampleFamily,
    handleAddMember,
    handleRemoveMember,
    handleAddTrip,
    handleRemoveTrip,
    toggleStepSelection: (scenarioId: string) =>
      setSelectedStepIds((prev) =>
        prev.includes(scenarioId) ? prev.filter((id) => id !== scenarioId) : [...prev, scenarioId]
      ),
    toggleHackChecked: (hackId: string) =>
      setCheckedHackIds((prev) =>
        prev.includes(hackId) ? prev.filter((id) => id !== hackId) : [...prev, hackId]
      ),
    handleLanguageSwitch: (nextLang: FamilyPlanLanguage) => {
      setPlanLanguage(nextLang);
      if (trips.length > 0) void requestAiFamilyPlan(members, trips, home, nextLang, selectedStepIds);
    },
    handleRefreshSteps: () => void requestAiFamilyPlan(members, trips, home, planLanguage, selectedStepIds),
    handleDownloadPlan: () =>
      downloadPrintableFamilyPlan({
        cityName: location?.name ?? 'Your city',
        liveAqi,
        aqiBandLabel,
        summary,
        steps: displayedSteps,
        selectedStepIds,
        afterImpact,
        checkedHackIds,
        indoorHacks: buildTailoredIndoorHacks(home, hourly24, liveAqi),
        summarySentences: activeSummaryText,
      }),
  };
}
