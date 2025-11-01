# N8n Workflow Setup Guide (Visual Step-by-Step)

## Status: N8n Ready with Pre-Built Workflows ✅

N8n is running at **http://localhost:5678**
Pre-built workflow JSONs are ready in `n8n-workflows/`

## Workflow 1: 3JMS Image to Job Trigger

### What It Does
- Receives webhook POST requests from 3JMS
- Extracts image data (SKU, SHA256, URL, theme)
- Transforms and calls your backend API
- Creates jobs in the processing pipeline

### Workflow File
`n8n-workflows/job-trigger-workflow.json`

### Visual Flow
```
3JMS System
    ↓
  POST to Webhook
    ↓
3JMS Webhook Receiver
    ↓
  Parse Data
    ↓
Create Job in Pipeline
    ↓
  HTTP POST to backend
    ↓
Format Response
    ↓
Return Success Message
```

### Setup Steps

#### Step 1: Open N8n Dashboard
```
Open: http://localhost:5678
```

#### Step 2: Create Admin Account (First Time Only)
- Click "Sign up"
- Enter email and password
- Click "Next"

#### Step 3: Create a New Workflow
1. Click the **"+"** button in the left sidebar
2. Select **"New"** → **"New Workflow"**

#### Step 4: Add Webhook Node
1. Click in the canvas
2. Search for **"Webhook"**
3. Click **"Webhook"** node
4. In the right panel:
   - Path: `3jms-image-webhook`
   - HTTP Method: `POST`
   - Response Mode: `On Received`
5. Click **"Test"** to generate and copy the production URL

#### Step 5: Add HTTP Request Node
1. Click **"+"** to add another node
2. Search for **"HTTP Request"**
3. Configure:
   - Method: `POST`
   - URL: `http://localhost:4000/api/webhooks/3jms/images`
   - Send Body: Toggle ON
   - Body Parameters:
     ```
     sku = $json.body.sku
     sha256 = $json.body.sha256
     imageUrl = $json.body.imageUrl
     theme = $json.body.theme || 'default'
     ```

#### Step 6: Connect Nodes
1. Click the **connection dot** on Webhook node
2. Drag to HTTP Request node

#### Step 7: Save and Activate
1. Top-left: Name the workflow: **"3JMS Image to Job Trigger"**
2. Click **Save**
3. Top-right: Click **toggle** to turn workflow **ON** (should be green)

#### Step 8: Get Your Webhook URL
1. Click the Webhook node
2. Copy the **Production URL** shown in the right panel
3. This is the URL to give to 3JMS:
   ```
   http://localhost:5678/webhook/3jms-image-webhook
   ```

### Test the Workflow
```bash
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"TEST-001",
    "sha256":"test-hash-123",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "theme":"default"
  }'
```

Expected response:
```json
{
  "status": "success",
  "message": "Job created successfully",
  "jobId": "...",
  "sku": "TEST-001"
}
```

---

## Workflow 2: Job Status Monitor & Notifier

### What It Does
- Runs every hour automatically
- Checks job statistics
- Detects completed and failed jobs
- Can send notifications (future: Slack, email)

### Workflow File
`n8n-workflows/job-monitor-workflow.json`

### Visual Flow
```
Hourly Schedule
    ↓
Get Job Statistics
    ↓
  Split branches
    ├─ Check Completions → Get Completed Jobs → Format Message
    │
    └─ Check Failures → Get Failed Jobs → Format Message
```

### Setup Steps (Similar to Above)

#### Step 1: Create New Workflow
1. Click **"+"** → **"New"**

#### Step 2: Add Schedule Node
1. Search for **"Schedule"**
2. Configure:
   - Trigger: `Every Hour`

#### Step 3: Add HTTP Request (Get Stats)
1. Add HTTP Request node
2. URL: `http://localhost:4000/api/jobs/stats`
3. Method: `GET`

#### Step 4: Add IF Node (Check Completions)
1. Add **"If"** node
2. Condition: `$json.today.done > 0`

#### Step 5: Add IF Node (Check Failures)
1. Add another **"If"** node
2. Condition: `$json.today.failed > 0`

#### Step 6: Add HTTP Requests for Data
For completion branch:
- URL: `http://localhost:4000/api/jobs?status=DONE&limit=5`

For failure branch:
- URL: `http://localhost:4000/api/jobs?status=FAILED&limit=5`

#### Step 7: Connect Everything
- Schedule → Get Stats
- Get Stats → If Completions & If Failures (both)
- If Completions TRUE → Get Completed Jobs
- If Failures TRUE → Get Failed Jobs

#### Step 8: Activate
1. Name: **"Job Status Monitor"**
2. Save
3. Activate with toggle

---

## Alternative: Quick Import Method

If you want to use the pre-built JSON files directly:

### Option A: Copy-Paste JSON
1. Open `n8n-workflows/job-trigger-workflow.json` in a text editor
2. Copy all content
3. In N8n: Right-click on canvas → **"Import from Clipboard"**
4. Paste the JSON
5. Click **"Import"**

### Option B: Use Import Script
```bash
# After n8n is running, you can try:
node n8n-setup-scripts/setup-workflows.js
```

---

## Your Webhook URLs (After Setup)

### Job Trigger
```
http://localhost:5678/webhook/3jms-image-webhook
```

Send POST requests with:
```json
{
  "sku": "PRODUCT_SKU",
  "sha256": "IMAGE_HASH",
  "imageUrl": "https://...",
  "theme": "default"
}
```

### Expected Flow
1. 3JMS sends image data to webhook
2. N8n receives → transforms → calls backend
3. Backend creates job
4. Job processes through 7 steps
5. Dashboard updates in real-time
6. Monitor workflow checks hourly

---

## Complete System Architecture

```
┌─────────────────────────────────────────────────────┐
│ 3JMS (Your Image Source)                            │
└────────────────┬────────────────────────────────────┘
                 │ POST webhook/3jms-image-webhook
                 ▼
┌─────────────────────────────────────────────────────┐
│ N8n Job Trigger Workflow                            │
│ • Webhook Receiver                                  │
│ • Data Transformer                                  │
│ • API Caller                                        │
│ • Response Formatter                                │
└────────────────┬────────────────────────────────────┘
                 │ POST /api/webhooks/3jms/images
                 ▼
┌─────────────────────────────────────────────────────┐
│ Backend API (http://localhost:4000)                 │
│ • Job Creation & Validation                         │
│ • Database Storage                                  │
│ • Status Management                                 │
└────────────────┬────────────────────────────────────┘
                 │ Automatic Processing
                 ▼
┌─────────────────────────────────────────────────────┐
│ Job Processor (7-Step Pipeline)                     │
│ 1. Download + BG Removal                            │
│ 2. Background Generation                            │
│ 3. Compositing                                      │
│ 4. Derivatives                                      │
│ 5. Manifest Generation                              │
│ 6. Shopify Push                                     │
│ 7. Completion                                       │
└────────────────┬────────────────────────────────────┘
                 │ Status Updates
                 ▼
┌─────────────────────────────────────────────────────┐
│ Dashboard (http://localhost:5173)                   │
│ • Real-time Job Tracking                            │
│ • Progress Visualization                            │
│ • Asset Management                                  │
│ • Analytics                                         │
└────────────────┬────────────────────────────────────┘
                 │ Hourly Polling
                 ▼
┌─────────────────────────────────────────────────────┐
│ N8n Monitor Workflow (Every Hour)                   │
│ • Check Job Statistics                              │
│ • Detect Completions                                │
│ • Detect Failures                                   │
│ • Send Notifications                                │
└─────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Webhook Not Triggering
- ✅ Workflow must be **activated** (green toggle)
- ✅ URL must be **exactly** correct
- ✅ Request method must be **POST**
- ✅ Check execution history in N8n for errors

### Backend Not Receiving Requests
- ✅ Backend must be running: `curl http://localhost:4000/api/health`
- ✅ HTTP Request node must have correct URL
- ✅ Body parameters must match API expectations
- ✅ Check N8n execution logs for errors

### Job Not Appearing in Dashboard
- ✅ Backend API must receive the webhook call
- ✅ Job must be in database: `curl http://localhost:4000/api/jobs`
- ✅ Dashboard must be refreshed
- ✅ Check browser console for errors

### N8n Not Responding
- ✅ Stop: `Ctrl+C` in the terminal
- ✅ Start again: `n8n start`
- ✅ Wait 30 seconds for initialization
- ✅ Visit: `http://localhost:5678`

---

## Advanced Customizations

### Add Email Notifications
1. In monitor workflow, after checking failures
2. Add **"Send Email"** node
3. Configure SMTP credentials
4. Format message with job details

### Add Slack Notifications
1. Add **"Slack"** node instead of email
2. Configure Slack credentials
3. Select channel
4. Format message

### Add Database Logging
1. After workflow completion
2. Add **"Insert Row"** node
3. Log execution details to your database

### Add Retry Logic
1. In job trigger, add **"Wait"** node
2. Set retry conditions
3. Add **"Retry"** node on failures

---

## Production Deployment

### When Ready for Production:

1. **Set N8n Host**
   ```bash
   export N8N_HOST=your-domain.com
   ```

2. **Use PostgreSQL Database**
   ```bash
   export DB_TYPE=postgresdb
   export DB_POSTGRESDB_HOST=db.example.com
   ```

3. **Enable Task Runners**
   ```bash
   export N8N_RUNNERS_ENABLED=true
   ```

4. **Configure SSL/TLS**
   ```bash
   export SECURE_COOKIE=true
   export N8N_PROTOCOL=https
   ```

5. **Deploy to Cloud**
   - Docker: `docker run -e N8N_HOST=domain n8nio/n8n`
   - Heroku: `heroku create && git push heroku main`
   - AWS: Use ECS or Lambda

---

## Summary

✅ N8n is running
✅ Workflows are pre-built (JSON format ready)
✅ Setup is straightforward (5-10 minutes)
✅ No coding required
✅ Full system integration achieved

**Next Step**: Open http://localhost:5678 and follow the visual setup steps above!

---

**Documentation**: Complete
**Status**: Ready for Activation
**Estimated Setup Time**: 10 minutes
**Difficulty**: Easy (UI-based, no code required)
