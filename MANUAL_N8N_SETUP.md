# Manual N8n Workflow Setup (5 Minutes)

## Status: N8n is Running! ✅

N8n is now running at **http://localhost:5678**

## Quick Setup Steps

### Step 1: Open N8n Dashboard
Open your browser and navigate to:
```
http://localhost:5678
```

### Step 2: Create Your Admin Account
- Set email and password
- Click "Next"
- Complete any onboarding prompts

### Step 3: Import First Workflow (Job Trigger)

#### Option A: Import from File
1. Click **"+"** button in the left sidebar
2. Click **"New"** → **"From file"**
3. Select `n8n-workflows/01-job-trigger.json`
4. Click **"Import"**

#### Option B: Copy-Paste Method
1. Click **"+"** in left sidebar
2. Click **"New"** → **"New workflow"**
3. Open this file in a text editor: `n8n-workflows/01-job-trigger.json`
4. In the new n8n workflow:
   - Right-click on canvas → **"Import from clipboard"**
   - Paste the JSON content
5. Click **"Import"**

### Step 4: Configure the Webhook Node

1. Find the **"3JMS Webhook Receiver"** node (first node)
2. Click on it to open the node panel
3. Note the **"Production URL"** field:
   - It should be something like: `http://localhost:5678/webhook/3jms-image-webhook`
   - Copy this URL - you'll use it to send jobs

### Step 5: Activate the Workflow

1. In the top-right corner, click the **toggle** to turn the workflow **ON**
2. You should see a **green checkmark** when it's active
3. The webhook is now listening for requests!

### Step 6: Test the Workflow

Run this curl command to test:
```bash
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"TEST-N8N-001",
    "sha256":"test-hash-123",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "theme":"default"
  }'
```

### Expected Results

1. **In N8n**:
   - Execution history shows one execution
   - Click on it to see the flow
   - You should see job data transformed

2. **In Your Backend**:
   - Job was created in database
   - Verify with: `curl http://localhost:4000/api/jobs | grep "TEST-N8N-001"`

3. **In Dashboard**:
   - New job appears at http://localhost:5173
   - Job starts processing through the 7-step pipeline

## Optional: Import Second Workflow (Job Monitor)

Repeat the same process with `n8n-workflows/02-job-monitor.json`

This workflow:
- Runs **every hour**
- Checks job status
- Sends **Slack notifications** (requires Slack setup)
- Can be left inactive for now

## Your Webhook URL

After activation, use this webhook URL to send images from 3JMS:

```
http://localhost:5678/webhook/3jms-image-webhook
```

Format:
```json
{
  "sku": "PRODUCT_SKU",
  "sha256": "IMAGE_SHA256_HASH",
  "imageUrl": "https://url-to-image.jpg",
  "theme": "default"
}
```

## System Health Check

Verify all three systems are running:

```bash
# N8n UI
curl http://localhost:5678

# Backend API
curl http://localhost:4000/api/health

# Frontend
curl http://localhost:5173
```

## Troubleshooting

### N8n Won't Start
```bash
# Kill any existing n8n processes
pkill -f "n8n start"

# Restart n8n
n8n start
```

### Webhook Not Receiving Data
1. Check workflow is **activated** (green toggle)
2. Verify URL in curl matches the production URL
3. Check n8n execution history for errors

### Job Not Created in Backend
1. Check backend is running: `curl http://localhost:4000/api/health`
2. Look at n8n workflow logs - what error do you see?
3. Verify backend API endpoint: `curl http://localhost:4000/api/webhooks/3jms/images`

### Can't See Job in Dashboard
1. Check frontend is running: http://localhost:5173
2. Refresh the page
3. Check browser console for errors
4. Verify database has job: `curl http://localhost:4000/api/jobs`

## Next Steps

1. **Activate Monitor Workflow**
   - Import `02-job-monitor.json`
   - Set up Slack credentials (optional)
   - Activate it

2. **Create Production Workflows**
   - Email notifications
   - Shopify push integration
   - Advanced error handling

3. **Set Up Advanced Automation**
   - AI background generation triggers
   - Asset transformation pipelines
   - Quality checks and validation

## Full System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 3JMS System (Your Image Source)                             │
└────────────────────┬────────────────────────────────────────┘
                     │ sends image data
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ N8n Webhook (http://localhost:5678/webhook/...)             │
│ • Receives images from 3JMS                                 │
│ • Transforms data format                                    │
│ • Calls your backend API                                    │
└────────────────────┬────────────────────────────────────────┘
                     │ creates job
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend API (http://localhost:4000)                         │
│ • Creates job in database                                   │
│ • Validates data                                            │
│ • Returns job ID                                            │
└────────────────────┬────────────────────────────────────────┘
                     │ processes automatically
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Job Processor (7-Step Pipeline)                             │
│ 1. Download + Background Removal (Freepik AI)              │
│ 2. Background Generation                                    │
│ 3. Compositing with Effects                                │
│ 4. Derivatives (9 files per variant)                        │
│ 5. Manifest Generation                                      │
│ 6. Shopify Push (future)                                    │
│ 7. Completion                                               │
└────────────────────┬────────────────────────────────────────┘
                     │ updates status
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Dashboard (http://localhost:5173)                           │
│ • Real-time job tracking                                    │
│ • Progress visualization                                    │
│ • Asset management                                          │
│ • Analytics                                                 │
└─────────────────────────────────────────────────────────────┘
                     │ monitors status
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ N8n Monitor Workflow (Hourly)                               │
│ • Checks job statistics                                     │
│ • Sends Slack notifications                                │
│ • Logs execution history                                    │
└─────────────────────────────────────────────────────────────┘
```

---

**Everything is ready! Your automated image processing pipeline is live.** 🚀
