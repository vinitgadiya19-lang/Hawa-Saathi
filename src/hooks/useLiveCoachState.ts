import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AiApiResult,
  buildAdviceCacheKey,
  type CoachLanguage,
  fetchAiAdvice,
  getCachedAiAdvice,
} from '../services/aiCoachApi.ts';
import { fetchAirQuality } from '../services/openMeteo.ts';
import type {
  LiveAirQualityData,
  SelectedLocation,
  WorkerRoleId,
} from '../types/airQuality.ts';
import {
  getAqiBand,
  getMainPollutant,
  getRoleCoaching,
} from '../utils/aqi.ts';

export interface LiveChatAirContext {
  aqi?: number;
  aqiBandLabel: string;
  mainPollutantSymbol?: string;
  locationName?: string;
}

export interface UseLiveCoachStateOptions {
  roleId: WorkerRoleId;
  location: SelectedLocation | null;
  language: CoachLanguage;
  hoursOutside: number;
  onModelAnswered: (model: string) => void;
  onLiveAirContextChange: (ctx: LiveChatAirContext) => void;
  debounceMs?: number;
  retryDelayMs?: number;
  fetchAirQualityImpl?: typeof fetchAirQuality;
  fetchAiAdviceImpl?: typeof fetchAiAdvice;
}

const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_RETRY_DELAY_MS = 5000;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}

interface AdviceRequestParams {
  adviceKey: string;
  roleId: WorkerRoleId;
  locationName: string;
  bandLabel: string;
  debouncedHours: number;
  debouncedLanguage: CoachLanguage;
  retryDelayMs: number;
  latestAqiRef: { current: number | undefined };
  latestPollutantRef: { current: string | undefined };
  onModelAnsweredRef: { current: (model: string) => void };
  fetchAiAdviceImpl: typeof fetchAiAdvice;
}

function useCoachAdviceRequest(params: AdviceRequestParams) {
  const {
    adviceKey,
    roleId,
    locationName,
    bandLabel,
    debouncedHours,
    debouncedLanguage,
    retryDelayMs,
    latestAqiRef,
    latestPollutantRef,
    onModelAnsweredRef,
    fetchAiAdviceImpl,
  } = params;

  const [adviceResult, setAdviceResult] = useState<AiApiResult | null>(null);
  const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [isAutoRetryPending, setIsAutoRetryPending] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const autoRetriedKeyRef = useRef<string | null>(null);

  const clearPendingRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      globalThis.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setIsAutoRetryPending(false);
  }, []);

  const retryAdviceManually = useCallback(() => {
    if (!adviceKey) return;
    clearPendingRetry();
    autoRetriedKeyRef.current = adviceKey;
    setAdviceError(null);
    setRetryTick((t) => t + 1);
  }, [adviceKey, clearPendingRetry]);

  useEffect(() => {
    clearPendingRetry();
    abortRef.current?.abort();

    if (!adviceKey) {
      setAdviceResult(null);
      setAdviceError(null);
      setIsLoadingAdvice(false);
      return undefined;
    }

    const cached = getCachedAiAdvice(adviceKey);
    if (cached) {
      setAdviceResult(cached);
      setAdviceError(null);
      setIsLoadingAdvice(false);
      onModelAnsweredRef.current(cached.model);
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const reqSeq = ++seqRef.current;

    setIsLoadingAdvice(true);
    setAdviceError(null);

    fetchAiAdviceImpl(
      {
        role: roleId,
        aqiBand: bandLabel,
        aqi: latestAqiRef.current,
        hoursOutside: debouncedHours,
        mainPollutant: latestPollutantRef.current,
        locationName,
        language: debouncedLanguage,
      },
      controller.signal
    )
      .then((res) => {
        if (controller.signal.aborted || reqSeq !== seqRef.current) return;
        setAdviceResult(res);
        setAdviceError(null);
        setIsLoadingAdvice(false);
        setIsAutoRetryPending(false);
        onModelAnsweredRef.current(res.model);
      })
      .catch((err) => {
        if (controller.signal.aborted || reqSeq !== seqRef.current) return;
        setAdviceResult(null);
        setAdviceError(
          err instanceof Error && err.message
            ? err.message
            : 'Unable to load personalized AI advice right now.'
        );
        setIsLoadingAdvice(false);

        if (autoRetriedKeyRef.current !== adviceKey) {
          autoRetriedKeyRef.current = adviceKey;
          setIsAutoRetryPending(true);
          retryTimerRef.current = globalThis.setTimeout(() => {
            retryTimerRef.current = null;
            setIsAutoRetryPending(false);
            setRetryTick((t) => t + 1);
          }, retryDelayMs);
        }
      });

    return () => {
      controller.abort();
      clearPendingRetry();
    };
  }, [
    adviceKey,
    roleId,
    locationName,
    bandLabel,
    debouncedHours,
    debouncedLanguage,
    retryTick,
    retryDelayMs,
    fetchAiAdviceImpl,
    clearPendingRetry,
    latestAqiRef,
    latestPollutantRef,
    onModelAnsweredRef,
  ]);

  return {
    adviceResult,
    isLoadingAdvice,
    adviceError,
    isAutoRetryPending,
    retryAdviceManually,
  };
}

function useAirQualityFetcher(
  location: SelectedLocation | null,
  fetchAirQualityImpl: typeof fetchAirQuality
) {
  const [airData, setAirData] = useState<LiveAirQualityData | null>(null);
  const [isLoadingAir, setIsLoadingAir] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);

  const airAbortRef = useRef<AbortController | null>(null);
  const airSeqRef = useRef(0);

  const locationName = location?.name ?? '';
  const locationLat = location?.latitude ?? null;
  const locationLon = location?.longitude ?? null;
  const hasLocation = locationName.length > 0 && locationLat !== null && locationLon !== null;

  const loadAirQualityCoords = useCallback(
    async (lat: number, lon: number) => {
      airAbortRef.current?.abort();
      const controller = new AbortController();
      airAbortRef.current = controller;
      const reqSeq = ++airSeqRef.current;

      setIsLoadingAir(true);
      setAirError(null);
      setAirData(null);

      try {
        const data = await fetchAirQualityImpl(lat, lon, controller.signal);
        if (!controller.signal.aborted && reqSeq === airSeqRef.current) {
          setAirData(data);
          setIsLoadingAir(false);
        }
      } catch (err) {
        if (controller.signal.aborted || reqSeq !== airSeqRef.current) return;
        const message =
          err instanceof Error && err.message ? err.message : 'Could not reach air quality service.';
        setAirError(message);
        setAirData(null);
        setIsLoadingAir(false);
      }
    },
    [fetchAirQualityImpl]
  );

  useEffect(() => {
    if (hasLocation && locationLat !== null && locationLon !== null) {
      void loadAirQualityCoords(locationLat, locationLon);
    }
    return () => {
      airAbortRef.current?.abort();
    };
  }, [hasLocation, locationLat, locationLon, loadAirQualityCoords]);

  return {
    airData,
    isLoadingAir,
    airError,
    loadAirQualityCoords,
    locationName,
  };
}

function useAirQualityDerived(
  airData: LiveAirQualityData | null,
  roleId: WorkerRoleId,
  locationName: string,
  onLiveAirContextChangeRef: { current: (ctx: LiveChatAirContext) => void }
) {
  const aqiValue = airData?.us_aqi ?? null;
  const pollutants = airData?.pollutants ?? null;
  const hourly24 = airData?.hourly24;

  const band = useMemo(() => (aqiValue !== null ? getAqiBand(aqiValue) : null), [aqiValue]);
  const mainPollutant = useMemo(() => (pollutants ? getMainPollutant(pollutants) : null), [pollutants]);
  const coaching = useMemo(
    () =>
      aqiValue !== null ? getRoleCoaching(roleId, aqiValue, mainPollutant, hourly24 ?? []) : null,
    [roleId, aqiValue, mainPollutant, hourly24]
  );

  const bandLabel = band?.label ?? '';
  const mainPollutantSymbol = mainPollutant?.symbol ?? '';

  const latestAqiRef = useRef<number | undefined>(aqiValue ?? undefined);
  latestAqiRef.current = aqiValue ?? undefined;
  const latestPollutantRef = useRef<string | undefined>(mainPollutantSymbol || undefined);
  latestPollutantRef.current = mainPollutantSymbol || undefined;

  useEffect(() => {
    onLiveAirContextChangeRef.current({
      aqi: aqiValue ?? undefined,
      aqiBandLabel: bandLabel || 'Moderate',
      mainPollutantSymbol: mainPollutantSymbol || undefined,
      locationName: locationName || undefined,
    });
  }, [aqiValue, bandLabel, mainPollutantSymbol, locationName, onLiveAirContextChangeRef]);

  return {
    aqiValue,
    band,
    mainPollutant,
    coaching,
    bandLabel,
    mainPollutantSymbol,
    latestAqiRef,
    latestPollutantRef,
  };
}

export function useLiveCoachState({
  roleId,
  location,
  language,
  hoursOutside,
  onModelAnswered,
  onLiveAirContextChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  fetchAirQualityImpl = fetchAirQuality,
  fetchAiAdviceImpl = fetchAiAdvice,
}: UseLiveCoachStateOptions) {
  const onModelAnsweredRef = useRef(onModelAnswered);
  onModelAnsweredRef.current = onModelAnswered;

  const onLiveAirContextChangeRef = useRef(onLiveAirContextChange);
  onLiveAirContextChangeRef.current = onLiveAirContextChange;

  const airFetcher = useAirQualityFetcher(location, fetchAirQualityImpl);
  const airDerived = useAirQualityDerived(
    airFetcher.airData,
    roleId,
    airFetcher.locationName,
    onLiveAirContextChangeRef
  );

  const loadAirQuality = useCallback(
    (loc: SelectedLocation) => airFetcher.loadAirQualityCoords(loc.latitude, loc.longitude),
    [airFetcher]
  );

  const debouncedHoursOutside = useDebouncedValue(hoursOutside, debounceMs);
  const debouncedLanguage = useDebouncedValue(language, debounceMs);

  const adviceKey =
    airDerived.aqiValue !== null && airDerived.bandLabel && airFetcher.locationName
      ? buildAdviceCacheKey({
          role: roleId,
          locationName: airFetcher.locationName,
          aqiBand: airDerived.bandLabel,
          hoursOutside: debouncedHoursOutside,
          language: debouncedLanguage,
        })
      : '';

  const advice = useCoachAdviceRequest({
    adviceKey,
    roleId,
    locationName: airFetcher.locationName,
    bandLabel: airDerived.bandLabel,
    debouncedHours: debouncedHoursOutside,
    debouncedLanguage,
    retryDelayMs,
    latestAqiRef: airDerived.latestAqiRef,
    latestPollutantRef: airDerived.latestPollutantRef,
    onModelAnsweredRef,
    fetchAiAdviceImpl,
  });

  return {
    airData: airFetcher.airData,
    isLoadingAir: airFetcher.isLoadingAir,
    airError: airFetcher.airError,
    adviceResult: advice.adviceResult,
    isLoadingAdvice: advice.isLoadingAdvice,
    adviceError: advice.adviceError,
    isAutoRetryPending: advice.isAutoRetryPending,
    retryAdviceManually: advice.retryAdviceManually,
    band: airDerived.band,
    mainPollutant: airDerived.mainPollutant,
    coaching: airDerived.coaching,
    loadAirQuality,
  };
}
