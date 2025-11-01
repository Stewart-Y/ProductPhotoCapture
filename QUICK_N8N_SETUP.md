# Quick N8n Setup (5 minutes)

## Step 1: Access N8n Dashboard
Open your browser and go to **http://localhost:5678**

## Step 2: Create Admin User
- Set up your email and password
- Complete the onboarding

## Step 3: Import Workflows

### Workflow 1: Job Trigger
1. Click **"+" → Import from URL** (or **File**)
2. Copy the content of `n8n-workflows/01-job-trigger.json`
3. **Right-click → Import from clipboard**
4. Click **Save**
5. Click the **toggle** in the top-right to **Activate**

### Workflow 2: Job Monitor (Optional)
1. Click **"+" → Import**
2. Copy the content of `n8n-workflows/02-job-monitor.json`
3. **Right-click → Import from clipboard**
4. Configure Slack credentials (if you have Slack workspace):
   - Click **Credentials → Create New**
   - Select **Slack**
   - Click **Connect**
   - Complete Slack authorization
5. Click **Save**
6. Activate the workflow

## Step 4: Get Your Webhook URL

After activating the Job Trigger workflow:

1. Go to the **webhook node** (first node in the workflow)
2. Copy the **Production URL** (it will look like):
   ```
   http://localhost:5678/webhook/3jms-image-webhook
   ```

## Step 5: Test the Integration

### Send test data to n8n webhook:
```bash
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"N8N-TEST-001",
    "sha256":"n8n-test-hash",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "theme":"default"
  }'
```

### Verify job was created:
```bash
# This should show your N8N-TEST-001 job
curl http://localhost:4000/api/jobs | grep "N8N-TEST-001"
```

## All Systems Status

### Backend
- API: http://localhost:4000
- Health: `curl http://localhost:4000/api/health`
- Jobs: `curl http://localhost:4000/api/jobs`

### Frontend
- Dashboard: http://localhost:5173
- Watch jobs update in real-time!

### N8n
- Editor: http://localhost:5678
- Import workflows and activate them
- Monitor executions

## Next Steps

1. **See it work**: Watch a job flow through the system
2. **Set up Slack alerts**: Configure the monitor workflow
3. **Deploy to production**: Follow deployment guide

---

**Everything is ready!** Your n8n integration will automatically:
- ✅ Create jobs from webhook data
- ✅ Call your backend API
- ✅ Monitor job status hourly
- ✅ Send notifications on completion/failure
