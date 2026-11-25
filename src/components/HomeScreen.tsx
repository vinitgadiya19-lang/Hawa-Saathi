import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Clock,
  LocateFixed,
  MapPin,
  OctagonAlert,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wind,
  X,
} from 'lucide-react';
import {
  AqiBandLevel,
  GeocodingCity,
  LiveAirQualityData,
  PollutantReadings,
  SelectedLocation,
  WorkerRoleId,
} from '../types/airQuality';
import { fetchAirQuality, searchCities } from '../services/openMeteo';
import {
  getAqiBand,
  getMainPollutant,
  getPollutantDetails,
  getRoleCoaching,
  getRoleDefinition,
} from '../utils/aqi';
import { RoleIllustration, SquiggleUnderline } from './RoleIllustrations';
import { HourlyBarChart } from './HourlyBarChart';
import { AiCoachStudio } from './AiCoachStudio';
import { FormattedCoachReply } from './FormattedCoachReply';
import {
  AiApiResult,
  CoachLanguage,
  fetchAiAdvice,
} from '../services/aiCoachApi';

export interface LiveChatAirContext {
  aqi?: number;
  aqiBandLabel: string;
  mainPollutantSymbol?: string;
  locationName?: string;
}

interface HomeScreenProps {
  roleId: WorkerRoleId;
  location: SelectedLocation | null;
  language: CoachLanguage;
  onChangeLanguage: (lang: CoachLanguage) => void;
  hoursOutside: number;
  onChangeHoursOutside: (hours: number) => void;
  answeredByModel: string | null;
  onModelAnswered: (model: string) => void;
  onLiveAirContextChange: (ctx: LiveChatAirContext) => void;
  onSelectLocation: (loc: SelectedLocation) => void;
  onChangeRole: () => void;
}

const STARTER_CITIES: Array<{
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
}> = [
  { name: 'Delhi', subtitle: 'India', latitude: 28.65195, longitude: 77.23149 },
  { name: 'Mumbai', subtitle: 'India', latitude: 19.07283, longitude: 72.88261 },
  { name: 'Bengaluru', subtitle: 'India', latitude: 12.97194, longitude: 77.59369 },
  { name: 'Kolkata', subtitle: 'India', latitude: 22.56263, longitude: 88.36304 },
];

const POLLUTANT_ORDER: (keyof PollutantReadings)[] = [
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone',
  'carbon_monoxide',
];

function BandIcon({ level, className = 'w-6 h-6' }: { level: AqiBandLevel; className?: string }) {
  switch (level) {
    case 'good':
      return <ShieldCheck className={className} aria-hidden="true" />;
    case 'moderate':
      return <Wind className={className} aria-hidden="true" />;
    case 'sensitive':
      return <AlertTriangle className={className} aria-hidden="true" />;
    case 'unhealthy':
    case 'very_unhealthy':
      return <ShieldAlert className={className} aria-hidden="true" />;
    case 'hazardous':
      return <OctagonAlert className={className} aria-hidden="true" />;
  }
}

export function HomeScreen({
  roleId,
  location,
  language,
  onChangeLanguage,
  hoursOutside,
  onChangeHoursOutside,
  answeredByModel,
  onModelAnswered,
  onLiveAirContextChange,
  onSelectLocation,
  onChangeRole,
}: HomeScreenProps) {
  const role = getRoleDefinition(roleId);

  // City search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingCity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Geolocation state
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Live Air Quality state
  const [airData, setAirData] = useState<LiveAirQualityData | null>(null);
  const [isLoadingAir, setIsLoadingAir] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);

  // AI Coach state
  const [adviceResult, setAdviceResult] = useState<AiApiResult | null>(null);
  const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const adviceAbortRef = useRef<AbortController | null>(null);

  const loadAirQuality = useCallback(async (loc: SelectedLocation) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoadingAir(true);
    setAirError(null);
    setAirData(null);

    try {
      const data = await fetchAirQuality(
        loc.latitude,
        loc.longitude,
        controller.signal
      );
      if (!controller.signal.aborted) {
        setAirData(data);
        setIsLoadingAir(false);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not reach air quality service.';
      setAirError(message);
      setAirData(null);
      setIsLoadingAir(false);
    }
  }, []);

  useEffect(() => {
    if (location) {
      loadAirQuality(location);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [location, loadAirQuality]);

  const handleUseMyLocation = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError(
        'Location is not supported by this browser. Search your city below instead.'
      );
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        onSelectLocation({
          name: 'My Current Location',
          subtitle: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
          latitude: lat,
          longitude: lon,
          source: 'gps',
        });
        setSearchResults([]);
        setHasSearched(false);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(
            'Location permission was blocked. Enable GPS permission or search your city below.'
          );
        } else if (err.code === err.TIMEOUT) {
          setGeoError(
            'GPS took too long to respond. Try again outdoors or search your city below.'
          );
        } else {
          setGeoError(
            'Could not detect your location. Please search your city below.'
          );
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 180000 }
    );
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchError('Type at least 2 letters of your city or town name.');
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const results = await searchCities(trimmed);
      setSearchResults(results);
      setIsSearching(false);
    } catch {
      setSearchResults([]);
      setSearchError('City search failed. Check your internet connection and try again.');
      setIsSearching(false);
    }
  };

  const handlePickCity = (city: GeocodingCity) => {
    const subtitleParts = [city.admin1, city.country].filter(Boolean);
    onSelectLocation({
      name: city.name,
      subtitle: subtitleParts.join(', '),
      latitude: city.latitude,
      longitude: city.longitude,
      source: 'search',
    });
    setSearchResults([]);
    setHasSearched(false);
    setGeoError(null);
  };

  const band = airData ? getAqiBand(airData.us_aqi) : null;
  const mainPollutant = airData ? getMainPollutant(airData.pollutants) : null;
  const coaching = airData
    ? getRoleCoaching(roleId, airData.us_aqi, mainPollutant, airData.hourly24)
    : null;

  useEffect(() => {
    onLiveAirContextChange({
      aqi: airData?.us_aqi,
      aqiBandLabel: band?.label ?? 'Moderate',
      mainPollutantSymbol: mainPollutant?.symbol,
      locationName: location?.name,
    });
  }, [
    airData?.us_aqi,
    band?.label,
    mainPollutant?.symbol,
    location?.name,
    onLiveAirContextChange,
  ]);

  useEffect(() => {
    if (!airData || !band || !location) {
      setAdviceResult(null);
      setAdviceError(null);
      return;
    }

    adviceAbortRef.current?.abort();
    const controller = new AbortController();
    adviceAbortRef.current = controller;

    setIsLoadingAdvice(true);
    setAdviceError(null);

    fetchAiAdvice(
      {
        role: roleId,
        aqiBand: band.label,
        aqi: airData.us_aqi,
        hoursOutside,
        mainPollutant: mainPollutant?.symbol,
        locationName: location.name,
        language,
      },
      controller.signal
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setAdviceResult(res);
        onModelAnswered(res.model);
        setIsLoadingAdvice(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setAdviceResult(null);
        setAdviceError(
          err instanceof Error ? err.message : 'Unable to load AI advice.'
        );
        setIsLoadingAdvice(false);
      });

    return () => {
      controller.abort();
    };
  }, [airData, band?.label, location, roleId, language, hoursOutside, mainPollutant?.symbol]);

  return (
    <div className="min-h-screen flex flex-col px-4 py-5 sm:px-8 sm:py-8 max-w-5xl mx-auto">
      {/* Compact Top Bar */}
      <header className="flex items-center justify-between gap-4 pb-4 border-b-2 border-[#141414]">
        <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#141414] whitespace-nowrap shrink-0">
          Hawa <em className="italic font-semibold">Saathi</em>
        </span>

        <button
          type="button"
          onClick={onChangeRole}
          aria-label={`Current role is ${role.label}. Tap to change role`}
          className={`brutal-btn ${role.cardBg} text-[#141414] font-bold text-sm sm:text-base px-3.5 py-2 rounded-full inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer min-h-[44px]`}
        >
          <span className="truncate max-w-[140px] sm:max-w-none">{role.shortLabel}</span>
          <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden="true" />
        </button>
      </header>

      <main className="flex-1 py-6 space-y-6">
        {/* Location Controls Card */}
        <section
          aria-label="Choose location for live air quality"
          className="brutal-card bg-white rounded-3xl p-4 sm:p-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            {/* Use My Location CTA */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={isLocating}
                aria-label="Use my current GPS location"
                className="brutal-btn w-full lg:w-auto bg-[#FF4D8D] text-[#141414] font-extrabold text-base sm:text-lg px-5 py-3.5 rounded-2xl inline-flex items-center justify-center gap-2.5 min-h-[54px] cursor-pointer disabled:opacity-65"
              >
                <LocateFixed className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>{isLocating ? 'Finding GPS...' : 'Use my location'}</span>
              </button>
            </div>

            {/* City Search Form */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex-1 flex flex-col sm:flex-row gap-2.5"
              role="search"
            >
              <div className="flex-1">
                <label
                  htmlFor="city-search-input"
                  className="block text-sm font-bold text-[#141414] mb-1.5"
                >
                  Or search any city / town
                </label>
                <div className="relative flex items-center">
                  <input
                    id="city-search-input"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (searchError) setSearchError(null);
                    }}
                    placeholder="e.g. Pune, Jaipur, Patna, Nairobi..."
                    className="w-full min-h-[52px] pl-4 pr-11 py-3 text-base sm:text-lg font-semibold text-[#141414] placeholder:text-[#52525B] bg-[#FFFDF2] border-2 border-[#141414] rounded-2xl"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                        setSearchError(null);
                        setHasSearched(false);
                      }}
                      aria-label="Clear city search"
                      className="absolute right-2 min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-[#141414] hover:bg-[#141414]/10 cursor-pointer"
                    >
                      <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSearching}
                aria-label="Search city"
                className="brutal-btn sm:self-end bg-[#FFD23F] text-[#141414] font-extrabold text-base sm:text-lg px-5 py-3 rounded-2xl inline-flex items-center justify-center gap-2 min-h-[52px] whitespace-nowrap cursor-pointer disabled:opacity-65"
              >
                <Search className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>{isSearching ? 'Searching...' : 'Search'}</span>
              </button>
            </form>
          </div>

          {/* Geolocation or Search Errors */}
          {(geoError || searchError) && (
            <div
              role="alert"
              className="mt-4 rounded-xl border-2 border-[#141414] bg-[#FFE0EA] px-4 py-3 text-sm sm:text-base font-bold text-[#141414]"
            >
              {geoError || searchError}
            </div>
          )}

          {/* City Search Results */}
          {hasSearched && !isSearching && !searchError && (
            <div className="mt-4 pt-4 border-t-2 border-[#141414]/15">
              {searchResults.length === 0 ? (
                <p className="text-base font-bold text-[#3F3F46]">
                  No matching cities found for &ldquo;{searchQuery.trim()}&rdquo;. Try a nearby larger city.
                </p>
              ) : (
                <div>
                  <p className="text-sm font-bold text-[#3F3F46] mb-2">
                    Select a matching city:
                  </p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {searchResults.map((city) => {
                      const sub = [city.admin1, city.country]
                        .filter(Boolean)
                        .join(', ');
                      return (
                        <li key={city.id}>
                          <button
                            type="button"
                            onClick={() => handlePickCity(city)}
                            aria-label={`Select city ${city.name}${sub ? `, ${sub}` : ''}`}
                            className="brutal-btn w-full text-left bg-[#FFFDF2] hover:bg-[#EAD6FF] rounded-xl px-4 py-3 flex items-center gap-3 min-h-[52px] cursor-pointer"
                          >
                            <MapPin
                              className="w-5 h-5 shrink-0 text-[#141414]"
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <div className="text-base font-extrabold text-[#141414] truncate">
                                {city.name}
                              </div>
                              {sub && (
                                <div className="text-sm font-medium text-[#3F3F46] truncate">
                                  {sub}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Empty Initial State (No Location Chosen Yet) */}
        {!location && !isLoadingAir && !airError && (
          <section className="brutal-card bg-[#EAD6FF] rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-[#FFFDF2] border-2 border-[#141414] flex items-center justify-center shrink-0">
                <RoleIllustration roleId={roleId} className="w-16 h-16" />
              </div>
              <div>
                <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#141414] leading-tight">
                  Ready to check your{' '}
                  <span className="relative inline-block">
                    <em className="italic font-semibold">air</em>
                    <SquiggleUnderline className="w-full h-3 -mt-1 block" />
                  </span>
                </h1>
                <p className="mt-2 text-base sm:text-lg font-medium text-[#141414]">
                  Tap <strong>Use my location</strong> or search your city above for live readings tailored for{' '}
                  <strong>{role.label}</strong>.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t-2 border-[#141414]/20">
              <p className="text-sm font-bold text-[#141414] mb-3">
                Or check a major city right now:
              </p>
              <div className="flex flex-wrap gap-2.5">
                {STARTER_CITIES.map((city) => (
                  <button
                    key={city.name}
                    type="button"
                    onClick={() =>
                      onSelectLocation({
                        name: city.name,
                        subtitle: city.subtitle,
                        latitude: city.latitude,
                        longitude: city.longitude,
                        source: 'search',
                      })
                    }
                    aria-label={`Check live air quality for ${city.name}`}
                    className="brutal-btn bg-[#FFFDF2] text-[#141414] font-bold text-base px-4 py-2.5 rounded-xl min-h-[46px] cursor-pointer"
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Loading State (No Fake Numbers) */}
        {isLoadingAir && location && (
          <section
            aria-live="polite"
            className="brutal-card bg-[#FFF3B0] rounded-3xl p-6 sm:p-8 flex items-center gap-4"
          >
            <RefreshCw
              className="w-8 h-8 animate-spin text-[#141414] shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#141414]">
                Checking live air for {location.name}...
              </h2>
              <p className="text-base font-semibold text-[#262626] mt-1">
                Fetching current AQI, pollutants, and 24-hour forecast.
              </p>
            </div>
          </section>
        )}

        {/* Honest Error State (Never Show Fake Numbers) */}
        {!isLoadingAir && airError && location && (
          <section
            role="alert"
            className="brutal-card bg-[#FFE0EA] rounded-3xl p-6 sm:p-8"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#141414] text-[#FFFDF2] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]">
                  Live data unavailable
                </h2>
                <p className="mt-2 text-base sm:text-lg font-semibold text-[#141414]">
                  We could not load real air quality readings for {location.name}. We never show guessed or fake numbers.
                </p>
                <p className="mt-1 text-sm font-medium text-[#3F3F46]">
                  Reason: {airError}
                </p>
                <button
                  type="button"
                  onClick={() => loadAirQuality(location)}
                  aria-label={`Retry loading live air quality for ${location.name}`}
                  className="brutal-btn mt-4 bg-[#FFD23F] text-[#141414] font-extrabold text-base px-5 py-3 rounded-xl inline-flex items-center gap-2 min-h-[48px] cursor-pointer"
                >
                  <RefreshCw className="w-5 h-5" aria-hidden="true" />
                  <span>Retry live check</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Live Air Quality Dashboard */}
        {!isLoadingAir && !airError && airData && band && location && (
          <div className="space-y-6">
            {/* Top 2-Column Split on Desktop: Big AQI Card + Role Coach Card */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Big AQI Card */}
              <section
                aria-labelledby="current-aqi-heading"
                className={`lg:col-span-7 brutal-card ${band.bgClass} ${band.textColorClass} rounded-3xl p-5 sm:p-7 flex flex-col justify-between`}
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm sm:text-base font-bold opacity-90">
                        <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>
                          {location.name}
                          {location.subtitle ? ` · ${location.subtitle}` : ''}
                        </span>
                      </div>
                      <h1
                        id="current-aqi-heading"
                        className="sr-only"
                      >
                        Current Air Quality Index for {location.name}
                      </h1>
                    </div>

                    <button
                      type="button"
                      onClick={() => loadAirQuality(location)}
                      aria-label="Refresh live air quality data"
                      className="brutal-btn bg-[#FFFDF2] text-[#141414] font-bold text-sm px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 min-h-[44px] cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" aria-hidden="true" />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {/* Huge AQI Number + Explicit Band Label */}
                  <div className="mt-5 flex flex-wrap items-end gap-4 sm:gap-6">
                    <div>
                      <div className="text-sm font-extrabold uppercase tracking-wider opacity-90">
                        US AQI
                      </div>
                      <div className="font-mono text-7xl sm:text-8xl font-bold leading-none tabular-nums mt-1">
                        {airData.us_aqi}
                      </div>
                    </div>

                    <div className="pb-1">
                      <div
                        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 border-[#141414] ${band.badgeBgClass} ${band.badgeTextClass} text-base sm:text-lg font-extrabold`}
                      >
                        <BandIcon level={band.level} className="w-5 h-5 shrink-0" />
                        <span>{band.label}</span>
                      </div>
                      <div className="mt-2 font-mono text-sm font-bold opacity-90">
                        {band.rangeText}
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-lg sm:text-xl font-bold leading-snug">
                    {band.summary}
                  </p>
                </div>

                {/* Main Pollutant Box + Required Honest Label */}
                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] text-[#141414] p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-extrabold uppercase tracking-wide text-[#3F3F46]">
                        Main Pollutant
                      </span>
                      <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums">
                        {mainPollutant
                          ? `${mainPollutant.symbol} · ${
                              mainPollutant.value !== null
                                ? `${mainPollutant.value.toFixed(1)} ${mainPollutant.unit}`
                                : '—'
                            }`
                          : 'Not reported'}
                      </span>
                    </div>
                    {mainPollutant && (
                      <p className="mt-1.5 text-sm sm:text-base font-medium text-[#262626]">
                        {mainPollutant.name}: {mainPollutant.sourceNote}
                      </p>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm font-bold opacity-95">
                    Data note: modelled estimate, may differ from your exact street
                  </p>
                </div>
              </section>

              {/* Role-Specific Outdoor Coach Card (Screenshot 1 Lilac Motif) */}
              {coaching && (
                <section
                  aria-labelledby="coach-heading"
                  className="lg:col-span-5 brutal-card bg-[#EAD6FF] text-[#141414] rounded-3xl p-5 sm:p-7 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3.5 pb-4 border-b-2 border-[#141414]/20">
                      <div className="w-14 h-14 rounded-xl bg-[#FFFDF2] border-2 border-[#141414] flex items-center justify-center shrink-0">
                        <RoleIllustration roleId={roleId} className="w-11 h-11" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold uppercase tracking-wider text-[#3F3F46]">
                          Coach for {role.label}
                        </div>
                        <h2
                          id="coach-heading"
                          className="font-serif text-xl sm:text-2xl font-bold leading-tight mt-0.5"
                        >
                          {coaching.headline}
                        </h2>
                      </div>
                    </div>

                    {isLoadingAdvice && (
                      <p className="mt-4 text-sm font-bold text-[#3F3F46]">
                        Personalizing advice for your shift...
                      </p>
                    )}

                    {adviceError && !isLoadingAdvice && (
                      <div
                        role="alert"
                        className="mt-4 rounded-xl border-2 border-[#141414] bg-[#FFE0EA] px-3.5 py-2.5 text-sm font-bold text-[#141414]"
                      >
                        {adviceError}
                      </div>
                    )}

                    {adviceResult && !isLoadingAdvice && (
                      <div className="mt-4 rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 space-y-2.5">
                        {adviceResult.usedFallback && (
                          <div className="inline-flex items-center rounded-lg border-2 border-[#141414] bg-[#FFD23F] px-2.5 py-1 text-xs font-extrabold text-[#141414]">
                            Basic answer (AI unavailable)
                          </div>
                        )}
                        <FormattedCoachReply
                          text={adviceResult.answer}
                          className="text-sm sm:text-base font-semibold text-[#141414]"
                        />
                      </div>
                    )}

                    {(!adviceResult || adviceResult.usedFallback) && (
                      <ul className="mt-4 space-y-3">
                        {coaching.tips.map((tip, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-3 text-base font-semibold leading-snug"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-0.5 w-6 h-6 rounded-full bg-[#141414] text-[#FFFDF2] font-mono text-xs font-bold flex items-center justify-center shrink-0"
                            >
                              {idx + 1}
                            </span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {coaching.bestWindowText && (
                    <div className="mt-5 rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] px-4 py-3 flex items-start gap-2.5">
                      <Clock className="w-5 h-5 shrink-0 mt-0.5 text-[#141414]" aria-hidden="true" />
                      <p className="text-sm sm:text-base font-bold text-[#141414]">
                        {coaching.bestWindowText}
                      </p>
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* All 5 Pollutants Breakdown */}
            <section aria-labelledby="pollutants-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h2
                  id="pollutants-heading"
                  className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]"
                >
                  Live Pollutants
                </h2>
                <span className="text-xs sm:text-sm font-bold text-[#3F3F46]">
                  modelled estimate, may differ from your exact street
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                {POLLUTANT_ORDER.map((key) => {
                  const info = getPollutantDetails(key, airData.pollutants[key]);
                  const isMain = mainPollutant?.key === key;
                  return (
                    <div
                      key={key}
                      className={`brutal-card-sm rounded-2xl p-4 flex flex-col justify-between ${
                        isMain ? 'bg-[#FFF3B0]' : 'bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-lg font-extrabold text-[#141414]">
                            {info.symbol}
                          </span>
                          {isMain && (
                            <span className="text-[11px] font-extrabold uppercase tracking-wide bg-[#141414] text-[#FFFDF2] px-2 py-0.5 rounded-md">
                              Main
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-[#3F3F46] mt-0.5">
                          {info.name}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-[#141414]/15">
                        <div className="font-mono text-2xl font-bold text-[#141414] tabular-nums">
                          {info.value !== null
                            ? info.value >= 100
                              ? Math.round(info.value)
                              : info.value.toFixed(1)
                            : '—'}
                        </div>
                        <div className="font-mono text-xs font-semibold text-[#3F3F46]">
                          {info.value !== null ? info.unit : 'Not reported'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 24-Hour Bar Chart */}
            <HourlyBarChart hourly24={airData.hourly24} />

            {/* Interactive AI Coach Studio: Shift Plan & Photo Audit */}
            <AiCoachStudio
              roleId={roleId}
              aqi={airData.us_aqi}
              aqiBandLabel={band.label}
              hoursOutside={hoursOutside}
              onChangeHoursOutside={onChangeHoursOutside}
              mainPollutantSymbol={mainPollutant?.symbol}
              locationName={location.name}
              hourly24={airData.hourly24}
              language={language}
              onChangeLanguage={onChangeLanguage}
              onModelAnswered={onModelAnswered}
            />
          </div>
        )}
      </main>

      <footer className="pt-6 pb-20 border-t-2 border-[#141414]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-[#3F3F46]">
        <span>Hawa Saathi · Open-Meteo Air Quality &amp; Geocoding</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>modelled estimate, may differ from your exact street</span>
          {answeredByModel && (
            <span className="font-mono text-xs font-bold text-[#141414]">
              Answered by: {answeredByModel}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
