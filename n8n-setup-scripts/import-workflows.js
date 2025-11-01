#!/usr/bin/env node

/**
 * N8n Workflow Auto-Import Script
 * This script connects to n8n and imports the workflows programmatically
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const N8N_HOST = 'localhost';
const N8N_PORT = 5678;
const N8N_API_URL = `http://${N8N_HOST}:${N8N_PORT}/api/v1`;

/**
 * Make HTTP request to n8n API
 */
function makeRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${N8N_API_URL}${endpoint}`);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(e);
          }
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Create a workflow in n8n
 */
async function createWorkflow(workflowData) {
  console.log(`Creating workflow: ${workflowData.name}`);

  const payload = {
    name: workflowData.name,
    nodes: workflowData.nodes,
    connections: workflowData.connections,
    active: workflowData.active || false
  };

  try {
    const response = await makeRequest('POST', '/workflows', payload);
    console.log(`✓ Workflow created: ${response.name} (ID: ${response.id})`);
    return response;
  } catch (error) {
    console.error(`✗ Failed to create workflow: ${error.message}`);
    throw error;
  }
}

/**
 * Update workflow to active state
 */
async function activateWorkflow(workflowId) {
  console.log(`Activating workflow: ${workflowId}`);

  try {
    const response = await makeRequest('PATCH', `/workflows/${workflowId}`, {
      active: true
    });
    console.log(`✓ Workflow activated: ${response.name}`);
    return response;
  } catch (error) {
    console.error(`✗ Failed to activate workflow: ${error.message}`);
    throw error;
  }
}

/**
 * Main setup function
 */
async function setup() {
  console.log('========================================');
  console.log('N8n Workflow Auto-Import');
  console.log('========================================\n');

  // Check if n8n is running
  console.log('Checking n8n status...');
  try {
    await makeRequest('GET', '/me');
    console.log('✓ N8n is running\n');
  } catch (error) {
    console.error('✗ N8n is not accessible at http://localhost:5678');
    console.error('Start n8n with: n8n start');
    process.exit(1);
  }

  // Load workflow files
  const workflowsDir = path.join(__dirname, '../n8n-workflows');
  const workflowFiles = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (workflowFiles.length === 0) {
    console.error('No workflow files found in n8n-workflows/');
    process.exit(1);
  }

  console.log(`Found ${workflowFiles.length} workflow(s)\n`);

  // Import each workflow
  for (const file of workflowFiles) {
    const filePath = path.join(workflowsDir, file);
    const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    try {
      // Create workflow
      const workflow = await createWorkflow(workflowData);

      // Optionally activate
      if (workflowData.autoActivate) {
        await activateWorkflow(workflow.id);
      }

      console.log('');
    } catch (error) {
      console.error(`Error with ${file}:`, error.message);
      console.log('');
    }
  }

  console.log('========================================');
  console.log('Setup Complete!');
  console.log('========================================\n');
  console.log('Next steps:');
  console.log('1. Open N8n UI: http://localhost:5678');
  console.log('2. View imported workflows');
  console.log('3. Activate workflows if not auto-activated');
  console.log('4. Get webhook URL from Job Trigger workflow\n');
  console.log('Quick test:');
  console.log('curl -X POST http://localhost:5678/webhook/3jms-image-webhook \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"sku":"TEST-001","sha256":"hash","imageUrl":"https://...","theme":"default"}\'');
  console.log('');
}

// Run setup
setup().catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});
