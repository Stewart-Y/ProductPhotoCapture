# ProductPhotoCapture Codebase - Comprehensive Exploration Report

**Project**: ProductPhotoCapture - AI-Enhanced Product Photo Management System  
**Status**: Production Ready (Phase 7 Complete)  
**Last Updated**: November 7, 2025  
**Live URL**: https://product-photos.click

---

## Executive Summary

ProductPhotoCapture is a fully operational, production-ready system for automating AI-enhanced product photography workflows. It processes images through a sophisticated 7-step pipeline combining background removal, AI-generated backgrounds, image compositing, and multi-format derivative generation. The system integrates 3JMS inventory source, AWS S3 storage, and Shopify as a destination platform.

**Key Metrics:**
- 100% production ready
- 7 complete implementation phases
- ~6,000+ lines of code (backend + frontend)
- 15+ API endpoints
- 24 asset outputs per job
- 11-14 seconds processing time per image
- Real-time dashboard with monitoring

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Main Components](#main-components)
5. [Key Features](#key-features)
6. [API Endpoints](#api-endpoints)
7. [Database Schema](#database-schema)
8. [Authentication & Security](#authentication--security)
9. [Configuration & Environment](#configuration--environment)
10. [Build & Deployment](#build--deployment)
11. [Testing Infrastructure](#testing-infrastructure)
12. [Notable Implementations](#notable-implementations)

---

## Project Overview

### Mission
Automate end-to-end workflow for AI-enhanced product photography:
- Receive product photos from 3JMS inventory system
- Apply background removal and AI-generated backgrounds
- Composite images with professional styling
- Generate multiple derivative formats/sizes
- Push to Shopify automatically

### Architecture Pattern
**3JMS (Source) → Webhook → Express API → Job Queue → AI Providers → S3 Storage → Shopify (Destination)**

### Current Status
- **100% Production Ready**
- 7-phase implementation complete
- All features tested and operational
- Deployed on AWS EC2 (t3.small)
- Handled complex image processing pipeline with 24 asset outputs per job

---

## Architecture

### High-Level System Design

```
┌─────────────────┐
│   3JMS System   │
│ (Image Source)  │
└────────┬────────┘
         │ Webhook: POST /webhooks/3jms/images
         ▼
┌──────────────────────────────────────────────────┐
│         Express.js Backend (Node.js)             │
│  ┌────────────────────────────────────────────┐  │
│  │  API Routes (15+ endpoints)                │  │
│  │  - Job management                          │  │
│  │  - Status queries                          │  │
│  │  - Webhook receivers                       │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  Job Queue (State Machine)                 │  │
│  │  - 7-step pipeline                         │  │
│  │  - Idempotent processing                   │  │
│  │  - Automatic retry logic                   │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  AI Providers                              │  │
│  │  - Freepik (segmentation & backgrounds)    │  │
│  │  - Nano Banana (compositing)               │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  Image Processing (Sharp)                  │  │
│  │  - Compositing pipeline                    │  │
│  │  - Derivative generation (9 variants)      │  │
│  │  - sRGB normalization                      │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
         │
         ├─→ AWS S3 (Storage)
         │   - Originals, cutouts, masks
         │   - Backgrounds, composites
         │   - Derivatives, manifests
         │
         └─→ Shopify (Destination)
             - Media upload
             - Product association
             
┌──────────────────────────────┐
│  React Dashboard (Frontend)  │
│  - Real-time job monitoring  │
│  - Status visualization      │
│  - Performance metrics       │
└──────────────────────────────┘
```

### Deployment Architecture

```
┌─────────────────────────────────────┐
│     Client Browser                  │
│     (React @ localhost:5173)         │
└──────────────┬──────────────────────┘
               │
               │ HTTPS
               ▼
┌─────────────────────────────────────┐
│     Nginx Reverse Proxy             │
│     (product-photos.click)          │
└──────────────┬──────────────────────┘
               │
         ┌─────┴─────┐
         ▼           ▼
    ┌────────┐   ┌────────┐
    │Backend │   │Frontend│
    │:4000   │   │:5173   │
    └────────┘   └────────┘
         │           │
         └─────┬─────┘
               ▼
    ┌──────────────────┐
    │  SQLite DB       │
    │  AWS S3 Storage  │
    └──────────────────┘
```

---

## Technology Stack

### Frontend
- **React**: v19.1.1 with TypeScript
- **Build Tool**: Vite 7.1.7
- **Routing**: React Router 7.9.4
- **State Management**: TanStack React Query v5.90.6
- **UI Framework**: Tailwind CSS v4.1.16
- **Component Library**: shadcn/ui components
- **Charts**: Recharts v3.3.0
- **Icons**: Lucide React v0.552.0
- **Type Checking**: TypeScript v5.9.3

### Backend
- **Runtime**: Node.js 18+ (ES Modules)
- **Framework**: Express 4.19.2
- **Database**: SQLite (better-sqlite3 v9.4.0)
- **Image Processing**: Sharp 0.34.4
- **AWS SDK**: @aws-sdk/client-s3 v3.921.0, s3-request-presigner v3.921.0
- **Data Validation**: Zod v4.1.12
- **File Upload**: Multer 1.4.5-lts.1
- **HTTP Client**: node-fetch 3.3.2
- **Environment**: dotenv 16.4.5

### DevTools
- **Development**: nodemon 3.1.0 (backend), Vite (frontend)
- **Linting**: ESLint 9.36.0 with React plugins
- **Build**: TypeScript compiler + Vite

### Infrastructure
- **Hosting**: AWS EC2 (t3.small, Ubuntu 24.04)
- **Process Manager**: PM2
- **Reverse Proxy**: Nginx
- **SSL/TLS**: Let's Encrypt (via Certbot)
- **Storage**: AWS S3

### External Services
- **Freepik API**: Background removal & generation
- **Shopify GraphQL API**: Product media management
- **3JMS Webhook**: Image source
- **N8n**: Workflow orchestration (optional)

---

## Main Components

### 1. Backend Server (`/server`)

#### Core Architecture
- **server.js**: Main Express application with CORS, middleware, and route mounting
- **db.js**: SQLite setup with automatic migration system
- **7 directory modules**: Jobs, Providers, Storage, Workflows, Migrations, etc.

#### Job Management System (`/server/jobs`)
- **state-machine.js**: 7-state Flow v2 pipeline with transition validation
- **manager.js**: CRUD operations with idempotency checks
- **routes.js** (1735 LOC): 15+ API endpoints with Zod validation
- **webhook-verify.js**: HMAC-SHA256 signature verification

#### AI Providers (`/server/providers`)
- **Freepik integration**: Background removal and themed generation
- **Nano Banana**: Alternative compositor for text preservation
- **Factory pattern**: Easy to add new providers

#### Image Processing (`/server/workflows`)
- **composite.js**: Sharp-based compositing with drop shadow and centering
- **derivatives.js**: 9-file generation (3 sizes × 3 formats)
- **processor.js** (824 LOC): Background job processor with 5-second polling
- **manifest.js**: JSON asset inventory generation
- **template-generator.js**: Background template management

#### Storage (`/server/storage`)
- **s3.js**: AWS S3 client with presigned URLs
- **Deterministic key generation**: originals/{sku}/{sha256}

#### Database (`/server/migrations`)
- **schema.sql**: Items and photos tables
- **002-jobs-and-shopify.sql**: 7-step pipeline with job state machine
- **003-007**: Flow v2 enhancements (templates, settings, preferences)

### 2. Frontend Client (`/client`)

#### Pages (8 main pages)
- **Dashboard.tsx**: KPI cards, failure list, processor status
- **Jobs.tsx**: Multi-filter job listing with pagination
- **JobDetail.tsx**: Single job with asset inventory
- **InventoryPage.tsx**: Product CRUD and photo gallery
- **ItemPage.tsx**: Single product details
- **Settings.tsx**: Workflow and compositor configuration
- **BackgroundTemplates.tsx**: Template management
- **WebhookSimulator.tsx**: Testing interface

#### Components
- **PhotoCaptureModal.tsx**: Camera capture with multi-camera support
- **PhotoGallery.tsx**: 4-photo layout with drag-drop
- **Shared UI**: Button, Card, Table, Badge, Input, Select, Dialog, Tabs

#### Hooks & API
- **useJobs.ts**: Job querying with React Query
- **useDashboardStats.ts**: KPI data and analytics
- **api-client.ts**: Type-safe fetch wrapper with 15+ endpoints

#### Styling
- **Tailwind CSS v4**: Utility-first styling
- **PostCSS**: CSS processing
- **Dark mode**: Built-in support

---

## Key Features

### 1. 7-Step AI Pipeline (Flow v2)
1. **BG_REMOVED**: Freepik removes background, extracts mask
2. **BACKGROUND_READY**: AI generates themed backgrounds
3. **COMPOSITED**: Mask composited with background + shadow
4. **DERIVATIVES**: 9 format/size variants generated
5. **SHOPIFY_PUSH**: Assets uploaded to S3 and Shopify
6. **DONE/FAILED**: Job completion with metrics

**Processing Time**: 11-14 seconds per image  
**Assets Generated**: 24 per job

### 2. Idempotent Job Processing
- Unique key: (SKU + SHA256 + Theme)
- Duplicate requests return existing job
- Webhook signature verification (HMAC-SHA256)

### 3. State Machine Validation
- 7 explicit states with allowed transitions
- Required fields per state
- Invalid transitions prevented

### 4. Automatic Retry Logic
- Exponential backoff (1 minute base)
- Max 3 retries by default
- Error code tracking

### 5. Cost Tracking & Analytics
- Per-API-call cost recording
- Job-level aggregation
- Dashboard analytics

### 6. Real-Time Dashboard
- Live job monitoring
- KPI visualization
- Failure alerts
- Performance metrics

### 7. Background Template System
- Pre-generated templates
- Multiple variants per theme
- S3 presigned URL access

### 8. N8n Workflow Integration
- Webhook automation
- Job status monitoring
- Slack notifications

### 9. Multi-Compositor Support
- Freepik Seedream (default)
- Nano Banana (text-preserving)
- Runtime switchable

### 10. Multi-Format Asset Generation
- JPEG (quality: 90)
- WebP (quality: 85)
- AVIF (quality: 80)
- 3 sizes: 2000px, 1200px, 400px

---

## API Endpoints

### Job Management (6 endpoints)
- POST /api/webhooks/3jms/images - Create job from webhook
- GET /api/jobs - List all jobs with filters
- GET /api/jobs/:id - Get job details
- POST /api/jobs/:id/start - Start processing
- PUT /api/jobs/:id/retry - Retry failed job
- PUT /api/jobs/:id/cancel - Cancel queued job

### Status & Analytics (4 endpoints)
- GET /api/health - Service health
- GET /api/jobs/stats - Aggregated statistics
- GET /api/processor/status - Processor state
- GET /api/processor/config - Processor configuration

### Settings & Templates (7+ endpoints)
- GET/PUT /api/settings/workflow
- GET/PUT /api/settings/compositor
- GET /api/templates
- POST /api/templates/:id/regenerate
- PUT /api/templates/:id/urls
- GET/PUT /api/settings/custom-prompts

---

## Database Schema

### Core Tables
- **items**: Product inventory (name, SKU, metadata)
- **photos**: Uploaded photos (item_id, url, position)
- **jobs**: Pipeline state machine with S3 keys and error tracking
- **shopify_map**: SKU → product ID cache
- **metadata**: System configuration key-value store

### Additional Tables (Flow v2)
- settings_workflow, settings_compositor
- background_templates, template_variants
- custom_prompts

### Indexes
- idx_jobs_status, idx_jobs_sku_sha, idx_jobs_created
- idx_photos_item_idx, idx_shopify_map_product_id, etc.

### Migrations
- Numbered .sql files for version control
- Auto-executed on startup
- Backward compatibility support

---

## Authentication & Security

### Webhook Security
- HMAC-SHA256 signature verification
- Constant-time comparison (prevents timing attacks)
- Raw body capture before JSON parsing
- Production-required secret enforcement

### CORS Configuration
- Allowlist pattern via ALLOWED_ORIGINS environment variable
- Default dev origins (localhost:5173, localhost:3000)
- Production requires explicit whitelist
- Methods: GET, POST, PUT, DELETE, OPTIONS

### S3 Security
- AWS credential chain (CLI credentials or environment)
- Presigned URLs (time-limited, default 1 hour)
- Bucket validation at initialization
- Region configuration required

### Payload Protection
- Webhook max 10MB (prevents memory attacks)
- File upload max 10MB (Multer)
- Stream error handling with connection termination

### Environment Security
- .env files via dotenv
- Environment-based API keys (not hardcoded)
- Production vs development .env support
- Configurable database path

---

## Configuration & Environment

### Required Variables
```bash
# AWS/Storage
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
S3_PUBLIC_BASE=https://your-bucket.s3.us-east-1.amazonaws.com

# AI Providers
FREEPIK_API_KEY=your-freepik-api-key
AI_PROVIDER=freepik

# Security
TJMS_WEBHOOK_SECRET=your-webhook-secret
NODE_ENV=production

# CORS
ALLOWED_ORIGINS=https://yourdomain.com

# Job Processing
JOB_POLL_INTERVAL_MS=5000
JOB_CONCURRENCY=1
JOB_MAX_RETRIES=3
IMAGE_MAX_PER_SKU=4
DEFAULT_THEME=default
```

### Loading Mechanism
- Backend: dotenv.config() in server.js
- Frontend: Vite environment variables (VITE_API_URL)
- Support for NODE_ENV-based environment selection

---

## Build & Deployment

### Local Development
```bash
# Backend
cd server && npm install && npm run dev  # port 4000

# Frontend  
cd client && npm install && npm run dev  # port 5173
```

### Production Build
```bash
# Client
cd client && npm run build  # outputs to dist/

# Server
cd server && npm install --production && node server.js
```

### Deployment
- **Script**: deploy.sh (8-step automated deployment)
- **Infrastructure**: AWS EC2 t3.small, Ubuntu 24.04
- **Process Manager**: PM2
- **Reverse Proxy**: Nginx
- **SSL/TLS**: Let's Encrypt
- **URL**: https://product-photos.click

---

## Testing Infrastructure

### Test Files
- test-end-to-end.js: Full pipeline validation
- test-freepik.js: API integration tests
- test-composite.js: Image compositing validation
- test-automated-pipeline.js: Processor testing
- test-processor-fix.js: Background worker validation

### Features
- Real API integration (not mocked)
- Full pipeline validation
- Cost calculation verification
- Timing metrics collection

### Manual Testing
- Test upload modal in dashboard
- Webhook simulator for curl testing
- Job filtering and search
- Real-time status monitoring

---

## Notable Implementations

### 1. State Machine with Type Safety
- Explicit state transitions
- Transition validation
- Required fields per state
- Clean separation of concerns

### 2. Idempotent Job Processing
- Deterministic keys (SHA256)
- Duplicate detection
- Safe webhook retry
- Prevents reprocessing

### 3. Provider Abstraction Pattern
- Easy new provider addition
- Factory pattern for instantiation
- Singleton instances
- API key management

### 4. Image Processing Pipeline
- Sharp.js high-performance processing
- sRGB color space normalization
- Drop shadow with parameters
- Multi-format output
- Batch optimization

### 5. Presigned URL Strategy
- Time-limited access
- No API key exposure
- Reduced payload size
- Secure cross-service communication

### 6. Real-Time Monitoring
- 5-second polling loop
- React Query dashboard updates
- Cost aggregation
- Performance metrics

### 7. Migration System
- Numbered SQL files
- Auto-migration on startup
- Version tracking
- Backward compatibility

### 8. Cost Tracking
- Per-call recording
- Job aggregation
- Daily/weekly/monthly analytics
- Cost breakdown

### 9. Error Recovery
- Automatic retry with backoff
- Graceful degradation
- Detailed error codes
- Persistence in database

### 10. N8n Integration
- Webhook receiver
- Data transformation
- Job status polling
- Slack notifications

---

## Project Maturity & Quality

### Completion Status
- Phases 1-7: Complete
- Production Ready: Yes
- Tests: Comprehensive
- Documentation: Extensive
- Error Handling: Robust
- Monitoring: Real-time

### Code Quality
- TypeScript for type safety
- ES Modules (modern syntax)
- Consistent error handling
- Detailed logging
- Input validation with Zod
- Security best practices

### Operational Excellence
- Automated deployment
- PM2 process management
- Real-time monitoring dashboard
- Error tracking
- Cost analytics
- Performance metrics

### Known Limitations
- SQLite (migrate to PostgreSQL for scale)
- N8n optional (not required)
- S3 required (no local fallback)
- Single instance (no clustering)

---

## Summary

ProductPhotoCapture represents a mature, production-ready system demonstrating:

1. **Solid Architecture**: Clean separation with provider pattern, state machines, factories
2. **Comprehensive Features**: 7-step pipeline, multiple AI providers, S3 storage, Shopify integration
3. **Production Readiness**: Security hardening, error handling, deployment automation, monitoring
4. **Excellent Documentation**: Multiple guides, inline comments, clear organization
5. **Scalable Design**: Provider abstraction, storage abstraction, migration system

**Total Code**: ~6,000+ lines (backend + frontend)  
**Live Status**: Successfully deployed at https://product-photos.click
