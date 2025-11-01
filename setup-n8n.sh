#!/bin/bash

# N8n Automated Setup Script
# This script sets up n8n workflows automatically

echo "=========================================="
echo "N8n Workflow Setup"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if n8n is running
echo "Checking n8n status..."
if ! curl -s http://localhost:5678/api/v1/me > /dev/null 2>&1; then
    echo -e "${RED}✗ N8n is not running on http://localhost:5678${NC}"
    echo "Start n8n with: n8n start"
    exit 1
fi
echo -e "${GREEN}✓ N8n is running${NC}"
echo ""

# Check if workflows directory exists
if [ ! -d "n8n-workflows" ]; then
    echo -e "${RED}✗ Workflow directory not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Workflow directory found${NC}"
echo ""

# Get n8n data directory
N8N_DATA_DIR="${N8N_USER_FOLDER:=$HOME/.n8n}"
WORKFLOWS_DIR="$N8N_DATA_DIR/workflows"

echo "Using N8n data directory: $N8N_DATA_DIR"
echo "Workflows directory: $WORKFLOWS_DIR"
echo ""

# Create workflows directory if it doesn't exist
mkdir -p "$WORKFLOWS_DIR"
echo -e "${GREEN}✓ Workflows directory ready${NC}"
echo ""

# Import workflows using n8n CLI
echo "Importing workflows..."
echo ""

# Workflow 1: Job Trigger
echo "Importing: Job Trigger Workflow..."
if n8n import:workflow --input=n8n-workflows/01-job-trigger.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Job Trigger Workflow imported${NC}"
else
    echo -e "${YELLOW}⚠ Job Trigger Workflow - Check n8n UI to import manually${NC}"
fi

# Workflow 2: Job Monitor
echo "Importing: Job Monitor Workflow..."
if n8n import:workflow --input=n8n-workflows/02-job-monitor.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Job Monitor Workflow imported${NC}"
else
    echo -e "${YELLOW}⚠ Job Monitor Workflow - Check n8n UI to import manually${NC}"
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Open N8n UI: http://localhost:5678"
echo "2. Look for imported workflows in the sidebar"
echo "3. Activate workflows by clicking the toggle"
echo "4. Get webhook URL from Job Trigger workflow"
echo "5. Test with curl or your 3JMS system"
echo ""
echo "Quick test:"
echo "curl -X POST http://localhost:5678/webhook/3jms-image-webhook \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"sku\":\"TEST-001\",\"sha256\":\"hash-123\",\"imageUrl\":\"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500\",\"theme\":\"default\"}'"
echo ""
