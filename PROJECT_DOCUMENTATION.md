# 3JMS → AI Backgrounds → Shopify: Complete Project Documentation

> **End-to-End Automation System for AI-Enhanced Product Photography**

Last Updated: November 1, 2025

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Data Flow](#data-flow)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Provider Architecture](#provider-architecture)
7. [Implementation Phases](#implementation-phases)
8. [Configuration](#configuration)
9. [Testing](#testing)
10. [Deployment](#deployment)

---

## Project Overview

### Mission Statement
Automate the entire workflow of receiving product photos from 3JMS, enhancing them with AI-generated backgrounds, and pushing the results to Shopify with zero manual intervention.

### Core Principles
- **Idempotent**: Same input always produces same output, safe to retry
- **Observable**: Full logging, metrics, and state tracking
- **Provider-Agnostic**: Easy to swap AI providers (Freepik, Replicate, Stability AI)
- **Presigned URLs**: Keep images out of orchestrator (n8n), use S3 URLs
- **Deterministic**: SHA256-based keys ensure consistency

### Technology Stack
- **Runtime**: Node.js 18+ with ES Modules
- **Framework**: Express.js for REST API
- **Database**: SQLite with better-sqlite3 (synchronous operations)
- **Storage**: AWS S3 with presigned URLs
- **Image Processing**: Sharp for compositing
- **AI Provider**: Freepik (background removal & generation)
- **Orchestration**: n8n (optional, for workflow automation)

---

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         3JMS (Source)                            │
│                    Product Photo System                          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        │ Webhook: image.created
                        │ {sku, imageUrl, sha256, takenAt}
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Our System (Express.js)                        │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              Job Queue (SQLite)                        │     │
│  │  - State machine (8 statuses)                         │     │
│  │  - Idempotency (sku + sha256 + theme)                │     │
│  │  - Retry logic with exponential backoff              │     │
│  └────────────────────────────────────────────────────────┘     │
│                        │                                         │
│                        ▼                                         │
│  ┌────────────────────────────────────────────────────────┐     │
│  │         AI Providers (Freepik)                        │     │
│  │  - Background Removal (segmentation)                  │     │
│  │  - Themed Background Generation                       │     │
│  └────────────────────────────────────────────────────────┘     │
│                        │                                         │
│                        ▼                                         │
│  ┌────────────────────────────────────────────────────────┐     │
│  │         Compositing Pipeline (Sharp)                  │     │
│  │  - Load mask + background                             │     │
│  │  - Resize and align                                   │     │
│  │  - Composite with alpha blending                      │     │
│  └────────────────────────────────────────────────────────┘     │
│                        │                                         │
│                        ▼                                         │
│  ┌────────────────────────────────────────────────────────┐     │
│  │         Shopify Integration (GraphQL)                 │     │
│  │  - Auto-lookup product by SKU                         │     │
│  │  - Upload media to product                            │     │
│  │  - Cache SKU → productId mappings                     │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS S3 Storage                              │
│  originals/{sku}/{sha256}.jpg                                   │
│  masks/{sku}/{sha256}.png                                       │
│  backgrounds/{theme}/{sku}/{sha256}_{variant}.jpg               │
│  composites/{theme}/{sku}/{sha256}_{variant}.jpg                │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
ProductPhotoCapture/
├── client/                    # React frontend (existing)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/api.ts
│   └── package.json
│
├── server/                    # Node.js backend
│   ├── migrations/            # Database migrations
│   │   ├── 001-initial.sql
│   │   └── 002-jobs-and-shopify.sql
│   │
│   ├── jobs/                  # Job queue system
│   │   ├── state-machine.js   # State transitions & validation
│   │   ├── manager.js         # CRUD operations
│   │   ├── webhook-verify.js  # HMAC verification
│   │   └── routes.js          # API endpoints (11 routes)
│   │
│   ├── providers/             # AI provider abstraction
│   │   ├── base.js            # Base interface
│   │   ├── index.js           # Factory pattern
│   │   └── freepik/
│   │       ├── segment.js     # Background removal
│   │       └── background.js  # Themed generation
│   │
│   ├── storage/               # S3 abstraction
│   │   ├── index.js           # Factory
│   │   └── s3.js              # S3 client
│   │
│   ├── integrations/          # External integrations
│   │   ├── shopify/           # (Phase 4)
│   │   └── threejms/          # (Phase 6)
│   │
│   ├── workflows/             # Compositing pipeline
│   │   └── composite.js       # (Phase 3)
│   │
│   ├── db.js                  # Database with migrations
│   ├── server.js              # Express app
│   ├── test-freepik.js        # Integration tests
│   └── .env                   # Configuration
│
└── README.md
```

---

## Data Flow

### Complete Workflow (Step-by-Step)

#### 1. Image Creation Event (3JMS → Our System)

```
3JMS captures product photo
  ↓
3JMS calls our webhook: POST /api/webhooks/3jms/images
  ↓
Webhook payload:
{
  "event": "image.created",
  "sku": "VWS200433868",
  "imageUrl": "https://3jms.com/photos/abc123.jpg",
  "sha256": "abc123def456...",
  "takenAt": "2025-11-01T12:00:00Z"
}
  ↓
Our system verifies HMAC signature
  ↓
Check for existing job (sku + sha256 + theme = unique)
  ↓
If exists: Return 200 + existing jobId (idempotent)
If new: Create job with status NEW
```

#### 2. Job Processing (State Machine)

```
Status: NEW
  ↓
Transition to QUEUED
  ↓
Generate presigned PUT URLs for:
  - originals/{sku}/{sha256}.jpg
  - masks/{sku}/{sha256}.png
  ↓
Status: QUEUED → SEGMENTING
  ↓
Call Freepik Background Removal API
  - POST /v1/ai/beta/remove-background
  - Download result within 5 minutes (URL expires!)
  - Upload to S3: masks/{sku}/{sha256}.png
  - Cost: $0.02
  ↓
Status: SEGMENTING → BG_GENERATING
  ↓
Call Freepik Background Generation API
  - POST /v1/ai/mystic
  - Prompt based on theme (default, kitchen, outdoors, etc.)
  - Resolution: 2k or 4k (auto-selected)
  - Download result within 5 minutes
  - Upload to S3: backgrounds/{theme}/{sku}/{sha256}_1.jpg
  - Cost: $0.05 (2k) or $0.10 (4k)
  ↓
Status: BG_GENERATING → COMPOSITING
  ↓
Load mask and background from S3
  - Resize background to match mask dimensions
  - Composite using alpha channel from mask
  - Upload to S3: composites/{theme}/{sku}/{sha256}_1.jpg
  ↓
Status: COMPOSITING → SHOPIFY_PUSH
  ↓
Lookup Shopify product by SKU
  - Check shopify_map cache table
  - If not found: Query Shopify GraphQL by metafield
  - Cache productId for future use
  ↓
Upload composite to Shopify product
  - Create media via GraphQL mutation
  - Get shopifyMediaId
  ↓
Status: SHOPIFY_PUSH → DONE
  ↓
Update job record with:
  - shopifyProductId
  - shopifyMediaId
  - totalCost (sum of all AI operations)
  - completedAt timestamp
```

#### 3. Error Handling

```
Any status can transition to FAILED
  ↓
Record error details:
  - errorCode (enum: API_ERROR, VALIDATION_ERROR, etc.)
  - errorMessage
  - errorDetails (JSON)
  - failedAt timestamp
  ↓
Retry logic (if applicable):
  - Max retries: 3
  - Exponential backoff: 2^retry_count seconds
  - Update retryCount in job record
```

---

## Database Schema

### Tables Overview

#### 1. `jobs` Table (Job Queue)

```sql
CREATE TABLE jobs (
  -- Identifiers
  id TEXT PRIMARY KEY,              -- nanoid(16)
  sku TEXT NOT NULL,                -- Product SKU from 3JMS
  img_sha256 TEXT NOT NULL,         -- SHA256 hash of original image
  theme TEXT NOT NULL DEFAULT 'default',

  -- State
  status TEXT NOT NULL DEFAULT 'NEW',  -- See JobStatus enum
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  queuedAt TEXT,
  startedAt TEXT,
  completedAt TEXT,
  failedAt TEXT,

  -- S3 Keys (deterministic paths)
  s3_original_key TEXT,             -- originals/{sku}/{sha256}.jpg
  s3_mask_key TEXT,                 -- masks/{sku}/{sha256}.png
  s3_bg_key TEXT,                   -- backgrounds/{theme}/{sku}/{sha256}_1.jpg
  s3_composite_key TEXT,            -- composites/{theme}/{sku}/{sha256}_1.jpg

  -- Shopify
  shopifyProductId TEXT,            -- Shopify GID
  shopifyMediaId TEXT,              -- Media asset GID

  -- Costs (in USD)
  segmentationCost REAL DEFAULT 0,  -- $0.02 for Freepik
  backgroundCost REAL DEFAULT 0,    -- $0.05-$0.10 for Freepik
  totalCost REAL DEFAULT 0,

  -- Errors
  errorCode TEXT,                   -- See ErrorCode enum
  errorMessage TEXT,
  errorDetails TEXT,                -- JSON
  retryCount INTEGER DEFAULT 0,

  -- Idempotency constraint
  UNIQUE(sku, img_sha256, theme)
);

-- Indices
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_sku ON jobs(sku);
CREATE INDEX idx_jobs_created ON jobs(createdAt DESC);
```

**JobStatus Enum:**
- `NEW` - Just created from webhook
- `QUEUED` - Waiting for processing
- `SEGMENTING` - Background removal in progress
- `BG_GENERATING` - Background generation in progress
- `COMPOSITING` - Image compositing in progress
- `SHOPIFY_PUSH` - Uploading to Shopify
- `DONE` - Successfully completed
- `FAILED` - Permanent failure

**ErrorCode Enum:**
- `VALIDATION_ERROR` - Invalid input data
- `API_ERROR` - External API failure
- `S3_ERROR` - S3 upload/download failure
- `SEGMENTATION_ERROR` - Background removal failed
- `BACKGROUND_ERROR` - Background generation failed
- `COMPOSITE_ERROR` - Image compositing failed
- `SHOPIFY_ERROR` - Shopify upload failed
- `NETWORK_ERROR` - Network timeout/connection
- `UNKNOWN_ERROR` - Unexpected error
- `RATE_LIMIT_ERROR` - API rate limit hit
- `COST_LIMIT_ERROR` - Budget exceeded

#### 2. `shopify_map` Table (SKU → ProductId Cache)

```sql
CREATE TABLE shopify_map (
  sku TEXT PRIMARY KEY,
  shopifyProductId TEXT NOT NULL,
  shopifyProductHandle TEXT,
  title TEXT,
  lastSyncedAt TEXT NOT NULL,

  -- Index for reverse lookup
  CREATE INDEX idx_shopify_productid ON shopify_map(shopifyProductId)
);
```

#### 3. `metadata` Table (System State)

```sql
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Example entries:
-- ('last_3jms_poll', '2025-11-01T12:00:00Z', ...)
-- ('total_processed', '1523', ...)
-- ('total_cost_usd', '45.67', ...)
```

---

## API Reference

### Webhook Endpoints

#### 1. Receive 3JMS Image Webhook

```http
POST /api/webhooks/3jms/images
Content-Type: application/json
X-3JMS-Signature: sha256=abc123...

{
  "event": "image.created",
  "sku": "VWS200433868",
  "imageUrl": "https://3jms.com/photos/abc123.jpg",
  "sha256": "abc123def456789...",
  "takenAt": "2025-11-01T12:00:00Z"
}
```

**Response (201 Created - New Job):**
```json
{
  "status": "created",
  "jobId": "xyz123abc456",
  "message": "Job created successfully"
}
```

**Response (200 OK - Duplicate):**
```json
{
  "status": "duplicate",
  "jobId": "xyz123abc456",
  "message": "Job already exists for this image"
}
```

**HMAC Verification:**
- Header: `X-3JMS-Signature: sha256=<hex_signature>`
- Algorithm: HMAC-SHA256
- Secret: From `THREEJMS_WEBHOOK_SECRET` env var
- Payload: Raw request body (before JSON parsing)

### Job Management Endpoints

#### 2. Start Job Processing

```http
POST /api/jobs/:id/start
```

**Response:**
```json
{
  "jobId": "xyz123abc456",
  "status": "QUEUED",
  "presignedUrls": {
    "original": "https://s3.amazonaws.com/...",
    "mask": "https://s3.amazonaws.com/..."
  }
}
```

#### 3. Get Job Status

```http
GET /api/jobs/:id
```

**Response:**
```json
{
  "id": "xyz123abc456",
  "sku": "VWS200433868",
  "theme": "default",
  "status": "COMPOSITING",
  "createdAt": "2025-11-01T12:00:00Z",
  "updatedAt": "2025-11-01T12:05:23Z",
  "s3Keys": {
    "original": "originals/VWS200433868/abc123.jpg",
    "mask": "masks/VWS200433868/abc123.png",
    "background": "backgrounds/default/VWS200433868/abc123_1.jpg",
    "composite": null
  },
  "costs": {
    "segmentation": 0.02,
    "background": 0.05,
    "total": 0.07
  },
  "retryCount": 0
}
```

#### 4. Get Presigned URLs

```http
GET /api/jobs/:id/presign?type=composite&expiresIn=3600
```

**Response:**
```json
{
  "url": "https://product-photos-ai-vws.s3.us-east-1.amazonaws.com/...",
  "expiresIn": 3600,
  "expiresAt": "2025-11-01T13:00:00Z"
}
```

#### 5. Mark Segmentation Complete

```http
POST /api/jobs/:id/segmentation
Content-Type: application/json

{
  "s3Key": "masks/VWS200433868/abc123.png",
  "cost": 0.02,
  "metadata": {
    "width": 1024,
    "height": 1024,
    "provider": "freepik"
  }
}
```

#### 6. Mark Background Generation Complete

```http
POST /api/jobs/:id/backgrounds
Content-Type: application/json

{
  "s3Key": "backgrounds/default/VWS200433868/abc123_1.jpg",
  "cost": 0.05,
  "metadata": {
    "theme": "default",
    "resolution": "2k",
    "provider": "freepik"
  }
}
```

#### 7. Mark Composite Complete

```http
POST /api/jobs/:id/composite
Content-Type: application/json

{
  "s3Key": "composites/default/VWS200433868/abc123_1.jpg",
  "metadata": {
    "width": 2048,
    "height": 2048,
    "format": "jpeg"
  }
}
```

#### 8. Mark Shopify Upload Complete

```http
POST /api/jobs/:id/shopify
Content-Type: application/json

{
  "productId": "gid://shopify/Product/123456",
  "mediaId": "gid://shopify/MediaImage/789012"
}
```

#### 9. Mark Job as Failed

```http
POST /api/jobs/:id/fail
Content-Type: application/json

{
  "errorCode": "API_ERROR",
  "errorMessage": "Freepik API returned 500",
  "errorDetails": {
    "provider": "freepik",
    "endpoint": "/v1/ai/beta/remove-background",
    "statusCode": 500
  }
}
```

#### 10. List Jobs

```http
GET /api/jobs?status=DONE&limit=50&offset=0
```

**Query Parameters:**
- `status` - Filter by status (optional)
- `sku` - Filter by SKU (optional)
- `theme` - Filter by theme (optional)
- `limit` - Results per page (default: 50, max: 100)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "jobs": [...],
  "total": 1523,
  "limit": 50,
  "offset": 0
}
```

#### 11. Get Statistics

```http
GET /api/jobs/stats
```

**Response:**
```json
{
  "total": 1523,
  "byStatus": {
    "NEW": 5,
    "QUEUED": 12,
    "SEGMENTING": 3,
    "BG_GENERATING": 2,
    "COMPOSITING": 1,
    "SHOPIFY_PUSH": 0,
    "DONE": 1450,
    "FAILED": 50
  },
  "totalCost": 152.30,
  "averageCost": 0.10,
  "successRate": 96.7
}
```

---

## Provider Architecture

### Base Provider Interface

All AI providers implement the `BaseProvider` class:

```javascript
class BaseProvider {
  async removeBackground({ imageUrl, sku, sha256 }) {
    // Returns: { success, s3Key, s3Url, cost, metadata, error }
  }

  async generateBackground({ theme, sku, sha256, dimensions, aspectRatio }) {
    // Returns: { success, s3Key, s3Url, cost, metadata, error }
  }

  getThemePrompt(theme) {
    // Returns: prompt string for AI generation
  }
}
```

### Freepik Provider

#### Background Removal (segment.js)

**API Endpoint:**
```
POST https://api.freepik.com/v1/ai/beta/remove-background
Content-Type: application/x-www-form-urlencoded
x-freepik-api-key: FPSX...

image_url=https://example.com/photo.jpg
```

**Response:**
```json
{
  "original": "https://api.freepik.com/v1/ai/beta/images/original/.../thumbnail.jpg",
  "high_resolution": "https://api.freepik.com/v1/ai/beta/images/download/.../high.png",
  "preview": "https://api.freepik.com/v1/ai/beta/images/download/.../preview.png",
  "url": "https://api.freepik.com/v1/ai/beta/images/download/.../high.png"
}
```

**CRITICAL:** All URLs expire after 5 minutes! Must download immediately.

**Cost:** $0.02 per operation

#### Background Generation (background.js)

**API Endpoint:**
```
POST https://api.freepik.com/v1/ai/mystic
Content-Type: application/json
x-freepik-api-key: FPSX...

{
  "prompt": "Professional product photography background...",
  "resolution": "2k",
  "aspect_ratio": "1:1",
  "model": "mystic",
  "engine": "Illusio",
  "creative_detailing": 5,
  "guidance_scale": 7.5,
  "num_inference_steps": 50
}
```

**Engines:**
- `Illusio` - Balanced, photorealistic
- `Sharpy` - High detail, sharp edges
- `Sparkle` - Artistic, vibrant colors

**Resolutions:**
- `2k` - 2048px, $0.05
- `4k` - 4096px, $0.10

**Response:**
```json
{
  "data": {
    "url": "https://api.freepik.com/.../generated.jpg",
    "id": "unique-id"
  }
}
```

### Theme Prompts

```javascript
const themes = {
  default: "Professional product photography background, clean and modern, soft gradient, studio lighting, photorealistic",

  kitchen: "Modern kitchen counter, marble surface, natural window lighting, blurred depth of field, professional photography",

  outdoors: "Natural outdoor setting, wooden table, soft sunlight, bokeh background, nature-inspired",

  minimal: "Minimalist background, pure solid color, ultra clean, perfect gradient, high key lighting",

  luxury: "Luxury setting, dark elegant background with gold accents, dramatic lighting, premium materials, sophisticated"
};
```

### Provider Factory

```javascript
import { getSegmentProvider, getBackgroundProvider } from './providers/index.js';

// Get singleton instances based on AI_PROVIDER env var
const segmentProvider = getSegmentProvider();  // FreepikSegmentProvider
const bgProvider = getBackgroundProvider();    // FreepikBackgroundProvider

// Use providers
const result = await segmentProvider.removeBackground({
  imageUrl: 'https://example.com/photo.jpg',
  sku: 'VWS200433868',
  sha256: 'abc123...'
});
```

---

## Implementation Phases

### Phase 0: Setup & Schema ✅ COMPLETE

**Commit:** 4fe86ec

**Completed:**
- Created migration system (numbered SQL files)
- Created `002-jobs-and-shopify.sql` with 3 tables
- Updated `.env.example` with 40+ variables
- Created directory structure (jobs/, providers/, storage/, integrations/, workflows/)
- Set up S3 bucket: `product-photos-ai-vws`
- Created S3 storage module with presigned URLs
- Tested S3 connection

**Files:**
- `server/migrations/002-jobs-and-shopify.sql`
- `server/db.js` (added migration runner)
- `server/storage/s3.js`
- `server/storage/index.js`
- `server/.env.example`

### Phase 1: Job Queue System ✅ COMPLETE

**Commit:** ab1c9b2

**Completed:**
- State machine with 8 statuses and transition validation
- Job manager with CRUD operations and idempotency
- HMAC webhook verification (constant-time comparison)
- 11 API endpoints for complete job lifecycle
- Integration with Express server
- Testing: job creation, status retrieval, idempotency

**Files:**
- `server/jobs/state-machine.js` (259 lines)
- `server/jobs/manager.js` (327 lines)
- `server/jobs/webhook-verify.js` (119 lines)
- `server/jobs/routes.js` (430 lines)
- `server/server.js` (updated)

**State Machine:**
```
NEW → QUEUED → SEGMENTING → BG_GENERATING → COMPOSITING → SHOPIFY_PUSH → DONE
  ↓                                                                          ↓
  └──────────────────────────── FAILED ←────────────────────────────────────┘
```

### Phase 2: AI Providers ✅ COMPLETE

**Commit:** 1997642

**Completed:**
- Base provider interface with `removeBackground()` and `generateBackground()`
- Freepik segment provider (background removal)
- Freepik background provider (themed generation)
- Provider factory with singleton pattern
- S3 integration with `uploadBuffer()` method
- End-to-end testing with real API calls
- Fixed 5-minute URL expiry handling
- Cost tracking: $0.02 segmentation, $0.05-$0.10 generation

**Files:**
- `server/providers/base.js` (100 lines)
- `server/providers/freepik/segment.js` (230 lines)
- `server/providers/freepik/background.js` (360 lines)
- `server/providers/index.js` (120 lines)
- `server/test-freepik.js` (80 lines)
- `server/storage/s3.js` (updated with uploadBuffer)

**Test Results:**
```
✅ API call to Freepik: 2.4s
✅ Image download: 1.7s (167KB)
✅ S3 upload: 0.5s
✅ Presigned URL generation: 0.1s
✅ Total: 4.7s
```

### Phase 3: Compositing Pipeline 🔄 IN PROGRESS

**Status:** Not started

**Goals:**
- Load mask and background from S3
- Resize images to match dimensions
- Composite using Sharp with alpha blending
- Upload result to S3
- Update job status

**Files to Create:**
- `server/workflows/composite.js`
- `server/workflows/index.js`

**Sharp Operations:**
```javascript
import sharp from 'sharp';

// Load mask (PNG with transparency)
const mask = sharp(maskBuffer);
const maskMeta = await mask.metadata();

// Load and resize background to match mask
const background = await sharp(bgBuffer)
  .resize(maskMeta.width, maskMeta.height, { fit: 'cover' })
  .toBuffer();

// Composite: background + mask
const composite = await sharp(background)
  .composite([{
    input: maskBuffer,
    blend: 'over'  // Alpha blending
  }])
  .jpeg({ quality: 90 })
  .toBuffer();
```

### Phase 4: Shopify Integration 📋 PLANNED

**Goals:**
- Auto-lookup product by SKU using metafields
- Cache SKU → productId in `shopify_map` table
- Upload composite image to product
- Handle multi-product scenarios

**Shopify GraphQL:**
```graphql
# 1. Find product by SKU
query findProductBySku($sku: String!) {
  products(first: 1, query: $sku) {
    edges {
      node {
        id
        handle
        title
      }
    }
  }
}

# 2. Upload media to product
mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
  productCreateMedia(productId: $productId, media: $media) {
    media {
      id
      alt
      mediaContentType
    }
    userErrors {
      field
      message
    }
  }
}
```

**Files to Create:**
- `server/integrations/shopify/client.js`
- `server/integrations/shopify/products.js`
- `server/integrations/shopify/media.js`

### Phase 5: n8n Orchestration 📋 PLANNED (Optional)

**Goals:**
- Create n8n workflow template
- Trigger on 3JMS webhook
- Call our API endpoints in sequence
- Handle errors and retries

**Workflow:**
```
Webhook Trigger (3JMS)
  ↓
HTTP Request: POST /api/webhooks/3jms/images
  ↓
Wait 2 seconds
  ↓
HTTP Request: POST /api/jobs/{id}/start
  ↓
Loop until DONE or FAILED:
  - HTTP Request: GET /api/jobs/{id}
  - Wait 10 seconds
  ↓
IF DONE:
  - Send success notification
IF FAILED:
  - Send error notification
```

### Phase 6: 3JMS Integration 📋 PLANNED

**Goals:**
- Implement webhook receiver (already done in Phase 1)
- Add polling fallback for missed webhooks
- Store last poll timestamp in `metadata` table

**Polling Logic:**
```javascript
// Every 5 minutes, check for new images
const lastPoll = getMetadata('last_3jms_poll');
const newImages = await fetch3JMSImages({ since: lastPoll });

for (const image of newImages) {
  createJob({
    sku: image.sku,
    imageUrl: image.url,
    sha256: image.hash,
    theme: 'default'
  });
}

setMetadata('last_3jms_poll', new Date().toISOString());
```

**Files to Create:**
- `server/integrations/threejms/client.js`
- `server/integrations/threejms/poller.js`

### Phase 7: Observability & Cleanup 📋 PLANNED

**Goals:**
- Add comprehensive logging (Winston or Pino)
- Add metrics endpoint (Prometheus format)
- Add health check endpoint
- Cleanup old jobs (retention policy)
- Add cost alerts

**Health Check:**
```http
GET /health

{
  "status": "healthy",
  "uptime": 86400,
  "database": "connected",
  "s3": "connected",
  "freepik": "connected"
}
```

**Metrics:**
```http
GET /metrics

# HELP jobs_total Total number of jobs
# TYPE jobs_total counter
jobs_total{status="done"} 1450
jobs_total{status="failed"} 50

# HELP job_cost_usd Total cost in USD
# TYPE job_cost_usd counter
job_cost_usd 152.30
```

---

## Configuration

### Environment Variables

**Required Variables:**
```bash
# Server
NODE_ENV=production
PORT=4000

# Database
DB_PATH=./data/database.db

# AWS S3
S3_BUCKET=product-photos-ai-vws
AWS_REGION=us-east-1
S3_PRESIGNED_URL_EXPIRY=3600

# AI Provider
AI_PROVIDER=freepik
FREEPIK_API_KEY=FPSX19f7a74f6cb4beca4f2222bb3f9000c3

# 3JMS Integration
THREEJMS_WEBHOOK_SECRET=your-secret-here
THREEJMS_API_URL=https://api.3jms.com
THREEJMS_API_KEY=your-api-key

# Shopify Integration
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
SHOPIFY_API_VERSION=2024-10
```

**Optional Variables:**
```bash
# Job Processing
JOB_MAX_RETRIES=3
JOB_RETRY_DELAY_SECONDS=60

# Theming
DEFAULT_THEME=default
SUPPORTED_THEMES=default,kitchen,outdoors,minimal,luxury

# Cost Limits (warnings only, no hard caps)
COST_WARNING_THRESHOLD_USD=100.00
COST_ALERT_THRESHOLD_USD=500.00

# Observability
LOG_LEVEL=info
METRICS_ENABLED=true
```

### AWS Credentials

Use AWS CLI credentials from `~/.aws/credentials` or environment variables:

```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### S3 Bucket Structure

```
product-photos-ai-vws/
├── originals/
│   └── {sku}/
│       └── {sha256}.jpg
├── masks/
│   └── {sku}/
│       └── {sha256}.png
├── backgrounds/
│   └── {theme}/
│       └── {sku}/
│           └── {sha256}_{variant}.jpg
└── composites/
    └── {theme}/
        └── {sku}/
            └── {sha256}_{variant}.jpg
```

---

## Testing

### Unit Tests

```bash
# Test Freepik integration
node server/test-freepik.js

# Expected output:
# ✅ Provider initialized
# ✅ API call successful
# ✅ Image downloaded (167KB)
# ✅ Uploaded to S3
# ✅ Presigned URL generated
# ✅ Cost: $0.02
```

### Integration Tests

```bash
# Start server
cd server && node server.js

# Test webhook (in another terminal)
curl -X POST http://localhost:4000/api/webhooks/3jms/images \
  -H "Content-Type: application/json" \
  -d '{
    "event": "image.created",
    "sku": "VWS200433868",
    "imageUrl": "https://example.com/photo.jpg",
    "sha256": "abc123def456",
    "takenAt": "2025-11-01T12:00:00Z"
  }'

# Test idempotency (same request again)
# Should return 200 with existing jobId

# Get job status
curl http://localhost:4000/api/jobs/{jobId}
```

### Manual Testing Checklist

- [ ] Create job via webhook
- [ ] Verify idempotency (duplicate webhook)
- [ ] Start job processing
- [ ] Verify S3 uploads
- [ ] Check presigned URLs are accessible
- [ ] Verify state transitions
- [ ] Test error handling (invalid SKU, etc.)
- [ ] Verify cost tracking
- [ ] Test retry logic
- [ ] Verify HMAC signature validation

---

## Deployment

### Production Checklist

**Pre-deployment:**
- [ ] Set all required environment variables
- [ ] Configure AWS credentials
- [ ] Create S3 bucket with correct permissions
- [ ] Run database migrations
- [ ] Test Freepik API key
- [ ] Test Shopify API key
- [ ] Configure 3JMS webhook URL

**Deployment:**
```bash
# Install dependencies
cd server
npm install --production

# Run migrations
node -e "import('./db.js').then(db => db.runMigrations())"

# Start server (with PM2 for production)
pm2 start server.js --name "product-photo-ai"
pm2 save
```

**Post-deployment:**
- [ ] Verify health endpoint responds
- [ ] Test webhook endpoint
- [ ] Monitor logs for errors
- [ ] Check S3 uploads
- [ ] Verify Shopify integration
- [ ] Set up monitoring/alerting

### Environment-Specific Settings

**Development:**
```bash
NODE_ENV=development
THREEJMS_WEBHOOK_SECRET=  # Optional, skips HMAC verification
LOG_LEVEL=debug
```

**Production:**
```bash
NODE_ENV=production
THREEJMS_WEBHOOK_SECRET=<strong-secret>  # Required!
LOG_LEVEL=info
```

---

## Cost Estimates

### Per-Job Breakdown

| Operation | Provider | Cost |
|-----------|----------|------|
| Background Removal | Freepik | $0.02 |
| Background Generation (2k) | Freepik | $0.05 |
| Background Generation (4k) | Freepik | $0.10 |
| Compositing | Sharp (free) | $0.00 |
| **Total per job (2k)** | | **$0.07** |
| **Total per job (4k)** | | **$0.12** |

### S3 Storage Costs

- **PUT requests:** $0.005 per 1,000 (negligible)
- **Storage:** $0.023 per GB/month
- **Data transfer:** First 100GB free, then $0.09/GB

**Example:**
- 1,000 jobs/month
- 4 images per job (original, mask, background, composite)
- ~2MB per image
- Total storage: 8GB/month = **$0.18/month**

### Total Cost Estimate

**1,000 jobs/month:**
- AI costs (2k): 1,000 × $0.07 = **$70**
- S3 storage: **$0.18**
- S3 bandwidth: ~8GB = **Free**
- **Total: ~$70/month**

**With $5 Freepik credit:**
- Can process: $5 / $0.07 = **~71 jobs**

---

## Troubleshooting

### Common Issues

**1. Freepik API returns 400 "Failed to download the image"**
- Freepik cannot access the image URL
- Check if URL is publicly accessible
- Verify URL uses HTTPS (not HTTP)
- Try a different test image

**2. S3 upload fails with "AccessDenied"**
- Check AWS credentials are configured
- Verify IAM permissions include `s3:PutObject`
- Check bucket name is correct

**3. Job stuck in SEGMENTING status**
- Check Freepik API key is valid
- Verify network connectivity
- Check API rate limits
- Look for error in `errorMessage` field

**4. Webhook returns 401 "Invalid signature"**
- HMAC verification failed
- Check `THREEJMS_WEBHOOK_SECRET` matches 3JMS configuration
- Verify raw body is being captured before JSON parsing
- In development, leave secret empty to skip verification

**5. Database locked error**
- SQLite doesn't support concurrent writes
- Ensure only one server instance is running
- Consider using WAL mode: `PRAGMA journal_mode=WAL`

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug node server.js

# View all logs
tail -f logs/combined.log

# View only errors
tail -f logs/error.log
```

---

## Future Enhancements

### Planned Features

1. **Multi-variant support**
   - Generate 3-5 backgrounds per theme
   - Let Shopify admins choose favorites

2. **A/B testing**
   - Track which backgrounds convert better
   - Auto-select winning variants

3. **Custom themes**
   - UI for creating custom prompts
   - Theme library with previews

4. **Batch processing**
   - Process multiple SKUs at once
   - Bulk upload to Shopify

5. **Quality scoring**
   - Use AI to score composite quality
   - Auto-retry if quality is low

6. **Analytics dashboard**
   - Cost tracking over time
   - Success/failure rates
   - Processing time metrics

### Provider Expansion

**Replicate (as alternative to Freepik):**
```javascript
// server/providers/replicate/segment.js
// server/providers/replicate/background.js
```

**Stability AI:**
```javascript
// server/providers/stability/segment.js
// server/providers/stability/background.js
```

---

## Contributing

### Code Style

- ES Modules (`import`/`export`)
- JSDoc comments for all functions
- Descriptive variable names
- Error handling with try/catch
- Logging for all operations

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/compositing-pipeline

# Make changes and commit
git add .
git commit -m "Phase 3 - Compositing Pipeline

Implemented Sharp-based image compositing..."

# Push and create PR
git push origin feature/compositing-pipeline
```

### Testing Requirements

- Unit tests for all providers
- Integration tests for API endpoints
- Manual testing checklist completion
- Cost estimation for new features

---

## License

Proprietary - All Rights Reserved

---

## Contact

For questions or support:
- GitHub Issues: [ProductPhotoCapture/issues](https://github.com/Stewart-Y/ProductPhotoCapture/issues)
- Documentation: This file

---

**Last Updated:** November 1, 2025
**Current Phase:** Phase 2 Complete, Phase 3 Starting
**Version:** v0.2.0-alpha
