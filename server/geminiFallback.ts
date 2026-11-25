import { GoogleGenAI } from '@google/genai';
import { createHash } from 'node:crypto';
import {
  buildRuleBasedAnswer,
  type AiFeatureType,
  type HourlyForecastInput,
  type SupportedLanguage,
} from './ruleBasedFallback.ts';

export const DEFAULT_GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
] as const;

export const COOLDOWN_MS = 60_000;
export const CACHE_TTL_MS = 5 * 60_000;
export const REQUEST_TIMEOUT_MS = 15_000;

export interface GeminiInlineImage {
  mimeType: string;
  base64Data: string;
}

export interface FallbackRequest {
  feature: AiFeatureType;
  role: string;
  aqiBand: string;
  aqi?: number;
  hoursOutside?: number;
  mainPollutant?: string;
  language: SupportedLanguage;
  question: string;
  hourly24?: HourlyForecastInput[];
  systemInstruction: string;
  prompt: string;
  image?: GeminiInlineImage;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  skipCache?: boolean;
}

export interface AttemptRecord {
  model: string;
  outcome: 'success' | 'skipped_cooldown' | 'retryable_error' | 'fatal_error';
  reason?: string;
}

export interface FallbackResponse {
  answer: string;
  model: string;
  usedFallback: boolean;
  cached: boolean;
  attempts: AttemptRecord[];
}

export class GeminiClientError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code = 'GEMINI_CLIENT_ERROR') {
    super(message);
    this.name = 'GeminiClientError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function getConfiguredModels(
  env: Record<string, string | undefined> = process.env
): string[] {
  const raw = env.GEMINI_MODELS;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = raw
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return [...DEFAULT_GEMINI_MODELS];
}

export function sanitizeSecretText(
  text: string,
  apiKey?: string
): string {
  let cleaned = text.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]');
  if (apiKey && apiKey.length >= 6) {
    cleaned = cleaned.split(apiKey).join('[REDACTED_KEY]');
  }
  return cleaned;
}

interface ClassifiedError {
  kind: 'retryable' | 'non_retryable';
  statusCode: number;
  reason: string;
}

function extractStatusCode(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const record = err as Record<string, unknown>;
  for (const field of ['status', 'statusCode', 'httpStatus']) {
    const val = record[field];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
  }
  const message = typeof record.message === 'string' ? record.message : '';
  const statusMatch = message.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  if (statusMatch) {
    return Number(statusMatch[1]);
  }
  return null;
}

export function classifyGeminiError(
  err: unknown,
  apiKey?: string
): ClassifiedError {
  const rawMsg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Unknown Gemini error';
  const safeMsg = sanitizeSecretText(rawMsg, apiKey);
  const upperMsg = safeMsg.toUpperCase();

  if (
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError' || upperMsg.includes('TIMED OUT'))
  ) {
    return {
      kind: 'retryable',
      statusCode: 504,
      reason: 'Request timed out (>15s)',
    };
  }

  const status = extractStatusCode(err);

  if (status === 429 || upperMsg.includes('RESOURCE_EXHAUSTED') || upperMsg.includes('QUOTA')) {
    return {
      kind: 'retryable',
      statusCode: 429,
      reason: 'HTTP 429 quota or rate limit',
    };
  }

  if (status === 503 || upperMsg.includes('UNAVAILABLE') || upperMsg.includes('OVERLOADED')) {
    return {
      kind: 'retryable',
      statusCode: 503,
      reason: 'HTTP 503 service overloaded',
    };
  }

  if (status === 500 || upperMsg.includes('INTERNAL')) {
    return {
      kind: 'retryable',
      statusCode: 500,
      reason: 'HTTP 500 internal error',
    };
  }

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    upperMsg.includes('API_KEY_INVALID') ||
    upperMsg.includes('INVALID_ARGUMENT') ||
    upperMsg.includes('UNAUTHENTICATED') ||
    upperMsg.includes('PERMISSION_DENIED')
  ) {
    const code = status === 401 || upperMsg.includes('UNAUTHENTICATED')
      ? 401
      : status === 403 || upperMsg.includes('PERMISSION_DENIED')
        ? 403
        : 400;
    return {
      kind: 'non_retryable',
      statusCode: code,
      reason: safeMsg || `HTTP ${code} request error`,
    };
  }

  // Other unexpected errors (e.g. network drop) can fall back to the next model
  return {
    kind: 'retryable',
    statusCode: status ?? 503,
    reason: safeMsg || 'Transient network or upstream error',
  };
}

export type ModelInvoker = (params: {
  model: string;
  systemInstruction: string;
  prompt: string;
  image?: GeminiInlineImage;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}) => Promise<string>;

interface CacheEntry {
  answer: string;
  model: string;
  expiresAt: number;
}

export interface FallbackLogger {
  info?: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface FallbackRunnerDependencies {
  env?: Record<string, string | undefined>;
  now?: () => number;
  timeoutMs?: number;
  cooldownMs?: number;
  cacheTtlMs?: number;
  invokeModel?: ModelInvoker;
  logger?: FallbackLogger;
}

function buildCacheKey(req: FallbackRequest): string {
  const normalizedQuestion = req.question.trim().toLowerCase().replace(/\s+/g, ' ');
  const imageHash = req.image
    ? createHash('sha256')
        .update(req.image.mimeType)
        .update(':')
        .update(req.image.base64Data)
        .digest('hex')
        .slice(0, 16)
    : 'no-img';

  return JSON.stringify([
    req.feature,
    req.role.trim().toLowerCase(),
    req.aqiBand.trim().toLowerCase(),
    req.language,
    req.hoursOutside ?? 'default-hrs',
    normalizedQuestion,
    imageHash,
  ]);
}

function isPlaceholderApiKey(key: string | undefined): boolean {
  if (!key) return true;
  const trimmed = key.trim();
  return trimmed.length === 0 || trimmed === 'MY_GEMINI_API_KEY';
}

function createSdkInvoker(apiKey: string): ModelInvoker {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  return async ({
    model,
    systemInstruction,
    prompt,
    image,
    responseMimeType,
    responseSchema,
  }) => {
    const contents = image
      ? {
          parts: [
            {
              inlineData: {
                mimeType: image.mimeType,
                data: image.base64Data,
              },
            },
            { text: prompt },
          ],
        }
      : prompt;

    const config: Record<string, unknown> = {
      systemInstruction,
    };
    if (responseMimeType) {
      config.responseMimeType = responseMimeType;
    }
    if (responseSchema) {
      config.responseSchema = responseSchema;
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Model returned empty response text');
    }
    return text;
  };
}

export function createGeminiFallbackRunner(deps: FallbackRunnerDependencies = {}) {
  const cooldownUntilByModel = new Map<string, number>();
  const responseCache = new Map<string, CacheEntry>();
  const inFlightRequests = new Map<string, Promise<FallbackResponse>>();

  const nowFn = deps.now ?? (() => Date.now());
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const cooldownMs = deps.cooldownMs ?? COOLDOWN_MS;
  const cacheTtlMs = deps.cacheTtlMs ?? CACHE_TTL_MS;
  const logger = deps.logger ?? console;
  const logRetryNotice = (msg: string, debugEnabled: boolean) => {
    if (deps.logger) {
      if (typeof deps.logger.info === 'function') {
        deps.logger.info(msg);
      } else {
        deps.logger.warn(msg);
      }
      return;
    }
    if (debugEnabled) {
      console.log(msg);
    }
  };

  let cachedClientKey: string | undefined;
  let cachedSdkInvoker: ModelInvoker | undefined;

  async function callWithTimeout(
    invoker: ModelInvoker,
    params: {
      model: string;
      systemInstruction: string;
      prompt: string;
      image?: GeminiInlineImage;
      responseMimeType?: string;
      responseSchema?: Record<string, unknown>;
    }
  ): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        invoker(params),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const timeoutErr = new Error(
              `Model ${params.model} timed out after ${timeoutMs}ms`
            );
            timeoutErr.name = 'TimeoutError';
            reject(timeoutErr);
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  async function execute(req: FallbackRequest): Promise<FallbackResponse> {
    const env = deps.env ?? process.env;
    const now = nowFn();
    const cacheKey = buildCacheKey(req);

    // Prune expired entry if hit
    if (!req.skipCache) {
      const hit = responseCache.get(cacheKey);
      if (hit) {
        if (now < hit.expiresAt) {
          return {
            answer: hit.answer,
            model: hit.model,
            usedFallback: false,
            cached: true,
            attempts: [],
          };
        }
        responseCache.delete(cacheKey);
      }

      const pending = inFlightRequests.get(cacheKey);
      if (pending) {
        const sharedResult = await pending;
        return {
          ...sharedResult,
          cached: !sharedResult.usedFallback,
        };
      }
    }

    const apiKey = env.GEMINI_API_KEY;
    let invoker = deps.invokeModel;

    if (!invoker) {
      if (isPlaceholderApiKey(apiKey)) {
        return {
          answer: buildRuleBasedAnswer({
            feature: req.feature,
            role: req.role,
            aqiBand: req.aqiBand,
            aqi: req.aqi,
            hoursOutside: req.hoursOutside,
            mainPollutant: req.mainPollutant,
            language: req.language,
            question: req.question,
            hourly24: req.hourly24,
          }),
          model: 'rule-based-fallback',
          usedFallback: true,
          cached: false,
          attempts: [],
        };
      }

      if (!cachedSdkInvoker || cachedClientKey !== apiKey) {
        cachedClientKey = apiKey;
        cachedSdkInvoker = createSdkInvoker(apiKey as string);
      }
      invoker = cachedSdkInvoker;
    }

    const runModels = async (): Promise<FallbackResponse> => {
      const models = getConfiguredModels(env);
      const attempts: AttemptRecord[] = [];

      for (const model of models) {
        const currentNow = nowFn();
        const cooldownUntil = cooldownUntilByModel.get(model);
        if (cooldownUntil !== undefined && currentNow < cooldownUntil) {
          attempts.push({
            model,
            outcome: 'skipped_cooldown',
            reason: 'Cooling down after 429',
          });
          continue;
        }
        if (cooldownUntil !== undefined && currentNow >= cooldownUntil) {
          cooldownUntilByModel.delete(model);
        }

        try {
          const answer = await callWithTimeout(invoker!, {
            model,
            systemInstruction: req.systemInstruction,
            prompt: req.prompt,
            image: req.image,
            responseMimeType: req.responseMimeType,
            responseSchema: req.responseSchema,
          });

          attempts.push({ model, outcome: 'success' });

          if (!req.skipCache) {
            responseCache.set(cacheKey, {
              answer,
              model,
              expiresAt: nowFn() + cacheTtlMs,
            });
          }

          return {
            answer,
            model,
            usedFallback: false,
            cached: false,
            attempts,
          };
        } catch (err) {
          const classified = classifyGeminiError(err, apiKey);

          if (classified.kind === 'non_retryable') {
            attempts.push({
              model,
              outcome: 'fatal_error',
              reason: classified.reason,
            });
            logger.error(
              `[Gemini] Non-retryable error on ${model} (${classified.statusCode}): ${classified.reason}`
            );
            throw new GeminiClientError(
              classified.statusCode === 401 || classified.statusCode === 403
                ? 'AI service rejected the API credentials. Check GEMINI_API_KEY configuration.'
                : `Invalid AI request (${classified.statusCode}): ${classified.reason}`,
              classified.statusCode,
              classified.statusCode === 401 || classified.statusCode === 403
                ? 'INVALID_API_KEY'
                : 'BAD_REQUEST'
            );
          }

          if (classified.statusCode === 429) {
            cooldownUntilByModel.set(model, nowFn() + cooldownMs);
          }

          attempts.push({
            model,
            outcome: 'retryable_error',
            reason: classified.reason,
          });
          logRetryNotice(
            `[Gemini] ${model} failed (${classified.reason}); trying next fallback model.`,
            env.DEBUG_GEMINI_FALLBACK === '1'
          );
        }
      }

      // All models failed or were cooling down -> rule-based fallback
      return {
        answer: buildRuleBasedAnswer({
          feature: req.feature,
          role: req.role,
          aqiBand: req.aqiBand,
          aqi: req.aqi,
          hoursOutside: req.hoursOutside,
          mainPollutant: req.mainPollutant,
          language: req.language,
          question: req.question,
          hourly24: req.hourly24,
        }),
        model: 'rule-based-fallback',
        usedFallback: true,
        cached: false,
        attempts,
      };
    };

    if (req.skipCache) {
      return runModels();
    }

    const promise = runModels().finally(() => {
      inFlightRequests.delete(cacheKey);
    });
    inFlightRequests.set(cacheKey, promise);
    return promise;
  }

  return {
    execute,
    _cooldownMap: cooldownUntilByModel,
    _cacheMap: responseCache,
  };
}

const sharedRunner = createGeminiFallbackRunner();

export async function callGeminiWithFallback(
  req: FallbackRequest
): Promise<FallbackResponse> {
  return sharedRunner.execute(req);
}
