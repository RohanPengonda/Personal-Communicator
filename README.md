# Communication Coach

A focused communication practice app with three modes:

- Live Coach
- Conversation
- Interview

## Running the app

Install once:

```bash
npm install
```

**Single-server mode (recommended):**

```bash
npm run build
npm start
```

Open `http://localhost:3001`. The Express server serves both the built app and the API, so no separate Vite dev server is needed at runtime. Internet access is still required for browser speech recognition and AI features.

**Development mode (hot reload):**

```bash
npm run dev:all
```

This starts both the API server and the Vite app together. Alternatively, run `npm run server` and `npm run dev` in two separate terminals. The API runs on port 3001 and the Vite app runs on port 5173. If you change `PORT`, set `VITE_API_URL` for the dev server (see `.env.example`); production builds detect the API automatically.

Copy `.env.example` to `.env` to configure it. AI keys are read **only by the server** (never bundled into the browser). Set `GEMINI_API_KEY` and/or `OPENROUTER_API_KEY`. Gemini is tried first; if it fails or hits its quota, the same request automatically retries with OpenRouter. OpenRouter uses `openrouter/free` by default and appends `:online` for web-sourced interviews (a small per-search fee still applies). Without either key, non-interview modes use the local mock scoring engine, but interviews still require a configured AI provider.

By default the server binds to `127.0.0.1` only, so recordings and History are not reachable from other devices. If you deliberately want LAN access, set `HOST=0.0.0.0` **and** set `APP_PASSCODE` to require a login. With a passcode configured, the app shows a lock screen; use the lock icon in the top bar to clear the saved passcode. The passcode is stored in that browser's `localStorage` and sent with every API and recording request.

## Online speech and transcription

The app runs in online mode only. Live transcription uses the browser Web Speech API, so use a Chromium-based browser (Chrome/Edge) with internet access. There is no offline or Whisper transcription mode.

No extra speech-to-text service is needed: the app derives word onsets from the browser's incremental recognition results (each word is timestamped when it first appears, then finalized when the result is locked in). Sessions save a `wordTimings` array, and coaching markers are aligned to it, so marker buttons jump to the actual moment a phrase was spoken instead of a fixed fraction of the recording. These timings are event-based estimates at the word level.

## Interview practice

The Interview tab is a spoken, ChatGPT-style mock interview. Choose a role preset (General HR, Behavioral, Software Engineer, Data Analyst, Product Manager, Sales) or type a role into the text area. You can also paste your own questions there — one per line — and the interviewer will use them in order before generating role-relevant follow-ups.

Questions, feedback, and model answers come from the configured AI provider with live web search. Gemini is tried first; on quota or other failures the app falls back to OpenRouter's free model router with `:online`, which adds web-sourced citations (a small per-search fee still applies). If web grounding itself is unavailable, the interview retries without grounding so it can continue. After each spoken answer, the AI gives honest feedback, an accurate model answer (correcting mistakes), and an optional probing follow-up before moving to the next question. Answers end automatically after a short pause, with a "Done answering" button as an override. The interviewer speaks each question and reply using browser text-to-speech.

Voice answers are required; the camera is optional and off by default. When the camera is enabled, the video is recorded and saved with the session. Interviews require a configured AI provider and web access. Each saved session stores the full Q&A, per-answer scores, feedback, model answers, and sources, and it appears in History and Progress like other sessions.

## Reviewing sessions

Live Coach sessions record the camera + microphone while you speak. Interview sessions record them only when you turn on the optional camera; voice is always required. Recordings are uploaded to the API and stored in `recordings/`, while the transcript, score, metrics, coaching markers, and interview Q&A are saved in `communication_agent.db`.

Open the **History** tab to replay a past session, jump to a coaching marker, and read the transcript. Search, mode filtering, sorting, and pagination all run on the server, so only one page of sessions is sent at a time. You can select multiple sessions with checkboxes and bulk-delete them, or delete a single session with a custom confirmation dialog (no browser `alert`/`confirm`). Video exports stream from the server instead of loading the whole file into browser memory. Marker buttons also appear on the results page right after a session ends.

The **Progress** tab shows your score trend, average metric scores, and attempt-to-attempt changes, aggregated server-side. When you practice a mode again, the app links your new attempt to the previous one and computes real score/metric deltas. Coaching markers are aligned to saved word timings from browser recognition events, so marker buttons jump to the moment an issue happened. Results show whether feedback came from an AI provider (Gemini or OpenRouter) or the local mock engine, and sessions with no detected speech are rejected instead of being scored against placeholder text.

The local mock engine derives every metric from measurable transcript signals (filler rate, sentence length, specificity, structure, pace, lexical diversity), so it is fully deterministic. AI scoring is prompt-guided and may vary slightly between runs; weak vs strong answers still spread across the 1–10 range instead of clustering near 7.

Recordings older than `RECORDING_RETENTION_DAYS` (default 30, set to 0 to disable) are removed automatically on server start and after uploads; transcripts and scores are kept. History shows current storage usage with a manual cleanup button.

Allow camera and microphone access, and keep `npm run server` running so recordings can be saved and played back.
