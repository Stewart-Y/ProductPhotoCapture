-- Migration 002: Job Queue System and Shopify Integration
-- Created: 2025-10-31
-- Description: Adds jobs table for async processing and shopify_map for SKU-to-product mapping

-- =============================================================================
-- JOBS TABLE: State machine for async image processing pipeline
-- =============================================================================
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,                    -- UUID v4 (nanoid)
  sku TEXT NOT NULL,                      -- Product SKU (from 3JMS)
  img_sha256 TEXT NOT NULL,               -- SHA256 hash of original image (idempotency key)
  theme TEXT NOT NULL DEFAULT 'default',  -- Background theme (default, halloween, christmas, etc.)
  status TEXT NOT NULL DEFAULT 'NEW',     -- Job state machine status
  attempt INTEGER DEFAULT 0,              -- Retry counter

  -- Source URLs (3JMS)
  source_url TEXT,                        -- Original image URL from 3JMS

  -- S3 Storage Keys
  s3_original_key TEXT,                   -- S3 key: originals/{sku}/{sha}.jpg
  s3_mask_key TEXT,                       -- S3 key: masks/{sku}/{sha}.png
  s3_bg_keys TEXT,                        -- JSON array of S3 keys for backgrounds
  s3_composite_keys TEXT,                 -- JSON array of S3 keys for final composites
  s3_thumb_keys TEXT,                     -- JSON array of S3 keys for thumbnails

  -- AI Provider Job IDs (for polling)
  segment_job_id TEXT,                    -- External job ID from segmentation provider
  bg_job_ids TEXT,                        -- JSON array of external job IDs from BG provider

  -- Shopify Integration
  shopify_product_id TEXT,                -- Shopify product GID
  shopify_media_ids TEXT,                 -- JSON array of Shopify media GIDs

  -- Error Handling
  error_code TEXT,                        -- Error code (e.g., PRODUCT_NOT_FOUND, SEGMENT_FAILED)
  error_message TEXT,                     -- Human-readable error message
  error_stack TEXT,                       -- Stack trace for debugging

  -- Cost Tracking
  cost_usd REAL DEFAULT 0.0,              -- Total cost in USD (sum of all API calls)

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,                  -- When job reached DONE/FAILED

  -- Idempotency constraint: one job per SKU+image hash+theme combo
  UNIQUE(sku, img_sha256, theme)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_jobs_sku_sha ON jobs(sku, img_sha256);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);

-- =============================================================================
-- SHOPIFY_MAP TABLE: SKU to Shopify Product ID mapping cache
-- =============================================================================
CREATE TABLE IF NOT EXISTS shopify_map (
  sku TEXT PRIMARY KEY,                   -- Product SKU (matches items.sku)
  product_id TEXT NOT NULL,               -- Shopify product GID (e.g., gid://shopify/Product/123)
  variant_id TEXT,                        -- Optional: Shopify variant GID if images attach to variant
  product_handle TEXT,                    -- Shopify product handle (URL slug)

  -- Metadata
  last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
  sync_status TEXT DEFAULT 'active',      -- active, failed, deleted

  -- Cache invalidation
  shopify_updated_at DATETIME,            -- Last update timestamp from Shopify

  FOREIGN KEY (sku) REFERENCES items(sku) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shopify_map_product_id ON shopify_map(product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_map_synced ON shopify_map(last_synced DESC);

-- =============================================================================
-- METADATA TABLE: System-wide key-value storage for timestamps, settings, etc.
-- =============================================================================
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,                   -- Unique key (e.g., '3jms_last_poll', 'migration_version')
  value TEXT,                             -- JSON or plain text value
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial metadata
INSERT OR IGNORE INTO metadata (key, value) VALUES ('3jms_last_poll', '2025-01-01T00:00:00Z');
INSERT OR IGNORE INTO metadata (key, value) VALUES ('migration_version', '002');

-- =============================================================================
-- TRIGGER: Auto-update updated_at timestamp on jobs table
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS jobs_updated_at
AFTER UPDATE ON jobs
FOR EACH ROW
BEGIN
  UPDATE jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =============================================================================
-- COMMENTS ON JOB STATUS VALUES (for reference)
-- =============================================================================
-- Valid job.status values (enforced in application code):
--   NEW              - Job created, not yet started
--   QUEUED           - Job queued for processing
--   SEGMENTING       - AI segmentation in progress
--   BG_GENERATING    - Background generation in progress
--   COMPOSITING      - Server-side compositing in progress
--   SHOPIFY_PUSH     - Uploading to Shopify
--   DONE             - Successfully completed
--   FAILED           - Permanent failure (see error_code/error_message)
--
-- Valid error_code values (examples):
--   PRODUCT_NOT_FOUND     - SKU not found in Shopify
--   SEGMENT_FAILED        - AI segmentation provider error
--   BG_FAILED             - Background generation provider error
--   COMPOSITE_FAILED      - Server-side compositing error
--   SHOPIFY_UPLOAD_FAILED - Shopify API error
--   S3_UPLOAD_FAILED      - S3 storage error
--   TIMEOUT               - Job exceeded max processing time
--   INVALID_IMAGE         - Image quality/size validation failed
