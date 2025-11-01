# N8n Workflow Import Guide - Step by Step

**Difficulty**: Easy ⭐⭐☆☆☆ | **Time**: 5-10 minutes | **Prerequisites**: N8n running at http://localhost:5678

---

## ✅ Pre-Check

Before you start, verify everything is running:

```bash
# Check Backend (should return {"ok":true})
curl http://localhost:4000/api/health

# Check Frontend (should show HTML)
curl -I http://localhost:5173

# Check N8n (should load dashboard)
# Open in browser: http://localhost:5678
```

---

## Section A: Initial N8n Setup (First Time Only)

### Step A1: Open N8n Dashboard

1. Open your browser
2. Go to: **http://localhost:5678**
3. You should see the N8n welcome screen

### Step A2: Create Admin Account

1. Click **"Sign up"**
2. Enter an email: `admin@example.com` (or your email)
3. Create a strong password
4. Click **"Agree & continue"**
5. You're now logged in! ✅

### Step A3: Verify You're in the Dashboard

You should see:
- Left sidebar with menu
- "Workflows" section
- "+" button to create new workflow
- "Admin" menu with user options

**You're ready to import workflows!**

---

## Section B: Import Job Trigger Workflow

### What This Workflow Does

```
3JMS System → [Webhook] → [HTTP Request] → Backend API → Job Created
```

**Nodes**:
1. **Webhook Receiver** - Listens for image data from 3JMS
2. **HTTP Request** - Forwards data to backend API
3. **Response Formatter** - Returns success confirmation

### Import Method 1: Copy-Paste JSON (Recommended)

**Step B1: Prepare the JSON file**

1. Open Windows Explorer
2. Navigate to: `ProductPhotoCapture\n8n-workflows\`
3. Right-click on `job-trigger-workflow.json`
4. Select **"Open with"** → **"Notepad"** (or your favorite text editor)
5. Select ALL text (Ctrl+A)
6. Copy to clipboard (Ctrl+C)

**Step B2: Import into N8n**

1. Back in N8n browser window
2. Click the **"+"** icon in left sidebar
3. You should see options:
   - "New workflow"
   - "Import from URL"
   - "Import from code/clipboard"
4. Look for **"Import"** or **"Import from clipboard"** option
   - (Exact text varies by N8n version)
5. Paste the JSON (Ctrl+V)
6. Click **"Import"** button

**Step B3: Verify Import**

You should see a canvas with 3 connected nodes:

```
┌─────────────────────────────────────┐
│  3JMS Webhook Receiver              │
│  (blue webhook icon)                │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  Create Job in Pipeline             │
│  (green HTTP request icon)          │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  Format Response                    │
│  (orange code icon)                 │
└─────────────────────────────────────┘
```

**Step B4: Name & Save**

1. Look at top-left of canvas
2. You should see a text field (might say "Untitled")
3. Click it and change to: **"3JMS Image to Job Trigger"**
4. Click **"Save"** (or Ctrl+S)

**Step B5: Activate**

1. Look at top-right corner
2. You should see a **toggle switch**
3. It might be gray (OFF) or green (ON)
4. Click the toggle to turn it **GREEN** (ON)
5. You should see a notification: "Workflow activated"

**✅ Job Trigger workflow is now active and listening for webhooks!**

---

### Import Method 2: Manual Node Setup (Alternative)

If copy-paste doesn't work, build it manually:

**Step 1: Create New Workflow**

1. Click **"+"** → **"New workflow"**
2. Name it: `3JMS Image to Job Trigger`
3. Start with blank canvas

**Step 2: Add Webhook Node**

1. Click in the canvas area
2. You should see a node search box
3. Type: **"webhook"**
4. Click the **"Webhook"** result (blue icon)
5. A node appears on the canvas

**Step 3: Configure Webhook Node**

1. Click the webhook node
2. On the right side, you should see a **"Parameters"** panel
3. Look for these fields and fill them:
   - **Path**: `3jms-image-webhook`
   - **HTTP Method**: Select **"POST"**
   - **Response Mode**: Select **"On Received"** (or "Immediately")

**Step 4: Add HTTP Request Node**

1. Click the **"+"** button on the webhook node (or click canvas)
2. Search for **"HTTP Request"**
3. Click to add the node
4. Position it to the right of the webhook node

**Step 5: Configure HTTP Node**

1. Click the HTTP Request node
2. In the right panel, set:
   - **Method**: `POST`
   - **URL**: `http://localhost:4000/api/webhooks/3jms/images`
   - **Send Body**: Toggle ON (switch to blue)
   - **Body Type**: Keep as "Body Parameters"

**Step 6: Add Body Parameters**

1. In the HTTP node panel, look for **"Body Parameters"**
2. You should see a **"+"** button or **"Add Parameter"** button
3. Click to add parameter #1:
   - **Name**: `sku`
   - **Value**: `={{ $json.body.sku }}`
4. Click to add parameter #2:
   - **Name**: `sha256`
   - **Value**: `={{ $json.body.sha256 }}`
5. Click to add parameter #3:
   - **Name**: `imageUrl`
   - **Value**: `={{ $json.body.imageUrl }}`
6. Click to add parameter #4:
   - **Name**: `theme`
   - **Value**: `={{ $json.body.theme || 'default' }}`

**Step 7: Add Response Formatter**

1. Click **"+"** on the HTTP node (or click canvas)
2. Search for **"Code"**
3. Click **"Code"** node
4. In the right panel, you should see a code editor
5. Paste this JavaScript:
   ```javascript
   return {
     status: "success",
     message: "Job created successfully",
     jobId: $json.jobId,
     sku: $json.job?.sku
   };
   ```

**Step 8: Connect Nodes**

1. Look for small circles/dots on the edges of nodes
2. On the Webhook node, find the **right dot**
3. Click and drag it to the **left dot** of the HTTP node
4. On the HTTP node, find the **right dot**
5. Click and drag it to the **left dot** of the Code node
6. You should see lines connecting the nodes

**Step 9: Save & Activate**

1. Top-left: Confirm name is `3JMS Image to Job Trigger`
2. Click **"Save"**
3. Top-right: Toggle switch to GREEN
4. Workflow is now active! ✅

---

## Section C: Import Job Monitor Workflow

### What This Workflow Does

```
Every Hour → Get Stats → Check Completions → Format & Display
          ↘ Check Failures → Format & Display
```

**Nodes**:
1. **Hourly Schedule** - Triggers every hour
2. **Get Job Statistics** - Fetches stats from backend
3. **Check for Completed Jobs** - Conditional: if any jobs completed
4. **Get Completed Jobs** - Fetches completed job list
5. **Format Completion Message** - Formats for display
6. **Check for Failed Jobs** - Conditional: if any jobs failed
7. **Get Failed Jobs** - Fetches failed job list
8. **Format Failure Message** - Formats for display

### Import Steps

**Step C1: Prepare JSON**

1. Open `n8n-workflows\job-monitor-workflow.json` in text editor
2. Select ALL (Ctrl+A)
3. Copy (Ctrl+C)

**Step C2: Import**

1. In N8n, click **"+"** in sidebar
2. Click **"Import"**
3. Paste JSON (Ctrl+V)
4. Click **"Import"**

**Step C3: Verify & Activate**

1. You should see 8 nodes in a branching pattern
2. Top-left: Confirm name is `Job Status Monitor & Notifier`
3. Click **"Save"**
4. Top-right: Toggle switch to GREEN
5. Workflow activated! ✅

---

## Section D: Test Your Workflows

### Test 1: Send Test Image (Webhook)

**Open Terminal** and run this curl command:

```bash
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"N8N-TEST-001",
    "sha256":"abc123def456xyz",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "theme":"default"
  }'
```

**Expected Response**:
```json
{
  "status": "success",
  "message": "Job created successfully",
  "jobId": "some-id-here",
  "sku": "N8N-TEST-001"
}
```

**If you see this, the webhook worked!** ✅

### Test 2: Check N8n Execution Log

1. In N8n, open the **"Job Trigger"** workflow
2. Look for an **"Executions"** or **"History"** tab/button
3. You should see your recent execution
4. Click it to see details:
   - Input data from the webhook
   - HTTP response from backend
   - Formatted output

**You can see exactly what happened!** 📊

### Test 3: Check Job in Dashboard

1. Open your dashboard: **http://localhost:5173**
2. You should see "N8N-TEST-001" in the jobs list
3. Click on it to see details
4. Watch it process through the 7 pipeline steps

**The job is being processed!** 🚀

### Test 4: Check Backend Database

```bash
curl http://localhost:4000/api/jobs | grep "N8N-TEST-001"
```

You should see the job in JSON format.

### Test 5: Monitor Workflow (Manual Execution)

1. In N8n, open **"Job Status Monitor & Notifier"** workflow
2. Click **"Execute Workflow"** button (usually top-right)
3. The workflow runs immediately
4. You should see the execution flow:
   - Schedule triggers (immediately for manual execution)
   - Gets stats from backend
   - Checks for completions/failures
   - Formats messages

**The monitoring system works!** 📈

---

## Section E: Monitor in Real Time

### Monitor Job Progress

1. Open dashboard: http://localhost:5173
2. Click on the job created from your test
3. Watch the status progress through:
   - NEW
   - BG_REMOVED (background removal)
   - BACKGROUND_READY (AI background generated)
   - COMPOSITED (image composited)
   - DERIVATIVES (size variations created)
   - SHOPIFY_PUSH (uploaded to storage)
   - DONE (complete)

### Check N8n Execution Logs

1. Go to N8n: http://localhost:5678
2. Click **"Executions"** in left sidebar (if available)
3. You should see:
   - Job Trigger executions (when webhooks fire)
   - Monitor workflow executions (hourly schedule)
4. Click any execution to see:
   - Input data
   - Node-by-node execution
   - Output data
   - Timing and errors

### View Backend Logs

```bash
# In a terminal where backend is running
# You should see real-time logs like:
# [INFO] Job #123 transitioned: NEW → BG_REMOVED
# [INFO] Download complete, starting processing
# [INFO] Background removed successfully
```

---

## Section F: Troubleshooting

### Webhook Not Triggering

**Problem**: Curl command fails or webhook shows in N8n history as 404

**Check**:
1. Is workflow **activated**? (Toggle should be GREEN)
   ```
   - Open workflow
   - Check top-right toggle
   - If gray, click to turn green
   ```

2. Is webhook path correct?
   ```
   - Open "3JMS Webhook Receiver" node
   - Path should be: 3jms-image-webhook
   - Full URL: http://localhost:5678/webhook/3jms-image-webhook
   ```

3. Is N8n running?
   ```bash
   curl http://localhost:5678
   # Should not fail
   ```

### Backend Not Receiving Requests

**Problem**: Curl returns success but job doesn't appear in backend

**Check**:
1. Backend running?
   ```bash
   curl http://localhost:4000/api/health
   # Should return {"ok":true}
   ```

2. Is HTTP node URL correct?
   ```
   - Open "Create Job in Pipeline" node
   - URL should be: http://localhost:4000/api/webhooks/3jms/images
   ```

3. Check N8n execution log for errors:
   ```
   - Click workflow
   - View Executions
   - Look for red/error indicators
   - Click to see error details
   ```

### Job Not Appearing in Dashboard

**Problem**: Backend receives request but job doesn't show on dashboard

**Check**:
1. Did backend create the job?
   ```bash
   curl http://localhost:4000/api/jobs
   # Should include your job
   ```

2. Is dashboard refreshed?
   ```
   - Go to http://localhost:5173
   - Press Ctrl+R to refresh
   - Look for recent jobs section
   ```

3. Check browser console for errors:
   ```
   - Press F12
   - Go to Console tab
   - Look for red error messages
   ```

### Workflows Not Appearing After Import

**Problem**: Imported workflows but don't see them in N8n

**Fix**:
1. Refresh browser: Ctrl+R
2. Look in left sidebar → "Workflows"
3. If still not there, restart N8n:
   ```bash
   # In terminal where N8n runs:
   # Press Ctrl+C to stop
   # Then run: n8n start
   # Wait 30 seconds for startup
   # Refresh browser
   ```

### Cannot Connect to N8n

**Problem**: Browser shows "Cannot reach localhost:5678"

**Check**:
1. Is N8n running?
   ```bash
   curl http://localhost:5678
   # Should not fail with connection error
   ```

2. Start N8n if not running:
   ```bash
   n8n start
   # Wait 30 seconds
   ```

3. Check port 5678 is free:
   ```bash
   netstat -ano | find "5678"
   # Should show N8n process
   ```

---

## Section G: Next Steps

After successful import and testing:

1. **Connect 3JMS System**
   - Get your webhook URL: `http://localhost:5678/webhook/3jms-image-webhook`
   - Configure 3JMS to POST images to this URL
   - Verify connection with test image

2. **Setup Slack Notifications** (Optional)
   ```
   - In monitor workflow, add "Slack" node
   - Configure with your Slack workspace
   - Select channel for notifications
   ```

3. **Production Deployment** (When ready)
   ```
   - Set N8N_HOST environment variable
   - Configure SSL/TLS
   - Use PostgreSQL instead of SQLite
   - Enable task runners
   ```

4. **Monitor Workflows**
   ```
   - Check execution logs regularly
   - Monitor error rates
   - Track webhook success rate
   ```

---

## Summary

✅ **You have successfully**:
- Set up N8n with proper workflows
- Created webhook for image ingestion
- Connected to backend API
- Enabled monitoring and status checks
- Tested end-to-end integration

🎯 **What's running**:
| Component | Status | URL |
|-----------|--------|-----|
| Backend API | ✅ Running | http://localhost:4000 |
| Dashboard | ✅ Running | http://localhost:5173 |
| N8n Engine | ✅ Running | http://localhost:5678 |
| Job Trigger | ✅ Active | /webhook/3jms-image-webhook |
| Job Monitor | ✅ Active | Every hour |

---

## Quick Reference

```bash
# Test webhook
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{"sku":"TEST","sha256":"hash","imageUrl":"url","theme":"default"}'

# Check backend
curl http://localhost:4000/api/health

# Check frontend
curl -I http://localhost:5173

# View jobs
curl http://localhost:4000/api/jobs

# View stats
curl http://localhost:4000/api/jobs/stats

# Open N8n
# http://localhost:5678

# Open Dashboard
# http://localhost:5173
```

---

**Documentation Complete** ✅
**Status**: Ready for Production Testing
**Last Updated**: 2025-11-01
