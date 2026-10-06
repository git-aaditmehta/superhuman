-- [OBSOLETE / ARCHIVED MIGRATION - DO NOT APPLY]
-- This migration was originally intended for the cloud database `superhuman-data-1` (ID: 13c7c8a4-e6c6-4deb-a72a-b8352dbb2d23),
-- which has been deleted from Cloudflare.
-- Under the local-first architecture, all productivity data (notes, tasks, goals, etc.) is stored
-- strictly on local user devices and is never hosted in Cloudflare D1 or the cloud backend.
-- This file is retained solely for historical reference and is excluded from wrangler.jsonc.
-- Migration number: 0002 	 2026-10-05T10:45:26.430Z

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id_is_pinned_updated_at ON notes(user_id, is_pinned DESC, updated_at DESC);
