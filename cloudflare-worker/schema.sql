-- D1 Schema for DevNotes Metadata
-- Run this with: wrangler d1 execute devnotes-db --file=./schema.sql

-- Main notes metadata table
CREATE TABLE IF NOT EXISTS notes_meta (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT,
  tags TEXT, -- JSON array stored as text
  languages TEXT, -- JSON array stored as text
  preview TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_type ON notes_meta(type);
CREATE INDEX IF NOT EXISTS idx_category ON notes_meta(category);
CREATE INDEX IF NOT EXISTS idx_language ON notes_meta(language);
CREATE INDEX IF NOT EXISTS idx_updated_at ON notes_meta(updated_at DESC);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  id UNINDEXED,
  title,
  preview,
  tags,
  category,
  type,
  language,
  content='notes_meta',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync with notes_meta
CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes_meta BEGIN
  INSERT INTO notes_fts(rowid, id, title, preview, tags, category, type, language)
  VALUES (new.rowid, new.id, new.title, new.preview, new.tags, new.category, new.type, new.language);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes_meta BEGIN
  UPDATE notes_fts SET
    title = new.title,
    preview = new.preview,
    tags = new.tags,
    category = new.category,
    type = new.type,
    language = new.language
  WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes_meta BEGIN
  DELETE FROM notes_fts WHERE rowid = old.rowid;
END;

-- Sync tracking table
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Insert initial sync state
INSERT OR IGNORE INTO sync_state (key, value, updated_at)
VALUES ('last_sync', '0', 0);
