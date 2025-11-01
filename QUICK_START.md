# Quick Start Guide

## 🚀 Start the System

### Option 1: Start Both Server & Client

```bash
# Terminal 1: Start Backend
cd server
npm install
node server.js
# Listens on http://localhost:4000
# Database: SQLite at server/db.sqlite
# Processor: Auto-starts, polls every 5 seconds

# Terminal 2: Start Frontend
cd client
npm install
npm run dev
# Listens on http://localhost:5173
```

### Option 2: Just Backend (for testing API)

```bash
cd server
npm install
node server.js
# Use curl/Postman to test endpoints
```

## 📝 Create Your First Job

### Via 3JMS Webhook
```bash
curl -X POST http://localhost:4000/api/webhooks/3jms/images \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "VWS200433868",
    "img_sha256": "abc123def456789",
    "source_url": "https://example.com/photo.jpg",
    "theme": "default"
  }'
```

Response:
```json
{
  "jobId": "tJjqQh35_7GCRhxUKfkVF",
  "status": "created"
}
```

### Then Monitor in Dashboard
1. Open http://localhost:5173
2. See job on Dashboard or Jobs page
3. Click job ID to view details
4. Watch status progress: NEW → BG_REMOVED → ... → DONE

## 🗂️ Project Structure

```
ProductPhotoCapture/
├── server/                          # Backend (Node.js/Express)
│   ├── db.js                        # SQLite database
│   ├── server.js                    # Main server & routes
│   ├── migrations/
│   │   ├── 001-init.sql
│   │   ├── 002-jobs-and-shopify.sql
│   │   └── 003-flow-v2-schema.sql   # Flow v2 columns
│   ├── jobs/
│   │   ├── manager.js               # Job CRUD
│   │   └── state-machine.js         # State transitions
│   ├── workflows/
│   │   ├── processor.js             # Main 7-step pipeline ⭐
│   │   ├── composite.js             # Image compositing
│   │   ├── derivatives.js           # Multi-format generation
│   │   ├── manifest.js              # JSON metadata
│   │   └── srgb-normalizer.js       # Color management
│   ├── providers/
│   │   └── freepik/
│   │       └── segment.js           # Background removal
│   └── storage/
│       └── s3.js                    # S3 client
│
├── client/                          # Frontend (React/Vite)
│   ├── src/
│   │   ├── App.tsx                  # Main router
│   │   ├── main.tsx                 # React entry point
│   │   ├── lib/
│   │   │   ├── api-client.ts        # API types & methods ⭐
│   │   │   ├── query-client.ts      # React Query config
│   │   │   └── utils.ts             # Format functions
│   │   ├── hooks/
│   │   │   ├── useJobs.ts           # Job list hook
│   │   │   ├── useDashboardStats.ts # Stats hook
│   │   │   ├── useProcessorStatus.ts # Processor hook
│   │   │   └── useHealth.ts         # Health hook
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx      # Navigation
│   │   │   │   └── TopBar.tsx       # Header
│   │   │   ├── ui/                  # Reusable components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   └── Select.tsx
│   │   │   └── StatCard.tsx
│   │   ├── pages/                   # Page components ⭐
│   │   │   ├── Dashboard.tsx        # Home page
│   │   │   ├── Jobs.tsx             # Jobs listing
│   │   │   └── JobDetail.tsx        # Job detail view
│   │   ├── globals.css              # Tailwind styles
│   │   └── index.css                # Global styles
│   └── tailwind.config.js           # Tailwind config
│
├── IMPLEMENTATION_SUMMARY.md         # Full documentation ⭐
└── UI_IMPLEMENTATION_GUIDE.md        # UI blueprint
```

## 🔑 Key Features

### Backend
✅ Webhook-driven job creation
✅ Automatic 7-step pipeline
✅ Background removal (Freepik API)
✅ Drop shadow compositing
✅ Multi-format derivatives (9 per composite)
✅ Comprehensive manifest JSON
✅ Error handling & retry logic
✅ Cost tracking per operation
✅ S3 as central storage

### Frontend
✅ Real-time dashboard with stats
✅ Jobs listing with filters
✅ Job detail with timeline & assets
✅ Dark mode toggle
✅ Responsive design
✅ Copy-to-clipboard for S3 keys
✅ Auto-refresh on status changes
✅ Processor monitoring
✅ Error display with details

## 📊 Pipeline States

```
NEW (job created)
  ↓
BG_REMOVED (background removal complete, cutout + mask)
  ↓
BACKGROUND_READY (AI backgrounds generated)
  ↓
COMPOSITED (composited with drop shadow & centering)
  ↓
DERIVATIVES (9 derivatives per composite generated)
  ↓
SHOPIFY_PUSH (ready to push to Shopify)
  ↓
DONE (successfully completed)

Any step → FAILED (if error occurs)
```

## 🧪 Test the Pipeline

### 1. Create a Job
```bash
curl -X POST http://localhost:4000/api/webhooks/3jms/images \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "TEST001",
    "img_sha256": "test123",
    "source_url": "https://via.placeholder.com/500",
    "theme": "default"
  }'
```

### 2. List Jobs
```bash
curl http://localhost:4000/api/jobs
```

### 3. Get Job Details
```bash
curl http://localhost:4000/api/jobs/{jobId}
```

### 4. Monitor Processor
```bash
curl http://localhost:4000/api/processor/status
```

### 5. View in Dashboard
- Open http://localhost:5173
- See your job processing through the pipeline

## 🔧 Configuration

### Server Environment Variables
```bash
FREEPIK_API_KEY=your_key         # Freepik API key
S3_BUCKET=your_bucket            # AWS S3 bucket name
AWS_REGION=us-east-1             # AWS region
JOB_POLL_INTERVAL_MS=5000        # Processor poll frequency
JOB_CONCURRENCY=1                # Max concurrent jobs
JOB_MAX_RETRIES=3                # Max retry attempts
```

### Client Environment Variables
```bash
VITE_API_URL=http://localhost:4000  # Backend API URL
```

## 📚 Documentation

- **IMPLEMENTATION_SUMMARY.md** - Complete project overview
- **UI_IMPLEMENTATION_GUIDE.md** - Frontend architecture & components
- Source code comments - Detailed function documentation

## 🐛 Troubleshooting

### Jobs not processing?
```bash
# Check processor status
curl http://localhost:4000/api/processor/status

# Start processor if stopped
curl -X POST http://localhost:4000/api/processor/start
```

### Database issues?
```bash
# Reset database
rm server/db.sqlite
node server.js  # Will recreate and migrate
```

### UI not loading?
```bash
# Clear cache and rebuild
cd client
rm -rf node_modules dist .vite
npm install
npm run dev
```

### S3 upload fails?
- Check AWS credentials in environment
- Verify S3 bucket exists and is accessible
- Check IAM permissions for PutObject

## 📊 Monitoring

### Dashboard
- Real-time job count
- Recent failures
- Average cost per job
- Processing time
- Processor status

### Job Detail Page
- Step-by-step progress
- Timing for each step
- Cost breakdown
- Error details
- All S3 asset keys

### API Health Check
```bash
curl http://localhost:4000/health
```

## 🎯 Next Steps

1. **Configure Freepik API**
   - Get API key from freepik.com
   - Set FREEPIK_API_KEY env var

2. **Configure S3**
   - Create S3 bucket
   - Set AWS credentials
   - Set S3_BUCKET env var

3. **Start Processing**
   - Send webhook to create job
   - Watch dashboard
   - Monitor pipeline progress

4. **Customize Themes**
   - Add new themes to provider
   - Adjust compositing settings
   - Fine-tune derivative sizes

## 📞 Support

Check the comprehensive documentation files for detailed information on:
- Complete API reference
- Database schema
- Component documentation
- Styling guide
- Future enhancement ideas

---

**System Status**: ✅ Production Ready

All 7-step pipeline phases are complete and tested!
