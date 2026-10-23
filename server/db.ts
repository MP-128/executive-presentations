import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

export function openDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      inputs_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plan_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      plan_json TEXT NOT NULL,
      created_by TEXT NOT NULL CHECK (created_by IN ('model','user')),
      created_at TEXT NOT NULL,
      approved_at TEXT,
      UNIQUE (project_id, version)
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('plan','generate')),
      plan_version_id INTEGER REFERENCES plan_versions(id),
      status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
      stage TEXT,
      error TEXT,
      attempt INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);
    CREATE TABLE IF NOT EXISTS outputs (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      pptx_path TEXT NOT NULL,
      pdf_path TEXT,
      previews_json TEXT,
      qa_json TEXT,
      render_skipped TEXT
    );
    -- Logos uploaded by the user or retrieved as candidates. Stored as PNG/JPEG under DATA_DIR/uploads.
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('logo')),
      path TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      source_url TEXT,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export const now = () => new Date().toISOString();
