import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Home, Info, Plus, Trash2 } from 'lucide-react';
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
} from '../../config/emissionFactors';
import {
  MAX_DAYS_PER_WEEK,
  MAX_DISTANCE_KM,
  MAX_FAMILY_MEMBERS,
  MAX_FREE_TEXT_LENGTH,
  type CalculatedTripResult,
  type FamilyMember,
  type HomeDetails,
  type TimeSlotBand,
} from '../../services/familyPlanCalc';
import { MethodologyPanel } from './MethodologyPanel';

const SLOT_BADGE_MAP: Record<
  TimeSlotBand,
  { label: string; bgClass: string; textClass: string }
> = {
  green: { label: 'Green hour', bgClass: 'bg-[#6EE7B7]', textClass: 'text-[#141414]' },
  yellow: { label: 'Yellow hour', bgClass: 'bg-[#FFD23F]', textClass: 'text-[#141414]' },
  red: { label: 'Red hour', bgClass: 'bg-[#FF8FA3]', textClass: 'text-[#141414]' },
  unknown: { label: 'Needs city AQI', bgClass: 'bg-[#E4E4E7]', textClass: 'text-[#141414]' },
};

const HOME_BOOLEAN_FIELDS = [
  { key: 'hasChimneyOrExhaust' as const, label: 'Kitchen chimney or exhaust fan?' },
  { key: 'usesAirPurifier' as const, label: 'Uses an air purifier at home?' },
  { key: 'windowsFacingMainRoad' as const, label: 'Windows facing a main road?' },
  { key: 'smokesOrIncenseIndoors' as const, label: 'Anyone smokes or burns incense indoors?' },
];

export interface TripDraftInput {
  memberId: string;
  from: string;
  to: string;
  distanceKm: string;
  timeOfDay: string;
  travelMode: TravelModeId;
  daysPerWeek: string;
}

interface FamilyJourneySectionProps {
  members: FamilyMember[];
  calculatedTrips: CalculatedTripResult[];
  home: HomeDetails;
  hasFamilyAndJourney: boolean;
  memberError: string | null;
  tripErrors: string[];
  tripMemberId: string;
  onChangeTripMemberId: (id: string) => void;
  onAddMember: (name: string, age: AgeGroupId, health: HealthNoteId) => void;
  onRemoveMember: (id: string) => void;
  onAddTrip: (draft: TripDraftInput) => boolean;
  onRemoveTrip: (id: string) => void;
  onChangeHome: (updater: (prev: HomeDetails) => HomeDetails) => void;
}

function FamilyMembersBlock({
  members,
  memberError,
  onAddMember,
  onRemoveMember,
}: {
  members: FamilyMember[];
  memberError: string | null;
  onAddMember: (name: string, age: AgeGroupId, health: HealthNoteId) => void;
  onRemoveMember: (id: string) => void;
}) {
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberAge, setNewMemberAge] = useState<AgeGroupId>('child_under_12');
  const [newMemberHealth, setNewMemberHealth] = useState<HealthNoteId>('none');

  const handleMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddMember(newMemberName, newMemberAge, newMemberHealth);
    setNewMemberName('');
    setNewMemberHealth('none');
  };

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl font-bold text-[#141414]">
        Family members ({members.length} / {MAX_FAMILY_MEMBERS})
      </h3>

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
                <div className="text-base font-extrabold text-[#141414] truncate">{m.name}</div>
                <div className="text-xs font-semibold text-[#3F3F46] mt-0.5">
                  {AGE_VULNERABILITY_FACTORS[m.ageGroup].label}
                  {m.healthNote !== 'none'
                    ? ` · ${HEALTH_VULNERABILITY_FACTORS[m.healthNote].label}`
                    : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveMember(m.id)}
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
        onSubmit={handleMemberSubmit}
        className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
      >
        <div>
          <label htmlFor="fp-member-name" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <label htmlFor="fp-member-age" className="block text-xs font-extrabold text-[#141414] mb-1">
            Age group
          </label>
          <select
            id="fp-member-age"
            value={newMemberAge}
            onChange={(e) => setNewMemberAge(e.target.value as AgeGroupId)}
            className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
          >
            {(Object.keys(AGE_VULNERABILITY_FACTORS) as AgeGroupId[]).map((id) => (
              <option key={id} value={id}>
                {AGE_VULNERABILITY_FACTORS[id].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fp-member-health" className="block text-xs font-extrabold text-[#141414] mb-1">
            Health note
          </label>
          <select
            id="fp-member-health"
            value={newMemberHealth}
            onChange={(e) => setNewMemberHealth(e.target.value as HealthNoteId)}
            className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
          >
            {(Object.keys(HEALTH_VULNERABILITY_FACTORS) as HealthNoteId[]).map((id) => (
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
  );
}

function TripAddForm({
  members,
  tripMemberId,
  tripErrors,
  onChangeTripMemberId,
  onAddTrip,
}: {
  members: FamilyMember[];
  tripMemberId: string;
  tripErrors: string[];
  onChangeTripMemberId: (id: string) => void;
  onAddTrip: (draft: TripDraftInput) => boolean;
}) {
  const [tripFrom, setTripFrom] = useState('Home');
  const [tripTo, setTripTo] = useState('School');
  const [tripDistance, setTripDistance] = useState('2');
  const [tripTime, setTripTime] = useState('08:00');
  const [tripMode, setTripMode] = useState<TravelModeId>('bike_petrol');
  const [tripDays, setTripDays] = useState('5');

  const handleTripSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddTrip({
      memberId: tripMemberId,
      from: tripFrom,
      to: tripTo,
      distanceKm: tripDistance,
      timeOfDay: tripTime,
      travelMode: tripMode,
      daysPerWeek: tripDays,
    });
  };

  return (
    <form
      onSubmit={handleTripSubmit}
      className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="fp-trip-who" className="block text-xs font-extrabold text-[#141414] mb-1">
            Who travels
          </label>
          <select
            id="fp-trip-who"
            value={tripMemberId}
            onChange={(e) => onChangeTripMemberId(e.target.value)}
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
          <label htmlFor="fp-trip-from" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <label htmlFor="fp-trip-to" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <label htmlFor="fp-trip-mode" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <label htmlFor="fp-trip-distance" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <label htmlFor="fp-trip-time" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <label htmlFor="fp-trip-days" className="block text-xs font-extrabold text-[#141414] mb-1">
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
  );
}

function TripsTable({
  calculatedTrips,
  onRemoveTrip,
}: {
  calculatedTrips: CalculatedTripResult[];
  onRemoveTrip: (id: string) => void;
}) {
  if (calculatedTrips.length === 0) {
    return (
      <p className="text-sm font-semibold text-[#3F3F46] py-2">
        No journeys added yet. Add a daily trip above or tap{' '}
        <strong>Load sample family</strong> to try an example household.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-2xl border-2 border-[#141414]">
      <table className="w-full text-left border-collapse min-w-[660px] text-sm">
        <thead>
          <tr className="border-b-2 border-[#141414] bg-[#FFF3B0] text-xs font-extrabold uppercase tracking-wide text-[#141414]">
            <th scope="col" className="p-3">Who &amp; Route</th>
            <th scope="col" className="p-3">Mode</th>
            <th scope="col" className="p-3">Distance / Freq</th>
            <th scope="col" className="p-3">Time Slot</th>
            <th scope="col" className="p-3">Weekly CO2 (est.)</th>
            <th scope="col" className="p-3">Weekly Exposure (est.)</th>
            <th scope="col" className="p-3 text-right">Remove</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#141414]/15 bg-white font-semibold text-[#141414]">
          {calculatedTrips.map((t) => {
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
                    onClick={() => onRemoveTrip(t.tripId)}
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
  );
}

function HomeDetailsBlock({
  home,
  onChangeHome,
}: {
  home: HomeDetails;
  onChangeHome: (updater: (prev: HomeDetails) => HomeDetails) => void;
}) {
  return (
    <div className="space-y-4 pt-4 border-t-2 border-[#141414]/15">
      <div className="flex items-center gap-2">
        <Home className="w-5 h-5 text-[#141414]" aria-hidden="true" />
        <h3 className="font-serif text-xl font-bold text-[#141414]">Home details</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-3.5">
          <label htmlFor="fp-cooking-fuel" className="block text-xs font-extrabold text-[#141414] mb-1.5">
            Cooking fuel
          </label>
          <select
            id="fp-cooking-fuel"
            value={home.cookingFuel}
            onChange={(e) =>
              onChangeHome((prev) => ({
                ...prev,
                cookingFuel: e.target.value as CookingFuelId,
              }))
            }
            className="w-full min-h-[44px] px-3 py-2 text-sm font-semibold text-[#141414] bg-white border-2 border-[#141414] rounded-xl"
          >
            {(Object.keys(COOKING_FUEL_FACTORS) as CookingFuelId[]).map((id) => (
              <option key={id} value={id}>
                {COOKING_FUEL_FACTORS[id].label}
              </option>
            ))}
          </select>
        </div>

        {HOME_BOOLEAN_FIELDS.map((field) => {
          const checked = home[field.key];
          return (
            <div
              key={field.key}
              className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-3.5 flex items-center justify-between gap-3"
            >
              <span className="text-sm font-bold text-[#141414]">{field.label}</span>
              <div
                role="group"
                aria-label={field.label}
                className="inline-flex rounded-xl border-2 border-[#141414] bg-white p-0.5 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => onChangeHome((prev) => ({ ...prev, [field.key]: true }))}
                  aria-pressed={checked}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] cursor-pointer ${
                    checked ? 'bg-[#141414] text-[#FFFDF2]' : 'text-[#141414]'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => onChangeHome((prev) => ({ ...prev, [field.key]: false }))}
                  aria-pressed={!checked}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] cursor-pointer ${
                    !checked ? 'bg-[#141414] text-[#FFFDF2]' : 'text-[#141414]'
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
  );
}

export function FamilyJourneySection({
  members,
  calculatedTrips,
  home,
  hasFamilyAndJourney,
  memberError,
  tripErrors,
  tripMemberId,
  onChangeTripMemberId,
  onAddMember,
  onRemoveMember,
  onAddTrip,
  onRemoveTrip,
  onChangeHome,
}: FamilyJourneySectionProps) {
  const [showMethodology, setShowMethodology] = useState(false);

  return (
    <section
      id="fp-section-1"
      aria-labelledby="fp-sec1-heading"
      className="brutal-card bg-white rounded-3xl p-5 sm:p-7 space-y-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b-2 border-[#141414]/15">
        <div>
          <h2 id="fp-sec1-heading" className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]">
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

      {showMethodology && <MethodologyPanel />}

      <FamilyMembersBlock
        members={members}
        memberError={memberError}
        onAddMember={onAddMember}
        onRemoveMember={onRemoveMember}
      />

      <div className="space-y-4 pt-4 border-t-2 border-[#141414]/15">
        <h3 className="font-serif text-xl font-bold text-[#141414]">
          Daily journeys ({calculatedTrips.length})
        </h3>
        <TripAddForm
          members={members}
          tripMemberId={tripMemberId}
          tripErrors={tripErrors}
          onChangeTripMemberId={onChangeTripMemberId}
          onAddTrip={onAddTrip}
        />
        <TripsTable calculatedTrips={calculatedTrips} onRemoveTrip={onRemoveTrip} />
      </div>

      <HomeDetailsBlock home={home} onChangeHome={onChangeHome} />

      {!hasFamilyAndJourney && (
        <div role="status" className="rounded-2xl border-2 border-[#141414] bg-[#FFF3B0] p-4">
          <p className="text-sm sm:text-base font-bold text-[#141414]">
            {members.length === 0
              ? 'Next: Add at least 1 family member and 1 daily journey above (or tap Load sample family) to reveal your Low-Emission Steps and Impact Insights.'
              : 'Next: Add at least 1 daily journey above to calculate your Low-Emission Steps and Impact Insights.'}
          </p>
        </div>
      )}
    </section>
  );
}
