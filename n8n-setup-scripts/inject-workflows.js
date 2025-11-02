#!/usr/bin/env node

/**
 * Direct N8n Workflow Injection
 * Inserts workflows directly via N8n's internal API
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const N8N_HOST = 'localhost';
const N8N_PORT = 5678;

function makeRequest(method, pathUrl, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: N8N_HOST,
      port: N8N_PORT,
      path: pathUrl,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(JSON.parse(body || '{}'));
          } catch (e) {
            resolve({ raw: body, status: res.statusCode });
          }
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function createWorkflow(workflowJson, apiKey = null) {
  const headers = {};
  if (apiKey) headers['X-N8N-API-KEY'] = apiKey;

  const payload = {
    name: workflowJson.name,
    nodes: workflowJson.nodes,
    connections: workflowJson.connections,
    settings: workflowJson.settings,
    active: false
  };

  console.log(`\n📋 Creating workflow: ${workflowJson.name}`);
  console.log(`   Nodes: ${workflowJson.nodes.length}`);

  try {
    const response = await makeRequest('POST', '/api/v1/workflows', payload, headers);
    console.log(`✅ Created successfully`);
    console.log(`   ID: ${response.id}`);
    return response;
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    // Try alternative endpoint
    console.log(`   Trying alternative endpoint...`);
    try {
      const alt = await makeRequest('POST', '/workflows', payload, headers);
      console.log(`✅ Created via alternative endpoint`);
      return alt;
    } catch (e2) {
      console.log(`❌ Also failed: ${e2.message}`);
      throw error;
    }
  }
}

async function main() {
  console.log('═════════════════════════════════════════════════');
  console.log('   N8n Workflow Direct Injection Tool');
  console.log('═════════════════════════════════════════════════');

  // Read workflows
  const workflowsDir = path.join(__dirname, '..', 'n8n-workflows');
  const triggerFile = path.join(workflowsDir, 'job-trigger-workflow.json');
  const monitorFile = path.join(workflowsDir, 'job-monitor-workflow.json');

  let triggerWorkflow, monitorWorkflow;

  try {
    triggerWorkflow = JSON.parse(fs.readFileSync(triggerFile, 'utf8'));
    monitorWorkflow = JSON.parse(fs.readFileSync(monitorFile, 'utf8'));
    console.log('\n✅ Loaded workflow files');
  } catch (error) {
    console.error('\n❌ Failed to load workflows:', error.message);
    process.exit(1);
  }

  // Try to create workflows
  try {
    await createWorkflow(triggerWorkflow);
    await createWorkflow(monitorWorkflow);

    console.log('\n═════════════════════════════════════════════════');
    console.log('✅ Workflows injected successfully!');
    console.log('═════════════════════════════════════════════════');
    console.log('\nNext steps:');
    console.log('1. Open N8n: http://localhost:5678');
    console.log('2. Refresh the page (Ctrl+R)');
    console.log('3. Check the Workflows section');
    console.log('4. Activate both workflows');
    console.log('5. Test with curl webhook\n');
  } catch (error) {
    console.log('\n❌ Failed to inject workflows');
    console.log('Alternative: Build manually in N8n UI using N8N_MANUAL_UI_SETUP.md');
    process.exit(1);
  }
}

main();
