/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { FloatingChatWidget } from './components/FloatingChatWidget';
import { HomeScreen, LiveChatAirContext } from './components/HomeScreen';
import { RoleSelectorScreen } from './components/RoleSelectorScreen';
import { CoachLanguage } from './services/aiCoachApi';
import { SelectedLocation, WorkerRoleId } from './types/airQuality';

const ROLE_STORAGE_KEY = 'hawa_saathi_role';
const LOCATION_STORAGE_KEY = 'hawa_saathi_location';
const LANG_STORAGE_KEY = 'hawa_saathi_lang';

const VALID_ROLES: WorkerRoleId[] = [
  'delivery',
  'driver',
  'vendor',
  'police',
  'general',
];

function readSavedRole(): WorkerRoleId | null {
  try {
    const raw = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (raw && VALID_ROLES.includes(raw as WorkerRoleId)) {
      return raw as WorkerRoleId;
    }
  } catch {
    // Ignore storage errors on restricted browsers
  }
  return null;
}

function readSavedLocation(): SelectedLocation | null {
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SelectedLocation>;
    if (
      typeof parsed.name === 'string' &&
      typeof parsed.latitude === 'number' &&
      Number.isFinite(parsed.latitude) &&
      typeof parsed.longitude === 'number' &&
      Number.isFinite(parsed.longitude)
    ) {
      return {
        name: parsed.name,
        subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : undefined,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        source: parsed.source === 'gps' ? 'gps' : 'search',
      };
    }
  } catch {
    // Ignore invalid JSON or storage restrictions
  }
  return null;
}

function readSavedLanguage(): CoachLanguage {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'hi' || saved === 'hinglish') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'en';
}

export default function App() {
  const [selectedRole, setSelectedRole] = useState<WorkerRoleId | null>(() =>
    readSavedRole()
  );
  const [screen, setScreen] = useState<'role' | 'home'>(() =>
    readSavedRole() ? 'home' : 'role'
  );
  const [location, setLocation] = useState<SelectedLocation | null>(() =>
    readSavedLocation()
  );
  const [language, setLanguage] = useState<CoachLanguage>(() =>
    readSavedLanguage()
  );
  const [hoursOutside, setHoursOutside] = useState<number>(() =>
    readSavedRole() === 'general' ? 2 : 8
  );
  const [answeredByModel, setAnsweredByModel] = useState<string | null>(null);
  const [liveAirContext, setLiveAirContext] = useState<LiveChatAirContext>({
    aqiBandLabel: 'Moderate',
  });

  const handleSelectRole = (roleId: WorkerRoleId) => {
    setSelectedRole(roleId);
    setHoursOutside(roleId === 'general' ? 2 : 8);
    try {
      window.localStorage.setItem(ROLE_STORAGE_KEY, roleId);
    } catch {
      // Ignore storage errors
    }
    setScreen('home');
  };

  const handleSelectLocation = (loc: SelectedLocation) => {
    setLocation(loc);
    try {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc));
    } catch {
      // Ignore storage errors
    }
  };

  const handleChangeLanguage = (nextLang: CoachLanguage) => {
    setLanguage(nextLang);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    } catch {
      // Ignore storage errors
    }
  };

  const handleLiveAirContextChange = useCallback((ctx: LiveChatAirContext) => {
    setLiveAirContext((prev) =>
      prev.aqi === ctx.aqi &&
      prev.aqiBandLabel === ctx.aqiBandLabel &&
      prev.mainPollutantSymbol === ctx.mainPollutantSymbol &&
      prev.locationName === ctx.locationName
        ? prev
        : ctx
    );
  }, []);

  const handleOpenRoleSelector = useCallback(() => {
    setScreen('role');
  }, []);

  const activeRoleForChat: WorkerRoleId = selectedRole ?? 'general';

  return (
    <>
      {screen === 'role' || !selectedRole ? (
        <RoleSelectorScreen
          selectedRole={selectedRole}
          onSelectRole={handleSelectRole}
          onContinue={selectedRole ? () => setScreen('home') : undefined}
        />
      ) : (
        <HomeScreen
          roleId={selectedRole}
          location={location}
          language={language}
          onChangeLanguage={handleChangeLanguage}
          hoursOutside={hoursOutside}
          onChangeHoursOutside={setHoursOutside}
          answeredByModel={answeredByModel}
          onModelAnswered={setAnsweredByModel}
          onLiveAirContextChange={handleLiveAirContextChange}
          onSelectLocation={handleSelectLocation}
          onChangeRole={handleOpenRoleSelector}
        />
      )}

      <FloatingChatWidget
        roleId={activeRoleForChat}
        aqi={liveAirContext.aqi}
        aqiBandLabel={liveAirContext.aqiBandLabel}
        hoursOutside={hoursOutside}
        mainPollutantSymbol={liveAirContext.mainPollutantSymbol}
        locationName={liveAirContext.locationName ?? location?.name}
        language={language}
        onModelAnswered={setAnsweredByModel}
      />
    </>
  );
}
