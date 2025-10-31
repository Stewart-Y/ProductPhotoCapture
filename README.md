# ProductPhotoCapture

**Live**: https://product-photos.click  
**Last Updated**: October 29, 2025

Full-stack inventory management system with browser-based photo capture and AI-powered image enhancement.

## Features

✅ **Inventory Management**
- CRUD operations for product items
- 3JMS inventory system integration
- Comprehensive product fields (SKU, brand, category, etc.)
- Warehouse location tracking

✅ **Photo Management**
- Browser-based camera capture (supports multiple cameras)
- Photo gallery (4 photos per item)
- Drag-and-drop reordering
- Set main image
- Auto-generated thumbnails

✅ **AI Enhancement** ⭐ NEW
- **Async processing** via Replicate API
- 2x, 3x, 4x upscaling
- Real-time progress tracking
- Before/after comparison slider
- Page refresh resilience
- 10-60 second processing time

## Stack

**Frontend**:
- React 18 + TypeScript
- Vite (build tool)
- React Router 7

**Backend**:
- Node.js (ES Modules)
- Express 4
- better-sqlite3
- Sharp (image processing)

**Infrastructure**:
- AWS EC2 (t3.small)
- Nginx (reverse proxy)
- PM2 (process manager)
- Ubuntu 24.04

**AI Enhancement**:
- Replicate API
- Models: Real-ESRGAN, Latent-SR

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Local Development

**Terminal 1 - Backend**:
```bash
cd server
npm install
cp .env.example .env
# Edit .env and set REPLICATE_API_TOKEN if using enhancement
npm run dev
```

**Terminal 2 - Frontend**:
```bash
cd client
npm install
npm run dev
```

**Access**:
- API: http://localhost:4000/api
- Web: http://localhost:5173

### Environment Setup for Enhancement

**Get Replicate API Token**:
1. Sign up at https://replicate.com
2. Go to https://replicate.com/account/api-tokens
3. Create a new token
4. Add to `server/.env`:

```bash
# Required for AI enhancement
ENHANCER=replicate
REPLICATE_API_TOKEN=r8_your_token_here

# Optional
REPLICATE_MODEL_VERSION=nightmareai/real-esrgan:42fed1c4...
REPLICATE_POLL_MS=2000
```

### Testing Enhancement

**PowerShell**:
```powershell
cd scripts
.\test-enhance.ps1 -PhotoId 1
```

**Bash**:
```bash
cd scripts
chmod +x test-enhance.sh
./test-enhance.sh 1
```

## API Endpoints

### Items
- `GET /api/items` - List all items
- `GET /api/items/:id` - Get item details
- `PUT /api/items/:id` - Update item
- `POST /api/items/:id/upload-image` - Upload main image

### Photos
- `GET /api/items/:id/photos` - Get item photos
- `POST /api/items/:id/photos` - Upload photo
- `DELETE /api/items/:id/photos/:photoId` - Delete photo

### Enhancement (NEW)
- `GET /api/enhance/status` - Check service status
- `POST /api/photos/:id/enhance` - Start enhancement job
  - Body: `{ scale?: 2|3|4, model?: string, tta?: boolean }`
  - Returns: `{ jobId, provider, status }`
- `GET /api/photos/:id/enhance/:jobId` - Poll job status
  - Returns: `{ status, progress?, photo?, error? }`

### 3JMS Integration
- `POST /api/tjms/import` - Sync from 3JMS

## Architecture

```
┌──────────┐    HTTPS    ┌───────┐    Proxy    ┌─────────┐
│  Client  │────────────>│ Nginx │────────────>│ Express │
│  React   │             └───────┘             │  API    │
└──────────┘                                   └────┬────┘
                                                    │
                                        ┌───────────┼───────────┐
                                        │           │           │
                                   ┌────▼────┐ ┌───▼────┐ ┌───▼────────┐
                                   │ SQLite  │ │ Sharp  │ │ Replicate  │
                                   │   DB    │ │ Images │ │ AI API     │
                                   └─────────┘ └────────┘ └────────────┘
```

## Enhancement Architecture

**Async Flow**:
1. User clicks "Enhance" → Modal opens
2. Frontend calls `POST /api/photos/:id/enhance`
3. Server starts Replicate job, returns `jobId`
4. Frontend polls `GET /api/photos/:id/enhance/:jobId` every 2s
5. When `status: 'succeeded'`:
   - Server downloads enhanced image
   - Generates thumbnail with Sharp
   - Inserts new photo into gallery
   - Returns photo details
6. Gallery refreshes with enhanced image

**Key Features**:
- ✅ Non-blocking (server stays responsive)
- ✅ Real progress tracking
- ✅ Survives page refresh (sessionStorage)
- ✅ Retry on failure
- ✅ Cost-effective (~$0.01 per image)

## Project Structure

```
ProductPhotoCapture/
├── client/               # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route pages
│   │   ├── lib/         # API client
│   │   └── app/         # Router config
│   └── dist/            # Build output
│
├── server/              # Express backend
│   ├── enhancers/       # Enhancement strategy (NEW)
│   │   ├── index.js     # Factory & interface
│   │   └── replicate.js # Replicate client
│   ├── utils/           # Utilities (NEW)
│   │   └── download.js  # Download with retries
│   ├── server.js        # Main server
│   ├── db.js            # Database setup
│   ├── schema.sql       # Database schema
│   ├── enhancer.js      # Legacy Real-ESRGAN (deprecated)
│   └── uploads/         # Image storage
│
└── scripts/             # Testing & deployment
    ├── test-enhance.ps1 # PowerShell test script
    └── test-enhance.sh  # Bash test script
```

## Deployment

See `CODEBASE_DOCUMENTATION.md` for comprehensive deployment instructions.

**Quick Deploy**:
```bash
# Build frontend
cd client && npm run build

# Upload to server
scp -i key.pem -r dist/* ubuntu@server:/var/www/client/

# Restart services
ssh -i key.pem ubuntu@server "pm2 restart all"
```

## Costs

**Infrastructure** (~$16-20/month):
- EC2 t3.small: ~$15/month
- Data transfer: ~$1-5/month

**Enhancement** (pay-per-use):
- $0.005-0.01 per image
- 100 images/month: ~$0.50-1.00
- 1000 images/month: ~$5-10

## Documentation

- **CODEBASE_DOCUMENTATION.md** - Complete technical documentation
- **ENHANCEMENT_GUIDE.md** - Enhancement feature guide (if exists)

## Troubleshooting

**Enhancement not working?**
```bash
# Check service status
curl http://localhost:4000/api/enhance/status

# Check logs
pm2 logs product-photo-server --lines 100

# Verify token
echo $REPLICATE_API_TOKEN  # Should show r8_...
```

**Common Issues**:
- Missing `REPLICATE_API_TOKEN` → Set in `.env`
- 401 Unauthorized → Token expired, rotate
- Jobs "lost" on restart → Expected, use Redis in production
- Download fails → Check internet connectivity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with clear commit messages
4. Test thoroughly (use test scripts)
5. Submit pull request

## License

MIT

## Author

Stewart-Y (GitHub)

## Support

Open an issue on GitHub for bugs or feature requests
