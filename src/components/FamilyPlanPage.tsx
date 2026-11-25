import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  HeartPulse,
  Home,
  Info,
  Leaf,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
  Wind,
} from 'lucide-react';
import {
  AGE_VULNERABILITY_FACTORS,
  COOKING_FUEL_FACTORS,
  HEALTH_VULNERABILITY_FACTORS,
  TRAVEL_MODE_FACTORS,
  TRAVEL_MODE_ORDER,
  type AgeGroupId,
  type CookingFuelId,
  type HealthNoteId,
  type TravelModeId,
} from '../config/emissionFactors';
import {
  buildTailoredIndoorHacks,
  calculateCadrRecommendation,
  calculateFamilyImpact,
  computeCombinedImpactAfterSteps,
  createSampleFamilyState,
  MAX_DAYS_PER_WEEK,
  MAX_DISTANCE_KM,
  MAX_FAMILY_MEMBERS,
  MAX_FREE_TEXT_LENGTH,
  sanitizeFreeText,
  validateTripInput,
  type FamilyMember,
  type FamilyTrip,
  type HomeDetails,
  type TimeSlotBand,
} from '../services/familyPlanCalc';
import {
  downloadPrintableFamilyPlan,
  fetchFamilyPlan,
  type FamilyPlanApiResponse,
  type FamilyPlanLanguage,
  type RankedLowEmissionStep,
} from '../services/familyPlanApi';
import type { HourlyAirQualityPoint, SelectedLocation } from '../types/airQuality';

interface FamilyPlanPageProps {
  location: SelectedLocation | null;
  liveAqi: number | null;
  aqiBandLabel: string;
  hourly24: HourlyAirQualityPoint[];
  defaultLanguage: 'en' | 'hi' | 'hinglish';
  onModelAnswered: (model: string) => void;
  onGoToLocationSetup: () => void;
}

const SLOT_BADGE_MAP: Record<
  TimeSlotBand,
  { label: string; bgClass: string; textClass: string }
> = {
  green: {
    label: 'Green hour',
    bgClass: 'bg-[#6EE7B7]',
    textClass: 'text-[#141414]',
  },
  yellow: {
    label: 'Yellow hour',
    bgClass: 'bg-[#FFD23F]',
    textClass: 'text-[#141414]',
  },
  red: {
    label: 'Red hour',
    bgClass: 'bg-[#FF8FA3]',
    textClass: 'text-[#141414]',
  },
  unknown: {
    label: 'Needs city AQI',
    bgClass: 'bg-[#E4E4E7]',
    textClass: 'text-[#141414]',
  },
};

export function FamilyPlanPage({
  location,
  liveAqi,
  aqiBandLabel,
  hourly24,
  defaultLanguage,
  onModelAnswered,
  onGoToLocationSetup,
}: FamilyPlanPageProps) {
  // Session-only browser memory state (no localStorage persistence)
  // Start empty so Low-Emission Steps & Impact Insights only calculate and appear after user inputs
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [trips, setTrips] = useState<FamilyTrip[]>([]);
  const [home, setHome] = useState<HomeDetails>({
    cookingFuel: 'lpg',
    hasChimneyOrExhaust: false,
    usesAirPurifier: false,
    windowsFacingMainRoad: false,
    smokesOrIncenseIndoors: false,
  });

  // Add Member form state
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberAge, setNewMemberAge] = useState<AgeGroupId>('child_under_12');
  const [newMemberHealth, setNewMemberHealth] = useState<HealthNoteId>('none');
  const [memberError, setMemberError] = useState<string | null>(null);

  // Add Trip form state
  const [tripMemberId, setTripMemberId] = useState<string>('');
  const [tripFrom, setTripFrom] = useState('Home');
  const [tripTo, setTripTo] = useState('School');
  const [tripDistance, setTripDistance] = useState('2');
  const [tripTime, setTripTime] = useState('08:00');
  const [tripMode, setTripMode] = useState<TravelModeId>('bike_petrol');
  const [tripDays, setTripDays] = useState('5');
  const [tripErrors, setTripErrors] = useState<string[]>([]);

  // "How we calculate" disclosure
  const [showMethodology, setShowMethodology] = useState(false);

  // Section 2 AI Low-Emission Steps + Section 4 Summary state
  const [planLanguage, setPlanLanguage] = useState<FamilyPlanLanguage>(
    defaultLanguage === 'hi' ? 'hi' : 'en'
  );
  const [aiPlan, setAiPlan] = useState<FamilyPlanApiResponse | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);

  // Section 3 Indoor Air Hacks slide-down, checklist, DIY + CADR Calculator
  const [showIndoorHacks, setShowIndoorHacks] = useState(false);
  const [checkedHackIds, setCheckedHackIds] = useState<string[]>([]);
  const [showCorsiSteps, setShowCorsiSteps] = useState(false);
  const [roomLength, setRoomLength] = useState('12');
  const [roomWidth, setRoomWidth] = useState('10');
  const [roomHeight, setRoomHeight] = useState('9');
  const [roomUnit, setRoomUnit] = useState<'ft' | 'm'>('ft');

  const prefersReducedMotion = useReducedMotion();
  const planAbortRef = useRef<AbortController | null>(null);

  const hasFamilyAndJourney = members.length > 0 && trips.length > 0;

  // Keep tripMemberId valid whenever members change
  useEffect(() => {
    if (members.length === 0) {
      if (tripMemberId !== '') setTripMemberId('');
      return;
    }
    if (!members.some((m) => m.id === tripMemberId)) {
      setTripMemberId(members[0].id);
    }
  }, [members, tripMemberId]);

  // Deterministic calculations only execute after user provides family details and at least 1 journey
  const summary = useMemo(() => {
    if (!hasFamilyAndJourney) {
      return calculateFamilyImpact({
        members: [],
        trips: [],
        home,
        hourly24: [],
        liveAqi: null,
      });
    }
    return calculateFamilyImpact({
      members,
      trips,
      home,
      hourly24,
      liveAqi,
    });
  }, [hasFamilyAndJourney, members, trips, home, hourly24, liveAqi]);

  // Build fallback ranked steps locally when user hasn't called Gemini yet,
  // or display Gemini-validated steps once generated.
  const displayedSteps: RankedLowEmissionStep[] = useMemo(() => {
    if (aiPlan && aiPlan.steps.length > 0) {
      return aiPlan.steps;
    }
    return summary.scenarios.slice(0, 5).map((sc, idx) => ({
      rank: idx + 1,
      scenarioId: sc.id,
      change: sc.title,
      whoBenefits: sc.whoBenefits,
      effort: sc.effort,
      cost: sc.cost,
      co2SavedKg: sc.co2SavedKg,
      exposureSaved: sc.exposureSaved,
    }));
  }, [aiPlan, summary.scenarios]);

  // Initialize selected steps to applicable top steps when new steps arrive
  useEffect(() => {
    const applicableIds = displayedSteps
      .filter((s) => s.co2SavedKg > 0 || s.exposureSaved > 0)
      .slice(0, 3)
      .map((s) => s.scenarioId);
    setSelectedStepIds(applicableIds);
  }, [aiPlan]);

  const afterImpact = useMemo(() => {
    if (!hasFamilyAndJourney) {
      return {
        afterCo2Kg: 0,
        totalCo2SavedKg: 0,
        afterExposure: null,
        totalExposureSaved: 0,
      };
    }
    const chosen = displayedSteps.filter((s) =>
      selectedStepIds.includes(s.scenarioId)
    );
    return computeCombinedImpactAfterSteps(summary, chosen);
  }, [hasFamilyAndJourney, summary, displayedSteps, selectedStepIds]);

  const indoorHacks = useMemo(
    () =>
      showIndoorHacks
        ? buildTailoredIndoorHacks(home, hourly24, liveAqi)
        : [],
    [showIndoorHacks, home, hourly24, liveAqi]
  );

  const cadrResult = useMemo(
    () =>
      calculateCadrRecommendation(
        Number(roomLength),
        Number(roomWidth),
        Number(roomHeight),
        roomUnit
      ),
    [roomLength, roomWidth, roomHeight, roomUnit]
  );

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
      setIsGeneratingPlan(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      setIsGeneratingPlan(false);
      setPlanError(
        err instanceof Error ? err.message : 'Unable to generate tailored steps.'
      );
    }
  };

  useEffect(() => {
    return () => {
      planAbortRef.current?.abort();
    };
  }, []);

  const handleLoadSampleFamily = () => {
    const sample = createSampleFamilyState();
    setMembers(sample.members);
    setTrips(sample.trips);
    setHome(sample.home);
    setTripMemberId(sample.members[0].id);
    setMemberError(null);
    setTripErrors([]);
    setCheckedHackIds(['cook_with_exhaust', 'stop_incense_smoke']);
    void requestAiFamilyPlan(
      sample.members,
      sample.trips,
      sample.home,
      planLanguage,
      ['shift_cleaner_hour', 'walk_or_cycle_short_trips', 'switch_to_metro_or_bus']
    );
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError(null);
    if (members.length >= MAX_FAMILY_MEMBERS) {
      setMemberError(`Maximum ${MAX_FAMILY_MEMBERS} family members supported.`);
      return;
    }
    const cleanName =
      sanitizeFreeText(newMemberName, MAX_FREE_TEXT_LENGTH) ||
      `Member ${members.length + 1}`;
    const newId = `m-${Date.now()}`;
    setMembers((prev) => [
      ...prev,
      {
        id: newId,
        name: cleanName,
        ageGroup: newMemberAge,
        healthNote: newMemberHealth,
      },
    ]);
    if (!tripMemberId) {
      setTripMemberId(newId);
    }
    setNewMemberName('');
    setNewMemberHealth('none');
  };

  const handleRemoveMember = (id: string) => {
    setMemberError(null);
    const nextMembers = members.filter((m) => m.id !== id);
    const nextTrips = trips.filter((t) => t.memberId !== id);
    setMembers(nextMembers);
    setTrips(nextTrips);
    setAiPlan(null);
    if (nextMembers.length === 0 || nextTrips.length === 0) {
      planAbortRef.current?.abort();
    }
  };

  const handleAddTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (members.length === 0) {
      setTripErrors(['Add at least 1 family member above before adding a journey.']);
      return;
    }
    const checked = validateTripInput({
      from: tripFrom,
      to: tripTo,
      distanceKm: tripDistance,
      daysPerWeek: tripDays,
      timeOfDay: tripTime,
      travelMode: tripMode,
    });
    if (!checked.valid) {
      setTripErrors(checked.errors);
      return;
    }

    setTripErrors([]);
    const newTrip: FamilyTrip = {
      id: `t-${Date.now()}`,
      memberId: tripMemberId || members[0].id,
      ...checked.sanitized,
    };
    const nextTrips = [...trips, newTrip];
    setTrips(nextTrips);
    setAiPlan(null);

    const nextSummary = calculateFamilyImpact({
      members,
      trips: nextTrips,
      home,
      hourly24,
      liveAqi,
    });
    const topIds = nextSummary.scenarios
      .filter((s) => s.co2SavedKg > 0 || s.exposureSaved > 0)
      .slice(0, 3)
      .map((s) => s.id);
    void requestAiFamilyPlan(members, nextTrips, home, planLanguage, topIds);
  };

  const handleRemoveTrip = (id: string) => {
    const nextTrips = trips.filter((t) => t.id !== id);
    setTrips(nextTrips);
    setAiPlan(null);
    if (nextTrips.length === 0) {
      planAbortRef.current?.abort();
    }
  };

  const toggleStepSelection = (scenarioId: string) => {
    setSelectedStepIds((prev) =>
      prev.includes(scenarioId)
        ? prev.filter((id) => id !== scenarioId)
        : [...prev, scenarioId]
    );
  };

  const toggleHackChecked = (hackId: string) => {
    setCheckedHackIds((prev) =>
      prev.includes(hackId)
        ? prev.filter((id) => id !== hackId)
        : [...prev, hackId]
    );
  };

  const handleLanguageSwitch = (nextLang: FamilyPlanLanguage) => {
    setPlanLanguage(nextLang);
    if (trips.length > 0) {
      void requestAiFamilyPlan(members, trips, home, nextLang, selectedStepIds);
    }
  };

  const jumpToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const maxMemberExposure = useMemo(() => {
    const nums = summary.memberTotals
      .map((m) => m.weeklyExposureScore ?? 0)
      .filter((n) => n > 0);
    return nums.length > 0 ? Math.max(...nums) : 1;
  }, [summary.memberTotals]);

  const fallbackSummaryText = useMemo(() => {
    const top = summary.memberTotals[0];
    if (planLanguage === 'hi') {
      return `आपके परिवार का अनुमानित साप्ताहिक CO2 उत्सर्जन अभी ${summary.weeklyTotalCo2Kg} किग्रा है जो चुने हुए कदमों से लगभग ${afterImpact.afterCo2Kg} किग्रा हो सकता है। ${
        summary.weeklyTotalExposure !== null && afterImpact.afterExposure !== null
          ? `साप्ताहिक एक्सपोज़र स्कोर ${summary.weeklyTotalExposure} से घटकर ${afterImpact.afterExposure} होने का अनुमान है।`
          : 'लाइव एक्सपोज़र स्कोर देखने के लिए ऊपर अपना शहर चुनें।'
      } सबसे पहले ${top?.name ?? 'परिवार के संवेदनशील सदस्यों'} की सुरक्षा पर ध्यान दें।`;
    }
    if (planLanguage === 'mr') {
      return `तुमच्या कुटुंबाचे अंदाजे साप्ताहिक CO2 उत्सर्जन सध्या ${summary.weeklyTotalCo2Kg} किलो आहे जे निवडलेल्या उपायांनंतर सुमारे ${afterImpact.afterCo2Kg} किलो होऊ शकते. ${
        summary.weeklyTotalExposure !== null && afterImpact.afterExposure !== null
          ? `साप्ताहिक एक्सपोजर स्कोअर ${summary.weeklyTotalExposure} वरून ${afterImpact.afterExposure} पर्यंत कमी होण्याचा अंदाज आहे.`
          : 'लाइव्ह एक्सपोजर स्कोअर पाहण्यासाठी वर तुमचे शहर निवडा.'
      } प्रथम ${top?.name ?? 'लहान मुले आणि ज्येष्ठ'} यांच्या संरक्षणास प्राधान्य द्या.`;
    }
    return `Your household's estimated weekly footprint is ${summary.weeklyTotalCo2Kg} kg CO2, which can drop to ${afterImpact.afterCo2Kg} kg CO2 with your selected steps. ${
      summary.weeklyTotalExposure !== null && afterImpact.afterExposure !== null
        ? `Estimated weekly breathing exposure drops from ${summary.weeklyTotalExposure.toLocaleString()} to ${afterImpact.afterExposure.toLocaleString()} points.`
        : 'Select a city in Live Coach to add live hourly AQI exposure scores.'
    } Prioritize ${top?.name ?? 'vulnerable family members'} first during high-AQI hours.`;
  }, [planLanguage, summary, afterImpact]);

  const activeSummaryText = aiPlan?.summarySentences || fallbackSummaryText;

  const co2ChartMax = Math.max(1, summary.weeklyTotalCo2Kg);
  const nowBarPct = Math.min(100, Math.round((summary.weeklyTotalCo2Kg / co2ChartMax) * 100));
  const afterBarPct = Math.min(100, Math.round((afterImpact.afterCo2Kg / co2ChartMax) * 100));

  return (
    <div className="space-y-6">
      {/* Family Plan Hero & Quick Section Nav */}
      <section className="brutal-card bg-[#EAD6FF] rounded-3xl p-5 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#141414] leading-tight">
              Family Plan
            </h1>
            <p className="mt-1.5 text-sm sm:text-base font-semibold text-[#141414]">
              Plan safer school runs, cleaner commutes, and lower-smoke homes together.{' '}
              <span className="font-normal text-[#3F3F46]">
                Session memory only · all figures are estimates.
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleLoadSampleFamily}
            className="brutal-btn bg-[#FFD23F] text-[#141414] font-extrabold text-sm sm:text-base px-5 py-3 rounded-2xl inline-flex items-center justify-center gap-2 min-h-[48px] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>Load sample family</span>
          </button>
        </div>

        {/* City & Live AQI Context Banner */}
        <div className="mt-4 pt-4 border-t-2 border-[#141414]/15 flex flex-wrap items-center justify-between gap-3">
          {location && liveAqi !== null ? (
            <p className="text-sm font-bold text-[#141414]">
              Using live Open-Meteo data for <strong>{location.name}</strong>: US AQI{' '}
              <span className="font-mono tabular-nums">{liveAqi}</span> ({aqiBandLabel}) ·{' '}
              <span className="font-normal text-[#3F3F46]">
                modelled estimate, may differ from your exact street
              </span>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-bold text-[#141414]">
                No live city AQI loaded yet — CO2 calculates now, and live exposure scores appear once a city is chosen.
              </p>
              <button
                type="button"
                onClick={onGoToLocationSetup}
                className="px-3.5 py-2 rounded-xl border-2 border-[#141414] bg-[#FFFDF2] text-xs font-extrabold text-[#141414] min-h-[40px] cursor-pointer"
              >
                Pick city / GPS
              </button>
            </div>
          )}
        </div>

        {/* Quick Jump Bar (only unlocks 2 & 4 once family + journey are entered) */}
        <nav
          aria-label="Family Plan sections"
          className="mt-4 flex flex-wrap gap-2"
        >
          <button
            type="button"
            onClick={() => jumpToSection('fp-section-1')}
            className="brutal-btn bg-[#FFFDF2] hover:bg-[#FFF3B0] text-[#141414] font-extrabold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            1. Family &amp; Journey
          </button>

          {hasFamilyAndJourney && (
            <button
              type="button"
              onClick={() => jumpToSection('fp-section-2')}
              className="brutal-btn bg-[#FFFDF2] hover:bg-[#FFF3B0] text-[#141414] font-extrabold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl min-h-[44px] whitespace-nowrap cursor-pointer"
            >
              2. Low-Emission Steps
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowIndoorHacks(true);
              setTimeout(() => jumpToSection('fp-section-3'), 40);
            }}
            className="brutal-btn bg-[#FFFDF2] hover:bg-[#FFF3B0] text-[#141414] font-extrabold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            3. Indoor Air Hacks
          </button>

          {hasFamilyAndJourney && (
            <button
              type="button"
              onClick={() => jumpToSection('fp-section-4')}
              className="brutal-btn bg-[#FFFDF2] hover:bg-[#FFF3B0] text-[#141414] font-extrabold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl min-h-[44px] whitespace-nowrap cursor-pointer"
            >
              4. Impact Insights
            </button>
          )}
        </nav>
      </section>

      {/* ===================================================================== */}
      {/* SECTION 1: MY FAMILY AND JOURNEY                                      */}
      {/* ===================================================================== */}
      <section
        id="fp-section-1"
        aria-labelledby="fp-sec1-heading"
        className="brutal-card bg-white rounded-3xl p-5 sm:p-7 space-y-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b-2 border-[#141414]/15">
          <div>
            <h2
              id="fp-sec1-heading"
              className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]"
            >
              1. My Family and Journey
            </h2>
            <p className="text-sm font-semibold text-[#3F3F46] mt-0.5">
              Add 1 to 6 household members, weekly trips, and home air sources.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMethodology((v) => !v)}
            aria-expanded={showMethodology}
            className="brutal-btn bg-[#D6EEFF] text-[#141414] font-extrabold text-xs sm:text-sm px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>How we calculate</span>
            {showMethodology ? (
              <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* How We Calculate Panel */}
        {showMethodology && (
          <div className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#141414]">
                How we calculate estimates
              </h3>
              <p className="text-sm font-medium text-[#262626] mt-1">
                Every figure is an <strong>estimate</strong>, not a measured health outcome.
                Per-trip exposure score ={' '}
                <span className="font-mono font-bold">
                  Slot AQI × Trip Minutes × Mode PM2.5 Factor × Vulnerability Factor
                </span>
                .
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px] text-xs sm:text-sm">
                <thead>
                  <tr className="border-b-2 border-[#141414] bg-[#FFF3B0] font-extrabold text-[#141414]">
                    <th className="p-2.5">Travel Mode</th>
                    <th className="p-2.5">Est. g CO2 / pkm</th>
                    <th className="p-2.5">PM2.5 Weight</th>
                    <th className="p-2.5">Assumed Speed</th>
                    <th className="p-2.5">Source / Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/15 font-medium text-[#141414]">
                  {TRAVEL_MODE_ORDER.map((modeId) => {
                    const f = TRAVEL_MODE_FACTORS[modeId];
                    return (
                      <tr key={modeId}>
                        <td className="p-2.5 font-bold">{f.label}</td>
                        <td className="p-2.5 font-mono tabular-nums">
                          {f.co2GramsPerPassengerKm} g
                        </td>
                        <td className="p-2.5 font-mono tabular-nums">
                          {f.pm25ExposureFactor.toFixed(2)}×
                        </td>
                        <td className="p-2.5 font-mono tabular-nums">
                          {f.avgSpeedKmh} km/h
                        </td>
                        <td className="p-2.5 text-xs text-[#3F3F46]">{f.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm">
              <div className="rounded-xl border border-[#141414]/25 bg-white p-3">
                <div className="font-extrabold text-[#141414] mb-1">
                  Vulnerability multipliers (estimate)
                </div>
                <ul className="space-y-1 text-[#262626]">
                  <li>
                    Child (&lt;12): <strong>1.35×</strong> · Senior (60+):{' '}
                    <strong>1.35×</strong> · Teen: <strong>1.10×</strong> · Adult:{' '}
                    <strong>1.00×</strong>
                  </li>
                  <li>
                    Asthma: <strong>1.40×</strong> · Heart condition: <strong>1.35×</strong> ·
                    Pregnancy: <strong>1.35×</strong>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-[#141414]/25 bg-white p-3">
                <div className="font-extrabold text-[#141414] mb-1">
                  Weekly cooking fuel baseline (estimate)
                </div>
                <ul className="space-y-1 text-[#262626]">
                  <li>
                    LPG: <strong>10.1 kg CO2/wk</strong> · PNG: <strong>8.6 kg/wk</strong> ·
                    Induction: <strong>6.4 kg/wk</strong> · Biomass:{' '}
                    <strong>24.0 kg/wk</strong>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 1A: Family Members */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-xl font-bold text-[#141414]">
              Family members ({members.length} / {MAX_FAMILY_MEMBERS})
            </h3>
          </div>

          {members.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-[#141414]/40 bg-[#FFFDF2] px-4 py-3 text-sm font-semibold text-[#3F3F46]">
              No family members added yet. Add 1 to 6 people below (or tap{' '}
              <strong>Load sample family</strong> above).
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-3.5 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-base font-extrabold text-[#141414] truncate">
                      {m.name}
                    </div>
                    <div className="text-xs font-semibold text-[#3F3F46] mt-0.5">
                      {AGE_VULNERABILITY_FACTORS[m.ageGroup].label}
                      {m.healthNote !== 'none'
                        ? ` · ${HEALTH_VULNERABILITY_FACTORS[m.healthNote].label}`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(m.id)}
                    aria-label={`Remove family member ${m.name}`}
                    className="min-w-[40px] min-h-[40px] rounded-xl border border-[#141414]/30 hover:bg-[#FFE0EA] flex items-center justify-center text-[#141414] shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={handleAddMember}
            className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
          >
            <div>
              <label
                htmlFor="fp-member-name"
                className="block text-xs font-extrabold text-[#141414] mb-1"
              >
                Person label (optional)
              </label>
              <input
                id="fp-member-name"
                type="text"
                maxLength={MAX_FREE_TEXT_LENGTH}
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="e.g. Aarav, Mom, Dada"
                className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
              />
            </div>

            <div>
              <label
                htmlFor="fp-member-age"
                className="block text-xs font-extrabold text-[#141414] mb-1"
              >
                Age group
              </label>
              <select
                id="fp-member-age"
                value={newMemberAge}
                onChange={(e) => setNewMemberAge(e.target.value as AgeGroupId)}
                className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
              >
                {(Object.keys(AGE_VULNERABILITY_FACTORS) as AgeGroupId[]).map(
                  (id) => (
                    <option key={id} value={id}>
                      {AGE_VULNERABILITY_FACTORS[id].label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="fp-member-health"
                className="block text-xs font-extrabold text-[#141414] mb-1"
              >
                Health note
              </label>
              <select
                id="fp-member-health"
                value={newMemberHealth}
                onChange={(e) =>
                  setNewMemberHealth(e.target.value as HealthNoteId)
                }
                className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
              >
                {(
                  Object.keys(HEALTH_VULNERABILITY_FACTORS) as HealthNoteId[]
                ).map((id) => (
                  <option key={id} value={id}>
                    {HEALTH_VULNERABILITY_FACTORS[id].label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={members.length >= MAX_FAMILY_MEMBERS}
              className="brutal-btn bg-[#D2F5E3] text-[#141414] font-extrabold text-sm px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Add person</span>
            </button>
          </form>

          {memberError && (
            <p role="alert" className="text-sm font-bold text-[#991B1B]">
              {memberError}
            </p>
          )}
        </div>

        {/* 1B: Daily Journeys */}
        <div className="space-y-4 pt-4 border-t-2 border-[#141414]/15">
          <h3 className="font-serif text-xl font-bold text-[#141414]">
            Daily journeys ({trips.length})
          </h3>

          <form
            onSubmit={handleAddTrip}
            className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="fp-trip-who"
                  className="block text-xs font-extrabold text-[#141414] mb-1"
                >
                  Who travels
                </label>
                <select
                  id="fp-trip-who"
                  value={tripMemberId}
                  onChange={(e) => setTripMemberId(e.target.value)}
                  disabled={members.length === 0}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl disabled:opacity-60"
                >
                  {members.length === 0 ? (
                    <option value="">Add a family member above first</option>
                  ) : (
                    members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="fp-trip-from"
                  className="block text-xs font-extrabold text-[#141414] mb-1"
                >
                  From (label)
                </label>
                <input
                  id="fp-trip-from"
                  type="text"
                  maxLength={MAX_FREE_TEXT_LENGTH}
                  value={tripFrom}
                  onChange={(e) => setTripFrom(e.target.value)}
                  placeholder="Home"
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                />
              </div>

              <div>
                <label
                  htmlFor="fp-trip-to"
                  className="block text-xs font-extrabold text-[#141414] mb-1"
                >
                  To (label)
                </label>
                <input
                  id="fp-trip-to"
                  type="text"
                  maxLength={MAX_FREE_TEXT_LENGTH}
                  value={tripTo}
                  onChange={(e) => setTripTo(e.target.value)}
                  placeholder="School / Office"
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                />
              </div>

              <div>
                <label
                  htmlFor="fp-trip-mode"
                  className="block text-xs font-extrabold text-[#141414] mb-1"
                >
                  Travel mode
                </label>
                <select
                  id="fp-trip-mode"
                  value={tripMode}
                  onChange={(e) => setTripMode(e.target.value as TravelModeId)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                >
                  {TRAVEL_MODE_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {TRAVEL_MODE_FACTORS[id].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label
                  htmlFor="fp-trip-distance"
                  className="block text-xs font-extrabold text-[#141414] mb-1"
                >
                  Distance (km, 0–{MAX_DISTANCE_KM})
                </label>
                <input
                  id="fp-trip-distance"
                  type="number"
                  step="0.1"
                  min={0}
                  max={MAX_DISTANCE_KM}
                  value={tripDistance}
                  onChange={(e) => setTripDistance(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono font-bold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                />
              </div>

              <div>
                <label
                  htmlFor="fp-trip-time"
                  className="block text-xs font-extrabold text-[#141414] mb-1"
                >
                  Time of day
                </label>
                <input
                  id="fp-trip-time"
                  type="time"
                  value={tripTime}
                  onChange={(e) => setTripTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono font-bold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                />
              </div>

              <div>
                <label
                  htmlFor="fp-trip-days"
                  className="block text-xs font-extrabold text-[#141414] mb-1"
                >
                  Days / week (0–{MAX_DAYS_PER_WEEK})
                </label>
                <input
                  id="fp-trip-days"
                  type="number"
                  step="1"
                  min={0}
                  max={MAX_DAYS_PER_WEEK}
                  value={tripDays}
                  onChange={(e) => setTripDays(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm font-mono font-bold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={members.length === 0}
                className="brutal-btn bg-[#FFD23F] text-[#141414] font-extrabold text-sm px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Add journey</span>
              </button>
            </div>

            {tripErrors.length > 0 && (
              <div
                role="alert"
                className="rounded-xl border-2 border-[#141414] bg-[#FFE0EA] px-3.5 py-2 text-xs sm:text-sm font-bold text-[#141414]"
              >
                {tripErrors.join(' ')}
              </div>
            )}
          </form>

          {summary.trips.length === 0 ? (
            <p className="text-sm font-semibold text-[#3F3F46] py-2">
              No journeys added yet. Add a daily trip above or tap{' '}
              <strong>Load sample family</strong> to try an example household.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border-2 border-[#141414]">
              <table className="w-full text-left border-collapse min-w-[660px] text-sm">
                <thead>
                  <tr className="border-b-2 border-[#141414] bg-[#FFF3B0] text-xs font-extrabold uppercase tracking-wide text-[#141414]">
                    <th className="p-3">Who &amp; Route</th>
                    <th className="p-3">Mode</th>
                    <th className="p-3">Distance / Freq</th>
                    <th className="p-3">Time Slot</th>
                    <th className="p-3">Weekly CO2 (est.)</th>
                    <th className="p-3">Weekly Exposure (est.)</th>
                    <th className="p-3 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/15 bg-white font-semibold text-[#141414]">
                  {summary.trips.map((t) => {
                    const badge = SLOT_BADGE_MAP[t.slotBand];
                    return (
                      <tr key={t.tripId}>
                        <td className="p-3">
                          <div className="font-extrabold">{t.memberName}</div>
                          <div className="text-xs text-[#3F3F46]">
                            {t.from} → {t.to}
                          </div>
                        </td>
                        <td className="p-3">{t.travelModeLabel}</td>
                        <td className="p-3 font-mono tabular-nums whitespace-nowrap">
                          {t.distanceKm} km · {t.daysPerWeek}d/wk
                        </td>
                        <td className="p-3">
                          <div className="font-mono text-xs font-bold mb-1">
                            {t.timeOfDay}
                            {t.slotAqi !== null ? ` (~${t.slotAqi} AQI)` : ''}
                          </div>
                          <span
                            className={`inline-block rounded-md border border-[#141414] ${badge.bgClass} ${badge.textClass} px-2 py-0.5 text-[11px] font-extrabold`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="p-3 font-mono tabular-nums whitespace-nowrap">
                          {t.weeklyCo2Kg.toFixed(1)} kg
                        </td>
                        <td className="p-3 font-mono tabular-nums whitespace-nowrap">
                          {t.weeklyExposureScore !== null
                            ? t.weeklyExposureScore.toLocaleString()
                            : '—'}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveTrip(t.tripId)}
                            aria-label={`Remove trip ${t.from} to ${t.to} for ${t.memberName}`}
                            className="min-w-[40px] min-h-[40px] rounded-xl border border-[#141414]/30 hover:bg-[#FFE0EA] inline-flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 1C: Home Details */}
        <div className="space-y-4 pt-4 border-t-2 border-[#141414]/15">
          <div className="flex items-center gap-2">
            <Home className="w-5 h-5 text-[#141414]" aria-hidden="true" />
            <h3 className="font-serif text-xl font-bold text-[#141414]">
              Home details
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-3.5">
              <label
                htmlFor="fp-cooking-fuel"
                className="block text-xs font-extrabold text-[#141414] mb-1.5"
              >
                Cooking fuel
              </label>
              <select
                id="fp-cooking-fuel"
                value={home.cookingFuel}
                onChange={(e) => {
                  setHome((prev) => ({
                    ...prev,
                    cookingFuel: e.target.value as CookingFuelId,
                  }));
                  setAiPlan(null);
                }}
                className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
              >
                {(Object.keys(COOKING_FUEL_FACTORS) as CookingFuelId[]).map(
                  (id) => (
                    <option key={id} value={id}>
                      {COOKING_FUEL_FACTORS[id].label}
                    </option>
                  )
                )}
              </select>
            </div>

            {[
              {
                key: 'hasChimneyOrExhaust' as const,
                label: 'Kitchen chimney or exhaust fan?',
              },
              {
                key: 'usesAirPurifier' as const,
                label: 'Uses an air purifier at home?',
              },
              {
                key: 'windowsFacingMainRoad' as const,
                label: 'Windows facing a main road?',
              },
              {
                key: 'smokesOrIncenseIndoors' as const,
                label: 'Anyone smokes or burns incense indoors?',
              },
            ].map((field) => {
              const checked = home[field.key];
              return (
                <div
                  key={field.key}
                  className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-3.5 flex items-center justify-between gap-3"
                >
                  <span className="text-sm font-bold text-[#141414]">
                    {field.label}
                  </span>
                  <div
                    role="group"
                    aria-label={field.label}
                    className="inline-flex rounded-xl border-2 border-[#141414] bg-white p-0.5 shrink-0"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setHome((prev) => ({ ...prev, [field.key]: true }));
                        setAiPlan(null);
                      }}
                      aria-pressed={checked}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] cursor-pointer ${
                        checked
                          ? 'bg-[#141414] text-[#FFFDF2]'
                          : 'text-[#141414]'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHome((prev) => ({ ...prev, [field.key]: false }));
                        setAiPlan(null);
                      }}
                      aria-pressed={!checked}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] cursor-pointer ${
                        !checked
                          ? 'bg-[#141414] text-[#FFFDF2]'
                          : 'text-[#141414]'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!hasFamilyAndJourney && (
          <div
            role="status"
            className="rounded-2xl border-2 border-[#141414] bg-[#FFF3B0] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <p className="text-sm sm:text-base font-bold text-[#141414]">
              {members.length === 0
                ? 'Next: Add at least 1 family member and 1 daily journey above (or tap Load sample family) to reveal your Low-Emission Steps and Impact Insights.'
                : 'Next: Add at least 1 daily journey above to calculate your Low-Emission Steps and Impact Insights.'}
            </p>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* SECTION 2: LOW-EMISSION STEPS (ONLY AFTER USER INPUTS)                */}
      {/* ===================================================================== */}
      {hasFamilyAndJourney && (
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
            onClick={() =>
              void requestAiFamilyPlan(
                members,
                trips,
                home,
                planLanguage,
                selectedStepIds
              )
            }
            disabled={isGeneratingPlan || trips.length === 0}
            className="brutal-btn bg-[#141414] text-[#FFFDF2] font-extrabold text-sm sm:text-base px-5 py-3 rounded-2xl inline-flex items-center justify-center gap-2 min-h-[48px] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-55"
          >
            {isGeneratingPlan ? (
              <RefreshCw className="w-5 h-5 animate-spin shrink-0" aria-hidden="true" />
            ) : (
              <Sparkles className="w-5 h-5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {isGeneratingPlan ? 'Ranking steps...' : 'Get 5 tailored steps'}
            </span>
          </button>
        </div>

        {aiPlan?.usedFallback && (
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
          {displayedSteps.map((step) => {
            const isChosen = selectedStepIds.includes(step.scenarioId);
            return (
              <div
                key={`${step.rank}-${step.scenarioId}`}
                className={`rounded-2xl border-2 border-[#141414] p-4 transition-colors ${
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
                    onClick={() => toggleStepSelection(step.scenarioId)}
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
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: INDOOR AIR HACKS (SLIDE-DOWN ON CLICK)                     */}
      {/* ===================================================================== */}
      <section
        id="fp-section-3"
        aria-labelledby="fp-sec3-heading"
        className="brutal-card bg-white rounded-3xl overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setShowIndoorHacks((v) => !v)}
          aria-expanded={showIndoorHacks}
          aria-controls="fp-indoor-hacks-panel"
          className="w-full p-5 sm:p-7 flex items-center justify-between gap-4 text-left hover:bg-[#FFFDF2] transition-colors cursor-pointer min-h-[76px]"
        >
          <div>
            <h2
              id="fp-sec3-heading"
              className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]"
            >
              3. Indoor Air Hacks
            </h2>
            <p className="text-sm font-semibold text-[#3F3F46] mt-0.5">
              {showIndoorHacks
                ? 'Tailored to your home details and live AQI, ordered Free, Low cost, then Invest.'
                : 'Tap to expand Free, Low-cost & Invest indoor air hacks, DIY filter guide & CADR calculator.'}
            </p>
          </div>

          <span className="brutal-btn bg-[#EAD6FF] text-[#141414] font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 min-h-[44px] whitespace-nowrap shrink-0">
            <span>{showIndoorHacks ? 'Hide hacks' : 'Show hacks'}</span>
            {showIndoorHacks ? (
              <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {showIndoorHacks && (
            <motion.div
              id="fp-indoor-hacks-panel"
              initial={prefersReducedMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 sm:px-7 sm:pb-7 pt-2 border-t-2 border-[#141414]/15 space-y-5">
                {/* Critical Safety Notes */}
                <div className="rounded-2xl border-2 border-[#141414] bg-[#FFE0EA] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-[#141414]">
            <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>Important indoor air safety rules</span>
          </div>
          <ul className="space-y-1.5 text-sm font-semibold text-[#141414] list-disc pl-5">
            <li>
              <strong>Never buy ozone-generating purifiers</strong> (avoid ionizers or “ozone” modes — ozone irritates lungs).
            </li>
            <li>
              <strong>Indoor plants do not meaningfully clean indoor air</strong> at real household room volumes.
            </li>
            <li>
              <strong>Protect children and seniors first</strong> — place your purifier or DIY filter box in their bedroom first.
            </li>
          </ul>
        </div>

        {/* Ordered Checklist (Free -> Low cost -> Invest) */}
        <div className="space-y-3">
          {indoorHacks.map((hack) => {
            const isChecked = checkedHackIds.includes(hack.id);
            const tierBg =
              hack.tier === 'free'
                ? 'bg-[#D2F5E3]'
                : hack.tier === 'low'
                  ? 'bg-[#FFF3B0]'
                  : 'bg-[#D6EEFF]';
            return (
              <div
                key={hack.id}
                className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-extrabold text-[#3F3F46]">
                      <span
                        className={`inline-block rounded-md border border-[#141414] ${tierBg} text-[#141414] px-2 py-0.5 mr-2`}
                      >
                        {hack.tierLabel}
                      </span>
                      <span>
                        Expected benefit:{' '}
                        <strong className="uppercase text-[#141414]">
                          {hack.expectedBenefit}
                        </strong>
                      </span>
                      {hack.isUrgentForHome && (
                        <span> · Priority for your home</span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-extrabold text-[#141414]">
                      {hack.title}
                    </h3>
                    <p className="text-sm font-semibold text-[#141414]">
                      {hack.action}
                    </p>
                    <p className="text-xs sm:text-sm font-medium text-[#3F3F46]">
                      Why: {hack.tailoredReason} · <strong>Limit:</strong> {hack.limits}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleHackChecked(hack.id)}
                    aria-pressed={isChecked}
                    className={`brutal-btn px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer ${
                      isChecked
                        ? 'bg-[#141414] text-[#FFFDF2]'
                        : 'bg-white text-[#141414]'
                    }`}
                  >
                    <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{isChecked ? 'Done / Planned' : 'Tick off'}</span>
                  </button>
                </div>

                {/* DIY Corsi-Rosenthal Step-by-Step */}
                {hack.steps && hack.steps.length > 0 && (
                  <div className="pt-2 border-t border-[#141414]/15">
                    <button
                      type="button"
                      onClick={() => setShowCorsiSteps((v) => !v)}
                      aria-expanded={showCorsiSteps}
                      className="text-xs sm:text-sm font-extrabold text-[#141414] underline inline-flex items-center gap-1 min-h-[40px] cursor-pointer"
                    >
                      <span>
                        {showCorsiSteps
                          ? 'Hide DIY Corsi-Rosenthal step-by-step'
                          : 'Show DIY Corsi-Rosenthal step-by-step (5 steps)'}
                      </span>
                    </button>

                    {showCorsiSteps && (
                      <ol className="mt-2 space-y-1.5 text-sm font-semibold text-[#141414] list-decimal pl-5">
                        {hack.steps.map((st, idx) => (
                          <li key={idx}>{st}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {/* CADR Calculator */}
                {hack.includesCadrCalculator && (
                  <div className="pt-3 border-t border-[#141414]/15 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-extrabold text-[#141414]">
                        Bedroom CADR Calculator (targets {cadrResult.targetAch} air changes/hour)
                      </span>
                      <div
                        role="group"
                        aria-label="Room dimension units"
                        className="inline-flex rounded-xl border-2 border-[#141414] bg-white p-0.5"
                      >
                        <button
                          type="button"
                          onClick={() => setRoomUnit('ft')}
                          aria-pressed={roomUnit === 'ft'}
                          className={`px-3 py-1 rounded-lg text-xs font-extrabold min-h-[36px] cursor-pointer ${
                            roomUnit === 'ft'
                              ? 'bg-[#141414] text-[#FFFDF2]'
                              : 'text-[#141414]'
                          }`}
                        >
                          Feet (ft)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoomUnit('m')}
                          aria-pressed={roomUnit === 'm'}
                          className={`px-3 py-1 rounded-lg text-xs font-extrabold min-h-[36px] cursor-pointer ${
                            roomUnit === 'm'
                              ? 'bg-[#141414] text-[#FFFDF2]'
                              : 'text-[#141414]'
                          }`}
                        >
                          Meters (m)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="fp-cadr-len"
                          className="block text-xs font-extrabold text-[#141414] mb-1"
                        >
                          Room length ({roomUnit})
                        </label>
                        <input
                          id="fp-cadr-len"
                          type="number"
                          min={1}
                          max={100}
                          step="0.5"
                          value={roomLength}
                          onChange={(e) => setRoomLength(e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 text-sm font-mono font-bold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="fp-cadr-wid"
                          className="block text-xs font-extrabold text-[#141414] mb-1"
                        >
                          Room width ({roomUnit})
                        </label>
                        <input
                          id="fp-cadr-wid"
                          type="number"
                          min={1}
                          max={100}
                          step="0.5"
                          value={roomWidth}
                          onChange={(e) => setRoomWidth(e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 text-sm font-mono font-bold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="fp-cadr-ht"
                          className="block text-xs font-extrabold text-[#141414] mb-1"
                        >
                          Ceiling height ({roomUnit})
                        </label>
                        <input
                          id="fp-cadr-ht"
                          type="number"
                          min={1}
                          max={30}
                          step="0.5"
                          value={roomHeight}
                          onChange={(e) => setRoomHeight(e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 text-sm font-mono font-bold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border-2 border-[#141414] bg-[#D6EEFF] p-3.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#141414]">
                        Room volume (estimate):{' '}
                        <span className="font-mono tabular-nums">
                          {cadrResult.volumeCubicMeters} m³
                        </span>
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-[#141414] font-mono tabular-nums">
                        Recommended CADR: ≥ {cadrResult.recommendedCadrM3h} m³/h (
                        {cadrResult.recommendedCadrCfm} CFM)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
              </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ===================================================================== */}
      {/* SECTION 4: IMPACT INSIGHTS (ONLY AFTER USER INPUTS)                   */}
      {/* ===================================================================== */}
      {hasFamilyAndJourney && (
      <section
        id="fp-section-4"
        aria-labelledby="fp-sec4-heading"
        className="brutal-card bg-[#D2F5E3] rounded-3xl p-5 sm:p-7 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-[#141414]/15">
          <div>
            <h2
              id="fp-sec4-heading"
              className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]"
            >
              4. Impact Insights
            </h2>
            <p className="text-sm font-semibold text-[#141414] mt-0.5">
              Weekly CO2 and member exposure estimates (never measured medical outcomes).
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              downloadPrintableFamilyPlan({
                cityName: location?.name ?? 'Current city',
                liveAqi,
                aqiBandLabel,
                summary,
                steps: displayedSteps,
                selectedStepIds,
                afterImpact,
                checkedHackIds,
                indoorHacks:
                  indoorHacks.length > 0
                    ? indoorHacks
                    : buildTailoredIndoorHacks(home, hourly24, liveAqi),
                summarySentences: activeSummaryText,
              })
            }
            className="brutal-btn bg-[#FFD23F] text-[#141414] font-extrabold text-sm sm:text-base px-5 py-3 rounded-2xl inline-flex items-center justify-center gap-2 min-h-[48px] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>Download my plan</span>
          </button>
        </div>

        {/* Visual Dashboard: Weekly CO2 Before vs After + Your Week, Two Ways */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          {/* Weekly CO2 Comparison Chart */}
          <div className="rounded-2xl border-2 border-[#141414] bg-white p-4 sm:p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#141414]">
                <Leaf className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Weekly CO2 (estimate): Now vs After Chosen Steps</span>
              </div>
              <p className="sr-only">
                Weekly estimated CO2 drops from {summary.weeklyTotalCo2Kg.toFixed(1)} kg to{' '}
                {afterImpact.afterCo2Kg.toFixed(1)} kg after chosen steps.
              </p>

              <div className="mt-4 space-y-3" aria-hidden="true">
                <div>
                  <div className="flex justify-between text-xs font-extrabold text-[#141414] mb-1">
                    <span>Now (weekly estimate)</span>
                    <span className="font-mono tabular-nums">
                      {summary.weeklyTotalCo2Kg.toFixed(1)} kg CO2
                    </span>
                  </div>
                  <div className="h-7 w-full rounded-lg border-2 border-[#141414] bg-[#FFFDF2] overflow-hidden">
                    <div
                      className="h-full bg-[#FF8FA3]"
                      style={{ width: `${nowBarPct}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-extrabold text-[#141414] mb-1">
                    <span>After {selectedStepIds.length} chosen step(s)</span>
                    <span className="font-mono tabular-nums">
                      {afterImpact.afterCo2Kg.toFixed(1)} kg CO2
                    </span>
                  </div>
                  <div className="h-7 w-full rounded-lg border-2 border-[#141414] bg-[#FFFDF2] overflow-hidden">
                    <div
                      className="h-full bg-[#34D399]"
                      style={{ width: `${afterBarPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border-2 border-[#141414] bg-[#FFFDF2] px-3.5 py-2.5 text-xs sm:text-sm font-bold text-[#141414] font-mono tabular-nums">
              Travel: {summary.weeklyTravelCo2Kg.toFixed(1)} kg + Cooking:{' '}
              {summary.weeklyCookingCo2Kg.toFixed(1)} kg ={' '}
              {summary.weeklyTotalCo2Kg.toFixed(1)} kg/wk (saves{' '}
              {afterImpact.totalCo2SavedKg.toFixed(1)} kg/wk)
            </div>
          </div>

          {/* Your Week, Two Ways */}
          <div className="rounded-2xl border-2 border-[#141414] bg-white p-4 sm:p-5 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="font-serif text-xl font-bold text-[#141414]">
                Your week, two ways
              </h3>
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
        </div>

        {/* Exposure Score Per Family Member (Sorted Highest First, Child/Senior Highlighted) */}
        <div className="rounded-2xl border-2 border-[#141414] bg-white p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wind className="w-5 h-5 text-[#141414]" aria-hidden="true" />
              <h3 className="font-serif text-xl font-bold text-[#141414]">
                Exposure score per family member (highest first)
              </h3>
            </div>
            <span className="text-xs font-bold text-[#3F3F46]">
              All scores are modelled estimates
            </span>
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
                      <span className="text-base font-extrabold text-[#141414]">
                        {m.name}
                      </span>
                      <span className="text-xs font-bold text-[#3F3F46]">
                        {m.ageLabel}
                        {m.hasHealthCondition ? ` · ${m.healthLabel}` : ''}
                      </span>
                      {m.isChildOrSenior && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#141414] bg-[#141414] text-[#FFFDF2] px-2 py-0.5 text-[11px] font-extrabold">
                          <HeartPulse className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>
                            {m.ageGroup === 'child_under_12'
                              ? 'Child priority'
                              : 'Senior priority'}
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
                      className="h-4 w-full rounded-md border border-[#141414] bg-white overflow-hidden"
                      aria-label={`${m.name} estimated weekly exposure score ${score}`}
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

        {/* 3-Sentence Plain-Language Summary (English / Hindi / Marathi) */}
        <div className="rounded-2xl border-2 border-[#141414] bg-white p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif text-xl font-bold text-[#141414]">
                Plain-language summary
              </h3>
              {aiPlan?.usedFallback && (
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
                  onClick={() => handleLanguageSwitch(lang.id)}
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

          <p className="text-base font-semibold text-[#141414] leading-relaxed">
            {activeSummaryText}
          </p>
        </div>

        {/* Confidence Note & Required Disclaimers */}
        <div className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 sm:p-5 space-y-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#141414]" aria-hidden="true" />
            <div>
              <p className="font-extrabold text-[#141414]">
                Confidence note (what this estimate includes &amp; cannot know)
              </p>
              <p className="mt-1 font-medium text-[#262626]">
                Includes modeled regional hourly Open-Meteo AQI, distance-based transport CO2 and PM2.5 exposure factors, and age/health sensitivity weights. Cannot know live street traffic jams, actual indoor PM2.5 levels inside your rooms, or individual medical conditions.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-[#141414]/15 font-bold text-[#141414]">
            Guidance only, not medical advice.{' '}
            {summary.hasAnyHealthNote && (
              <span className="underline">
                Talk to your doctor about specific care.
              </span>
            )}
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
