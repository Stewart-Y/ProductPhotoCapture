# 3JMS Webhook Configuration - Step by Step

## ⚠️ Problem

You uploaded an image in 3JMS but nothing happened because **3JMS doesn't know where to send the webhook notification**.

Your backend webhook endpoint exists and is ready:
```
http://localhost:4000/api/webhooks/3jms/images
```

But **3JMS hasn't been configured to POST to it**.

---

## ✅ Solution: Configure Webhook in 3JMS

### Step 1: Access 3JMS Admin Settings

In 3JMS UI:
1. Click **Settings** (gear icon)
2. Navigate to **Integrations** or **Webhooks** section
3. Look for **"Webhook Configuration"** or **"API Settings"**

### Step 2: Add New Webhook

Create a **new webhook** with these settings:

| Setting | Value |
|---------|-------|
| **Event Type** | Image Uploaded / Product Updated / Inventory Changed |
| **Webhook URL** | `http://localhost:4000/api/webhooks/3jms/images` |
| **HTTP Method** | `POST` |
| **Content Type** | `application/json` |
| **Active** | ✅ Enabled |

### Step 3: Webhook Payload Configuration

3JMS should send POST body with:

```json
{
  "event": "image.uploaded",
  "sku": "BLUE-SHIRT-001",
  "imageUrl": "https://3jms-cdn.com/uploads/uuid-abc123.jpg",
  "sha256": "abc123def456789...",
  "takenAt": "2025-11-02T20:00:00Z"
}
```

### Step 4: Test Webhook

In 3JMS settings, look for **"Test Webhook"** button:
1. Click "Send Test"
2. Check if you get a 200 response
3. Job should appear in your dashboard

---

## 🔗 Network Considerations

### If 3JMS is Local/Same Network
```
Webhook URL: http://localhost:4000/api/webhooks/3jms/images
OR
Webhook URL: http://192.168.1.100:4000/api/webhooks/3jms/images
(Replace 192.168.1.100 with your machine's IP)
```

### If 3JMS is Remote
```
Webhook URL: http://YOUR_PUBLIC_IP:4000/api/webhooks/3jms/images
(Requires port forwarding or ngrok tunnel)
```

### For Local Testing with ngrok
```bash
# Install ngrok if not already installed
npm install -g ngrok

# In new terminal, expose your local server
ngrok http 4000

# This gives you a URL like:
# https://abc123.ngrok.io/api/webhooks/3jms/images

# Use this URL in 3JMS webhook configuration
```

---

## 🧪 Manual Test Before Configuring 3JMS

Test your webhook manually to verify it works:

```bash
curl -X POST http://localhost:4000/api/webhooks/3jms/images \
  -H "Content-Type: application/json" \
  -d '{
    "event": "image.uploaded",
    "sku":"BLUE-SHIRT-001",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "sha256":"abc123def456789abcdef",
    "takenAt":"2025-11-02T20:00:00Z"
  }'
```

**Expected Response:**
```json
{
  "jobId": "Ly8Lf6YQr6BmE9tyo3e2y",
  "status": "created",
  "job": {
    "id": "Ly8Lf6YQr6BmE9tyo3e2y",
    "sku": "BLUE-SHIRT-001",
    "theme": "default",
    "status": "NEW",
    "createdAt": "2025-11-02T20:15:00.000Z"
  }
}
```

---

## 📊 Webhook Request/Response Flow

### Request (3JMS → Your Backend)
```
POST http://localhost:4000/api/webhooks/3jms/images HTTP/1.1
Content-Type: application/json

{
  "event": "image.uploaded",
  "sku": "TESTING_ONLY_TESTING_ITEM_#2_2012_750ML",
  "imageUrl": "https://3jms-cdn.com/image.jpg",
  "sha256": "hash...",
  "takenAt": "2025-11-02T20:00:00Z"
}
```

### Response (Your Backend → 3JMS)
```
HTTP/1.1 201 Created
Content-Type: application/json

{
  "jobId": "unique-job-id-here",
  "status": "created",
  "job": {
    "id": "unique-job-id-here",
    "sku": "TESTING_ONLY_TESTING_ITEM_#2_2012_750ML",
    "theme": "default",
    "status": "NEW",
    "createdAt": "2025-11-02T20:15:30.123Z"
  }
}
```

---

## 🔍 Debugging: Webhook Not Triggering

### Check 1: Endpoint is Live
```bash
# Test if endpoint exists
curl -I http://localhost:4000/api/webhooks/3jms/images

# Should return: 405 Method Not Allowed (because we need POST, not GET)
# If returns 404, endpoint doesn't exist - backend isn't running
```

### Check 2: Backend Logs
When webhook is called, you should see in backend logs:
```
[Webhook] Received POST from 3JMS
[Webhook] SKU: TESTING_ONLY_TESTING_ITEM_#2_2012_750ML
[Webhook] Job created: Ly8Lf6YQr6BmE9tyo3e2y
```

### Check 3: Dashboard Updates
After webhook sent, refresh dashboard:
```
http://localhost:5173
```

New job should appear in "Jobs" section

### Check 4: Verify 3JMS Configuration
- [ ] Webhook URL is correct
- [ ] Method is POST
- [ ] Content-Type is application/json
- [ ] Webhook is ENABLED
- [ ] Event type is "Image Uploaded" or equivalent

---

## 🚀 Complete Setup Process

### For Local Testing:

```
1. ✅ Backend running on port 4000
2. ✅ Frontend running on port 5173
3. ✅ Webhook endpoint ready
4. ❌ 3JMS webhook NOT configured yet

TO FIX:
5. Open 3JMS Settings
6. Find Webhooks section
7. Add: http://localhost:4000/api/webhooks/3jms/images
8. Save settings
9. Upload image in 3JMS
10. ✅ Webhook triggers
11. ✅ Job appears on dashboard
12. ✅ Processing starts automatically
```

---

## 📋 3JMS Webhook Configuration Checklist

When you find the webhook settings in 3JMS, configure exactly:

```
☐ Event: Image Uploaded
☐ URL: http://localhost:4000/api/webhooks/3jms/images
☐ Method: POST
☐ Content-Type: application/json
☐ Include Body:
   {
     "sku": (from product SKU)
     "imageUrl": (from uploaded image)
     "sha256": (calculate from image)
   }
☐ Enabled: Yes
☐ Test button: Sends test webhook
```

---

## 🎯 What Happens After Configuration

Once configured in 3JMS:

```
You in 3JMS:
  Upload image → Choose product SKU
         ↓
3JMS Backend:
  Processes upload → Webhook triggers
         ↓
Your Backend:
  Receives webhook → Creates job → Starts processing
         ↓
Dashboard:
  Job appears → Shows progress → Completes in 14s
         ↓
Assets:
  24 files ready → Download or integrate with Shopify
```

---

## 🔧 If You Can't Find Webhook Settings in 3JMS

3JMS might use different terminology:

Look for sections named:
- **Integrations**
- **API Settings**
- **External Integrations**
- **Webhooks**
- **Notifications**
- **Automation**
- **Event Listeners**
- **POST Endpoints**

Or contact 3JMS support to ask:
> "How do I configure a POST webhook to be triggered when an image is uploaded to a product?"

---

## ✨ Once Configured

After setting up the webhook in 3JMS:

1. **Upload image in 3JMS** to any product SKU
2. **Instant webhook** sent to your backend
3. **Job created** automatically
4. **Processing starts** immediately
5. **14 seconds later** → 24 assets ready
6. **Dashboard shows** complete transformation pipeline

---

**The webhook is ready on your backend. You just need to tell 3JMS where to send it!**

Status: Backend Ready, Waiting for 3JMS Configuration
