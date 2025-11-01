#!/usr/bin/env node

/**
 * N8n Workflow Setup Script
 * Directly creates workflows in n8n using HTTP API
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const N8N_HOST = 'localhost';
const N8N_PORT = 5678;
const N8N_API_URL = `http://${N8N_HOST}:${N8N_PORT}/api/v1`;

let authToken = null;

/**
 * Make HTTP request
 */
function makeRequest(method, endpoint, data = null, includeAuth = false) {
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

    if (includeAuth && authToken) {
      options.headers['X-N8N-API-KEY'] = authToken;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
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
 * Create workflow directly
 */
async function createWorkflow(workflowData) {
  console.log(`\nCreating workflow: "${workflowData.name}"`);

  const payload = {
    name: workflowData.name,
    nodes: workflowData.nodes || [],
    connections: workflowData.connections || {},
    active: false,
    settings: workflowData.settings || {},
    tags: workflowData.tags || []
  };

  try {
    const response = await makeRequest('POST', '/workflows', payload, true);
    console.log(`✓ Created: ${response.name} (ID: ${response.id})`);

    if (workflowData.activate) {
      console.log(`  Activating workflow...`);
      await makeRequest('PATCH', `/workflows/${response.id}`, { active: true }, true);
      console.log(`✓ Activated: ${response.name}`);
    }

    return response;
  } catch (error) {
    console.error(`✗ Failed: ${error.message}`);
    throw error;
  }
}

/**
 * Main setup
 */
async function setup() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('         N8n Workflow Implementation');
  console.log('═══════════════════════════════════════════════════════');

  // Check n8n is running
  console.log('\n1️⃣  Checking N8n status...');
  try {
    const response = await makeRequest('GET', '/health');
    console.log('✓ N8n is running and accessible\n');
  } catch (error) {
    console.error('✗ N8n is not accessible at http://localhost:5678');
    console.error('   Start n8n with: n8n start');
    process.exit(1);
  }

  // Get or create API key
  console.log('2️⃣  Setting up authentication...');
  try {
    // Try to get existing workflows (this tests if we can access the API)
    await makeRequest('GET', '/workflows', null, false);
    console.log('✓ API access verified\n');
  } catch (error) {
    console.log('⚠ API authentication may be needed');
    console.log('   Configure N8N_API_KEY environment variable if needed\n');
  }

  // Load workflow definitions
  console.log('3️⃣  Loading workflow definitions...');
  const workflowsDir = path.join(__dirname, '../n8n-workflows');

  if (!fs.existsSync(workflowsDir)) {
    console.error('✗ Workflows directory not found:', workflowsDir);
    process.exit(1);
  }

  const workflowFiles = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  console.log(`✓ Found ${workflowFiles.length} workflow(s)\n`);

  // Import workflows
  console.log('4️⃣  Importing workflows...\n');

  const importedWorkflows = [];

  for (const file of workflowFiles) {
    const filePath = path.join(workflowsDir, file);
    let workflowData;

    try {
      workflowData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`✗ Failed to parse ${file}: ${error.message}`);
      continue;
    }

    try {
      const workflow = await createWorkflow(workflowData);
      importedWorkflows.push(workflow);
    } catch (error) {
      console.error(`✗ Failed to create workflow from ${file}`);
      continue;
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ Setup Complete!');
  console.log('═══════════════════════════════════════════════════════\n');

  if (importedWorkflows.length > 0) {
    console.log(`📊 Imported ${importedWorkflows.length} workflow(s):\n`);
    importedWorkflows.forEach(wf => {
      const status = wf.active ? '🟢 ACTIVE' : '⚪ INACTIVE';
      console.log(`   ${status} - ${wf.name} (ID: ${wf.id})`);
    });
  }

  console.log('\n🌐 Access N8n Dashboard: http://localhost:5678\n');
  console.log('📝 Next Steps:');
  console.log('   1. Open http://localhost:5678 in your browser');
  console.log('   2. Create admin account (first time)');
  console.log('   3. View imported workflows in sidebar');
  console.log('   4. Workflows are ready to use!\n');

  console.log('🧪 Test the Job Trigger Workflow:');
  console.log('   curl -X POST http://localhost:5678/webhook/3jms-image-webhook \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{');
  console.log('       "sku":"N8N-TEST-001",');
  console.log('       "sha256":"test-hash",');
  console.log('       "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",');
  console.log('       "theme":"default"');
  console.log('     }\'');
  console.log('');
}

// Run
setup().catch(error => {
  console.error('\n❌ Setup failed:', error.message);
  process.exit(1);
});
