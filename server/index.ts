import './env.ts';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { existsSync } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { getDb, initDatabase } from './db.ts';
import {
  evaluateSession,
  generateConversationReply,
  generateInterviewStart,
  generateInterviewTurn
} from './aiService.ts';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const recordingsDir = path.resolve(process.cwd(), 'recordings');
const distDir = path.resolve(process.cwd(), 'dist');
const retentionDays = Number(process.env.RECORDING_RETENTION_DAYS || 30);
const whisperUrl = process.env.WHISPER_URL || 'http://localhost:8080/inference';
const appPasscode = process.env.APP_PASSCODE || '';

app.use(cors());
app.use(express.json());

// Optional single-user gate. Empty passcode = no login screen. Tokens are not
// used: the same passcode is sent as a header by the app and as a query param
// by <video> elements, which cannot set headers.
app.get('/api/auth-status', (_req, res) => res.json({ enabled: !!appPasscode }));
app.use(['/api', '/recordings'], (req, res, next) => {
  if (!appPasscode || req.path === '/auth-status') return next();
  const supplied = req.get('x-app-passcode') || String(req.query.passcode || '');
  if (supplied === appPasscode) return next();
  res.status(401).json({ error: 'Passcode required' });
});

app.use('/recordings', express.static(recordingsDir));
app.use('/recordings', (_req, res) => res.status(404).json({ error: 'Recording not found' }));

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

app.post('/api/interview/start', async (req, res) => {
  try {
    res.json(await generateInterviewStart({
      role: req.body?.role || 'General',
      customQuestions: Array.isArray(req.body?.customQuestions) ? req.body.customQuestions : []
    }));
  } catch (error) {
    res.status(503).json({ error: (error as Error).message });
  }
});

app.post('/api/interview/turn', async (req, res) => {
  try {
    res.json(await generateInterviewTurn({
      role: req.body?.role || 'General',
      question: req.body?.question || '',
      answer: req.body?.answer || '',
      history: Array.isArray(req.body?.history) ? req.body.history : [],
      customQuestions: Array.isArray(req.body?.customQuestions) ? req.body.customQuestions : [],
      askedQuestions: Array.isArray(req.body?.askedQuestions) ? req.body.askedQuestions : [],
      isFollowUp: !!req.body?.isFollowUp
    }));
  } catch (error) {
    res.status(503).json({ error: (error as Error).message });
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

function mapSession(row: any) {
  return {
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
    wordTimings: row.word_timings_json ? JSON.parse(row.word_timings_json) : undefined,
    interviewQa: row.interview_qa_json ? JSON.parse(row.interview_qa_json) : undefined
  };
}

app.get('/api/sessions', async (req, res) => {
  try {
    const database = await getDb();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const mode = typeof req.query.mode === 'string' && req.query.mode !== 'ALL'
      ? req.query.mode : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const sortBy = ['date', 'score', 'duration'].includes(String(req.query.sortBy))
      ? String(req.query.sortBy) : 'date';
    const scoreMin = Number(req.query.scoreMin);
    const scoreMax = Number(req.query.scoreMax);
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : '';

    const clauses: string[] = [];
    const params: any[] = [];
    if (mode) { clauses.push('mode = ?'); params.push(mode); }
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      clauses.push('(LOWER(transcript) LIKE ? OR LOWER(mode_label) LIKE ? OR LOWER(context_prompt) LIKE ?)');
      params.push(like, like, like);
    }
    if (Number.isFinite(scoreMin)) { clauses.push('score >= ?'); params.push(scoreMin); }
    if (Number.isFinite(scoreMax)) { clauses.push('score <= ?'); params.push(scoreMax); }
    if (dateFrom) { clauses.push('timestamp >= ?'); params.push(dateFrom); }
    if (dateTo) { clauses.push('timestamp <= ?'); params.push(dateTo); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = sortBy === 'score'
      ? 'score DESC, timestamp DESC'
      : sortBy === 'duration'
        ? 'duration_seconds DESC, timestamp DESC'
        : 'timestamp DESC';

    const countRow = await database.get(`SELECT COUNT(*) AS count FROM sessions ${where}`, params);
    const total = Number((countRow as any)?.count ?? 0);
    const rows = await database.all(
      `SELECT * FROM sessions ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({
      items: rows.map(mapSession),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize))
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/sessions/latest', async (_req, res) => {
  try {
    const database = await getDb();
    const rows = await database.all('SELECT * FROM sessions ORDER BY timestamp DESC');
    const latest: Record<string, any> = {};
    rows.forEach((row: any) => {
      if (!latest[row.mode]) latest[row.mode] = mapSession(row);
    });
    res.json(latest);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/sessions/stats', async (_req, res) => {
  try {
    const database = await getDb();
    const rows = await database.all('SELECT * FROM sessions ORDER BY timestamp ASC');
    const scores = rows.map((row: any) => Number(row.score));
    const newest = scores.length ? new Date(rows[rows.length - 1].timestamp).getTime() : 0;
    const weekAgo = newest - 7 * 24 * 60 * 60 * 1000;
    const metricKeys = ['clarity', 'confidence', 'engagement', 'structure', 'conciseness', 'storytelling'];
    const averages: Record<string, number> = {};
    metricKeys.forEach((key) => {
      const values = rows.map((row: any) => Number(JSON.parse(row.metrics_json)[key] || 0));
      averages[key] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    });

    const byMode: Record<string, any[]> = {};
    rows.forEach((row: any) => {
      (byMode[row.mode] ??= []).push(row);
    });
    const comparisons: any[] = [];
    Object.values(byMode).forEach((list) => {
      const ordered = list.slice().sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      for (let index = 0; index < Math.min(3, ordered.length - 1); index += 1) {
        const current = ordered[index];
        const previous = ordered[index + 1];
        const change = current.score - previous.score;
        comparisons.push({
          id: current.id,
          mode: current.mode,
          timestamp: current.timestamp,
          previousScore: previous.score,
          score: current.score,
          changePct: previous.score ? Math.round((change / previous.score) * 100) : 0,
          deltas: current.deltas_json ? JSON.parse(current.deltas_json) : undefined
        });
      }
    });

    res.json({
      summary: {
        total: rows.length,
        average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
        best: scores.length ? Math.max(...scores) : 0,
        recent: newest ? rows.filter((row: any) => new Date(row.timestamp).getTime() >= weekAgo).length : 0
      },
      trend: rows.slice(-12).map((row: any) => ({
        id: row.id, timestamp: row.timestamp, score: row.score
      })),
      averages,
      comparisons: comparisons
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 6)
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid session id' });
      return;
    }
    const database = await getDb();
    const row = await database.get('SELECT * FROM sessions WHERE id = ?', [id]);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(mapSession(row));
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
        evaluation_source, word_timings_json, interview_qa_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      session.wordTimings ? JSON.stringify(session.wordTimings) : null,
      session.interviewQa ? JSON.stringify(session.interviewQa) : null
    ]);
    res.json({ success: true, id: session.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/sessions/delete-bulk', async (req, res) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const valid = ids.filter((id) => /^[a-zA-Z0-9_-]+$/.test(id));
    if (!valid.length) {
      res.status(400).json({ error: 'No valid session ids' });
      return;
    }
    const database = await getDb();
    for (const id of valid) {
      const row = await database.get('SELECT media_url FROM sessions WHERE id = ?', [id]);
      if (row) await removeRecording((row as any).media_url);
      await database.run('DELETE FROM sessions WHERE id = ?', [id]);
    }
    res.json({ success: true, deleted: valid.length });
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

app.get('/api/recordings/:id/download', (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: 'Invalid recording id' });
    return;
  }
  for (const extension of ['webm', 'mp4']) {
    const file = path.join(recordingsDir, `${id}.${extension}`);
    if (existsSync(file)) {
      res.download(file, `${id}.${extension}`);
      return;
    }
  }
  res.status(404).json({ error: 'Recording not found' });
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
  app.listen(PORT, HOST, () => {
    const mode = existsSync(path.join(distDir, 'index.html')) ? 'app + API' : 'API only';
    const gate = appPasscode ? ' (passcode required)' : '';
    console.log(`Communication Coach ${mode} listening on http://${HOST}:${PORT}${gate}`);
  });
}

start().catch((error) => {
  console.error('Server startup failed:', error);
  process.exitCode = 1;
});
