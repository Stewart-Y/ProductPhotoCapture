#!/usr/bin/env python3

import json
import sqlite3
import os
from datetime import datetime
from pathlib import Path

# N8n database location
N8N_HOME = os.path.expanduser('~/.n8n')
N8N_DB = os.path.join(N8N_HOME, 'database.sqlite')

def load_workflow(filepath):
    """Load workflow JSON file"""
    with open(filepath, 'r') as f:
        return json.load(f)

def import_workflow_to_db(db_path, workflow_data):
    """Import workflow directly into n8n database"""

    if not os.path.exists(db_path):
        print(f"❌ Database not found: {db_path}")
        print(f"   Make sure n8n has been started at least once")
        return False

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        now = datetime.now().isoformat()

        # Insert workflow
        workflow_name = workflow_data.get('name', 'Untitled Workflow')
        nodes = json.dumps(workflow_data.get('nodes', []))
        connections = json.dumps(workflow_data.get('connections', {}))
        active = workflow_data.get('active', False)

        cursor.execute('''
            INSERT INTO workflow (name, nodes, connections, active, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (workflow_name, nodes, connections, 1 if active else 0, now, now))

        conn.commit()
        workflow_id = cursor.lastrowid

        print(f"✅ Imported: {workflow_name} (ID: {workflow_id})")

        conn.close()
        return True

    except Exception as e:
        print(f"❌ Error importing workflow: {e}")
        return False

def main():
    print("═════════════════════════════════════════════════")
    print("    N8n Workflow Database Import")
    print("═════════════════════════════════════════════════\n")

    # Get workflow files
    workflows_dir = Path(__file__).parent.parent / 'n8n-workflows'
    workflow_files = sorted(workflows_dir.glob('*-workflow.json'))

    if not workflow_files:
        print("❌ No workflow files found in n8n-workflows/")
        return 1

    print(f"Found {len(workflow_files)} workflow(s)\n")

    # Check database
    if not os.path.exists(N8N_DB):
        print(f"❌ N8n database not found: {N8N_DB}")
        print("   Start n8n first: n8n start")
        return 1

    print(f"Using database: {N8N_DB}\n")

    # Import each workflow
    imported_count = 0
    for workflow_file in workflow_files:
        try:
            workflow_data = load_workflow(workflow_file)
            if import_workflow_to_db(N8N_DB, workflow_data):
                imported_count += 1
        except Exception as e:
            print(f"❌ Failed to process {workflow_file.name}: {e}")

    print(f"\n═════════════════════════════════════════════════")
    print(f"✅ Import complete: {imported_count} workflow(s) imported")
    print("═════════════════════════════════════════════════\n")

    print("Next steps:")
    print("1. Restart n8n: Ctrl+C to stop, then run 'n8n start'")
    print("2. Open http://localhost:5678")
    print("3. Check the Workflows section to see your imported workflows")
    print("4. Activate them and start using!\n")

    return 0

if __name__ == '__main__':
    exit(main())
