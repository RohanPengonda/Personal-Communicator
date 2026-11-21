import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getDb, initDatabase } from './db.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

initDatabase().catch((error) => {
  console.error('Database initialization failed:', error);
});

app.get('/api/sessions', async (_req, res) => {
  try {
    const database = await getDb();
    const rows = await database.all('SELECT * FROM sessions ORDER BY timestamp DESC LIMIT 20');
    res.json(rows.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      mode: row.mode,
      modeLabel: row.mode_label,
      durationSeconds: row.duration_seconds,
      contextPrompt: row.context_prompt,
      targetAudience: row.target_audience,
      transcript: row.transcript,
      score: row.score,
      utterances: JSON.parse(row.utterances_json),
      metrics: JSON.parse(row.metrics_json),
      replays: JSON.parse(row.replays_json),
      whyCoaching: JSON.parse(row.why_coaching_json),
      attemptNumber: row.attempt_number,
      previousAttemptId: row.previous_attempt_id,
      deltas: row.deltas_json ? JSON.parse(row.deltas_json) : undefined,
      oneThingToPractice: row.one_thing_to_practice
    })));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const session = req.body;
    const database = await getDb();
    await database.run(`
      INSERT INTO sessions (
        id, timestamp, mode, mode_label, duration_seconds, context_prompt, target_audience,
        transcript, score, utterances_json, metrics_json, replays_json, why_coaching_json,
        attempt_number, previous_attempt_id, deltas_json, one_thing_to_practice
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      session.id,
      session.timestamp,
      session.mode,
      session.modeLabel,
      session.durationSeconds,
      session.contextPrompt,
      session.targetAudience || null,
      session.transcript,
      session.score,
      JSON.stringify(session.utterances),
      JSON.stringify(session.metrics),
      JSON.stringify(session.replays),
      JSON.stringify(session.whyCoaching),
      session.attemptNumber || 1,
      session.previousAttemptId || null,
      session.deltas ? JSON.stringify(session.deltas) : null,
      session.oneThingToPractice
    ]);
    res.json({ success: true, id: session.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Communication Coach API listening on port ${PORT}`);
});
