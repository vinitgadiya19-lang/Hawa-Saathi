import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  callGeminiWithFallback,
  GeminiClientError,
  sanitizeSecretText,
} from './server/geminiFallback.ts';
import {
  formatCoachReply,
  guardAndAnswerChat,
} from './server/chatGuard.ts';
import type {
  HourlyForecastInput,
  SupportedLanguage,
} from './server/ruleBasedFallback.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_ROLES = new Set([
  'delivery',
  'driver',
  'vendor',
  'police',
  'general',
]);
const ALLOWED_LANGUAGES = new Set<SupportedLanguage>(['en', 'hi', 'hinglish']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_QUESTION_CHARS = 1000;
const MAX_IMAGE_BASE64_CHARS = 7_000_000; // ~5MB binary image

function parseLanguage(raw: unknown): SupportedLanguage {
  if (typeof raw === 'string' && ALLOWED_LANGUAGES.has(raw as SupportedLanguage)) {
    return raw as SupportedLanguage;
  }
  return 'en';
}

function languageInstruction(lang: SupportedLanguage): string {
  if (lang === 'hi') {
    return 'Reply in simple, everyday Hindi (Devanagari script) easy for outdoor workers to understand.';
  }
  if (lang === 'hinglish') {
    return 'Reply in natural, simple Hinglish (Hindi words written in English letters) easy for Indian outdoor workers to read.';
  }
  return 'Reply in plain, clear everyday English.';
}

function validateBasePayload(body: unknown): {
  role: string;
  aqiBand: string;
  aqi?: number;
  hoursOutside: number;
  mainPollutant?: string;
  locationName?: string;
  language: SupportedLanguage;
} {
  if (!body || typeof body !== 'object') {
    throw new GeminiClientError('Request body must be a JSON object.', 400, 'BAD_REQUEST');
  }
  const data = body as Record<string, unknown>;
  const role = typeof data.role === 'string' ? data.role.trim() : '';
  const aqiBand = typeof data.aqiBand === 'string' ? data.aqiBand.trim() : '';

  if (!ALLOWED_ROLES.has(role)) {
    throw new GeminiClientError('Invalid worker role.', 400, 'BAD_REQUEST');
  }
  if (!aqiBand || aqiBand.length > 60) {
    throw new GeminiClientError('Valid aqiBand is required.', 400, 'BAD_REQUEST');
  }

  const aqi =
    typeof data.aqi === 'number' && Number.isFinite(data.aqi)
      ? Math.round(data.aqi)
      : undefined;
  const defaultHours = role === 'general' ? 2 : 8;
  const rawHours =
    typeof data.hoursOutside === 'number' && Number.isFinite(data.hoursOutside)
      ? Math.round(data.hoursOutside)
      : defaultHours;
  const hoursOutside = Math.max(1, Math.min(24, rawHours));
  const mainPollutant =
    typeof data.mainPollutant === 'string'
      ? data.mainPollutant.trim().slice(0, 40)
      : undefined;
  const locationName =
    typeof data.locationName === 'string'
      ? data.locationName.trim().slice(0, 80)
      : undefined;

  return {
    role,
    aqiBand,
    aqi,
    hoursOutside,
    mainPollutant,
    locationName,
    language: parseLanguage(data.language),
  };
}

function handleApiError(res: Response, err: unknown) {
  if (err instanceof GeminiClientError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }
  const msg = sanitizeSecretText(
    err instanceof Error ? err.message : 'Unexpected server error',
    process.env.GEMINI_API_KEY
  );
  console.error('[API Error]', msg);
  res.status(500).json({
    error: 'Failed to process request.',
    code: 'INTERNAL_ERROR',
  });
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  // 1. Role & AQI tailored AI advice
  app.post('/api/advice', async (req: Request, res: Response) => {
    try {
      const base = validateBasePayload(req.body);
      const systemInstruction = [
        'You are Hawa Saathi, a practical outdoor air quality coach.',
        'Start directly with the most important step first. Do not include any greeting such as "Hello friend" or "Hi".',
        'Base mask advice specifically on the worker role, hours spent outside, and current AQI.',
        'Always mention that people with asthma, heart disease, children, and elders should consider wearing a mask even at Moderate AQI.',
        'Format steps as a plain numbered list (1., 2., 3.) under 95 words total. Do not use ** bold markdown symbols.',
        'Never invent fake AQI numbers. Never mention system internals.',
        languageInstruction(base.language),
      ].join(' ');

      const prompt = [
        `Worker role: ${base.role}`,
        `Hours spent outside: ${base.hoursOutside}`,
        `Location: ${base.locationName || 'Current area'}`,
        `Current AQI Band: ${base.aqiBand}${base.aqi !== undefined ? ` (US AQI ${base.aqi})` : ''}`,
        `Main pollutant: ${base.mainPollutant || 'PM2.5'}`,
        'Give practical outdoor protection advice starting with the top action.',
      ].join('\n');

      const result = await callGeminiWithFallback({
        feature: 'advice',
        role: base.role,
        aqiBand: base.aqiBand,
        aqi: base.aqi,
        hoursOutside: base.hoursOutside,
        mainPollutant: base.mainPollutant,
        language: base.language,
        question: `advice:${base.role}:${base.aqiBand}:${base.hoursOutside}:${base.mainPollutant ?? ''}`,
        systemInstruction,
        prompt,
      });

      res.json({
        ...result,
        answer: formatCoachReply(result.answer),
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 2. Outdoor Air Quality Chat Q&A (Two-layer guard)
  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const base = validateBasePayload(req.body);
      const rawQuestion = (req.body as Record<string, unknown>).question;
      const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : '';

      if (!question) {
        throw new GeminiClientError('Please type a question first.', 400, 'BAD_REQUEST');
      }
      if (question.length > MAX_QUESTION_CHARS) {
        throw new GeminiClientError(
          `Question must be under ${MAX_QUESTION_CHARS} characters.`,
          400,
          'BAD_REQUEST'
        );
      }

      const systemInstruction = [
        'You are Hawa Saathi, an honest air quality coach for outdoor workers.',
        'Only answer questions about air quality, pollution, masks, indoor air, routes, shift timing, and general pollution precautions.',
        'Start directly with the most important action first. Do not use any greeting like "Hello friend".',
        'Make mask advice depend on the worker role, hours spent outside, and AQI. Note that people with asthma, heart disease, children, and elders should consider a mask even at Moderate AQI.',
        'Never recommend specific medicine names or doses, and never write code.',
        'Use a plain numbered list (1., 2., 3.) under 110 words. Never use ** bold markdown symbols.',
        languageInstruction(base.language),
      ].join(' ');

      const prompt = [
        `Worker role: ${base.role}`,
        `Hours spent outside: ${base.hoursOutside}`,
        `Location: ${base.locationName || 'Current area'}`,
        `Current AQI Band: ${base.aqiBand}${base.aqi !== undefined ? ` (US AQI ${base.aqi})` : ''}`,
        `Main pollutant: ${base.mainPollutant || 'PM2.5'}`,
        `Question: ${question}`,
      ].join('\n');

      const result = await guardAndAnswerChat({
        role: base.role,
        aqiBand: base.aqiBand,
        aqi: base.aqi,
        hoursOutside: base.hoursOutside,
        mainPollutant: base.mainPollutant,
        locationName: base.locationName,
        language: base.language,
        question,
        systemInstruction,
        prompt,
      });

      res.json(result);
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 3. 24-Hour Outdoor Shift Plan
  app.post('/api/shift-plan', async (req: Request, res: Response) => {
    try {
      const base = validateBasePayload(req.body);
      const bodyObj = req.body as Record<string, unknown>;
      const shiftFocus =
        typeof bodyObj.shiftFocus === 'string'
          ? bodyObj.shiftFocus.trim().slice(0, 200)
          : 'Full outdoor day shift';

      const rawHourly = Array.isArray(bodyObj.hourly24) ? bodyObj.hourly24 : [];
      const hourly24: HourlyForecastInput[] = rawHourly
        .slice(0, 24)
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          hourLabel:
            typeof item.hourLabel === 'string' ? item.hourLabel.slice(0, 20) : 'Hour',
          us_aqi:
            typeof item.us_aqi === 'number' && Number.isFinite(item.us_aqi)
              ? Math.round(item.us_aqi)
              : null,
        }));

      const forecastSummary =
        hourly24.length > 0
          ? hourly24
              .map((h) => `${h.hourLabel}: ${h.us_aqi !== null ? h.us_aqi : 'N/A'}`)
              .join(', ')
          : 'Hourly forecast unavailable';

      const systemInstruction = [
        'You are Hawa Saathi, an outdoor shift planner.',
        'Start directly with the most important action first with zero greeting.',
        'Base mask advice on worker role, hours spent outside, and AQI, and remind that people with asthma, heart disease, children, and elders should consider a mask even at Moderate AQI.',
        'Format as a plain numbered list (1., 2., 3.) under 110 words with Best Hours, Peak Caution Hours, and Mask/Break Plan. Never use ** symbols.',
        'Use only the provided hourly AQI values.',
        languageInstruction(base.language),
      ].join(' ');

      const prompt = [
        `Worker role: ${base.role}`,
        `Hours spent outside: ${base.hoursOutside}`,
        `Shift focus: ${shiftFocus}`,
        `Current AQI Band: ${base.aqiBand}${base.aqi !== undefined ? ` (US AQI ${base.aqi})` : ''}`,
        `Main pollutant: ${base.mainPollutant || 'PM2.5'}`,
        `Next 24h US AQI forecast: ${forecastSummary}`,
      ].join('\n');

      const result = await callGeminiWithFallback({
        feature: 'shift_plan',
        role: base.role,
        aqiBand: base.aqiBand,
        aqi: base.aqi,
        hoursOutside: base.hoursOutside,
        mainPollutant: base.mainPollutant,
        language: base.language,
        question: `shift:${shiftFocus}:${base.hoursOutside}:${hourly24.map((h) => h.us_aqi ?? 'x').join(',')}`,
        hourly24,
        systemInstruction,
        prompt,
      });

      res.json({
        ...result,
        answer: formatCoachReply(result.answer),
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 4. Mask / Street Photo Audit
  app.post('/api/photo-audit', async (req: Request, res: Response) => {
    try {
      const base = validateBasePayload(req.body);
      const bodyObj = req.body as Record<string, unknown>;
      const mimeType = typeof bodyObj.mimeType === 'string' ? bodyObj.mimeType.trim() : '';
      const imageBase64 =
        typeof bodyObj.imageBase64 === 'string' ? bodyObj.imageBase64.trim() : '';
      const note =
        typeof bodyObj.note === 'string'
          ? bodyObj.note.trim().slice(0, 300)
          : 'Check mask fit or outdoor street exposure in this photo.';

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new GeminiClientError(
          'Unsupported image format. Upload JPEG, PNG, or WebP.',
          400,
          'BAD_REQUEST'
        );
      }
      if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
        throw new GeminiClientError(
          'Image is missing or larger than 5MB.',
          400,
          'BAD_REQUEST'
        );
      }
      if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
        throw new GeminiClientError('Invalid base64 image encoding.', 400, 'BAD_REQUEST');
      }

      const systemInstruction = [
        'You are Hawa Saathi inspecting a worker photo (mask fit, roadside workspace, or street haze).',
        'Start directly with the most important fix first. Do not use any greeting.',
        'Format as a plain numbered list (1., 2., 3.) under 100 words. Never use ** symbols.',
        languageInstruction(base.language),
      ].join(' ');

      const prompt = [
        `Worker role: ${base.role}`,
        `Hours spent outside: ${base.hoursOutside}`,
        `Current AQI Band: ${base.aqiBand}${base.aqi !== undefined ? ` (US AQI ${base.aqi})` : ''}`,
        `Main pollutant: ${base.mainPollutant || 'PM2.5'}`,
        `Worker note: ${note}`,
      ].join('\n');

      const result = await callGeminiWithFallback({
        feature: 'photo_audit',
        role: base.role,
        aqiBand: base.aqiBand,
        aqi: base.aqi,
        hoursOutside: base.hoursOutside,
        mainPollutant: base.mainPollutant,
        language: base.language,
        question: `photo:${note}`,
        systemInstruction,
        prompt,
        image: {
          mimeType,
          base64Data: imageBase64,
        },
      });

      res.json({
        ...result,
        answer: formatCoachReply(result.answer),
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  const distDir = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Hawa Saathi server listening on http://0.0.0.0:${port}`);
  });
}

// Only bind port when run directly (not when imported in tests)
const entryScript = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryScript === __filename) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
