# Hawa Saathi

A mobile-first outdoor air quality coach built for delivery riders, cab/auto drivers, street vendors, traffic police, and everyday citizens.

## Features

- **Role-Based Guidance**: Remembers your outdoor work role and tailors mask, break, and route tips based on hours spent outside.
- **Live Air Quality & 24h Forecast**: Uses browser GPS or city search via the free Open-Meteo Air Quality & Geocoding APIs (`us_aqi`, PM2.5, PM10, NO₂, O₃, CO, and next-24-hour chart). Shows honest error states instead of placeholder numbers.
- **AI Coach & Floating Chat**: Role-aware advice, 24-hour shift planning, mask/street photo audits, and a floating chat widget in English, Hindi, and Hinglish.
- **Model Fallback & Safety Guards**: Server-side `/api/*` routes automatically fall back across `GEMINI_MODELS` (with 429 cooldowns, 5-minute caching, and rule-based fallback) and enforce two-layer topic/medical/emergency guards on chat.

## Setup & Commands

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env` (see `.env.example`):
   - `GEMINI_API_KEY`: Server-side Gemini API key (optional—falls back to built-in rule-based advice if unavailable).
   - `GEMINI_MODELS`: Optional comma-separated fallback model list.
3. Run locally on port `3000`:
   ```bash
   npm run dev
   ```
4. Run tests, typecheck, or production build:
   ```bash
   npm test
   npm run lint
   npm run build
   npm start
   ```
