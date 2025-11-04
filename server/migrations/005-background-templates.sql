-- Migration 005: Background Templates System
-- Creates tables for reusable background template library

-- Background Templates: Store template metadata
CREATE TABLE IF NOT EXISTS background_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  theme TEXT,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'generating', 'archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_count INTEGER DEFAULT 0
);

-- Template Assets: Store S3 keys for each template variant
CREATE TABLE IF NOT EXISTS template_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  variant INTEGER NOT NULL,
  s3_key TEXT NOT NULL,
  s3_url TEXT,
  s3_url_expires_at DATETIME,
  width INTEGER,
  height INTEGER,
  format TEXT,
  size_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES background_templates(id) ON DELETE CASCADE,
  UNIQUE(template_id, variant)
);

-- Add background_template_id to jobs table
ALTER TABLE jobs ADD COLUMN background_template_id TEXT REFERENCES background_templates(id);

-- Add active background template to settings
INSERT OR IGNORE INTO settings (key, value, description, updated_at)
VALUES ('active_background_template', NULL, 'Currently active background template ID', datetime('now'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_templates_status ON background_templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_created ON background_templates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_assets_template ON template_assets(template_id);
CREATE INDEX IF NOT EXISTS idx_jobs_template ON jobs(background_template_id);

-- Update migration version
INSERT OR REPLACE INTO metadata (key, value)
VALUES ('migration_version', '005');
