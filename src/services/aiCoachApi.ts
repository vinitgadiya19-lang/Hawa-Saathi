import type { HourlyAirQualityPoint, WorkerRoleId } from '../types/airQuality.ts';

export type CoachLanguage = 'en' | 'hi' | 'hinglish';

export interface AiApiResult {
  answer: string;
  model: string;
  usedFallback: boolean;
  cached: boolean;
}

interface BaseAiContext {
  role: WorkerRoleId;
  aqiBand: string;
  aqi?: number;
  hoursOutside?: number;
  mainPollutant?: string;
  locationName?: string;
  language: CoachLanguage;
}

const ADVICE_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const adviceClientCache = new Map<string, { expiresAt: number; result: AiApiResult }>();

export function buildAdviceCacheKey(params: {
  role: WorkerRoleId;
  locationName?: string;
  aqiBand: string;
  hoursOutside?: number;
  language: CoachLanguage;
}): string {
  const city = (params.locationName ?? '').trim().toLowerCase();
  const hours = params.hoursOutside ?? 8;
  return `${params.role}::${city}::${params.aqiBand}::${hours}::${params.language}`;
}

export function getCachedAiAdvice(
  key: string,
  now = Date.now()
): AiApiResult | null {
  const entry = adviceClientCache.get(key);
  if (!entry) return null;
  if (now >= entry.expiresAt) {
    adviceClientCache.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

export function clearAiAdviceCache(): void {
  adviceClientCache.clear();
}

async function postJson<T>(
  url: string,
  payload: unknown,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!res.ok) {
    throw new Error(
      data?.error || `Request failed (${res.status})`
    );
  }
  if (!data) {
    throw new Error('Empty response from server');
  }
  return data;
}

export async function fetchAiAdvice(
  ctx: BaseAiContext,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<AiApiResult> {
  const key = buildAdviceCacheKey(ctx);
  const cached = getCachedAiAdvice(key);
  if (cached) {
    return cached;
  }

  const result = await postJson<AiApiResult>('/api/advice', ctx, signal, fetchImpl);
  adviceClientCache.set(key, {
    expiresAt: Date.now() + ADVICE_CLIENT_CACHE_TTL_MS,
    result,
  });
  return result;
}

export function fetchAiChat(
  ctx: BaseAiContext & { question: string },
  signal?: AbortSignal
): Promise<AiApiResult> {
  return postJson<AiApiResult>('/api/chat', ctx, signal);
}

export function fetchAiShiftPlan(
  ctx: BaseAiContext & {
    shiftFocus: string;
    hourly24: HourlyAirQualityPoint[];
  },
  signal?: AbortSignal
): Promise<AiApiResult> {
  return postJson<AiApiResult>(
    '/api/shift-plan',
    {
      ...ctx,
      hourly24: ctx.hourly24.map((h) => ({
        hourLabel: h.hourLabel,
        us_aqi: h.us_aqi,
      })),
    },
    signal
  );
}

export function fetchAiPhotoAudit(
  ctx: BaseAiContext & {
    mimeType: string;
    imageBase64: string;
    note: string;
  },
  signal?: AbortSignal
): Promise<AiApiResult> {
  return postJson<AiApiResult>('/api/photo-audit', ctx, signal);
}

export async function prepareImageForUpload(
  file: File
): Promise<{ mimeType: string; imageBase64: string; previewUrl: string }> {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Please choose a JPEG, PNG, or WebP photo.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('Invalid image file.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the selected image.'));
      img.onload = () => {
        const maxSide = 1024;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const base64Only = dataUrl.split(',')[1] ?? '';
          resolve({
            mimeType: file.type,
            imageBase64: base64Only,
            previewUrl: dataUrl,
          });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const base64Data = compressedDataUrl.split(',')[1] ?? '';
        resolve({
          mimeType: 'image/jpeg',
          imageBase64: base64Data,
          previewUrl: compressedDataUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
