# Hawa Saathi — Security & Threat Model

## 1. System Overview & Trust Boundaries
Hawa Saathi uses a React + TypeScript browser frontend served alongside a Node/Express backend (`server.ts`):
- **Untrusted Browser Boundary**: User chat inputs, role selections, city queries, family profiles, journeys, and uploaded images enter through HTTP POST routes (`/api/*`). Client state stays in browser memory (family plan) or non-sensitive `localStorage` preferences (role, city, language).
- **Trusted Backend Boundary (`server.ts`)**: Holds `GEMINI_API_KEY` exclusively on the server, validates and sanitizes all JSON request bodies, enforces fixed-window per-IP rate limiting, applies security response headers, runs a two-layer safety check on chat questions, and executes Gemini API calls with automatic model fallback and deterministic fallbacks.
- **External Services**:
  - **Open-Meteo Air Quality & Geocoding APIs** (public HTTPS endpoints called directly by the browser for live AQI and city search; coordinate bounds validated before dispatch).
  - **Google Gemini API (`@google/genai`)** (called strictly server-side from `server/geminiFallback.ts`).

## 2. Primary Threats & Mitigations

| Threat | Entry Point | Mitigation Implemented | Verification |
| :--- | :--- | :--- | :--- |
| API key exposure in client bundle, logs, or responses | Client JS, HTTP error messages, console logs | Key read only from server `process.env.GEMINI_API_KEY`; `VITE_GEMINI_*` never used; `sanitizeSecretText()` strips key patterns before logging or returning errors; server errors return generic `"Service temporarily unavailable"` messages. | `server/geminiFallback.test.ts`, `scripts/a11yCheck.test.ts` |
| Prompt injection & system-prompt / secret extraction | `/api/chat`, `/api/family-plan` | Layer-1 deterministic injection regex check + Gemini classifier refuses injection attempts; system prompts isolate untrusted user text; Layer-2 post-check blocks secret patterns (`AIza...`, `GEMINI_API_KEY`, `system prompt`), code blocks, and ungrounded medical dosages. | `server/chatGuard.test.ts`, `server/serverSecurity.test.ts` |
| Unsafe medical or emergency advice | `/api/chat` | Emergency keyword and classifier detection returns immediate hospital/108/112 action steps; medical dosage queries return safe non-diagnostic clinic guidance. | `server/chatGuard.test.ts`, `server/serverSecurity.test.ts` |
| Fabricated numeric estimates in Family Plan | `/api/family-plan` | Weekly CO2, PM2.5 exposure scores, and "what-if" savings are calculated deterministically in `src/services/familyPlanCalc.ts`; Gemini only ranks and summarizes server-computed scenarios, with strict validation rejecting hallucinated IDs or tampered figures. | `src/services/familyPlanCalc.test.ts`, `server/familyPlan.test.ts` |
| Malformed, oversized, or unvalidated payloads | `/api/*` | Centralized schema validators (`server/validation.ts`) enforce type checks, role/language whitelists, finite numeric bounds (`aqi` 0–1000, `hoursOutside` 1–24, `distanceKm` 0–200, `daysPerWeek` 0–7), max string lengths, and valid base64/MIME checks on images (`limit: 8mb`). | `server/serverSecurity.test.ts` |
| Automated abuse / quota exhaustion | `/api/*` | Fixed-window per-IP rate limiter (`createRateLimiter` in `server/security.ts`, default 60 req/min/IP) returns HTTP `429` with `Retry-After` and standard rate-limit headers; server response caching avoids repeat Gemini calls. | `server/serverSecurity.test.ts`, `server/geminiFallback.test.ts` |
| Cross-site injection, MIME sniffing, referrer leakage | All HTTP responses & HTML export | `securityHeadersMiddleware` sets `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`, and disables `X-Powered-By`. Printable HTML plan escapes all dynamic fields (`escapeHtml`). React bindings avoid `dangerouslySetInnerHTML`. | `server/serverSecurity.test.ts`, `scripts/a11yCheck.test.ts` |

## 3. Residual Risks & Operational Notes
- **In-memory rate limiting & caching**: Rate-limit counters and response caches live in Node process memory; a horizontally scaled multi-instance deployment should back these with a shared store (e.g., Redis) if strict global limits are required.
- **Third-party API availability & regional resolution**: Open-Meteo provides modelled regional estimates rather than street-level sensor readings, and Gemini throughput remains subject to upstream API quota limits.
- **No user authentication**: The app holds no user accounts, passwords, or persisted family data; all family plan data stays strictly in browser session memory.
