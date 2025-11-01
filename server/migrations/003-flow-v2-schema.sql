-- Migration 003: Flow v2 Schema Updates
-- Adds support for cutouts, derivatives, manifests, and new state machine

-- Add new columns to jobs table
ALTER TABLE jobs ADD COLUMN s3_cutout_key TEXT;
ALTER TABLE jobs ADD COLUMN s3_derivative_keys TEXT; -- JSON array
ALTER TABLE jobs ADD COLUMN manifest_s3_key TEXT;

-- Add timing columns for observability
ALTER TABLE jobs ADD COLUMN download_ms INTEGER;
ALTER TABLE jobs ADD COLUMN segmentation_ms INTEGER;
ALTER TABLE jobs ADD COLUMN backgrounds_ms INTEGER;
ALTER TABLE jobs ADD COLUMN compositing_ms INTEGER;
ALTER TABLE jobs ADD COLUMN derivatives_ms INTEGER;
ALTER TABLE jobs ADD COLUMN manifest_ms INTEGER;

-- Add provider metadata
ALTER TABLE jobs ADD COLUMN provider_metadata TEXT; -- JSON with provider details

-- Reset any QUEUED jobs to NEW for Flow v2 compatibility
UPDATE jobs SET status = 'NEW', updated_at = datetime('now') WHERE status = 'QUEUED';

-- Create index on manifest key for faster lookups
CREATE INDEX IF NOT EXISTS idx_jobs_manifest ON jobs(manifest_s3_key);

-- Create index on cutout key
CREATE INDEX IF NOT EXISTS idx_jobs_cutout ON jobs(s3_cutout_key);
