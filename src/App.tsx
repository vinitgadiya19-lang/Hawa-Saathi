/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { RoleSelectorScreen } from './components/RoleSelectorScreen';
import { SelectedLocation, WorkerRoleId } from './types/airQuality';

const ROLE_STORAGE_KEY = 'hawa_saathi_role';
const LOCATION_STORAGE_KEY = 'hawa_saathi_location';

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

  const handleSelectRole = (roleId: WorkerRoleId) => {
    setSelectedRole(roleId);
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

  if (screen === 'role' || !selectedRole) {
    return (
      <RoleSelectorScreen
        selectedRole={selectedRole}
        onSelectRole={handleSelectRole}
        onContinue={selectedRole ? () => setScreen('home') : undefined}
      />
    );
  }

  return (
    <HomeScreen
      roleId={selectedRole}
      location={location}
      onSelectLocation={handleSelectLocation}
      onChangeRole={() => setScreen('role')}
    />
  );
}
