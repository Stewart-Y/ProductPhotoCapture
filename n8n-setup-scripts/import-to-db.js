#!/usr/bin/env node

/**
 * N8n Workflow Database Import
 * Directly inserts workflows into n8n's SQLite database
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const os = require('os');

const N8N_HOME = path.join(os.homedir(), '.n8n');
const N8N_DB = path.join(N8N_HOME, 'database.sqlite');

/**
 * Load workflow JSON
 */
function loadWorkflow(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load workflow: ${error.message}`);
    return null;
  }
}

/**
 * Import workflow to database
 */
async function importWorkflowToDb(dbPath, workflowData) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dbPath)) {
      console.log(`❌ Database not found: ${dbPath}`);
      console.log('   Make sure n8n has been started at least once');
      resolve(false);
      return;
    }

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`Failed to connect to database: ${err.message}`);
        resolve(false);
        return;
      }

      const now = new Date().toISOString();
      const name = workflowData.name || 'Untitled Workflow';
      const nodes = JSON.stringify(workflowData.nodes || []);
      const connections = JSON.stringify(workflowData.connections || {});
      const active = workflowData.active ? 1 : 0;

      // Insert workflow
      db.run(
        `INSERT INTO workflow (name, nodes, connections, active, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, nodes, connections, active, now, now],
        function(err) {
          if (err) {
            console.error(`❌ Failed to insert workflow: ${err.message}`);
            db.close();
            resolve(false);
          } else {
            console.log(`✅ Imported: ${name} (ID: ${this.lastID})`);
            db.close();
            resolve(true);
          }
        }
      );
    });
  });
}

/**
 * Main setup
 */
async function main() {
  console.log('═════════════════════════════════════════════════');
  console.log('    N8n Workflow Database Import');
  console.log('═════════════════════════════════════════════════\n');

  // Get workflow files
  const workflowsDir = path.join(__dirname, '..', 'n8n-workflows');
  let workflowFiles = [];

  try {
    workflowFiles = fs.readdirSync(workflowsDir)
      .filter(f => f.endsWith('-workflow.json'))
      .map(f => path.join(workflowsDir, f));
  } catch (error) {
    console.error(`❌ Failed to read workflows directory: ${error.message}`);
    return 1;
  }

  if (workflowFiles.length === 0) {
    console.log('❌ No workflow files found in n8n-workflows/');
    return 1;
  }

  console.log(`Found ${workflowFiles.length} workflow file(s)\n`);

  // Check database exists
  if (!fs.existsSync(N8N_DB)) {
    console.log(`❌ N8n database not found: ${N8N_DB}`);
    console.log('   Start n8n first: n8n start');
    return 1;
  }

  console.log(`Using database: ${N8N_DB}\n`);

  // Import each workflow
  let importedCount = 0;
  for (const workflowFile of workflowFiles) {
    const workflowData = loadWorkflow(workflowFile);
    if (workflowData) {
      const success = await importWorkflowToDb(N8N_DB, workflowData);
      if (success) importedCount++;
    }
  }

  console.log(`\n═════════════════════════════════════════════════`);
  console.log(`✅ Complete: ${importedCount}/${workflowFiles.length} workflows imported`);
  console.log('═════════════════════════════════════════════════\n');

  console.log('⚠️  Important: You must RESTART n8n for changes to take effect!\n');

  console.log('Next steps:');
  console.log('1. Stop n8n (Ctrl+C)');
  console.log('2. Start n8n again: n8n start');
  console.log('3. Open http://localhost:5678');
  console.log('4. Your workflows will appear in the Workflows section');
  console.log('5. Activate them and start using!\n');

  return 0;
}

// Check if sqlite3 is installed
try {
  require('sqlite3');
} catch (error) {
  console.error('❌ sqlite3 module not found');
  console.error('Install with: npm install sqlite3');
  process.exit(1);
}

main().then(code => process.exit(code));
