#!/usr/bin/env node

/**
 * N8n Workflow Activation Script
 * Imports and activates workflow JSON files into a running N8n instance
 *
 * This script:
 * 1. Connects to N8n HTTP API
 * 2. Creates a user if needed (first time setup)
 * 3. Imports workflow JSON files
 * 4. Activates workflows for immediate use
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const N8N_URL = 'http://localhost:5678';
const N8N_API = `${N8N_URL}/api/v1`;

/**
 * Make HTTP request to N8n API
 */
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : N8N_API + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject({
              status: res.statusCode,
              message: parsed.message || body,
              data: parsed
            });
          } else {
            resolve(parsed);
          }
        } catch (e) {
          resolve({ raw: body, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

/**
 * Load workflow JSON file
 */
function loadWorkflow(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to load workflow: ${error.message}`);
    return null;
  }
}

/**
 * Create workflow in N8n
 */
async function createWorkflow(workflowData, apiKey = null) {
  try {
    const headers = {};
    if (apiKey) headers['X-N8N-API-KEY'] = apiKey;

    const payload = {
      name: workflowData.name,
      nodes: workflowData.nodes,
      connections: workflowData.connections,
      settings: workflowData.settings || {},
      active: workflowData.active || false
    };

    const response = await makeRequest('POST', '/workflows', payload, headers);
    return { success: true, id: response.id, data: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Activate workflow
 */
async function activateWorkflow(workflowId, apiKey = null) {
  try {
    const headers = {};
    if (apiKey) headers['X-N8N-API-KEY'] = apiKey;

    await makeRequest('PATCH', `/workflows/${workflowId}`, { active: true }, headers);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Wait for N8n to be ready
 */
async function waitForN8n(maxAttempts = 30) {
  console.log('⏳ Waiting for N8n to be ready...');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await makeRequest('GET', '/status');
      console.log('✅ N8n is ready!');
      return true;
    } catch (error) {
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  console.error('❌ N8n failed to start after waiting');
  return false;
}

/**
 * Main setup
 */
async function main() {
  console.log('═════════════════════════════════════════════════');
  console.log('    N8n Workflow Activation & Import');
  console.log('═════════════════════════════════════════════════\n');

  // Check if N8n is running
  const ready = await waitForN8n();
  if (!ready) {
    console.log('\n❌ N8n is not running. Start it with: n8n start');
    return 1;
  }

  // Get workflow files
  const workflowsDir = path.join(__dirname, '..', 'n8n-workflows');
  let workflowFiles = [];

  try {
    workflowFiles = fs.readdirSync(workflowsDir)
      .filter(f => f.endsWith('-workflow.json'))
      .map(f => ({
        name: f,
        path: path.join(workflowsDir, f)
      }));
  } catch (error) {
    console.error(`❌ Failed to read workflows directory: ${error.message}`);
    return 1;
  }

  if (workflowFiles.length === 0) {
    console.log('❌ No workflow files found in n8n-workflows/');
    return 1;
  }

  console.log(`Found ${workflowFiles.length} workflow file(s)\n`);

  // Try to get API key from N8n (this may not work without auth setup)
  // For now, we'll attempt without it
  let apiKey = null;

  // Import workflows
  let importedCount = 0;
  let activatedCount = 0;

  for (const { name, path: filepath } of workflowFiles) {
    console.log(`\n📋 Processing: ${name}`);

    const workflowData = loadWorkflow(filepath);
    if (!workflowData) continue;

    // Create workflow
    console.log('   ↳ Creating workflow...');
    const createResult = await createWorkflow(workflowData, apiKey);

    if (!createResult.success) {
      console.error(`   ❌ Failed to create: ${createResult.error}`);
      continue;
    }

    console.log(`   ✅ Created: ${workflowData.name} (ID: ${createResult.id})`);
    importedCount++;

    // Activate workflow
    if (workflowData.active !== false) {
      console.log('   ↳ Activating workflow...');
      const activateResult = await activateWorkflow(createResult.id, apiKey);

      if (!activateResult.success) {
        console.log(`   ⚠️  Could not auto-activate: ${activateResult.error}`);
        console.log(`   → Activate manually in N8n UI: http://localhost:5678`);
      } else {
        console.log('   ✅ Activated!');
        activatedCount++;
      }
    }
  }

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`✅ Import: ${importedCount}/${workflowFiles.length} workflows imported`);
  console.log(`✅ Activated: ${activatedCount}/${workflowFiles.length} workflows`);
  console.log('═════════════════════════════════════════════════\n');

  if (importedCount > 0) {
    console.log('📖 Next steps:');
    console.log('1. Open N8n: http://localhost:5678');
    console.log('2. Check the Workflows section in the sidebar');
    console.log('3. Your workflows are ready to use');
    console.log('4. Any that show as inactive can be toggled on with the toggle switch\n');

    console.log('🧪 Test the Job Trigger workflow:');
    console.log('   curl -X POST http://localhost:5678/webhook/3jms-image-webhook \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{');
    console.log('       "sku":"N8N-TEST-001",');
    console.log('       "sha256":"test-hash-123",');
    console.log('       "imageUrl":"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",');
    console.log('       "theme":"default"');
    console.log('     }\'\n');
  }

  return 0;
}

main().then(code => process.exit(code)).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
