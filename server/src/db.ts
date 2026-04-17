import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface DbHandle {
  raw: Database.Database
  close: () => void
}

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent TEXT,
  agent_session_id TEXT,
  last_connection_id TEXT,
  alias TEXT,
  session_init TEXT,
  created_at INTEGER,
  destroyed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_index INTEGER NOT NULL,
  sender TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  connection_id TEXT,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, id)
);
CREATE INDEX IF NOT EXISTS events_by_session_order
  ON events(session_id, event_index, id);

CREATE TABLE IF NOT EXISTS projects (
  directory TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`

export function openDatabase(path: string): DbHandle {
  mkdirSync(dirname(path), { recursive: true })
  const raw = new Database(path)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')

  // Always run schema_v1 as idempotent CREATE IF NOT EXISTS so first-run
  // vs. upgrade both work. Any future migrations live below and gate on
  // the version row.
  raw.exec(SCHEMA_V1)
  const currentVersion = (
    raw.prepare('SELECT version FROM schema_version').get() as
      | { version: number }
      | undefined
  )?.version
  if (currentVersion === undefined) {
    raw.prepare('INSERT INTO schema_version (version) VALUES (1)').run()
  }

  return { raw, close: () => raw.close() }
}
