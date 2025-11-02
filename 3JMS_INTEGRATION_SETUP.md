# 3JMS Integration Setup - Option 1: Direct Webhook

Complete step-by-step guide to integrate your Product Photo Capture system with 3JMS.

---

## 🎯 Overview

When you upload/update an image in 3JMS for a product SKU, your system will:

1. ✅ Receive webhook from 3JMS with image URL
2. ✅ Download the image
3. ✅ Remove background (Freepik AI)
4. ✅ Generate AI backgrounds (2 variations)
5. ✅ Composite image on backgrounds
6. ✅ Create derivatives (3 sizes × 2 formats)
7. ✅ Upload to S3
8. ✅ Return manifest to 3JMS

**Total time**: ~14 seconds per image

---

## 🔧 Configuration Steps

### Step 1: Get Your Webhook URL

Your webhook endpoint is:

```
http://YOUR_SERVER_IP:4000/api/webhooks/3jms/images
```

Replace `YOUR_SERVER_IP` with:
- **Local testing**: `localhost` or `127.0.0.1`
- **Local network**: Your machine IP (e.g., `192.168.1.100`)
- **Remote**: Your server's public IP or domain

**Example**:
```
http://192.168.1.100:4000/api/webhooks/3jms/images
```

### Step 2: Configure 3JMS Webhook

In your 3JMS admin panel:

1. **Go to**: Settings → Webhooks (or similar)
2. **Event**: Image uploaded / Product updated
3. **URL**: Paste your webhook URL
4. **Method**: POST
5. **Headers** (optional):
   ```
   Content-Type: application/json
   ```

### Step 3: Test Configuration

Before submitting real images, test the webhook:

```bash
# Test from your terminal
curl -X POST http://localhost:4000/api/webhooks/3jms/images \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"TEST-3JMS-001",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
    "sha256":"test-hash-1234567890abcdef",
    "event":"image.uploaded"
  }'
```

Expected response:
```json
{
  "jobId": "Ly8Lf6YQr6BmE9tyo3e2y",
  "status": "created",
  "job": {
    "id": "Ly8Lf6YQr6BmE9tyo3e2y",
    "sku": "TEST-3JMS-001",
    "theme": "default",
    "status": "NEW",
    "createdAt": "2025-11-02T19:54:00Z"
  }
}
```

### Step 4: Verify Dashboard

Open dashboard and confirm job appeared:

```
http://localhost:5173
```

You should see `TEST-3JMS-001` in the job list, processing through steps.

---

## 📝 Webhook Request Format

3JMS should send POST requests with this JSON body:

```json
{
  "event": "image.uploaded",
  "sku": "YOUR-PRODUCT-SKU",
  "imageUrl": "https://cdn.example.com/image.jpg",
  "sha256": "abc123def456...",
  "takenAt": "2025-11-02T19:00:00Z"
}
```

### Required Fields

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `sku` | string | `PROD-12345` | Product SKU, must be unique per image |
| `imageUrl` | string | `https://cdn.../img.jpg` | Must be publicly accessible |
| `sha256` | string | `abc123...` | Image hash for deduplication |

### Optional Fields

| Field | Type | Example | Default |
|-------|------|---------|---------|
| `event` | string | `image.uploaded` | Not required |
| `takenAt` | string | `2025-11-02T19:00:00Z` | Not required |
| `theme` | string | `default` | Query param or env var |

---

## 🔄 Complete Flow Example

### Scenario: Update Product Image in 3JMS

**Step 1: 3JMS triggers webhook**

```
You upload image in 3JMS dashboard
    ↓
3JMS POSTs to our endpoint
{
  "sku": "BLUE-SHIRT-001",
  "imageUrl": "https://3jms-cdn.com/uploads/blue-shirt.jpg",
  "sha256": "hash123456",
  "event": "image.uploaded"
}
```

**Step 2: Our system receives**

```
Backend API receives POST
    ↓
Validates webhook signature (if enabled)
    ↓
Creates job in database
    ↓
Returns {"jobId": "...", "status": "created"}
    ↓
Job processor starts (in background)
```

**Step 3: Processing pipeline**

```
Download image from imageUrl
    ↓
Call Freepik API: Remove background
    ↓
Call Freepik API: Generate 2 AI backgrounds
    ↓
Composite original cutout on 2 backgrounds
    ↓
Create 18 derivatives (3 sizes × 2 formats × 1.5 variations)
    ↓
Generate manifest.json
    ↓
Upload all 24 files to S3
```

**Step 4: You see progress**

```
Dashboard updates in real-time
    ↓
Status: NEW → BG_REMOVED → BACKGROUND_READY → COMPOSITED → DERIVATIVES → SHOPIFY_PUSH → DONE
    ↓
~14 seconds later: Complete with 24 assets
```

---

## 🚀 Production Checklist

Before going live with 3JMS:

- [ ] Webhook URL is correct for your environment
- [ ] Test webhook works (see Step 3 above)
- [ ] Dashboard displays test job correctly
- [ ] Test image processes to completion
- [ ] All 24 assets generated
- [ ] Asset URLs are accessible
- [ ] Error handling verified (test with bad URL)
- [ ] SKU naming convention documented
- [ ] Image size limits defined
- [ ] Rate limiting configured (if needed)

---

## 🔍 Troubleshooting

### Webhook Not Triggering

**Problem**: 3JMS submits but our endpoint doesn't receive

**Check**:

1. Webhook URL is correct:
   ```bash
   curl -I http://localhost:4000/api/webhooks/3jms/images
   # Should return 405 (method not allowed for GET)
   ```

2. Firewall allows inbound traffic on port 4000
3. 3JMS can reach your server (test connectivity)
4. Check server logs for errors:
   ```bash
   tail -f server.log | grep "Webhook"
   ```

### Image Download Fails

**Problem**: Job created but status stuck at "BG_REMOVED"

**Check**:

1. Image URL is publicly accessible:
   ```bash
   curl -I "IMAGEURL"
   # Should return 200
   ```

2. Image is valid format (JPG, PNG, WebP)
3. Image is under 50MB
4. Freepik API credentials valid (check backend logs)

### Job Fails at Compositing

**Problem**: Status reaches "COMPOSITED" but stuck

**Check**:

1. S3 credentials configured
2. S3 bucket accessible
3. Disk space available (temp files)
4. Check backend error logs

### Dashboard Not Updating

**Problem**: Job created but not showing on dashboard

**Check**:

1. Refresh dashboard: Ctrl+R
2. Check browser console (F12) for errors
3. Verify API returning jobs:
   ```bash
   curl http://localhost:4000/api/jobs
   ```
4. Check database:
   ```bash
   sqlite3 server/db.sqlite "SELECT COUNT(*) FROM jobs;"
   ```

---

## 📊 Monitoring the Integration

### Real-Time Dashboard

Open: **http://localhost:5173**

View:
- Job status and progress
- Processing time
- Asset count
- Error messages (if any)
- KPI stats

### API Monitoring

```bash
# Get all jobs
curl http://localhost:4000/api/jobs

# Get specific job
curl http://localhost:4000/api/jobs/BLUE-SHIRT-001

# Get statistics
curl http://localhost:4000/api/jobs/stats

# Response:
{
  "today": {
    "total": 5,
    "done": 4,
    "failed": 1
  },
  "cost": {
    "avgPerJob24h": 0.02,
    "totalMTD": 1.50
  },
  "timing": {
    "avgProcessingTime": 13.8
  }
}
```

### Log Monitoring

```bash
# Watch backend logs
tail -f backend.log | grep -E "Webhook|Job|Error"

# Errors only
tail -f backend.log | grep "ERROR"

# Specific job
tail -f backend.log | grep "BLUE-SHIRT-001"
```

---

## 🔐 Security Considerations

### Webhook Verification

The endpoint includes optional webhook verification:

```
POST /api/webhooks/3jms/images
Header: X-3JMS-Signature: <signature>
```

Verification checks:
- Request signature valid
- Timestamp within 5 minutes
- Request body not modified

**To enable** (optional):
```javascript
// In routes.js
const verify = verify3JMSWebhook;  // Already imported
```

### IP Whitelisting (Optional)

Add 3JMS IP to firewall whitelist:

```bash
# Linux/Mac
sudo iptables -A INPUT -s 3JMS_IP -p tcp --dport 4000 -j ACCEPT

# Or in your cloud provider's security groups
```

### Rate Limiting

Limit requests per SKU:

```javascript
// In .env
IMAGE_MAX_PER_SKU=4  // Max 4 images per SKU (prevents abuse)
```

---

## 💡 Best Practices

### SKU Format

Use consistent, unique naming:

```
Format: BRAND-CATEGORY-ID
Examples:
  BLUE-SHIRT-001
  BLUE-SHIRT-002
  RED-SHIRT-001
  SHOE-SNEAKER-123
```

### Image URLs

- Use HTTPS when possible
- Include query params for optimization: `?w=800&q=85`
- Ensure URLs are stable (not temporary/expiring)
- Test URLs work before submitting

### Batch Processing

For bulk images:
- Submit 1-5 at a time
- Wait for completion between batches
- Monitor error rates
- Adjust if needed

### Error Handling

Your system automatically:
- Retries failed downloads once
- Logs all errors with timestamp
- Marks jobs as FAILED with error code
- Continues processing other images

---

## 📈 Performance Expectations

| Metric | Value | Notes |
|--------|-------|-------|
| **Webhook Response Time** | < 100ms | Returns immediately |
| **Job Creation** | Instant | Database insert |
| **Total Processing Time** | ~14 seconds | Average |
| **Slowest Step** | Background removal | 4-5 seconds (Freepik API) |
| **Fastest Step** | Derivatives | 1-2 seconds (local) |
| **Asset Generation** | 24 files | cutout, 2 BGs, 2 composites, 18 derivatives |
| **Concurrent Jobs** | Depends on CPU | Typically 2-4 simultaneously |

---

## 🎓 Integration Examples

### Example 1: Simple 3JMS Upload

3JMS configuration:
```
Webhook URL: http://your-server:4000/api/webhooks/3jms/images
Method: POST
Event: Image Upload
```

Body automatically includes:
- `sku` - from product SKU
- `imageUrl` - from uploaded image URL
- `sha256` - from image hash
- `takenAt` - from timestamp

### Example 2: Custom Integration

If 3JMS doesn't have webhook support, create middleware:

```bash
# Option 1: Simple relay server
node DIRECT_WEBHOOK_TRIGGER.md → "Option 2"

# Option 2: Cron job
# Run periodically:
for product in $(list-products); do
  imageUrl=$(get-image-url $product)
  curl -X POST http://localhost:4000/api/webhooks/3jms/images \
    -d "{\"sku\":\"$product\",\"imageUrl\":\"$imageUrl\",\"sha256\":\"hash\"}"
done

# Option 3: API Integration
# See: DIRECT_WEBHOOK_TRIGGER.md for example code
```

---

## ✅ Success Criteria

You'll know integration is working when:

1. ✅ Image uploaded in 3JMS
2. ✅ Dashboard job appears within 2 seconds
3. ✅ Processing starts automatically
4. ✅ Status progresses through all 7 steps
5. ✅ Completes in ~14 seconds
6. ✅ Dashboard shows 24 assets generated
7. ✅ Assets are downloadable
8. ✅ Error cases handled gracefully

---

## 🆘 Support

### Immediate Checks

1. **Webhook received?**
   ```bash
   curl http://localhost:4000/api/jobs | grep YOUR-SKU
   ```

2. **Processing started?**
   ```bash
   curl http://localhost:4000/api/jobs/YOUR-SKU
   # Check: "status" field should progress
   ```

3. **Dashboard shows job?**
   ```
   Open http://localhost:5173
   Look for your SKU in the list
   ```

### Debug Logs

```bash
# Backend logs
tail -f backend.log

# Database query
sqlite3 server/db.sqlite "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1;"

# API response
curl -s http://localhost:4000/api/jobs/YOUR-SKU | jq .
```

### Common Issues

| Issue | Solution |
|-------|----------|
| 404 on webhook | URL is wrong, check IP:port |
| Job not starting | Check backend logs, verify Freepik API key |
| Image download fails | Verify image URL is public, check size |
| S3 upload fails | Check AWS credentials, bucket permissions |
| Dashboard empty | Refresh browser (Ctrl+R), check API response |

---

## 🚀 Next Steps

1. ✅ Get webhook URL from above
2. ✅ Configure 3JMS webhook settings
3. ✅ Test with curl command
4. ✅ Upload test image in 3JMS
5. ✅ Watch dashboard
6. ✅ Verify assets generated
7. ✅ Start production uploads

---

**You're all set! Integration is straightforward - just point 3JMS to your webhook URL and you're done!** 🎉

Status: Ready for 3JMS Integration
Last Updated: 2025-11-02
