# S3 Setup Complete! ✅

**Date**: October 31, 2025
**Bucket**: `product-photos-ai-vws`
**Region**: `us-east-1`
**IAM User**: `CameraCapture` (Account: 911167925148)

---

## What Was Done

### 1. S3 Bucket Creation ✅
```bash
aws s3 mb s3://product-photos-ai-vws --region us-east-1
```

**Bucket Name**: `product-photos-ai-vws`
- ✅ Created in us-east-1 region
- ✅ Uses existing AWS CLI credentials (CameraCapture user)
- ✅ Block Public Access enabled (secure)
- ✅ Encryption enabled (SSE-S3)

### 2. Folder Structure ✅

Created 5 folders in S3:
```
s3://product-photos-ai-vws/
├── originals/      # Original images from 3JMS
├── masks/          # Alpha masks from segmentation
├── backgrounds/    # AI-generated themed backgrounds
├── composites/     # Final composited images
└── thumbs/         # 400px thumbnails
```

### 3. AWS SDK Installation ✅

Installed packages:
- `@aws-sdk/client-s3` - S3 client
- `@aws-sdk/s3-request-presigner` - Presigned URL generation

Total: 111 new packages added

### 4. S3 Storage Module ✅

**Created**: `server/storage/s3.js` (200+ lines)

Features:
- ✅ Deterministic key generation (SKU + SHA256 based)
- ✅ Presigned PUT URLs (for uploads)
- ✅ Presigned GET URLs (for downloads)
- ✅ Direct upload/delete methods
- ✅ Connection testing
- ✅ SHA256 hash utility
- ✅ Singleton pattern

**Created**: `server/storage/index.js`
- Factory pattern for future storage types (local/S3)

### 5. Environment Configuration ✅

**Updated**: `server/.env`

Added:
```bash
AWS_REGION=us-east-1
S3_BUCKET=product-photos-ai-vws
S3_PUBLIC_BASE=https://product-photos-ai-vws.s3.us-east-1.amazonaws.com
S3_PRESIGNED_URL_EXPIRY=3600
```

**Note**: AWS credentials automatically loaded from AWS CLI config (~/.aws/credentials)

### 6. Connection Testing ✅

Ran comprehensive tests:
- ✅ Upload test file to S3
- ✅ Delete test file from S3
- ✅ Key generation for all file types
- ✅ Presigned URL generation (PUT and GET)

**Results**: All tests passed!

---

## S3 Key Structure (Deterministic)

### Patterns:
```javascript
// Original image
originals/{sku}/{sha256}.jpg
// Example: originals/VWS200433868/abc123def456.jpg

// Alpha mask
masks/{sku}/{sha256}.png
// Example: masks/VWS200433868/abc123def456.png

// Background (themed)
backgrounds/{theme}/{sku}/{sha256}_{variant}.jpg
// Example: backgrounds/halloween/VWS200433868/abc123def456_1.jpg

// Composite (final output)
composites/{theme}/{sku}/{sha256}_{aspect}_{variant}_{type}.jpg
// Example: composites/halloween/VWS200433868/abc123def456_1x1_1_master.jpg
// Types: master (3000px), shopify (2048px)
// Aspects: 1x1 (square), 4x5 (portrait)

// Thumbnail
thumbs/{sku}/{sha256}_400.jpg
// Example: thumbs/VWS200433868/abc123def456_400.jpg
```

### Why SHA256?
- **Idempotency**: Same image always generates same key
- **Deduplication**: Identical images don't duplicate in S3
- **Versioning**: Different images of same SKU have different keys
- **Cacheable**: Deterministic URLs can be cached aggressively

---

## Usage Examples

### Basic Upload
```javascript
import getS3Storage from './storage/s3.js';

const s3 = getS3Storage();

// Upload file directly
await s3.upload(
  'originals/VWS200433868/abc123.jpg',
  fileBuffer,
  'image/jpeg'
);
```

### Presigned URLs (Recommended for n8n/AI Providers)
```javascript
// Generate presigned PUT URL (for uploading)
const putUrl = await s3.getPresignedPutUrl(
  'originals/VWS200433868/abc123.jpg',
  'image/jpeg',
  3600 // expires in 1 hour
);

// n8n or AI provider can now upload directly to this URL
// without needing AWS credentials

// Generate presigned GET URL (for downloading)
const getUrl = await s3.getPresignedGetUrl(
  'masks/VWS200433868/abc123.png',
  3600 // expires in 1 hour
);

// AI provider can download the mask from this URL
```

### Key Generation Helpers
```javascript
const s3 = getS3Storage();

// Get keys for a job
const sku = 'VWS200433868';
const sha = 'abc123def456';
const theme = 'halloween';

const keys = {
  original: s3.getOriginalKey(sku, sha),
  mask: s3.getMaskKey(sku, sha),
  background: s3.getBackgroundKey(sku, sha, theme, 1),
  composite: s3.getCompositeKey(sku, sha, theme, '1x1', 1, 'master'),
  thumbnail: s3.getThumbnailKey(sku, sha)
};

// Generate presigned URLs for all
const urls = {
  original: await s3.getPresignedGetUrl(keys.original),
  mask: await s3.getPresignedGetUrl(keys.mask),
  background: await s3.getPresignedGetUrl(keys.background),
  composite: await s3.getPresignedGetUrl(keys.composite)
};
```

---

## Cost Estimate

Based on 1,000 jobs/month (5,000 images):

| Item | Usage | Monthly Cost |
|------|-------|--------------|
| **Storage** | 10 GB (5,000 × 2 MB avg) | $0.23 |
| **PUT Requests** | 25,000 (5 files per image) | $0.13 |
| **GET Requests** | 50,000 (downloads for processing) | $0.02 |
| **Data Transfer Out** | 20 GB (to AI providers) | $1.80 |
| **TOTAL** | | **$2.18/month** |

*Prices based on us-east-1, as of January 2025*

### Cost per Job:
- **1 job** (1 SKU, 1 original → 4 outputs) ≈ **$0.002** (~0.2¢)
- **1,000 jobs** ≈ **$2.18**
- **10,000 jobs** ≈ **$21.80**

Very affordable!

---

## Security Notes

✅ **Block Public Access Enabled**
- Bucket is not publicly accessible
- All downloads use presigned URLs (time-limited)

✅ **Credentials from AWS CLI**
- Uses existing `CameraCapture` IAM user
- Credentials stored securely in ~/.aws/credentials
- Not hardcoded in .env

✅ **Presigned URL Expiry**
- Default: 1 hour (3600 seconds)
- Configurable via S3_PRESIGNED_URL_EXPIRY
- URLs expire automatically (time-bound access)

---

## Next Steps

With S3 now set up, you can proceed to:

### Phase 1: Job Queue & State Machine (Ready!)
- ✅ S3 storage ready for presigned URLs
- ✅ Key generation functions ready
- ✅ Connection tested and working

Next implementation:
1. `jobs/state-machine.js` - Job lifecycle
2. `jobs/manager.js` - Job CRUD operations
3. `jobs/routes.js` - 8 new API endpoints
4. Webhook verification (HMAC)

### Additional Setup (When Ready):
- [ ] **Replicate API** - Get token from https://replicate.com/account/api-tokens
- [ ] **Shopify API** - Create custom app with media permissions
- [ ] **3JMS Webhook** - Get webhook secret from 3JMS devs
- [ ] **n8n** - Already installed, ready to configure

---

## Troubleshooting

If you encounter issues:

### "Access Denied" Error
```bash
# Check IAM permissions
aws iam get-user

# Verify bucket access
aws s3 ls s3://product-photos-ai-vws/
```

### "Bucket does not exist" Error
```bash
# List all buckets
aws s3 ls

# Recreate if needed
aws s3 mb s3://product-photos-ai-vws --region us-east-1
```

### Test Connection
```bash
cd server
node -e "import getS3Storage from './storage/s3.js'; const s3 = getS3Storage(); await s3.testConnection();"
```

---

## Summary

✅ **S3 Bucket**: Created and configured
✅ **Folder Structure**: 5 folders ready
✅ **AWS SDK**: Installed and tested
✅ **Storage Module**: Full-featured S3 client
✅ **Environment**: Configured with credentials
✅ **Testing**: All tests passed

**Status**: 🟢 **READY FOR PHASE 1!**

You can now build the job queue system that uses S3 for all image storage!
