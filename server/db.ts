import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'communication_agent.db');
let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await open({ filename: dbPath, driver: sqlite3.Database });
    await dbInstance.exec('PRAGMA journal_mode = WAL;');
  }
  return dbInstance;
}

export async function initDatabase() {
  const db = await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      mode TEXT NOT NULL,
      mode_label TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      context_prompt TEXT NOT NULL,
      target_audience TEXT,
      transcript TEXT NOT NULL,
      score REAL NOT NULL,
      utterances_json TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      replays_json TEXT NOT NULL,
      why_coaching_json TEXT NOT NULL,
      attempt_number INTEGER DEFAULT 1,
      previous_attempt_id TEXT,
      deltas_json TEXT,
      one_thing_to_practice TEXT NOT NULL,
      media_url TEXT
    );
  `);

  // Existing databases were created before recordings were supported.
  const columns = await db.all('PRAGMA table_info(sessions)');
  if (!columns.some((column: any) => column.name === 'media_url')) {
    await db.exec('ALTER TABLE sessions ADD COLUMN media_url TEXT');
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      utterances_json TEXT NOT NULL
    );
  `);

}
