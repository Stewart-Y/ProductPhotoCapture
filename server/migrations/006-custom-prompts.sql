-- Migration 006: Custom Prompt Presets
-- Creates table for user-defined reusable prompt templates

-- Custom Prompts: Store user-created prompt presets
CREATE TABLE IF NOT EXISTS custom_prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL,
  is_default BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_count INTEGER DEFAULT 0
);

-- Insert default custom prompt
INSERT INTO custom_prompts (id, title, prompt, is_default, created_at)
VALUES
  ('prompt_default', 'Custom Prompt', 'Professional product photography empty background scene, vacant center foreground space ready for placement, soft gradient backdrop fading from light to slightly darker tone, clean smooth surface in sharp focus. Studio lighting setup with key and fill lights illuminating empty foreground area, high quality commercial photography, photorealistic rendering, subtle texture, depth of field with blurred edges, background elements at periphery.', 1, datetime('now'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_prompts_title ON custom_prompts(title);
CREATE INDEX IF NOT EXISTS idx_custom_prompts_default ON custom_prompts(is_default);

-- Update migration version
INSERT OR REPLACE INTO metadata (key, value)
VALUES ('migration_version', '006');
