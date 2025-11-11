# ProductPhotoCapture - Complete Codebase Overview

**Last Updated**: November 8, 2025  
**Environment**: EC2 (98.89.71.150) - Ubuntu 24.04  
**Live URL**: https://product-photos.click  
**Status**: Phase 1 Complete - Security Hardened, Recent: Nano Banana (Gemini) Integration Added

---

## 1. PROJECT STRUCTURE & ARCHITECTURE

```
ProductPhotoCapture/
├── client/                          # React 19 Frontend (Vite)
│   ├── src/
│   │   ├── pages/                   # Route pages (Dashboard, Jobs, Settings, etc.)
│   │   ├── components/              # Reusable UI components
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── lib/                     # API client utilities
│   │   └── app/                     # Router configuration
│   ├── dist/                        # Production build output
│   └── package.json                 # React + TanStack Router + TailwindCSS
│
├── server/                          # Express Backend (Node.js 18+)
│   ├── server.js                    # Main Express app entry point
│   ├── db.js                        # SQLite3 database initialization + migrations
│   ├── schema.sql                   # Base database schema
│   ├── tjms-client.js               # 3JMS API client (Vista Wine & Spirits)
│   │
│   ├── jobs/                        # Job Queue System
│   │   ├── routes.js                # API endpoints (1700+ lines)
│   │   ├── manager.js               # Job CRUD & state management
│   │   ├── state-machine.js         # Job status transitions (NEW → DONE)
│   │   └── webhook-verify.js        # Webhook signature verification
│   │
│   ├── workflows/                   # Processing Pipeline
│   │   ├── processor.js             # Background job processor (Flow v2)
│   │   ├── composite.js             # Image compositing orchestration
│   │   ├── derivatives.js           # Generate multiple sizes/formats
│   │   ├── manifest.js              # Build job output manifest
│   │   ├── template-generator.js    # AI background template creation
│   │   ├── srgb-normalizer.js       # Color space normalization
│   │   └── index.js                 # Workflow exports
│   │
│   ├── providers/                   # Pluggable AI Provider System
│   │   ├── index.js                 # Provider factory
│   │   ├── base.js                  # Base provider interface
│   │   ├── freepik/                 # Freepik API integrations
│   │   │   ├── segment.js           # Background removal
│   │   │   ├── background.js        # Background generation
│   │   │   ├── seedream.js          # Seedream 4 Edit API
│   │   │   └── composite.js         # Compositing orchestration
│   │   └── nanobanana/              # Gemini Flash Integration (NEW)
│   │       └── composite.js         # Gemini 2.5 Flash via OpenRouter
│   │
│   ├── storage/                     # S3 Integration
│   │   ├── index.js                 # Storage factory
│   │   └── s3.js                    # AWS S3 client (presigned URLs)
│   │
│   ├── migrations/                  # Database migrations
│   │   ├── 002-jobs-and-shopify.sql # Job queue schema
│   │   ├── 003-flow-v2-schema.sql   # Flow v2 status fields
│   │   ├── 004-workflow-preference.sql # Workflow selection
│   │   ├── 005-background-templates.sql # Template storage
│   │   ├── 006-custom-prompts.sql   # User prompt presets
│   │   └── 007-template-variant-selection.sql # Variant selection
│   │
│   ├── utils/                       # Utility functions
│   ├── integrations/                # 3rd party integrations
│   ├── uploads/                     # Local file storage
│   │   ├── thumbnails/              # Generated thumbnails
│   │   └── tmp/                     # Temporary files
│   │
│   └── package.json                 # Node deps (Express, Sharp, AWS SDK)
│
├── ecosystem.config.js              # PM2 process configuration
├── deploy.sh                        # Production deployment script
├── deploy-staging.sh                # Staging deployment script
├── fix-production-ui.sh             # UI fix script (recent commit)
│
├── n8n-setup-scripts/               # N8n workflow automation (legacy)
├── n8n-workflows/                   # N8n workflow definitions
│
└── Documentation/                   # Various setup & integration guides
    ├── README.md
    ├── DEPLOYMENT_GUIDE.md
    ├── GEMINI_SETUP_GUIDE.md        # Nano Banana (NEW)
    ├── 3JMS_INTEGRATION_SETUP.md
    ├── AWS_S3_SETUP.md
    └── [20+ other guides]
```

---

## 2. BACKEND ARCHITECTURE

### 2.1 Server Stack
- **Framework**: Express 4.19.2
- **Runtime**: Node.js (ES Modules)
- **Database**: SQLite3 (better-sqlite3 9.4.0)
- **Image Processing**: Sharp 0.34.4
- **HTTP Client**: node-fetch 3.3.2
- **Validation**: Zod 4.1.12
- **Process Manager**: PM2 (ecosystem.config.js)

### 2.2 Main Entry Point (server.js)

**Key Features**:
- CORS configuration with origin whitelist
- Webhook raw body capture for signature verification
- Static file serving (uploads)
- Health check endpoint: `GET /api/health`

**Core Endpoints**:
```
POST   /api/webhooks/3jms/images     # Webhook from 3JMS (creates jobs)
POST   /api/jobs/:id/start           # Start job, get presigned URLs
GET    /api/jobs/:id                 # Poll job status
GET    /api/jobs                     # List jobs with filters
POST   /api/jobs/:id/fail            # Mark job as failed
GET    /api/processor/status         # Get processor state
GET    /api/processor/config         # Get processor configuration
```

### 2.3 Database Schema

**Core Tables**:

1. **items** - Product inventory
   - id (TEXT PRIMARY KEY)
   - sku, name, brand, year, category, size
   - warehouse location fields (shelf, row, column)
   - descriptive fields (description, ABV, weight, etc.)
   - image_url (main product photo)

2. **photos** - Photo gallery for each item
   - id (TEXT PRIMARY KEY)
   - item_id (FK → items.id)
   - url, file_name, created_at
   - position (for ordering)

3. **jobs** - AI processing jobs
   - id, sku, theme, status
   - source_url, img_sha256
   - S3 keys: s3_original_key, s3_mask_key, s3_cutout_key
   - S3 arrays: s3_bg_keys, s3_composite_keys, s3_derivative_keys, s3_thumb_keys
   - shopify_media_ids (uploaded media)
   - error tracking: error_code, error_message, error_stack
   - timing: created_at, started_at, completed_at
   - cost tracking: processing_cost_usd

4. **background_templates** - Reusable background templates
   - id, name, theme, prompt, status
   - created_at, updated_at
   - used_count

5. **template_assets** - Individual template variants
   - template_id (FK), variant number
   - s3_key, s3_url, s3_url_expires_at
   - width, height, format, size_bytes
   - selected flag

6. **custom_prompts** - User-created AI prompts
   - id, title, prompt
   - is_default flag
   - used_count

7. **settings** - Key-value configuration store
   - key (TEXT PRIMARY KEY)
   - value
   - Stores: workflow_preference, ai_compositor, active_background_template, selected_prompt_id

### 2.4 Job Processing Pipeline (Flow v2)

**State Machine** (state-machine.js):
```
NEW 
  ↓
BG_REMOVED        (background removal + mask generated)
  ↓
BACKGROUND_READY  (background variants generated)
  ↓
COMPOSITED        (product + background composited, shadow added)
  ↓
DERIVATIVES       (multiple sizes and formats created)
  ↓
SHOPIFY_PUSH      (uploading to Shopify)
  ↓
DONE              (completed successfully)

OR → FAILED       (at any stage)
```

**Processor Architecture** (processor.js):
- Runs as background worker (started in server.js)
- Polls for NEW jobs every 5 seconds
- Configurable concurrency (default: 1 job at a time)
- Each step is a distinct function with retry logic
- Cost tracking per job

### 2.5 API Endpoints Structure

**Photo Management** (from server.js):
```
GET    /api/items                      # List all inventory items
GET    /api/items/:id                  # Get item with all fields
PUT    /api/items/:id                  # Update item metadata
POST   /api/items/:id/upload-image    # Upload & process main image
GET    /api/items/:id/photos          # Get photo gallery
POST   /api/items/:id/photos          # Add photo to gallery
DELETE /api/items/:id/photos/:photoId # Delete photo
PUT    /api/items/:id/photos/reorder  # Reorder photos
PUT    /api/items/:id/set-main-image  # Set existing photo as main
```

**3JMS Integration** (from server.js):
```
GET    /api/tjms/sync-status          # Get sync stats
POST   /api/tjms/import                # Background import from 3JMS
GET    /api/tjms/test-permissions     # Test API permissions
POST   /api/tjms/push/:id              # Push item changes back to 3JMS
```

**Job Processing** (from jobs/routes.js):
```
POST   /api/webhooks/3jms/images              # Receive webhook (idempotent)
POST   /api/jobs/:id/start                    # Transition to QUEUED, get presigned URLs
GET    /api/jobs/:id                          # Get job status & assets
POST   /api/jobs/:id/segmentation            # Update after segmentation
POST   /api/jobs/:id/backgrounds             # Update after BG generation
POST   /api/jobs/:id/composite/run           # Run compositing workflow
POST   /api/jobs/:id/composite               # Update after compositing
POST   /api/jobs/:id/shopify                 # Mark complete with Shopify media IDs
POST   /api/jobs/:id/fail                    # Mark as failed
GET    /api/jobs                              # List jobs with filters
GET    /api/jobs/stats                       # Dashboard statistics
```

**Presigned URL Generation**:
```
GET    /api/jobs/:id/presign                 # Generate presigned GET URL
POST   /api/jobs/:id/presign                 # Generate presigned PUT/GET URLs
GET    /api/s3/presign                       # Generate URL for any S3 key
```

**Background Templates**:
```
GET    /api/templates                        # List templates
GET    /api/templates/:id                    # Get template with assets
POST   /api/templates                        # Create template (async generation)
POST   /api/templates/upload                 # Upload custom background image
PUT    /api/templates/:id                    # Update template metadata
DELETE /api/templates/:id                    # Archive template
POST   /api/templates/:id/regenerate         # Generate additional variants
GET    /api/settings/active-template         # Get active background template
POST   /api/settings/active-template         # Set active template
```

**Custom Prompts**:
```
GET    /api/custom-prompts                   # List all prompts
POST   /api/custom-prompts                   # Create new prompt
DELETE /api/custom-prompts/:id               # Delete prompt (non-default only)
PATCH  /api/custom-prompts/:id               # Update prompt
POST   /api/settings/selected-prompt         # Select active prompt
GET    /api/settings/selected-prompt         # Get selected prompt ID
```

**Workflow Settings**:
```
GET    /api/settings/workflow                # Get workflow preference (cutout_composite or seedream_edit)
POST   /api/settings/workflow                # Save workflow preference
GET    /api/settings/compositor              # Get AI compositor (freepik or nanobanana)
POST   /api/settings/compositor              # Set AI compositor
```

**Testing/Debugging**:
```
POST   /api/upload-test-image                # Upload image for webhook testing
GET    /api/prompts/cutout                   # Get cutout prompt
POST   /api/prompts/cutout                   # Save cutout prompt
GET    /api/prompts/background               # Get background prompt
POST   /api/prompts/background               # Save background prompt
```

### 2.6 AI Provider System (Pluggable Architecture)

**Current Providers**:

1. **Freepik** (Active)
   - Segmentation: Removes background → PNG mask
   - Background: Generates themed backgrounds via Stable Diffusion XL
   - Compositing: Freepik Seedream 4 Edit API (better than manual compositing)
   - Cost: ~$0.07-0.12 per job

2. **Nano Banana (Gemini Flash)** (NEW - Added in recent commit)
   - Uses Gemini 2.5 Flash via OpenRouter API
   - Single-step compositing (faster, cheaper)
   - Better text preservation in images
   - Cost: ~$0.03 per job (60% cheaper)
   - Status: Implemented but API key issues noted in GEMINI_SETUP_GUIDE.md

**Provider Interface** (base.js):
```javascript
class BaseProvider {
  async startJob(inputUrl, options)  // Returns { jobId, status }
  async getStatus(jobId)             // Returns { status, progress?, resultUrl? }
  async cancel(jobId)                // Cancel running job
  estimateCost(options)              // Return USD estimate
}
```

### 2.7 S3 Storage Integration

**S3 Key Structure**:
```
sku/{sku}/original/{sha256}.jpg          # Original product photo
sku/{sku}/mask/{sha256}.png              # Segmentation mask
sku/{sku}/cutout/{sha256}.png            # Cutout (product with alpha)
sku/{sku}/bg/{theme}/{sha256}/{variant}  # Background variants
sku/{sku}/composite/{theme}/{sha256}/... # Final composited images
sku/{sku}/derivatives/{sha256}/...       # Multiple sizes/formats
sku/{sku}/thumb/{sha256}.jpg             # Thumbnail
test-uploads/...                         # Test image uploads
templates/generated/...                  # Template generation cache
templates/uploaded/...                   # User-uploaded templates
```

**Presigned URLs**:
- Generated on-demand for secure access
- PUT URLs: For uploading from external services
- GET URLs: For viewing/downloading
- Expiration: Configurable (default 1 hour)

### 2.8 3JMS Integration (Vista Wine & Spirits)

**Features**:
- Read-only API token for inventory sync
- Background import (up to 100 pages, rate-limited to 40 req/min)
- Preserves existing photos during sync
- Maps 3JMS fields to local schema
- Push capability (if token has write permission)

**Flow**:
1. Call `POST /api/tjms/import`
2. Returns immediately, processes in background
3. Fetches up to 10,000 items (100 pages × 100 items/page)
4. Inserts or updates items
5. Respects rate limits automatically

---

## 3. FRONTEND ARCHITECTURE

### 3.1 Technology Stack
- **Framework**: React 19.1.1
- **Router**: React Router 7.9.4 (client-side routing)
- **Data Fetching**: TanStack React Query 5.90.6
- **Tables**: TanStack React Table 8.21.3
- **Charts**: Recharts 3.3.0
- **Styling**: TailwindCSS 4.1.16 + custom components
- **Build Tool**: Vite 7.1.7
- **Language**: TypeScript 5.9.3

### 3.2 Page Structure

**Main Routes**:
1. **Dashboard** (`/`) - Overview & statistics
   - Job stats (today's count, cost, timing)
   - Real-time processor status
   - Quick action buttons

2. **Inventory** (`/`) - Product catalog
   - List all items with search/filter
   - Quick photo upload
   - Direct to item detail

3. **Item Detail** (`/items/:id`) - Full product editor
   - Product metadata (SKU, brand, category, etc.)
   - Photo gallery with drag-reorder
   - Set main image
   - Warehouse location tracking

4. **Jobs** (`/jobs`) - Job queue management
   - List all jobs with status
   - Filter by status, SKU, theme
   - View job details (modal)
   - Presigned URL generation for assets

5. **Job Detail** (`/jobs/:id`) - Deep dive into single job
   - Full job lifecycle & timing
   - Asset gallery (original, mask, composite, etc.)
   - S3 key management
   - Error details if failed
   - Visual pipeline viewer (recent feature)

6. **Background Templates** (`/templates`) - Template management
   - Create templates (async generation)
   - Upload custom backgrounds
   - View generated variants
   - Set active template
   - Manage variants

7. **Settings** (`/settings`) - Configuration
   - Workflow preference (cutout_composite vs seedream_edit)
   - AI Compositor selection (freepik vs nanobanana)
   - Custom prompt management
   - Active background template selection

8. **Webhook Simulator** (`/webhook`) - Testing
   - Manual webhook trigger
   - Test image upload
   - Verify webhook signature

9. **Shopify Integration** (`/shopify`) - Future integration
   - Connect to Shopify store
   - Product synchronization
   - Media upload tracking

### 3.3 Component Architecture

**Layout**:
- `Sidebar.tsx` - Navigation menu
- `TopBar.tsx` - User info, current page indicator
- `Header.tsx` - Page title & breadcrumbs

**Shared Components**:
- `Card.tsx` - Card container (Shadcn-like)
- `Button.tsx` - Styled button
- `Input.tsx` - Form input
- `Select.tsx` - Dropdown select
- `Badge.tsx` - Status badge
- `Table.tsx` - Data table (TanStack Table)
- `StatCard.tsx` - Statistics display
- `Spinner.tsx` - Loading spinner
- `LoadingOverlay.tsx` - Full-page loading

**Feature Components**:
- `PhotoGallery.tsx` - Drag-and-drop photo management
- `PhotoGridModal.tsx` - Photo grid viewer
- `PhotoCaptureModal.tsx` - Camera capture interface
- `TestUploadModal.tsx` - Test image upload

### 3.4 Data Flow & State Management

**Query Pattern** (React Query):
```javascript
// Fetch jobs
const { data: jobs } = useQuery({
  queryKey: ['jobs'],
  queryFn: () => api.listJobs()
});

// Poll job status
const { data: job } = useQuery({
  queryKey: ['job', jobId],
  queryFn: () => api.getJob(jobId),
  refetchInterval: 2000  // Poll every 2 seconds
});
```

**API Client** (lib/):
- Centralized fetch wrapper
- Error handling
- Automatic retry logic
- Authorization headers (if needed)

---

## 4. KEY FEATURES & WORKFLOWS

### 4.1 Photo Capture & Management
**User Flow**:
1. Browse inventory (Dashboard or Items page)
2. Click "Add Photo" on item
3. Choose source:
   - Camera capture (mobile/webcam)
   - File upload
   - URL (test image)
4. Photo is processed:
   - Uploaded to server
   - Auto-rotated via Sharp
   - Full-size generated (max 2048px, quality 92)
   - Thumbnail generated (300x300, quality 85)
5. Displayed in gallery with:
   - Drag-reorder
   - Set as main image
   - Delete
   - Presigned URL for external access

### 4.2 AI Image Enhancement Pipeline

**High-Level Flow**:
```
User uploads image
  ↓
Image saved to S3 (original)
  ↓ Webhook triggered with SKU + SHA256
  ↓
Job created (NEW status)
  ↓ [Background Job Processor]
  ↓
1. Segmentation (Freepik or Freepik Seedream)
   - Input: Original image
   - Output: Mask + Cutout
   - Result: BG_REMOVED status
  ↓
2. Background Generation
   - Input: Cutout + Prompt
   - Output: Background variants
   - Result: BACKGROUND_READY status
  ↓
3. Compositing (Seedream 4 Edit or Gemini Flash)
   - Input: Cutout + Background
   - Output: Composite with shadow + centering
   - Result: COMPOSITED status
  ↓
4. Derivatives
   - Generate multiple sizes (100px - 2048px)
   - Multiple formats (JPEG, PNG, WebP)
   - Result: DERIVATIVES status
  ↓
5. Shopify Upload
   - Push to Shopify via API
   - Store media IDs
   - Result: SHOPIFY_PUSH → DONE
```

**Custom Prompts**:
- Default: Professional studio background with empty center
- Users can create presets for different product types
- Stored in `custom_prompts` table
- Selected via `/api/settings/selected-prompt`

**Background Templates**:
- Pre-generated background variants
- Reusable across multiple jobs
- Can be:
  - AI-generated (async via `/api/templates`)
  - User-uploaded (via `/api/templates/upload`)
- Each template has multiple variants
- Variants can be marked as "selected"

### 4.3 Webhook Integration (3JMS)

**Trigger**:
```
3JMS system detects photo upload → 
Sends webhook to ProductPhotoCapture
```

**Webhook Signature Verification**:
- Uses HMAC-SHA256 signature
- Stored in `X-3JMS-Signature` header
- Secret key in environment variable
- Verified in `webhook-verify.js`

**Idempotent Job Creation**:
- Checks for existing job with same `sku + sha256`
- Returns 200 with `"duplicate"` status if exists
- Returns 201 with `"created"` status if new
- Prevents duplicate processing

### 4.4 Background Template Generation

**User Experience**:
1. Go to Templates page
2. Click "Create Template"
3. Enter:
   - Template name
   - Custom prompt (or select from presets)
   - Variant count (how many variations to generate)
4. Template created with `status: 'pending'`
5. Generation happens async (backend processes)
6. UI shows template with progress
7. When done, shows all generated variants
8. User can select which variants to use

**Backend Implementation**:
- `POST /api/templates` accepts name + prompt
- Creates template record with `status: 'pending'`
- Calls Freepik API to generate 3-5 variants
- Uploads each to S3
- Updates template with S3 URLs
- Sets `status: 'active'` when complete

### 4.5 3JMS Inventory Sync

**Flow**:
1. Click "Import from 3JMS" on Settings
2. Request sent to `POST /api/tjms/import`
3. Server responds immediately (job runs in background)
4. Backend:
   - Fetches all inventory SKUs (paginated)
   - For each item: check if exists locally
   - If exists: update metadata (preserve photos)
   - If new: insert with all fields
   - Respects rate limits (40 req/min)
5. Can sync up to 10,000 items

**Data Mapping**:
```
3JMS Field          → Local Field
item_id/vws_product_sku → id (primary key)
name/full_display_name  → name
brand               → brand
vintage/year        → year
bottle_size/size    → size
case_size/pack_size → case_size
abv                 → abv
weight              → weight
discontinued/inactive   → discontinued (boolean)
location/shelf      → warehouse_shelf
row/column/bin      → warehouse_row/column
```

---

## 5. RECENT CHANGES & FEATURES

### 5.1 Most Recent Commits

**Commit 2e41add** (Nov 7, 2025):
- **Fix**: Production UI showing only "client" text
- **File Modified**: fix-production-ui.sh
- Indicates recent UI rendering issue on production EC2

**Commit 021c3a2** (Nov 6, 2025):
- **Docs**: Comprehensive staging and production deployment guide
- **File**: DEPLOYMENT_GUIDE.md
- Multi-environment setup documentation

**Commit ceb7fe2** (Nov 6, 2025):
- **Docs**: Mac development environment setup guides
- Improved local development experience

**Commit 44f6714** (Nov 4, 2025):
- **Feature**: Add Nano Banana compositor and enhanced admin tools
- **Files**: 
  - `/server/providers/nanobanana/composite.js` (NEW)
  - Enhanced admin UI for compositor selection
- **What**: Integrated Gemini 2.5 Flash via OpenRouter for image compositing
- **Why**: 60% cheaper than Freepik, better text preservation

**Commit 790fc4a** (Oct 28, 2025):
- **Feature**: Complete Phase 1 security hardening with comprehensive fixes
- **Changes**:
  - CORS whitelist implementation
  - API key rotation capability
  - Input validation with Zod
  - SQL injection prevention
  - Rate limiting readiness

### 5.2 Major Features Implemented

**Phase 1 Complete**:
1. ✅ Inventory management (CRUD)
2. ✅ Photo capture & gallery
3. ✅ AI image enhancement pipeline
4. ✅ 3JMS integration (read + write)
5. ✅ Background template system
6. ✅ Custom prompts for AI
7. ✅ Workflow preference selection (2 modes)
8. ✅ Compositor selection (Freepik vs Gemini)
9. ✅ Security hardening
10. ✅ Admin tools & monitoring

**Not Yet Implemented**:
- Shopify integration (endpoint exists, not complete)
- Webhook signing from ProductPhotoCapture back to 3JMS
- Redis caching (uses in-memory)
- Batch job processing (current: 1 at a time)

### 5.3 Workflow Preferences

**Two Processing Modes**:

1. **cutout_composite** (Recommended for most products)
   - Step 1: Segment background (Freepik)
   - Step 2: Generate background (Stable Diffusion XL)
   - Step 3: Composite with Seedream 4 Edit
   - Quality: Very good, professional results
   - Cost: $0.07-0.12 per job

2. **seedream_edit** (Future alt workflow)
   - Single call to Seedream
   - Placeholder for future implementation
   - Currently uses Freepik

### 5.4 AI Compositor Options

**Freepik** (Default - Stable):
- Proven production use
- Seedream 4 Edit API (v2024.10)
- Generates high-quality composites
- Cost: Part of background generation cost

**Nano Banana (Gemini Flash)** (NEW):
- Gemini 2.5 Flash model via OpenRouter
- Single-step composite (faster)
- Better text preservation
- 60% cheaper
- Status: Implemented, API key setup required
- See: GEMINI_SETUP_GUIDE.md

---

## 6. CONFIGURATION & ENVIRONMENT

### 6.1 Environment Variables

**Database**:
```bash
DB_PATH=./db.sqlite  # SQLite database location
```

**Server**:
```bash
PORT=4000                    # Express port
NODE_ENV=production          # Environment mode
ALLOWED_ORIGINS=...          # CORS whitelist
```

**AI Providers**:
```bash
AI_PROVIDER=freepik          # Default provider
AI_COMPOSITOR=freepik        # For compositing (freepik or nanobanana)
FREEPIK_API_KEY=...          # Freepik API token
NANOBANANA_API_KEY=...       # OpenRouter API key for Gemini
```

**AWS S3**:
```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=...
```

**3JMS Integration**:
```bash
TJMS_API_BASE_URL=https://3jms.vistawinespirits.com
TJMS_API_KEY=...             # API token from 3JMS
TJMS_WEBHOOK_SECRET=...      # For signature verification
```

**Job Processing**:
```bash
ENABLE_WORKER=true           # Enable background processor
JOB_POLL_INTERVAL_MS=5000    # Poll every 5 seconds
JOB_CONCURRENCY=1            # Process 1 job at a time
JOB_MAX_RETRIES=3            # Retry failed steps 3 times
JOB_RETRY_DELAY_MS=60000     # Wait 1 minute between retries
```

**Images**:
```bash
IMAGE_MAX_PER_SKU=4          # Max photos per product
DEFAULT_THEME=default        # Default background theme
```

### 6.2 PM2 Ecosystem Configuration

**File**: `ecosystem.config.js`

```javascript
{
  apps: [
    {
      name: 'prod-server',
      script: './server/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      instances: 1,
      max_memory_restart: '1G'
    },
    {
      name: 'prod-client',
      script: 'npx serve ./client/dist -l 5173 -s',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1
    },
    // + staging equivalents on ports 4001, 5174
  ]
}
```

**Key Settings**:
- Auto-restart on crash
- No watch (production)
- 1GB memory limit
- Graceful shutdown handling

### 6.3 Deployment Scripts

**`deploy.sh`**:
- Pushes to EC2 (98.89.71.150)
- Pulls latest from GitHub
- Installs dependencies
- Builds React client
- Restarts PM2 processes
- Verifies with health checks

**`deploy-staging.sh`**:
- Similar flow but to staging environment
- Uses separate database (db-staging.sqlite)
- Separate PM2 process names

**`fix-production-ui.sh`** (NEW):
- Specifically fixes UI rendering issues
- Recent addition (last commit)

---

## 7. SECURITY & HARDENING

### 7.1 Implemented Security Measures

**CORS Protection**:
- Whitelist-based origin validation
- Blocks all cross-origin requests except allowed origins
- Configurable via `ALLOWED_ORIGINS` env var

**Input Validation**:
- Zod schema validation for all webhook payloads
- Type checking on all API inputs
- Prevents injection attacks

**Webhook Verification**:
- HMAC-SHA256 signature verification
- Ensures requests truly from 3JMS
- Prevents spoofed webhooks

**API Key Management**:
- Never hardcoded (all from environment)
- Token rotation capability documented
- Separate tokens for different services

**Database**:
- Parameterized queries (better-sqlite3)
- No string concatenation in SQL
- Transaction support for data consistency

### 7.2 Still To Do

- Rate limiting (endpoints ready, not enforced)
- Auth/authorization (currently open API)
- HTTPS validation (via Nginx in production)
- Request signing for outbound webhooks

---

## 8. PERFORMANCE & MONITORING

### 8.1 Job Statistics Dashboard

**Available Metrics**:
```
GET /api/jobs/stats → {
  today: {
    total: number,      // Jobs created today
    done: number,       // Completed
    failed: number      // Failed
  },
  cost: {
    avgPerJob24h: number,  // Average cost per job
    totalMTD: number       // Total cost month-to-date
  },
  timing: {
    avgProcessingTime: number  // Average hours to complete
  }
}
```

### 8.2 Processor Status

```
GET /api/processor/status → {
  isRunning: boolean,
  config: {
    pollInterval: ms,
    concurrency: number,
    maxRetries: number
  },
  activeJobs: number,
  stats: {
    jobsProcessed: number,
    jobsFailed: number,
    totalCost: usd
  }
}
```

### 8.3 Logging

**Server Logs via PM2**:
```bash
# View all logs
pm2 logs

# Follow specific service
pm2 logs prod-server --lines 50

# Filter by pattern
pm2 logs prod-server | grep "error"
```

**Log Prefixes** (for grep):
- `[Server]` - Server startup
- `[Processor]` - Job processor
- `[Webhook]` - Webhook handling
- `[Job Start/Get/Fail]` - Job operations
- `[3JMS]` - 3JMS integration
- `[Freepik]` / `[NanoBanana]` - AI provider calls
- `[Composite]` - Compositing operations
- `[S3]` - S3 storage operations

---

## 9. INFRASTRUCTURE

### 9.1 EC2 Deployment

**Instance Details**:
- **Type**: t3.small
- **IP**: 98.89.71.150
- **OS**: Ubuntu 24.04 LTS
- **Region**: us-east-1 (Virginia)

**Services Running**:
- Nginx (reverse proxy, HTTPS termination)
- Node.js (Express server, port 4000)
- Serve (static client, port 5173)
- SQLite (local database)
- PM2 (process manager)

**Reverse Proxy (Nginx)**:
- Handles HTTPS (SSL certificate)
- Routes `/api/*` to Express (port 4000)
- Routes `/*` to static client (port 5173)
- Domain: product-photos.click

### 9.2 S3 Buckets

**Main Bucket**:
- Stores all processed images
- Organized by SKU
- Presigned URLs for secure access
- Lifecycle policies (optional)

**Key Structure**:
```
bucket/
├── sku/{sku}/
│   ├── original/{sha256}.jpg
│   ├── mask/{sha256}.png
│   ├── cutout/{sha256}.png
│   ├── bg/{theme}/...
│   ├── composite/{theme}/...
│   ├── derivatives/{sha256}/...
│   └── thumb/{sha256}.jpg
├── test-uploads/...
└── templates/...
```

### 9.3 Cost Breakdown

**Infrastructure** (~$15-20/month):
- EC2 t3.small: ~$15/month
- Data transfer out: ~$1-5/month
- S3 storage: <$1/month (images deleted after use)

**AI Processing** (pay-per-use):
- **Freepik**: $0.07-0.12 per job
  - Segmentation: $0.02
  - Background: $0.05-0.10
- **Gemini Flash (Nano Banana)**: $0.03 per job
  - Single composite call

**Example**: 1000 jobs/month with Freepik = ~$70-120/month

---

## 10. DEVELOPMENT GUIDE

### 10.1 Local Setup

**Backend**:
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev
```

**Frontend**:
```bash
cd client
npm install
npm run dev
# Access at http://localhost:5173
```

**Database**:
- Auto-created on first run (server/db.sqlite)
- Migrations run automatically
- Demo items inserted if empty

### 10.2 Testing Workflows

**Manual Webhook Test**:
```bash
curl -X POST http://localhost:4000/api/webhooks/3jms/images \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "TEST-001",
    "imageUrl": "https://via.placeholder.com/500",
    "sha256": "test123abc...",
    "takenAt": "2025-11-08T12:00:00Z"
  }'
```

**Test Image Upload**:
```bash
curl -X POST http://localhost:4000/api/upload-test-image \
  -F "file=@/path/to/image.jpg"
# Returns presigned URL for webhook testing
```

**Check Job Status**:
```bash
curl http://localhost:4000/api/jobs/{jobId}
```

### 10.3 Git Workflow

**Branches**:
- `main` - Production (deploy.sh targets this)
- `develop` - Integration branch
- Feature branches off develop

**Commit Strategy**:
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- Each commit should be deployable (staging)
- Document migrations in commit message

---

## 11. KNOWN ISSUES & NOTES

### 11.1 Current Status

**Working Well**:
- ✅ Core photo capture and gallery
- ✅ Freepik AI pipeline (stable, proven)
- ✅ 3JMS inventory sync
- ✅ Database and migrations
- ✅ Job queue and processor
- ✅ S3 storage with presigned URLs
- ✅ Custom prompts and templates
- ✅ Admin UI for settings

**Known Issues**:
- ❌ Recent UI rendering bug on production (being fixed)
- ⚠️  Nano Banana (Gemini) API key invalid (needs OpenRouter setup)
- ⚠️  No authentication/authorization yet (API is open)
- ⚠️  Rate limiting not enforced (infrastructure ready)
- ⚠️  Shopify integration endpoints exist but incomplete

### 11.2 Technical Debt

1. **In-Memory Job Tracking**: Uses Set, should use Redis in production
2. **No Webhook Signing**: Can't verify responses back to 3JMS
3. **Synchronous S3 Uploads**: Could be improved with batch uploads
4. **Database Transactions**: Limited transaction support currently
5. **Error Recovery**: Some edge cases not handled (e.g., partial failures)

### 11.3 Future Roadmap

- [ ] Authentication & authorization layer
- [ ] Complete Shopify integration
- [ ] Batch job processing (concurrent processing)
- [ ] Redis for job state (instead of SQLite)
- [ ] Real-time WebSocket updates
- [ ] Advanced analytics dashboard
- [ ] Automated quality checks
- [ ] Image CDN integration

---

## 12. USEFUL COMMANDS

### Backend

```bash
# Development
cd server && npm run dev

# Production start
cd server && npm start

# Check database
sqlite3 db.sqlite ".tables"

# View processor logs
pm2 logs prod-server --lines 100

# Database migrations
# Auto-run on startup, manual check:
sqlite3 db.sqlite "SELECT * FROM metadata WHERE key='migration_version'"
```

### Frontend

```bash
# Development
cd client && npm run dev

# Build for production
cd client && npm run build

# Preview build
cd client && npm run preview
```

### Deployment

```bash
# Deploy to production
./deploy.sh

# Deploy to staging
./deploy-staging.sh

# Fix UI rendering issue
./fix-production-ui.sh

# SSH into server
ssh -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150

# View PM2 processes
pm2 list
pm2 status
pm2 logs

# Restart services
pm2 restart prod-server prod-client
```

---

## 13. DOCUMENTATION FILES IN REPO

Key documentation files to review:
- **README.md** - Project overview
- **DEPLOYMENT_GUIDE.md** - Complete deployment instructions
- **GEMINI_SETUP_GUIDE.md** - Nano Banana integration (new)
- **AWS_S3_SETUP.md** - S3 configuration
- **3JMS_INTEGRATION_SETUP.md** - 3JMS webhook setup
- **COMPLETE_IMAGE_FLOW.md** - 7-step pipeline detailed breakdown
- **CODEBASE_EXPLORATION.md** - Earlier exploration notes

---

## Summary

**ProductPhotoCapture** is a mature, Phase 1 complete inventory management system with AI-powered image enhancement. The architecture is well-documented, secure, and designed for horizontal scaling. The pluggable AI provider system allows switching between different compositing approaches (Freepik vs Gemini). The codebase follows clean architecture principles with clear separation between jobs, workflows, and providers. Recent additions (Nano Banana/Gemini integration) show active development focused on cost optimization while maintaining quality.

**Next Priority Actions**:
1. Fix recent UI rendering bug (in progress via fix-production-ui.sh)
2. Get valid OpenRouter API key for Gemini Flash testing
3. Complete Shopify integration
4. Add authentication/authorization layer
5. Set up Redis for production-ready job tracking
