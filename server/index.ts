import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { getDb, initDatabase } from './db.ts';
import { evaluateSession, generateConversationReply } from './aiService.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const recordingsDir = path.resolve(process.cwd(), 'recordings');
const distDir = path.resolve(process.cwd(), 'dist');
const retentionDays = Number(process.env.RECORDING_RETENTION_DAYS || 30);
const whisperUrl = process.env.WHISPER_URL || 'http://localhost:8080/inference';

app.use(cors());
app.use(express.json());
app.use('/recordings', express.static(recordingsDir));

function recordingPath(mediaUrl?: string | null): string | null {
  if (!mediaUrl) return null;
  try {
    const filename = path.basename(new URL(mediaUrl).pathname);
    if (/^[a-zA-Z0-9_-]+\.(webm|mp4)$/.test(filename)) {
      return path.join(recordingsDir, filename);
    }
  } catch {
    // Ignore malformed URLs from old records.
  }
  return null;
}

async function removeRecording(mediaUrl?: string | null) {
  const file = recordingPath(mediaUrl);
  if (!file) return;
  try {
    await unlink(file);
  } catch {
    // Already gone — nothing to clean up.
  }
}

async function cleanupExpiredRecordings() {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;

  const database = await getDb();
  const rows = await database.all(
    'SELECT id, timestamp, media_url FROM sessions WHERE media_url IS NOT NULL'
  );
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const row of rows) {
    if (new Date(row.timestamp).getTime() < cutoff) {
      await removeRecording(row.media_url);
      await database.run('UPDATE sessions SET media_url = NULL WHERE id = ?', [row.id]);
      removed += 1;
    }
  }
  return removed;
}

app.post('/api/evaluate', async (req, res) => {
  try {
    res.json(await evaluateSession(req.body));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/conversation-reply', async (req, res) => {
  try {
    const reply = await generateConversationReply(req.body.transcript || '', req.body.history || []);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post(
  '/api/transcribe',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '200mb' }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: 'Invalid audio payload' });
        return;
      }
      const response = await fetch(whisperUrl, {
        method: 'POST',
        headers: { 'Content-Type': String(req.headers['content-type'] || 'audio/webm') },
        body: new Uint8Array(req.body),
        signal: AbortSignal.timeout(120000)
      });
      if (!response.ok) throw new Error(`Whisper service returned HTTP ${response.status}`);
      const data = await response.json() as any;
      const rawWords: any[] = data.words ?? data.segments?.flatMap((segment: any) => segment.words ?? []) ?? [];
      const wordTimings = rawWords
        .map((word) => ({
          word: String(word.word ?? word.text ?? '').trim(),
          start: Number(word.start ?? 0),
          end: Number(word.end ?? 0)
        }))
        .filter((word) => word.word.length > 0);
      res.json({ text: String(data.text ?? ''), wordTimings });
    } catch (error) {
      res.status(503).json({ error: `Local transcription unavailable: ${(error as Error).message}` });
    }
  }
);

app.get('/api/storage', async (_req, res) => {
  try {
    const database = await getDb();
    const rows = await database.all('SELECT media_url FROM sessions WHERE media_url IS NOT NULL');
    let bytes = 0;
    let count = 0;

    for (const row of rows) {
      const file = recordingPath(row.media_url);
      if (!file) continue;
      try {
        const info = await stat(file);
        bytes += info.size;
        count += 1;
      } catch {
        // File missing — the next cleanup pass will clear its reference.
      }
    }
    res.json({ bytes, count, retentionDays });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/sessions', async (_req, res) => {
  try {
    const database = await getDb();
    const rows = await database.all('SELECT * FROM sessions ORDER BY timestamp DESC');
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
      mediaUrl: row.media_url || undefined,
      evaluationSource: row.evaluation_source || undefined,
      wordTimings: row.word_timings_json ? JSON.parse(row.word_timings_json) : undefined
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
        attempt_number, previous_attempt_id, deltas_json, one_thing_to_practice, media_url,
        evaluation_source, word_timings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      session.mediaUrl || null,
      session.evaluationSource || null,
      session.wordTimings ? JSON.stringify(session.wordTimings) : null
    ]);
    res.json({ success: true, id: session.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid session id' });
      return;
    }

    const database = await getDb();
    const row = await database.get('SELECT media_url FROM sessions WHERE id = ?', [id]);
    if (row) await removeRecording((row as any).media_url);
    await database.run('DELETE FROM sessions WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/recordings/cleanup', async (_req, res) => {
  try {
    const removed = await cleanupExpiredRecordings();
    res.json({ success: true, removed });
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
      void cleanupExpiredRecordings().catch((error) => {
        console.warn('Recording cleanup failed:', error);
      });

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

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// When a production build exists, serve the whole app from this one server so
// no Vite process (or internet connection) is needed at runtime.
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

async function start() {
  await mkdir(recordingsDir, { recursive: true });
  await initDatabase();
  const removed = await cleanupExpiredRecordings();
  if (removed > 0) console.log(`Removed ${removed} expired recording(s).`);
  app.listen(PORT, () => {
    const mode = existsSync(path.join(distDir, 'index.html')) ? 'app + API' : 'API only';
    console.log(`Communication Coach ${mode} listening on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Server startup failed:', error);
  process.exitCode = 1;
});
