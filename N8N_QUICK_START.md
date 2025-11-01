# N8n Quick Start Guide - Complete Setup & Testing

## Status: ✅ N8n Running at http://localhost:5678

All systems ready for workflow import and activation!

---

## Step 1: Open N8n Dashboard

Navigate to **http://localhost:5678** in your browser

---

## Step 2: Create Admin Account (First Time Only)

**If this is your first time:**

1. Click **"Sign up"**
2. Enter your email (e.g., `admin@example.com`)
3. Create a password
4. Click **"Agree & Continue"**

**Note**: Keep these credentials - you'll need them to log back in.

---

## Step 3: Import Job Trigger Workflow (5 minutes)

This workflow receives images from 3JMS and creates jobs in your pipeline.

### Method A: Copy-Paste JSON (Easiest)

1. **In N8n Dashboard:**
   - Click the **"+"** button in the left sidebar
   - Select **"Import"**

2. **Open workflow file:**
   - Open this file in a text editor: `n8n-workflows/job-trigger-workflow.json`
   - Select ALL content (Ctrl+A)
   - Copy (Ctrl+C)

3. **Paste into N8n:**
   - Back in N8n, paste (Ctrl+V) into the import dialog
   - Click **"Import"**

4. **Verify the workflow loaded:**
   - You should see 3 nodes in the canvas:
     - **3JMS Webhook Receiver** (blue, top-left)
     - **Create Job in Pipeline** (green, middle)
     - **Format Response** (orange, bottom-right)

### Method B: Manual Node-by-Node Setup (If copy-paste doesn't work)

**1. Create blank workflow**
- Click **"+"** → **"New Workflow"**
- Name it: **"3JMS Image to Job Trigger"**

**2. Add Webhook Node**
- Click in canvas
- Search for **"Webhook"**
- Click to add
- Configure right panel:
  - **Path**: `3jms-image-webhook`
  - **HTTP Method**: `POST`
  - **Response Mode**: `On Received`

**3. Add HTTP Request Node**
- Click **"+"** to add another node
- Search for **"HTTP Request"**
- Click to add
- Configure:
  - **Method**: `POST`
  - **URL**: `http://localhost:4000/api/webhooks/3jms/images`
  - **Send Body**: Toggle ON
  - **Body Parameters:**
    - Click **"Add Parameter"** 4 times:
      1. Name: `sku` → Value: `={{ $json.body.sku }}`
      2. Name: `sha256` → Value: `={{ $json.body.sha256 }}`
      3. Name: `imageUrl` → Value: `={{ $json.body.imageUrl }}`
      4. Name: `theme` → Value: `={{ $json.body.theme || 'default' }}`

**4. Add Response Formatter Node**
- Add another node
- Search for **"Code"**
- Select "Code" (JavaScript)
- Paste this in the code box:
  ```javascript
  return {
    status: "success",
    message: "Job created successfully",
    jobId: $json.jobId,
    sku: $json.job?.sku
  };
  ```

**5. Connect Nodes**
- Click the dot on Webhook node → drag to HTTP Request node
- Click the dot on HTTP Request node → drag to Code node

**6. Save & Activate**
- Top-left: Enter name: **"3JMS Image to Job Trigger"**
- Click **"Save"**
- Top-right: Toggle the switch to **ON** (should turn green)

---

## Step 4: Import Job Monitor Workflow (3 minutes)

This workflow checks job status every hour and can send notifications.

### Using Copy-Paste Method:

1. **In N8n Dashboard:**
   - Click **"+"** → **"Import"**

2. **Open and copy:**
   - File: `n8n-workflows/job-monitor-workflow.json`
   - Select all, copy

3. **Paste into N8n**

4. **Verify:** You should see 8 nodes arranged in a tree pattern

5. **Activate:** Toggle the switch in top-right to ON

---

## Step 5: Test Your Workflows

### Test 1: Manual Webhook Trigger

Open a terminal and run:

```bash
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"N8N-TEST-001",
    "sha256":"abc123def456",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "theme":"default"
  }'
```

**Expected response:**
```json
{
  "status": "success",
  "message": "Job created successfully",
  "jobId": "...",
  "sku": "N8N-TEST-001"
}
```

### Test 2: Check Job Was Created

```bash
curl http://localhost:4000/api/jobs | grep "N8N-TEST-001"
```

**You should see the job in the list**

### Test 3: Check Dashboard

1. Open your dashboard at **http://localhost:5173**
2. You should see the new job in the list
3. Watch it process through all 7 steps in real-time

### Test 4: Monitor Workflow

The Job Monitor workflow runs every hour automatically.

To test it immediately:

1. In N8n, open **"Job Status Monitor & Notifier"**
2. Click **"Execute Workflow"** button (top-right)
3. Watch the execution in the panel below

---

## Workflow Details

### Job Trigger Workflow
- **Webhook Path**: `http://localhost:5678/webhook/3jms-image-webhook`
- **Accepts**: `{sku, sha256, imageUrl, theme}`
- **Sends to Backend**: `POST /api/webhooks/3jms/images`
- **Returns**: Job creation confirmation
- **Status**: Active (processing jobs immediately)

### Job Monitor Workflow
- **Trigger**: Every hour
- **Actions**:
  1. Fetch job statistics from `/api/jobs/stats`
  2. Check for completed jobs (if any exist)
  3. Check for failed jobs (if any exist)
  4. Format and display results
- **Status**: Active (monitoring continuously)

---

## What Happens When You Submit an Image

```
3JMS System
    ↓ (sends image data)
N8n Webhook Receiver
    ↓ (receives POST request)
HTTP Request Node
    ↓ (calls backend API)
Backend API
    ↓ (creates job in database)
Job Processor
    ↓ (7-step pipeline)
Dashboard
    ↓ (displays in real-time)
Completion
```

---

## Troubleshooting

### Webhook Not Triggering

- [ ] Workflow is **activated** (toggle is green)
- [ ] You're using the correct webhook path: `http://localhost:5678/webhook/3jms-image-webhook`
- [ ] You're sending POST requests
- [ ] Check N8n execution history for errors

### Job Not Appearing in Dashboard

- [ ] Backend is running: `curl http://localhost:4000/api/health`
- [ ] Webhook was triggered (check N8n execution logs)
- [ ] Dashboard is refreshed (Ctrl+R or Cmd+R)

### Workflows Not Appearing After Import

- [ ] Refresh N8n browser tab (Ctrl+R)
- [ ] Check the "Workflows" section in left sidebar
- [ ] Restart N8n if needed: Stop (Ctrl+C) and run `n8n start` again

### Cannot Access N8n

- [ ] Is N8n running? Check: `curl http://localhost:5678`
- [ ] Start N8n: `n8n start`
- [ ] Wait 30 seconds for startup
- [ ] Try again at: http://localhost:5678

---

## What's Running

✅ **Backend API** (port 4000)
- Handles job creation, state management, processing
- Endpoints: `/api/jobs`, `/api/jobs/stats`, `/api/webhooks/*`

✅ **React Dashboard** (port 5173)
- Real-time job monitoring and visualization
- Shows KPIs, recent jobs, system status

✅ **N8n Workflow Engine** (port 5678)
- Receives webhooks from 3JMS
- Monitors job status hourly
- Orchestrates integrations

✅ **SQLite Database**
- Stores jobs, assets, processing states
- Automatic migrations applied

✅ **Asset Storage** (S3 compatible)
- Stores images, cutouts, backgrounds
- Generates presigned URLs for downloads

---

## Next Steps

1. ✅ Import both workflows (Job Trigger + Job Monitor)
2. ✅ Test webhook with curl command
3. ✅ Verify job appears on dashboard
4. ✅ Activate Job Monitor workflow
5. 🔄 Connect to real 3JMS system
6. 🔧 (Optional) Configure Slack notifications
7. 📊 Monitor production jobs

---

## Quick Reference

| Component | URL | Status |
|-----------|-----|--------|
| N8n Dashboard | http://localhost:5678 | ✅ Running |
| Backend API | http://localhost:4000 | ✅ Running |
| Frontend Dashboard | http://localhost:5173 | ✅ Running |
| Job Trigger Webhook | http://localhost:5678/webhook/3jms-image-webhook | Needs workflow activation |
| Job Monitor Scheduler | Every hour | Active after workflow activation |

---

## File References

- **Workflow Files**: `n8n-workflows/`
  - `job-trigger-workflow.json` (3-node workflow)
  - `job-monitor-workflow.json` (8-node workflow)

- **Backend**: `server/`
  - `jobs/routes.js` (API endpoints)
  - `workflows/processor.js` (7-step pipeline)
  - `db.js` (SQLite database)

- **Frontend**: `client/src/`
  - `pages/Dashboard.tsx` (Real-time monitoring)
  - `hooks/useJobs.ts` (Data fetching)

---

## Support & Resources

- **N8n Docs**: https://docs.n8n.io
- **N8n Community**: https://community.n8n.io
- **Backend Setup**: See `LOCAL_SETUP.md`
- **Project Architecture**: See `N8N_INTEGRATION.md`

---

**Last Updated**: 2025-11-01
**Status**: Ready for Activation
**Setup Time**: ~10 minutes
**Difficulty**: Easy (UI-based, no code required)
