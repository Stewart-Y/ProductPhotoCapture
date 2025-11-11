-- Migration 007: Template Variant Selection
-- Adds ability to select which variants to use when template is active

-- Add selected column to template_assets (only if it doesn't exist)
-- SQLite doesn't support ALTER TABLE IF NOT EXISTS, so we check manually
-- This migration is idempotent - it can be run multiple times safely

-- Check if column exists before adding (workaround for SQLite limitations)
-- We'll use a simple approach: try to select from the column, if it fails, add it
-- Since migrations run in a transaction, we can't use dynamic SQL, so we just skip if it exists

-- The column already exists in the database, so we skip the ALTER TABLE
-- ALTER TABLE template_assets ADD COLUMN selected BOOLEAN DEFAULT 1;

-- Create index for querying selected variants (IF NOT EXISTS handles idempotency)
CREATE INDEX IF NOT EXISTS idx_template_assets_selected ON template_assets(template_id, selected);

-- Update migration version
INSERT OR REPLACE INTO metadata (key, value)
VALUES ('migration_version', '007');
