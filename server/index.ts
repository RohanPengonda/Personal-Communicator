import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { getDb, initDatabase } from './db.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const recordingsDir = path.resolve(process.cwd(), 'recordings');

app.use(cors());
app.use(express.json());

mkdir(recordingsDir, { recursive: true }).catch((error) => {
  console.error('Could not create recordings directory:', error);
});
app.use('/recordings', express.static(recordingsDir));

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
      oneThingToPractice: row.one_thing_to_practice,
      mediaUrl: row.media_url || undefined
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
        attempt_number, previous_attempt_id, deltas_json, one_thing_to_practice, media_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      session.oneThingToPractice,
      session.mediaUrl || null
    ]);
    res.json({ success: true, id: session.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post(
  '/api/recordings/:id',
  express.raw({ type: ['video/*', 'audio/*', 'application/octet-stream'], limit: '200mb' }),
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || !Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: 'Invalid recording payload' });
        return;
      }

      const contentType = req.headers['content-type'] || 'video/webm';
      const extension = contentType.includes('mp4') ? 'mp4' : 'webm';
      const filename = `${id}.${extension}`;

      await mkdir(recordingsDir, { recursive: true });
      await writeFile(path.join(recordingsDir, filename), req.body);

      res.json({
        success: true,
        url: `${req.protocol}://${req.get('host')}/recordings/${filename}`
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

app.get('/api/conversations', async (_req, res) => {
  try {
    const database = await getDb();
    const rows = await database.all(
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 50'
    );
    res.json(rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      utterances: JSON.parse(row.utterances_json)
    })));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/conversations', async (req, res) => {
  try {
    const conversation = req.body;
    const database = await getDb();
    await database.run(`
      INSERT INTO conversations (id, title, updated_at, utterances_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at,
        utterances_json = excluded.utterances_json
    `, [
      conversation.id,
      conversation.title,
      conversation.updatedAt,
      JSON.stringify(conversation.utterances)
    ]);
    res.json({ success: true, id: conversation.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const database = await getDb();
    await database.run('DELETE FROM conversations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Communication Coach API listening on port ${PORT}`);
});
