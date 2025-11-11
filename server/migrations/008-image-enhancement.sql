-- Migration 008: Image Enhancement Workflow
-- Creates table for standalone AI image enhancement (upscaling)

CREATE TABLE IF NOT EXISTS enhancements (
  id TEXT PRIMARY KEY,
  input_s3_key TEXT NOT NULL,
  output_s3_key TEXT,
  scale_factor INTEGER NOT NULL CHECK(scale_factor IN (2, 4, 8)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  cost REAL DEFAULT 0,
  metadata TEXT, -- JSON: { duration, inputSize, outputSize, width, height, provider, etc. }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying by status
CREATE INDEX IF NOT EXISTS idx_enhancements_status ON enhancements(status);

-- Index for querying by creation date
CREATE INDEX IF NOT EXISTS idx_enhancements_created_at ON enhancements(created_at DESC);
