-- Migration 004: Add workflow preference settings
-- Adds support for two background generation workflows:
--   1. 'cutout_composite' (default): Cutout + Background Generation + Compositing (precise, 3-step)
--   2. 'seedream_edit' (optional): Freepik Seedream 4 Edit single-step AI background replacement (fast)

-- Add workflow_type column to jobs table to track which workflow was used
ALTER TABLE jobs ADD COLUMN workflow_type TEXT DEFAULT 'cutout_composite';

-- Create settings table for global application preferences
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default workflow preference
INSERT OR IGNORE INTO settings (key, value, description)
VALUES (
  'workflow_preference',
  'cutout_composite',
  'Default workflow: cutout_composite (precise) or seedream_edit (fast)'
);

-- Create index on workflow_type for analytics queries
CREATE INDEX IF NOT EXISTS idx_jobs_workflow ON jobs(workflow_type, status);

-- Update metadata version
INSERT OR REPLACE INTO metadata (key, value)
VALUES ('migration_version', '4');
