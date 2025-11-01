# N8n Integration Guide

## Overview

N8n provides powerful workflow automation for your image processing pipeline. It connects your 3JMS system with the job pipeline and enables notifications, monitoring, and data transformations.

## Running N8n Locally

### Start N8n
```bash
n8n start
```

N8n will be available at **http://localhost:5678**

### Initial Setup
1. Navigate to http://localhost:5678
2. Create your admin user account
3. Set up credentials for integrations (Slack, email, etc.)

## Available Workflows

### 1. Job Trigger Workflow (01-job-trigger.json)
**Purpose**: Receives images from 3JMS and creates jobs in the pipeline

**Flow**:
1. **3JMS Webhook Receiver** - Listens for incoming image data
   - Endpoint: `/webhook/3jms-image-webhook`
   - Expects: `{sku, sha256, imageUrl, theme}`

2. **Create Job in Pipeline** - Calls your backend API
   - POST to `http://localhost:4000/api/webhooks/3jms/images`
   - Transforms n8n data to API format

3. **Success Response** - Returns job creation confirmation
   - Returns: `{status, jobId, sku}`

**To Activate**:
1. Go to N8n UI
2. Import `01-job-trigger.json`
3. Save and activate the workflow
4. Get webhook URL from the workflow

**Testing the Workflow**:
```bash
# Send test image data to n8n
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"TEST-N8N-001",
    "sha256":"test-hash-123",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "theme":"default"
  }'
```

### 2. Job Monitor Workflow (02-job-monitor.json)
**Purpose**: Polls job status hourly and sends notifications

**Flow**:
1. **Schedule Trigger** - Runs every hour
2. **Get Job Statistics** - Fetches stats from API
3. **Check for Failures** - Conditional: if failed jobs > 0
   - **Get Failed Jobs** - Fetches up to 5 failed jobs
   - **Send Slack Alert** - Notifies #pipeline-alerts channel

4. **Check for Completions** - Conditional: if completed jobs > 0
   - **Get Completed Jobs** - Fetches up to 5 completed jobs
   - **Send Completion Alert** - Notifies #pipeline-status channel

**To Activate**:
1. Import `02-job-monitor.json`
2. Configure Slack credentials:
   - Go to Credentials → Slack
   - Authenticate with your Slack workspace
3. Save and activate

**Slack Channel Names** (adjust to your workspace):
- `#pipeline-alerts` - Failed job notifications
- `#pipeline-status` - Completion notifications

## API Integration Points

### Your Backend Endpoints
All n8n workflows use these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks/3jms/images` | POST | Create job from image data |
| `/api/jobs` | GET | List all jobs with filters |
| `/api/jobs/:id` | GET | Get single job details |
| `/api/jobs/stats` | GET | Get dashboard statistics |
| `/api/processor/status` | GET | Get processor status |

### Query Parameters for Job Listing
```
GET /api/jobs?status=DONE&limit=5
GET /api/jobs?status=FAILED&limit=10
GET /api/jobs?sku=VWS123&theme=default
```

## Advanced Workflows (Coming Soon)

### 3. Shopify Push Workflow
When ready to implement Shopify integration:
```
Job Completed → Extract S3 URLs → Transform for Shopify → Push Media → Update Job Status
```

### 4. Email Notifications Workflow
Send detailed job reports:
```
Daily → Get All Completed Jobs → Generate Report → Send Email
```

### 5. Webhook to Slack Transformer
Real-time notifications:
```
Your App Webhook → Parse → Format → Send to Slack
```

## Deployment Configuration

### For Production
1. Set `N8N_HOST=your-domain.com`
2. Set `N8N_PORT=5678`
3. Configure SSL/TLS certificates
4. Set up database (PostgreSQL recommended)
5. Enable webhook signatures for security

### Environment Variables
```bash
# For secure webhook signatures
WEBHOOK_TUNNEL_URL=https://your-domain.com/webhook

# Database (instead of SQLite)
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=localhost
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=n8n
DB_POSTGRESDB_PASSWORD=secure_password

# Task runners (recommended for production)
N8N_RUNNERS_ENABLED=true
```

## Manual Workflow Import

If workflows don't load automatically:

1. **Open N8n Dashboard** → http://localhost:5678
2. **Create New Workflow**
3. **Copy JSON content** from workflow file
4. **Right-click → Import from clipboard**
5. **Configure and save**

## Testing Workflows

### Test Job Trigger
```bash
# This should create a job in your system
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"N8N-TEST-001",
    "sha256":"n8n-test-hash",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "theme":"default"
  }'

# Check the job was created
curl http://localhost:4000/api/jobs | grep "N8N-TEST-001"
```

### Test Job Monitor
1. Go to the monitor workflow in N8n
2. Click "Execute Workflow" button
3. Check Slack for notifications
4. Review logs in N8n execution history

## Troubleshooting

### Workflow Not Triggering
- Check if workflow is active (toggle switch on)
- Verify webhook URL is correct
- Check n8n logs for errors

### API Calls Failing
- Ensure backend is running on http://localhost:4000
- Verify API endpoints are accessible: `curl http://localhost:4000/api/health`
- Check HTTP request node configuration

### Slack Notifications Not Working
- Verify Slack app is authorized
- Check channel names in workflow
- Ensure bot has permission to post to channels

### Performance Issues
- Consider using Task Runners for heavy workflows
- Increase database pool size
- Monitor n8n logs: `tail -f ~/.n8n/logs/*`

## Security Best Practices

1. **Webhook Validation**
   - Enable webhook signatures
   - Validate request source

2. **Credentials Management**
   - Use environment variables for sensitive data
   - Rotate API keys regularly
   - Never commit credentials to git

3. **Rate Limiting**
   - Add delays between API calls
   - Implement exponential backoff for retries

4. **Audit Logging**
   - Enable execution history
   - Monitor failed executions
   - Set up alerts for errors

## Integration Checklist

- [ ] N8n running locally on port 5678
- [ ] Backend running on port 4000
- [ ] Job Trigger workflow imported and active
- [ ] Job Monitor workflow imported (Slack optional)
- [ ] Test job creation via n8n webhook
- [ ] Verify jobs appear on dashboard
- [ ] Monitor workflow running on schedule
- [ ] Slack notifications received (if configured)

## Next Steps

1. **Activate workflows** - Import and enable the provided workflows
2. **Configure notifications** - Set up Slack or email alerts
3. **Test end-to-end** - Create a job via n8n and watch it process
4. **Monitor performance** - Check n8n execution logs
5. **Plan advanced workflows** - Design custom automations for your business needs

## Support

For n8n documentation: https://docs.n8n.io
For workflow help: Check individual workflow JSON files for detailed node configuration

---

**N8n Version**: Latest
**Last Updated**: 2025-11-01
**Status**: Ready for Production Testing
