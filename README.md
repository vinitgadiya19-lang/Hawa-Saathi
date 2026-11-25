# Hawa Saathi: Outdoor Air Quality Coach

**Live app:** https://hawa-saathi-4ey3.vercel.app/

Most air quality apps say "stay indoors". That doesn't help delivery riders, cab and auto drivers, street vendors or traffic police, who must work outside. Hawa Saathi gives them simple, role-specific guidance based on live air quality.

## Features
- **Role-based advice:** choose Delivery Rider, Cab/Auto Driver, Street Vendor, Traffic Police or General, and get short, practical steps.
- **Live AQI:** use GPS or search any city. Data comes from Open-Meteo (US AQI, main pollutant, 24-hour forecast).
- **AI chatbot:** answers air quality questions in simple steps, in English, Hindi and Marathi, using the user's role and current AQI.

## How Gemini is used
- The chatbot and advice run on the server through the Gemini API with a strict system prompt.
- A pre-check classifies each message (on-topic, off-topic, medical, emergency, injection attempt) before any answer is generated.
- Automatic fallback across several Gemini models if one hits its quota, then a rule-based answer if all fail.

## Tech
React + TypeScript, Node server routes, Gemini API, Open-Meteo.

## Setup
1. Clone the repo and run `npm install`.
2. Set environment variables: `GEMINI_API_KEY` and `GEMINI_MODELS` (comma-separated model list).
3. Run `npm run dev`. Run tests with `npm test`.


## Safety and limitations
- Guidance only, not medical advice. The bot never diagnoses or suggests medicines, and tells users to seek medical help for emergencies.
- AQI values are modelled regional estimates and may differ from a specific street.
- Usage depends on API quotas.

## Challenge
Built for Google PromptWars, Challenge 6: Urban Air Quality Assistant.
