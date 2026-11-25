import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { WorkerRoleId } from '../types/airQuality';
import { WORKER_ROLES } from '../utils/aqi';
import { RoleIllustration, SquiggleUnderline } from './RoleIllustrations';

interface RoleSelectorScreenProps {
  selectedRole: WorkerRoleId | null;
  onSelectRole: (roleId: WorkerRoleId) => void;
  onContinue?: () => void;
}

export function RoleSelectorScreen({
  selectedRole,
  onSelectRole,
  onContinue,
}: RoleSelectorScreenProps) {
  return (
    <div className="min-h-screen flex flex-col justify-between px-4 py-6 sm:px-8 sm:py-10 max-w-5xl mx-auto">
      <header className="flex items-center justify-between gap-4 pb-6 border-b-2 border-[#141414]">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#141414]">
            Hawa <em className="italic font-semibold">Saathi</em>
          </span>
        </div>
        {selectedRole && onContinue && (
          <button
            type="button"
            onClick={onContinue}
            aria-label="Go to live air quality home screen"
            className="brutal-btn bg-[#FF4D8D] text-[#141414] font-bold text-sm sm:text-base px-4 py-2.5 rounded-full inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Open Home</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </header>

      <main className="my-auto py-6 sm:py-10">
        <div className="max-w-2xl mb-8">
          <p className="text-sm sm:text-base font-bold text-[#141414] mb-2">
            Outdoor Air Quality Coach
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#141414] leading-[1.08] text-balance">
            Who is working{' '}
            <span className="relative inline-block">
              <em className="italic font-semibold">outside</em>
              <SquiggleUnderline className="w-full h-3.5 -mt-1 block" />
            </span>{' '}
            today?
          </h1>
          <p className="mt-4 text-base sm:text-lg font-medium text-[#262626] max-w-xl">
            Tap your role to get plain, street-ready air advice. We will remember your choice on this phone.
          </p>
        </div>

        <div
          role="group"
          aria-label="Choose your outdoor work role"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
        >
          {WORKER_ROLES.map((role) => {
            const isSelected = selectedRole === role.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => onSelectRole(role.id)}
                aria-pressed={isSelected}
                aria-label={`Select role: ${role.label}. ${role.tagline}`}
                className={`brutal-btn text-left rounded-2xl p-5 sm:p-6 flex items-center gap-4 min-h-[104px] cursor-pointer ${role.cardBg} ${
                  isSelected
                    ? 'ring-4 ring-[#141414] ring-offset-2 ring-offset-[#FFFDF2]'
                    : ''
                }`}
              >
                <div className="shrink-0 w-16 h-16 rounded-xl bg-[#FFFDF2] border-2 border-[#141414] flex items-center justify-center">
                  <RoleIllustration roleId={role.id} className="w-12 h-12" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xl sm:text-2xl font-extrabold text-[#141414] leading-tight">
                      {role.label}
                    </span>
                    {isSelected && (
                      <span
                        className="shrink-0 w-7 h-7 rounded-full bg-[#141414] text-[#FFFDF2] flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm sm:text-base font-medium text-[#262626] leading-snug">
                    {role.tagline}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </main>

      <footer className="pt-6 border-t-2 border-[#141414]/15 text-sm font-medium text-[#3F3F46]">
        Live air readings powered by Open-Meteo · Saved locally on your device
      </footer>
    </div>
  );
}
