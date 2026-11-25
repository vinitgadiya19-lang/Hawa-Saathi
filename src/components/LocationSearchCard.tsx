import React, { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search, X } from 'lucide-react';
import { searchCities } from '../services/openMeteo';
import type { GeocodingCity, SelectedLocation } from '../types/airQuality';

interface LocationSearchCardProps {
  onSelectLocation: (loc: SelectedLocation) => void;
}

function CitySearchResults({
  searchQuery,
  searchResults,
  onPickCity,
}: {
  searchQuery: string;
  searchResults: GeocodingCity[];
  onPickCity: (city: GeocodingCity) => void;
}) {
  return (
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
              const sub = [city.admin1, city.country].filter(Boolean).join(', ');
              return (
                <li key={city.id}>
                  <button
                    type="button"
                    onClick={() => onPickCity(city)}
                    aria-label={`Select city ${city.name}${sub ? `, ${sub}` : ''}`}
                    className="brutal-btn w-full text-left bg-[#FFFDF2] hover:bg-[#EAD6FF] rounded-xl px-4 py-3 flex items-center gap-3 min-h-[52px] cursor-pointer"
                  >
                    <MapPin className="w-5 h-5 shrink-0 text-[#141414]" aria-hidden="true" />
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
  );
}

export function LocationSearchCard({ onSelectLocation }: LocationSearchCardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingCity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const searchAbortRef = useRef<AbortController | null>(null);

  const runCitySearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < 2) {
      setSearchError('Type at least 2 letters of your city or town name.');
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const results = await searchCities(trimmed, controller.signal);
      if (!controller.signal.aborted) {
        setSearchResults(results);
        setIsSearching(false);
      }
    } catch {
      if (controller.signal.aborted) return;
      setSearchResults([]);
      setSearchError('City search failed. Check your internet connection and try again.');
      setIsSearching(false);
    }
  };

  // Debounced auto-search when user types at least 3 characters
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runCitySearch(trimmed);
    }, 350);

    return () => {
      window.clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
  }, [searchQuery]);

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
          setGeoError('Could not detect your location. Please search your city below.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 180000 }
    );
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCitySearch(searchQuery);
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

  return (
    <section
      aria-label="Choose location for live air quality"
      className="brutal-card bg-white rounded-3xl p-4 sm:p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
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
                  if (e.target.value.trim().length < 2) {
                    setSearchResults([]);
                    setHasSearched(false);
                  }
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

      {(geoError || searchError) && (
        <div
          role="alert"
          className="mt-4 rounded-xl border-2 border-[#141414] bg-[#FFE0EA] px-4 py-3 text-sm sm:text-base font-bold text-[#141414]"
        >
          {geoError || searchError}
        </div>
      )}

      {hasSearched && !isSearching && !searchError && (
        <CitySearchResults
          searchQuery={searchQuery}
          searchResults={searchResults}
          onPickCity={handlePickCity}
        />
      )}
    </section>
  );
}
