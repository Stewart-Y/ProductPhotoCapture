# ProductPhotoCapture - Quick Summary

Generated: November 8, 2025  
Full Documentation: See `CODEBASE_COMPLETE_OVERVIEW.md` (1179 lines)

---

## What This Application Does

**ProductPhotoCapture** is an AI-powered inventory management system that:

1. **Manages wine/spirits inventory** (3JMS integration with Vista Wine & Spirits)
2. **Captures product photos** (browser-based camera, file upload, or URLs)
3. **Enhances photos with AI** (removes background, generates themed backgrounds, composites product into new background)
4. **Generates multiple formats** (different sizes: 100px to 2048px, formats: JPEG/PNG/WebP)
5. **Prepares for Shopify upload** (maintains media IDs for integration)

**Current Status**: Phase 1 complete. Live at https://product-photos.click on EC2.

---

## Tech Stack at a Glance

**Frontend**: React 19 + Vite + TailwindCSS + TanStack Router & Query  
**Backend**: Node.js + Express + SQLite3 + Sharp (image processing)  
**AI Providers**: Freepik (segmentation, background gen) + Gemini Flash (compositing, NEW)  
**Storage**: AWS S3 (all images)  
**Infrastructure**: EC2 t3.small + Nginx + PM2  
**Database**: SQLite3 (better-sqlite3) with migrations system

---

## Core Workflows

### Workflow 1: Photo Upload & Enhancement
```
User uploads photo (mobile/webcam/file)
  → Sharp processes (auto-rotate, resize, thumbnails)
  → Saved locally and to S3
  → Job created in queue (NEW status)
  → Background worker processes through 7 steps:
     1. Segmentation (remove background, create mask)
     2. Background generation (SDXL themed)
     3. Compositing (combine with shadow & centering)
     4. Derivatives (multiple sizes/formats)
     5. Quality checks
     6. Shopify upload
     7. Mark DONE
  → Frontend polls for updates every 2 seconds
  → Asset gallery updates with results
```

### Workflow 2: 3JMS Inventory Sync
```
Click "Import from 3JMS"
  → API called with pagination (40 req/min rate limit)
  → Up to 10,000 items fetched
  → New items inserted, existing items updated (photos preserved)
  → Async background job (doesn't block UI)
```

### Workflow 3: Background Template Creation
```
User creates custom template
  → Enter name + custom prompt + variant count
  → Job created (status: pending)
  → AI generates N variants asynchronously
  → Uploads each to S3
  → Template marked active
  → Can be reused for future jobs
```

---

## Project Structure - Key Directories

```
client/src/pages/           # Dashboard, Jobs, Settings, Templates, etc.
client/src/components/      # Reusable UI components

server/jobs/                # Job CRUD, state machine, webhooks
server/workflows/           # Processing pipeline orchestration
server/providers/           # Pluggable AI provider system
  ├── freepik/            # Segmentation, backgrounds, compositing
  └── nanobanana/         # Gemini Flash integration (NEW)
server/storage/             # S3 client with presigned URLs
server/migrations/          # 7 database migrations (cumulative)
```

---

## Database at a Glance

**Core Tables**:
- `items` - Product inventory (sku, name, category, warehouse location, etc.)
- `photos` - Photo gallery per item
- `jobs` - AI processing jobs (status, timing, costs, S3 keys)
- `background_templates` - Template definitions
- `template_assets` - Template variant storage
- `custom_prompts` - User-created AI prompt presets
- `settings` - Key-value config (workflow preference, active template, etc.)

---

## API Endpoints by Category

### Photo Management
```
POST   /api/items/:id/photos           # Upload photo
GET    /api/items/:id/photos           # Get photo gallery
DELETE /api/items/:id/photos/:photoId  # Delete photo
PUT    /api/items/:id/photos/reorder   # Drag-reorder
```

### Job Queue
```
POST   /api/webhooks/3jms/images       # Webhook trigger (idempotent)
POST   /api/jobs/:id/start             # Start processing, get presigned URLs
GET    /api/jobs/:id                   # Poll status
GET    /api/jobs                       # List all
POST   /api/jobs/:id/fail              # Mark failed
GET    /api/jobs/stats                 # Dashboard stats
```

### Configuration
```
GET/POST /api/settings/workflow        # Workflow preference
GET/POST /api/settings/compositor      # AI provider selection (freepik vs nanobanana)
GET/POST /api/settings/active-template # Background template selection
GET/POST /api/custom-prompts           # Prompt management
GET/POST /api/templates                # Template management
```

---

## Recent Changes (Last 5 Commits)

| Date | Commit | Type | What |
|------|--------|------|------|
| Nov 7 | 2e41add | Fix | Production UI rendering bug |
| Nov 6 | 021c3a2 | Docs | Deployment guide |
| Nov 6 | ceb7fe2 | Docs | Mac setup guides |
| Nov 4 | 44f6714 | **Feature** | **Nano Banana (Gemini Flash) integration - 60% cheaper!** |
| Oct 28 | 790fc4a | Feature | Security hardening (Phase 1 complete) |

---

## Current Capabilities vs Future

**Working Now (Phase 1)**:
✅ Photo capture & gallery (drag-reorder, set main)  
✅ AI enhancement pipeline (7-step workflow)  
✅ Custom prompts & templates  
✅ 3JMS inventory sync  
✅ S3 storage with presigned URLs  
✅ Background job processor  
✅ Dashboard with stats  
✅ Settings UI (workflow, compositor, templates)  
✅ Security hardening (CORS, input validation, webhook verification)  
✅ Two AI providers (Freepik & Gemini Flash)

**Partial/TODO**:
⚠️ Shopify integration (endpoints exist, not fully implemented)  
⚠️ Rate limiting (infrastructure ready, not enforced)  
⚠️ Authentication/authorization (no auth yet - API is open)  
⚠️ Webhook signing back to 3JMS  
⚠️ Batch processing (currently 1 job at a time)

---

## Configuration Highlights

**Environment Variables** (key ones):
```bash
AI_PROVIDER=freepik          # Which provider to use
AI_COMPOSITOR=freepik        # For compositing (can switch to nanobanana)
FREEPIK_API_KEY=...          # Freepik token
NANOBANANA_API_KEY=...       # OpenRouter key for Gemini
TJMS_API_KEY=...             # 3JMS token
AWS_S3_BUCKET=...            # S3 bucket name
ENABLE_WORKER=true           # Start background processor
JOB_CONCURRENCY=1            # 1 job at a time (configurable)
```

**PM2 Configuration** (ecosystem.config.js):
- Manages 4 processes: prod-server, prod-client, staging-server, staging-client
- Auto-restart on crash
- 1GB memory limit per process
- Graceful shutdown

---

## Key Architecture Decisions

1. **Pluggable AI Providers**: Not locked to single vendor. Can switch between Freepik and Gemini.
2. **State Machine for Jobs**: Ensures jobs flow through states in correct order. Guards against invalid transitions.
3. **Async Background Processing**: Jobs process in background worker. UI polls for updates. Non-blocking.
4. **Presigned URLs**: Secure S3 access without API key exposure. Generated on-demand.
5. **Idempotent Webhooks**: Same webhook processed twice won't create duplicate jobs.
6. **Modular Workflows**: Each step (segmentation, background gen, compositing, etc.) is separate. Easy to swap providers.

---

## Performance & Costs

**Processing Time**: 
- Varies by provider: Freepik ~30-60 seconds per job
- Gemini Flash faster (single call instead of 3 steps)

**Costs per Job**:
- **Freepik**: $0.07-0.12 (recommended, stable)
- **Gemini Flash**: $0.03 (60% cheaper, text preservation)

**Infrastructure**: ~$15-20/month (EC2 + data transfer)

---

## How to Get Around the Codebase

**To understand photo flow**: Read `client/src/pages/ItemPage.tsx` (photo gallery) + `server/server.js` (upload endpoint)

**To understand job processing**: Read `server/jobs/state-machine.js` (valid states) → `server/workflows/processor.js` (main loop) → individual step functions

**To add a new AI provider**: Copy `server/providers/freepik/` structure, implement interface, register in `server/providers/index.js`

**To change default settings**: Edit `server/migrations/006-custom-prompts.sql` (default prompt) or modify UI pages (`Settings.tsx`)

**To deploy**: Run `./deploy.sh` (production) or `./deploy-staging.sh` (staging). Both pull from GitHub, rebuild, restart PM2.

---

## Known Issues

1. **UI Rendering Bug** (Nov 7): Recent fix in `fix-production-ui.sh`
2. **Gemini API Key Invalid**: Needs valid OpenRouter key (see `GEMINI_SETUP_GUIDE.md`)
3. **No Auth**: Anyone can access API (open by design for now)
4. **Single Job Processing**: One job at a time (can increase JOB_CONCURRENCY in env)

---

## Quick Commands

```bash
# View server logs
pm2 logs prod-server --lines 50

# Check processor status
curl http://localhost:4000/api/processor/status

# Get job statistics
curl http://localhost:4000/api/jobs/stats

# Trigger manual webhook (for testing)
curl -X POST http://localhost:4000/api/webhooks/3jms/images \
  -H "Content-Type: application/json" \
  -d '{"sku":"TEST","imageUrl":"https://...","sha256":"abc123"}'

# Deploy to production
./deploy.sh

# View deployment logs
ssh -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150 "pm2 logs"
```

---

## For More Details

See the full **`CODEBASE_COMPLETE_OVERVIEW.md`** file (1179 lines):
- Complete API endpoint reference
- Database schema details
- Security measures
- Development setup
- Testing guides
- Infrastructure details
- Cost breakdown

---

**Need specific info?** Search the overview document for:
- API endpoints by name
- Database table structures
- Environment variables
- File locations
- Configuration options
