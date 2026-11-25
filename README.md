# Hawa Saathi — Outdoor Air Quality Coach & Family Plan

**Live app:** https://hawa-saathi-4ey3.vercel.app/

## Problem
Most air quality apps offer one generic instruction: *"stay indoors"*. That advice does not work for delivery riders, cab and auto drivers, street vendors, traffic police, or families navigating winter smog across daily school runs and commutes.

## Who It Is For
- **Outdoor Workers:** Delivery Riders, Cab/Auto Drivers, Street Vendors, Traffic Police, and Everyday Citizens.
- **Urban Households:** Families balancing children, seniors, daily commutes, indoor cooking fuels, and practical clean-air budgets.

## Features
- **Role-Based Outdoor Coach (`Live Coach`):** Practical, shift-aware precautions grounded in live US AQI, outer hours spent outdoors, and the dominant pollutant (`PM2.5`, `PM10`, `NO2`, `O3`, `CO`).
- **Live AQI & 24-Hour Forecast:** Uses GPS or debounced city search via Open-Meteo (with response caching and an interactive accessible bar chart + hourly data table).
- **Floating Multilingual AI Coach:** Available across all screens in English, Hindi, and Hinglish/Marathi-friendly replies, with keyboard focus trapping and `aria-live` announcements.
- **Family Plan (4 Sections):**
  1. **My Family & Journey:** Session-only profile for 1–6 family members (age & health notes), daily trips, home setup, and a `"Load sample family"` demo mode plus `"How we calculate"` emission/exposure factors table.
  2. **Low-Emission Steps:** Unlocks after family and journey input; ranks 5 tailored actions using deterministic savings (clean-hour shifts, walking/cycling short trips, metro/bus switches, carpooling, induction cooking).
  3. **Indoor Air Hacks:** Slide-down checklist ordered Free, Low-cost, and Invest (cleanest-hour ventilation, exhaust use, Corsi-Rosenthal DIY guide, room CADR calculator, and purifier safety notes).
  4. **Impact Insights:** Weekly CO2 now vs. after chart, member exposure ranking (highlighting children & seniors), 3-sentence English/Hindi/Marathi summary, confidence bounds, and printable HTML plan download.

## Architecture
- **Frontend (`src/`):** React 19 + TypeScript (strict mode) + Vite + Tailwind CSS v4. Heavy tabs (`FamilyPlanPage`) are code-split via `React.lazy`. All Open-Meteo requests are deduplicated and cached client-side.
- **Backend (`server.ts`, `server/`):** Express server handling all `/api/*` routes (`advice`, `chat`, `shift-plan`, `photo-audit`, `family-plan`), centralized input validation/sanitization (`server/validation.ts`), security headers + fixed-window rate limiting (`server/security.ts`), chat safety guards (`server/chatGuard.ts`), and Gemini orchestration (`server/geminiFallback.ts`).

## How Google Services Are Used
- **Google Gemini API (`@google/genai`):** All AI calls run exclusively on the Node server using `GEMINI_API_KEY` (never shipped to the browser).
  - **Multi-Model Automatic Fallback:** `server/geminiFallback.ts` iterates sequentially through `GEMINI_MODELS` (comma-separated, defaulting to Flash-class models). When a model returns HTTP 429 quota/rate-limit or transient errors, the server logs a key-sanitized warning and seamlessly falls back to the next configured model, or to a deterministic rule-based response (`server/ruleBasedFallback.ts`) if all models fail.
  - **Strict Structured Output & Grounding:** Chat pre-check classification and Family Plan ranking enforce JSON schemas (`Type.OBJECT` / `responseMimeType: 'application/json'`). Family CO2 and exposure numbers are computed deterministically in code (`src/services/familyPlanCalc.ts`)—Gemini ranks and explains provided numbers without inventing metrics.
- **Google AI Studio:** Used to prototype, test, and configure runtime secrets (`GEMINI_API_KEY`) and preview environment hosting for the full-stack Vite + Express applet.

## How to Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables (never commit `.env` or real keys):
   ```bash
   cp .env.example .env
   ```
   Set `GEMINI_API_KEY` and optional `GEMINI_MODELS` (comma-separated model IDs).
3. Start development server on port `3000`:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   npm start
   ```

## How to Test & Verify
- **Run full automated test suite:** `npm test`
- **Run tests with coverage report:** `npm run test:coverage`
- **Run TypeScript & ESLint checks:** `npm run lint` (`tsc --noEmit && eslint .`)
- **Automated CI:** `.github/workflows/ci.yml` executes install, ESLint, TypeScript check, test coverage, and Vite production build on every push and pull request.

## Safety & Limitations
- **Guidance only, not medical advice:** The assistant never diagnoses illnesses or suggests medicines/dosages, and directs emergency symptoms immediately to emergency care (`108` / `112` / `911`).
- **Modelled estimates:** AQI values from Open-Meteo are regional modelled estimates and may differ from street-level conditions. Transport CO2 and breathing exposure numbers are labelled estimates, not measured clinical outcomes.
- **Quota dependency:** AI responses depend on configured Gemini API quotas; built-in caching and rule-based fallbacks preserve core app utility when AI quota is exhausted.

## Documentation
- [Security & Threat Model](docs/SECURITY.md)
- [Challenge Requirements Alignment](docs/REQUIREMENTS.md)

## Challenge
Built for Google PromptWars, Challenge 6: Urban Air Quality Assistant.
