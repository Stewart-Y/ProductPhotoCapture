# N8n Manual UI Setup - Build Workflows Step by Step

**No Copy-Paste Needed** - We'll build the workflows directly in N8n

---

## Part 1: Create Job Trigger Workflow (3 minutes)

### Step 1.1: Create New Workflow

1. Open N8n: **http://localhost:5678**
2. Click the **"+"** button in the left sidebar
3. Select **"New workflow"**
4. You should see a blank canvas

### Step 1.2: Add Webhook Node

1. Click in the canvas (or look for node search)
2. A node palette should appear
3. Search for **"Webhook"**
4. Click on **"Webhook"** (should be blue icon)
5. A webhook node appears on canvas

### Step 1.3: Configure Webhook Node

Click on the webhook node. On the right side you should see a panel with parameters:

**Set these values:**
- **Path**: `3jms-image-webhook`
- **HTTP Method**: Select from dropdown → **`POST`**
- **Response Mode**: Select from dropdown → **`On Received`**

**That's it for the webhook node!**

### Step 1.4: Add HTTP Request Node

1. Click the webhook node to select it
2. You should see a **"+"** button on the right side of the node
3. Click that **"+"** button
4. Search for **"HTTP Request"** in the node selector
5. Click **"HTTP Request"** (green icon with globe)
6. Node appears connected to the right

### Step 1.5: Configure HTTP Request Node

Click the HTTP Request node. On the right panel:

**Set these values:**
- **Method**: Select dropdown → **`POST`**
- **URL**: `http://localhost:4000/api/webhooks/3jms/images`
- **Send Body**: Toggle the switch to **ON** (should be blue)
- **Body Type**: Should already be "Body Parameters" (keep as is)

### Step 1.6: Add Body Parameters

In the HTTP Request node settings, look for **"Body Parameters"** section:

1. Click **"+"** button or **"Add Parameter"** button
2. **First Parameter**:
   - Name: `sku`
   - Value: `={{ $json.body.sku }}`
   - Click **Add**

3. **Second Parameter**:
   - Name: `sha256`
   - Value: `={{ $json.body.sha256 }}`
   - Click **Add**

4. **Third Parameter**:
   - Name: `imageUrl`
   - Value: `={{ $json.body.imageUrl }}`
   - Click **Add**

5. **Fourth Parameter**:
   - Name: `theme`
   - Value: `={{ $json.body.theme || 'default' }}`
   - Click **Add**

### Step 1.7: Add Response Formatter Node

1. Click the HTTP Request node
2. Click the **"+"** button on its right side
3. Search for **"Code"**
4. Click **"Code"** (orange icon)
5. Node appears on the right

### Step 1.8: Configure Code Node

Click the Code node. In the right panel:

1. Look for the **code editor** area
2. Make sure **mode** is set to "JavaScript"
3. In the code box, delete any existing content
4. Paste this exactly:

```javascript
return {
  status: "success",
  message: "Job created successfully",
  jobId: $json.jobId,
  sku: $json.job?.sku
};
```

### Step 1.9: Save Workflow

1. Top-left of the canvas, you should see a text field
2. It might say "Untitled" or blank
3. Click it and type: **`3JMS Image to Job Trigger`**
4. Press Enter to confirm
5. Click **"Save"** button (or Ctrl+S)
6. You should see a success message

### Step 1.10: Activate Workflow

1. Look at the **top-right corner** of the canvas
2. You should see a **toggle switch** (might be gray)
3. Click the toggle to turn it **GREEN**
4. You should see: "Workflow activated" message

**✅ Workflow 1 is complete!**

---

## Part 2: Create Job Monitor Workflow (5 minutes)

### Step 2.1: Create New Workflow

1. Click **"+"** in left sidebar
2. Click **"New workflow"**
3. Blank canvas appears

### Step 2.2: Add Schedule Node

1. Click in canvas
2. Search for **"Schedule"**
3. Click **"Schedule"** (clock icon)
4. Node appears

### Step 2.3: Configure Schedule Node

Click the Schedule node. In the right panel:

- **Rule**: Select dropdown → **`Every hour`**
- Leave other settings as default

### Step 2.4: Add HTTP Request (Stats)

1. Click the Schedule node
2. Click the **"+"** on the right
3. Search for **"HTTP Request"**
4. Click **"HTTP Request"**
5. Node appears connected

### Step 2.5: Configure Stats HTTP Node

Click the node. In the right panel:

- **Method**: Select → **`GET`**
- **URL**: `http://localhost:4000/api/jobs/stats`
- **Send Body**: Keep as **OFF** (toggle should be gray)

### Step 2.6: Add First Conditional (Check for Completed)

1. Click the Stats HTTP node
2. Click the **"+"** button
3. Search for **"If"**
4. Click **"If"** (green arrow icon)
5. Node appears

### Step 2.7: Configure Completion Check

Click the If node. In the right panel:

1. Look for **"Conditions"** section
2. You should see a condition rule
3. Set:
   - **Value 1**: `={{ $json.today.done }}`
   - **Operation**: Select dropdown → **`greater than`**
   - **Value 2**: `0`

This checks if any jobs were completed today.

### Step 2.8: Add Second Conditional (Check for Failures)

1. Click back on the Stats HTTP node
2. Click the **"+"** button (might be at the bottom)
3. Search for **"If"**
4. Click **"If"**
5. Another If node appears (positioned below)

### Step 2.9: Configure Failure Check

Click the second If node. In the right panel:

- **Value 1**: `={{ $json.today.failed }}`
- **Operation**: Select → **`greater than`**
- **Value 2**: `0`

This checks if any jobs failed today.

### Step 2.10: Add Get Completed Jobs (HTTP)

1. Click the first If node (Completions check)
2. You should see two **outputs** at the bottom (true/false)
3. Click the **true** output (top one)
4. Click the **"+"** that appears
5. Search for **"HTTP Request"**
6. Click **"HTTP Request"**

### Step 2.11: Configure Completed Jobs HTTP

Click this node. Set:

- **Method**: **`GET`**
- **URL**: `http://localhost:4000/api/jobs?status=DONE&limit=5`

### Step 2.12: Add Get Failed Jobs (HTTP)

1. Click the second If node (Failures check)
2. Click the **true** output (top one)
3. Click the **"+"** that appears
4. Search for **"HTTP Request"**
5. Click **"HTTP Request"**

### Step 2.13: Configure Failed Jobs HTTP

Click this node. Set:

- **Method**: **`GET`**
- **URL**: `http://localhost:4000/api/jobs?status=FAILED&limit=5`

### Step 2.14: Add Completion Message Formatter

1. Click the "Get Completed Jobs" HTTP node
2. Click the **"+"** on the right
3. Search for **"Code"**
4. Click **"Code"**

### Step 2.15: Configure Completion Formatter

In the code editor, paste:

```javascript
return {
  message: "✅ Jobs Completed Today",
  count: $json.count,
  jobs: $json.jobs?.map(j => `${j.sku} - $${j.cost_usd}`)
};
```

### Step 2.16: Add Failure Message Formatter

1. Click the "Get Failed Jobs" HTTP node
2. Click the **"+"** on the right
3. Search for **"Code"**
4. Click **"Code"**

### Step 2.17: Configure Failure Formatter

In the code editor, paste:

```javascript
return {
  message: "⚠️ Failed Jobs Alert",
  count: $json.count,
  jobs: $json.jobs?.map(j => `${j.sku} - ${j.error_code}`)
};
```

### Step 2.18: Save Monitor Workflow

1. Top-left: Type name: **`Job Status Monitor & Notifier`**
2. Press Enter
3. Click **"Save"**

### Step 2.19: Activate Monitor Workflow

1. Top-right: Find the toggle switch
2. Click to turn it **GREEN**
3. Confirm "Workflow activated" message

**✅ Workflow 2 is complete!**

---

## Part 3: Test Your Workflows

### Test 1: Verify Webhooks Registered

Open terminal and run:

```bash
curl -X POST http://localhost:5678/webhook/3jms-image-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sku":"TEST-UI-001",
    "sha256":"test123",
    "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    "theme":"default"
  }'
```

**Expected**: JSON response with success message

### Test 2: Check N8n Execution Log

1. Open N8n: http://localhost:5678
2. Click on "3JMS Image to Job Trigger" workflow
3. Look for an "Executions" tab or button
4. You should see your test request logged
5. Click to view details

### Test 3: Check Job on Dashboard

1. Open dashboard: http://localhost:5173
2. Look for job "TEST-UI-001" in the list
3. Click to view details
4. Watch it progress through steps

### Test 4: Monitor Workflow Manual Test

1. Open "Job Status Monitor & Notifier" in N8n
2. Look for an "Execute Workflow" button (top-right area)
3. Click it to run immediately
4. Watch execution flow through the nodes

**✅ Everything should work!**

---

## Troubleshooting

### Can't find Node Search

If you don't see a search box when trying to add nodes:

1. Right-click on the canvas
2. Look for "Add node" or similar option
3. Or: look at the left sidebar for a "Nodes" panel/button
4. Click to expand available nodes

### Parameter Values Not Accepting `{{ }}`

Some versions of N8n need you to:

1. Click on the value field
2. You might see an icon (looks like `{}`  or `f(x)`)
3. Click that icon to enable "expression mode"
4. Then paste the expression

### HTTP Request Not Working

Make sure you:

1. Set **Method** correctly (POST or GET)
2. Set **URL** correctly (use `http://` not `https://`)
3. For POST: Make sure **Send Body** is toggled ON
4. For body parameters, make sure they're in the right section

### If Node Showing Error

If the If node shows an error:

1. Make sure the condition values are formatted correctly
2. Try deleting and recreating the If node
3. Check that the previous node (Stats HTTP) is returning data

---

## Quick Reference

| Workflow | Purpose | Trigger | Nodes |
|----------|---------|---------|-------|
| **Job Trigger** | Receives images, creates jobs | Webhook POST | 3 |
| **Job Monitor** | Checks status, detects changes | Schedule (hourly) | 8 |

| Node Type | Used For |
|-----------|----------|
| **Webhook** | Receive HTTP requests |
| **HTTP Request** | Call APIs |
| **Schedule** | Timed triggers |
| **If** | Conditional logic |
| **Code** | Transform data |

---

## Success Checklist

- [ ] Job Trigger workflow created
- [ ] All 3 nodes connected properly
- [ ] Webhook node shows path: `3jms-image-webhook`
- [ ] HTTP node shows URL: `http://localhost:4000/api/webhooks/3jms/images`
- [ ] Job Trigger is ACTIVATED (toggle green)
- [ ] Job Monitor workflow created
- [ ] All 8 nodes connected properly
- [ ] Schedule node set to "Every hour"
- [ ] First If node checks completions
- [ ] Second If node checks failures
- [ ] Job Monitor is ACTIVATED (toggle green)
- [ ] Test webhook succeeds
- [ ] Job appears on dashboard
- [ ] Monitor workflow executes without errors

---

**You're done when both workflows are GREEN and test webhook works!** 🚀
