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

**Single-server mode (works online or fully offline, recommended):**

```bash
npm run build
npm start
```

Open `http://localhost:3001`. The Express server serves both the built app and the API, so no Vite dev server and no internet connection are needed at runtime. Use this for offline use.

**Development mode (hot reload):**

```bash
npm run server
npm run dev
```

The API runs on port 3001 and the Vite app runs on port 5173. If you change `PORT`, set `VITE_API_URL` for the dev server (see `.env.example`); production builds detect the API automatically.

Copy `.env.example` to `.env` to configure it. `GEMINI_API_KEY` is optional and is read **only by the server** (never bundled into the browser). Without a key, the app uses the local mock scoring engine and works fully offline.

By default the server binds to `127.0.0.1` only, so recordings and History are not reachable from other devices. If you deliberately want LAN access, set `HOST=0.0.0.0` **and** set `APP_PASSCODE` to require a login. With a passcode configured, the app shows a lock screen; use the lock icon in the top bar to clear the saved passcode. The passcode is stored in that browser's `localStorage` and sent with every API and recording request.

## Online vs offline mode

Use the **Online / Offline** toggle in the top bar to switch how speech is handled:

- **Online** (default): live transcription uses the browser Web Speech API, so use a Chromium-based browser (Chrome/Edge) with internet access.
- **Offline**: your microphone audio is sent to a local Whisper service for speech-to-text (S2T), and the coach's spoken replies/questions use the browser's built-in text-to-speech (T2S) with locally installed voices. No Google service and no internet are required.

To run fully offline, start a local Whisper HTTP service that accepts raw audio and returns JSON with `text` and optionally `words` (each with `word`, `start`, `end`). For example, with [whisper.cpp](https://github.com/ggml-org/whisper.cpp) in server mode:

```bash
./server -m models/ggml-base.en.bin --port 8080
```

Then set `WHISPER_URL=http://localhost:8080/inference` in `.env`. Whisper's word timings are used to place coaching markers at the exact moment in the recording where each issue occurred.

In **Online** mode no extra service is needed: the app derives word onsets from the browser's incremental recognition results (each word is timestamped when it first appears, then finalized when the result is locked in). Both modes save a `wordTimings` array with the session, and coaching markers are aligned to it, so marker buttons jump to the actual moment a phrase was spoken instead of a fixed fraction of the recording. Whisper remains the most precise source; browser-derived timings are event-based estimates at the word level.

## Reviewing sessions

Live Coach and Interview sessions record the camera + microphone while you speak. The recording is uploaded to the API and stored in `recordings/`, while the transcript, score, metrics, and coaching markers are saved in `communication_agent.db`.

Open the **History** tab to replay a past session, jump to a coaching marker, and read the transcript. Search, mode filtering, sorting, and pagination all run on the server, so only one page of sessions is sent at a time. You can select multiple sessions with checkboxes and bulk-delete them, or delete a single session with a custom confirmation dialog (no browser `alert`/`confirm`). Video exports stream from the server instead of loading the whole file into browser memory. Marker buttons also appear on the results page right after a session ends.

The **Progress** tab shows your score trend, average metric scores, and attempt-to-attempt changes, aggregated server-side. When you practice a mode again, the app links your new attempt to the previous one and computes real score/metric deltas. Coaching markers are aligned to saved word timings (Whisper offline, browser recognition events online), so marker buttons jump to the moment an issue happened. Results show whether feedback came from Gemini AI or the local mock engine, and sessions with no detected speech are rejected instead of being scored against placeholder text.

Scoring is deterministic: Gemini calls use temperature 0 with a fixed seed, and the local mock engine derives every metric from measurable transcript signals (filler rate, sentence length, specificity, structure, pace, lexical diversity). Re-evaluating the same answer produces the same score, and weak vs strong answers spread across the 1–10 range instead of clustering near 7.

Recordings older than `RECORDING_RETENTION_DAYS` (default 30, set to 0 to disable) are removed automatically on server start and after uploads; transcripts and scores are kept. History shows current storage usage with a manual cleanup button.

Allow camera and microphone access, and keep `npm run server` running so recordings can be saved and played back.
