# Communication Coach

A focused communication practice app with three modes:

- Live Coach
- Conversation
- Interview

## Development

```bash
npm install
npm run server
npm run dev
```

The API runs on port 3001 and the Vite app runs on port 5173.

For voice mode, use a Chromium-based browser and allow microphone access.

## Reviewing sessions

Live Coach and Interview sessions record the camera + microphone while you speak. The recording is uploaded to the API and stored in `recordings/`, while the transcript, score, metrics, and coaching markers are saved in `communication_agent.db`.

Open the **History** tab to replay a past session, jump to a coaching marker, and read the transcript. Marker buttons also appear on the results page right after a session ends. Allow camera and microphone access, and keep `npm run server` running so recordings can be saved and played back.
