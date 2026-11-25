import React, { useState } from 'react';
import {
  Camera,
  CalendarClock,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import {
  AiApiResult,
  CoachLanguage,
  fetchAiPhotoAudit,
  fetchAiShiftPlan,
  prepareImageForUpload,
} from '../services/aiCoachApi';
import { HourlyAirQualityPoint, WorkerRoleId } from '../types/airQuality';
import { FormattedCoachReply } from './FormattedCoachReply';

interface AiCoachStudioProps {
  roleId: WorkerRoleId;
  aqi: number;
  aqiBandLabel: string;
  hoursOutside: number;
  onChangeHoursOutside: (hours: number) => void;
  mainPollutantSymbol?: string;
  locationName: string;
  hourly24: HourlyAirQualityPoint[];
  language: CoachLanguage;
  onChangeLanguage: (lang: CoachLanguage) => void;
  onModelAnswered: (model: string) => void;
}

type StudioTab = 'shift' | 'photo';

const SHIFT_OPTIONS = [
  { id: 'Full day outdoor shift', label: 'Full day shift' },
  { id: 'Morning & lunch rush', label: 'Morning & lunch' },
  { id: 'Evening peak traffic', label: 'Evening rush' },
];

export function AiCoachStudio({
  roleId,
  aqi,
  aqiBandLabel,
  hoursOutside,
  onChangeHoursOutside,
  mainPollutantSymbol,
  locationName,
  hourly24,
  language,
  onChangeLanguage,
  onModelAnswered,
}: AiCoachStudioProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>('shift');

  // Shift plan state
  const [shiftFocus, setShiftFocus] = useState(SHIFT_OPTIONS[0].id);
  const [shiftResult, setShiftResult] = useState<AiApiResult | null>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);

  // Photo audit state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoPayload, setPhotoPayload] = useState<{
    mimeType: string;
    imageBase64: string;
  } | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [photoResult, setPhotoResult] = useState<AiApiResult | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const baseCtx = {
    role: roleId,
    aqiBand: aqiBandLabel,
    aqi,
    hoursOutside,
    mainPollutant: mainPollutantSymbol,
    locationName,
    language,
  };

  const handleGenerateShiftPlan = async () => {
    setShiftLoading(true);
    setShiftError(null);
    try {
      const res = await fetchAiShiftPlan({
        ...baseCtx,
        shiftFocus,
        hourly24,
      });
      setShiftResult(res);
      onModelAnswered(res.model);
    } catch (err) {
      setShiftError(
        err instanceof Error ? err.message : 'Could not build shift plan.'
      );
    } finally {
      setShiftLoading(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoResult(null);
    try {
      const prepared = await prepareImageForUpload(file);
      setPhotoPreview(prepared.previewUrl);
      setPhotoPayload({
        mimeType: prepared.mimeType,
        imageBase64: prepared.imageBase64,
      });
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Could not load image.'
      );
    }
  };

  const handleAuditPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoPayload) {
      setPhotoError('Choose or snap a photo first.');
      return;
    }
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const res = await fetchAiPhotoAudit({
        ...baseCtx,
        mimeType: photoPayload.mimeType,
        imageBase64: photoPayload.imageBase64,
        note: photoNote.trim() || 'Check mask fit and roadside air exposure.',
      });
      setPhotoResult(res);
      onModelAnswered(res.model);
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Photo audit failed.'
      );
    } finally {
      setPhotoLoading(false);
    }
  };

  return (
    <section
      aria-labelledby="coach-tools-heading"
      className="brutal-card bg-white rounded-3xl p-4 sm:p-6 space-y-5"
    >
      {/* Header + Language Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2
            id="coach-tools-heading"
            className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]"
          >
            Saathi Tools
          </h2>
          <p className="text-sm sm:text-base font-semibold text-[#3F3F46]">
            Plan your shift hours or audit your mask photo
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="group"
            aria-label="Hours spent outside today"
            className="inline-flex items-center gap-1 p-1 bg-[#FFFDF2] border-2 border-[#141414] rounded-2xl"
          >
            <span className="px-2 text-xs font-extrabold text-[#3F3F46] whitespace-nowrap">
              Outside:
            </span>
            {[2, 4, 8, 10].map((hrs) => {
              const active = hoursOutside === hrs;
              return (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => onChangeHoursOutside(hrs)}
                  aria-pressed={active}
                  aria-label={`${hrs} hours outside`}
                  className={`px-2.5 py-2 text-xs sm:text-sm font-bold rounded-xl min-h-[40px] whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#141414] text-[#FFFDF2]'
                      : 'text-[#141414] hover:bg-[#FFF3B0]'
                  }`}
                >
                  {hrs}h
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Choose response language"
            className="inline-flex items-center gap-1 p-1 bg-[#FFFDF2] border-2 border-[#141414] rounded-2xl"
          >
            {(
              [
                { id: 'en', label: 'English' },
                { id: 'hi', label: 'हिन्दी' },
                { id: 'hinglish', label: 'Hinglish' },
              ] as const
            ).map((lang) => {
              const active = language === lang.id;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => onChangeLanguage(lang.id)}
                  aria-pressed={active}
                  aria-label={`Set language to ${lang.label}`}
                  className={`px-3 py-2 text-sm font-bold rounded-xl min-h-[40px] whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#141414] text-[#FFFDF2]'
                      : 'text-[#141414] hover:bg-[#EAD6FF]'
                  }`}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mode Tabs */}
      <div
        role="tablist"
        aria-label="Hawa Saathi tools"
        className="grid grid-cols-2 gap-2.5 sm:gap-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shift'}
          onClick={() => setActiveTab('shift')}
          className={`brutal-btn rounded-2xl px-3 py-3 font-extrabold text-sm sm:text-base inline-flex items-center justify-center gap-2 min-h-[50px] cursor-pointer ${
            activeTab === 'shift' ? 'bg-[#D2F5E3]' : 'bg-[#FFFDF2]'
          }`}
        >
          <CalendarClock className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>Shift Plan</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'photo'}
          onClick={() => setActiveTab('photo')}
          className={`brutal-btn rounded-2xl px-3 py-3 font-extrabold text-sm sm:text-base inline-flex items-center justify-center gap-2 min-h-[50px] cursor-pointer ${
            activeTab === 'photo' ? 'bg-[#FFE0EA]' : 'bg-[#FFFDF2]'
          }`}
        >
          <Camera className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>Photo Audit</span>
        </button>
      </div>

      {/* Tab 2: Shift Plan */}
      {activeTab === 'shift' && (
        <div role="tabpanel" aria-label="Shift Plan" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <span className="block text-sm font-bold text-[#141414] mb-2">
                Pick your shift timing
              </span>
              <div className="flex flex-wrap gap-2">
                {SHIFT_OPTIONS.map((opt) => {
                  const selected = shiftFocus === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShiftFocus(opt.id)}
                      aria-pressed={selected}
                      className={`brutal-btn px-3.5 py-2.5 rounded-xl text-sm sm:text-base font-bold min-h-[44px] cursor-pointer ${
                        selected
                          ? 'bg-[#141414] text-[#FFFDF2]'
                          : 'bg-[#FFFDF2] text-[#141414]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateShiftPlan}
              disabled={shiftLoading}
              aria-label="Build 24-hour shift plan"
              className="brutal-btn bg-[#6EE7B7] text-[#141414] font-extrabold text-base px-5 py-3 rounded-2xl inline-flex items-center justify-center gap-2 min-h-[52px] whitespace-nowrap cursor-pointer disabled:opacity-65"
            >
              <CalendarClock className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{shiftLoading ? 'Planning...' : 'Build Shift Plan'}</span>
            </button>
          </div>

          {shiftError && (
            <div
              role="alert"
              className="rounded-xl border-2 border-[#141414] bg-[#FFE0EA] p-3.5 text-sm sm:text-base font-bold text-[#141414] flex items-center gap-2"
            >
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{shiftError}</span>
            </div>
          )}

          {shiftResult && (
            <ResultCard result={shiftResult} bgClass="bg-[#D2F5E3]" />
          )}
        </div>
      )}

      {/* Tab 3: Photo Audit */}
      {activeTab === 'photo' && (
        <form
          onSubmit={handleAuditPhoto}
          role="tabpanel"
          aria-label="Photo Audit"
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <label
              htmlFor="photo-audit-input"
              className="brutal-btn bg-[#FFFDF2] hover:bg-[#FFE0EA] rounded-2xl px-4 py-3.5 inline-flex items-center gap-2.5 font-extrabold text-base text-[#141414] min-h-[52px] cursor-pointer"
            >
              <Upload className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{photoPreview ? 'Choose another photo' : 'Upload or snap photo'}</span>
              <input
                id="photo-audit-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelect}
                className="sr-only"
              />
            </label>

            {photoPreview && (
              <img
                src={photoPreview}
                alt="Selected photo preview for mask or street air check"
                className="w-24 h-24 object-cover rounded-2xl border-2 border-[#141414]"
              />
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1">
              <label htmlFor="photo-note-input" className="sr-only">
                Optional note about your photo
              </label>
              <input
                id="photo-note-input"
                type="text"
                value={photoNote}
                onChange={(e) => setPhotoNote(e.target.value)}
                placeholder="Optional note (e.g. checking my mask fit or street smoke)"
                className="w-full min-h-[52px] px-4 py-3 text-base font-semibold text-[#141414] placeholder:text-[#52525B] bg-[#FFFDF2] border-2 border-[#141414] rounded-2xl"
              />
            </div>

            <button
              type="submit"
              disabled={photoLoading || !photoPayload}
              aria-label="Run photo safety audit"
              className="brutal-btn bg-[#FF4D8D] text-[#141414] font-extrabold text-base px-5 py-3 rounded-2xl inline-flex items-center justify-center gap-2 min-h-[52px] whitespace-nowrap cursor-pointer disabled:opacity-55"
            >
              <Camera className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{photoLoading ? 'Checking...' : 'Audit Photo'}</span>
            </button>
          </div>

          {photoError && (
            <div
              role="alert"
              className="rounded-xl border-2 border-[#141414] bg-[#FFE0EA] p-3.5 text-sm sm:text-base font-bold text-[#141414] flex items-center gap-2"
            >
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{photoError}</span>
            </div>
          )}

          {photoResult && (
            <ResultCard result={photoResult} bgClass="bg-[#FFE0EA]" />
          )}
        </form>
      )}
    </section>
  );
}

function ResultCard({
  result,
  bgClass,
}: {
  result: AiApiResult;
  bgClass: string;
}) {
  return (
    <div
      aria-live="polite"
      className={`rounded-2xl border-2 border-[#141414] ${bgClass} p-4 sm:p-5 space-y-3`}
    >
      {result.usedFallback && (
        <div className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#141414] bg-[#FFD23F] px-3 py-1 text-xs sm:text-sm font-extrabold text-[#141414]">
          <span>Basic answer (AI unavailable)</span>
        </div>
      )}

      <FormattedCoachReply text={result.answer} />
    </div>
  );
}
