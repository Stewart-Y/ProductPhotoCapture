-- Migration 007: Template Variant Selection
-- Adds ability to select which variants to use when template is active

-- Add selected column to template_assets to track which variants are chosen
ALTER TABLE template_assets ADD COLUMN selected BOOLEAN DEFAULT 1;

-- Create index for querying selected variants
CREATE INDEX IF NOT EXISTS idx_template_assets_selected ON template_assets(template_id, selected);

-- Update migration version
INSERT OR REPLACE INTO metadata (key, value)
VALUES ('migration_version', '007');
