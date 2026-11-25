import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { calculateCadrRecommendation, type IndoorHackItem } from '../../services/indoorHacks';

interface IndoorAirHacksSectionProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  hacks: IndoorHackItem[];
  checkedHackIds: string[];
  onToggleHack: (hackId: string) => void;
}

function IndoorSafetyRulesBox() {
  return (
    <div className="rounded-2xl border-2 border-[#141414] bg-[#FFE0EA] p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-[#141414]">
        <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
        <span>Important indoor air safety rules</span>
      </div>
      <ul className="space-y-1.5 text-sm font-semibold text-[#141414] list-disc pl-5">
        <li>
          <strong>Never buy ozone-generating purifiers</strong> (avoid ionizers or “ozone” modes —
          ozone irritates lungs).
        </li>
        <li>
          <strong>Indoor plants do not meaningfully clean indoor air</strong> at real household room
          volumes.
        </li>
        <li>
          <strong>Protect children and seniors first</strong> — place your purifier or DIY filter
          box in their bedroom first.
        </li>
      </ul>
    </div>
  );
}

function BedroomCadrCalculator() {
  const [roomLength, setRoomLength] = useState('12');
  const [roomWidth, setRoomWidth] = useState('10');
  const [roomHeight, setRoomHeight] = useState('9');
  const [roomUnit, setRoomUnit] = useState<'ft' | 'm'>('ft');

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

  return (
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
              roomUnit === 'ft' ? 'bg-[#141414] text-[#FFFDF2]' : 'text-[#141414]'
            }`}
          >
            Feet (ft)
          </button>
          <button
            type="button"
            onClick={() => setRoomUnit('m')}
            aria-pressed={roomUnit === 'm'}
            className={`px-3 py-1 rounded-lg text-xs font-extrabold min-h-[36px] cursor-pointer ${
              roomUnit === 'm' ? 'bg-[#141414] text-[#FFFDF2]' : 'text-[#141414]'
            }`}
          >
            Meters (m)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="fp-cadr-len" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <label htmlFor="fp-cadr-wid" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <label htmlFor="fp-cadr-ht" className="block text-xs font-extrabold text-[#141414] mb-1">
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
          <span className="font-mono tabular-nums">{cadrResult.volumeCubicMeters} m³</span>
        </span>
        <span className="text-sm sm:text-base font-extrabold text-[#141414] font-mono tabular-nums">
          Recommended CADR: ≥ {cadrResult.recommendedCadrM3h} m³/h ({cadrResult.recommendedCadrCfm}{' '}
          CFM)
        </span>
      </div>
    </div>
  );
}

function IndoorHackCard({
  hack,
  isChecked,
  onToggleHack,
}: {
  hack: IndoorHackItem;
  isChecked: boolean;
  onToggleHack: (hackId: string) => void;
}) {
  const [showCorsiSteps, setShowCorsiSteps] = useState(false);
  const tierBg =
    hack.tier === 'free'
      ? 'bg-[#D2F5E3]'
      : hack.tier === 'low'
        ? 'bg-[#FFF3B0]'
        : 'bg-[#D6EEFF]';

  return (
    <div className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 space-y-3">
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
              <strong className="uppercase text-[#141414]">{hack.expectedBenefit}</strong>
            </span>
            {hack.isUrgentForHome && <span> · Priority for your home</span>}
          </div>

          <h3 className="text-base sm:text-lg font-extrabold text-[#141414]">{hack.title}</h3>
          <p className="text-sm font-semibold text-[#141414]">{hack.action}</p>
          <p className="text-xs sm:text-sm font-medium text-[#3F3F46]">
            Why: {hack.tailoredReason} · <strong>Limit:</strong> {hack.limits}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onToggleHack(hack.id)}
          aria-pressed={isChecked}
          className={`brutal-btn px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer ${
            isChecked ? 'bg-[#141414] text-[#FFFDF2]' : 'bg-white text-[#141414]'
          }`}
        >
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{isChecked ? 'Done / Planned' : 'Tick off'}</span>
        </button>
      </div>

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

      {hack.includesCadrCalculator && <BedroomCadrCalculator />}
    </div>
  );
}

export function IndoorAirHacksSection({
  isOpen,
  onToggleOpen,
  hacks,
  checkedHackIds,
  onToggleHack,
}: IndoorAirHacksSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      id="fp-section-3"
      aria-labelledby="fp-sec3-heading"
      className="brutal-card bg-white rounded-3xl overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-controls="fp-indoor-hacks-panel"
        className="w-full p-5 sm:p-7 flex items-center justify-between gap-4 text-left hover:bg-[#FFFDF2] transition-colors cursor-pointer min-h-[76px]"
      >
        <div>
          <h2 id="fp-sec3-heading" className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]">
            3. Indoor Air Hacks
          </h2>
          <p className="text-sm font-semibold text-[#3F3F46] mt-0.5">
            {isOpen
              ? 'Tailored to your home details and live AQI, ordered Free, Low cost, then Invest.'
              : 'Tap to expand Free, Low-cost & Invest indoor air hacks, DIY filter guide & CADR calculator.'}
          </p>
        </div>

        <span className="brutal-btn bg-[#EAD6FF] text-[#141414] font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 min-h-[44px] whitespace-nowrap shrink-0">
          <span>{isOpen ? 'Hide hacks' : 'Show hacks'}</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id="fp-indoor-hacks-panel"
            initial={prefersReducedMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 sm:px-7 sm:pb-7 pt-2 border-t-2 border-[#141414]/15 space-y-5">
              <IndoorSafetyRulesBox />
              <div className="space-y-3">
                {hacks.map((hack) => (
                  <IndoorHackCard
                    key={hack.id}
                    hack={hack}
                    isChecked={checkedHackIds.includes(hack.id)}
                    onToggleHack={onToggleHack}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
