#!/bin/bash

# Quick fix for production UI showing just "client" text
# This script fixes the immediate issue without full redeployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# EC2 Configuration
EC2_IP="98.89.71.150"
EC2_USER="ubuntu"
EC2_KEY_PATH="c:/Users/Stewart/Desktop/ProductPhotoCapture/ProductPhotoCaptureKey.pem"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Quick Fix: Production UI${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Update SSH key path for Mac if needed
if [[ "$OSTYPE" == "darwin"* ]]; then
  EC2_KEY_PATH="$HOME/Desktop/ProductPhotoCapture/ProductPhotoCaptureKey.pem"
fi

# Check if SSH key exists
if [ ! -f "$EC2_KEY_PATH" ]; then
  echo -e "${RED}Error: SSH key not found at ${EC2_KEY_PATH}${NC}"
  echo -e "${YELLOW}Please update EC2_KEY_PATH in this script${NC}"
  exit 1
fi

chmod 400 "$EC2_KEY_PATH"

echo -e "${YELLOW}[1/4] Checking current PM2 status...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  pm2 list
  echo ""
  echo "Current client process info:"
  pm2 info prod-client 2>/dev/null || pm2 info product-photo-client 2>/dev/null || echo "No client process found"
ENDSSH

echo -e "${YELLOW}[2/4] Installing serve package globally...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  # Install serve globally if not already installed
  npm list -g serve || npm install -g serve
ENDSSH

echo -e "${YELLOW}[3/4] Fixing PM2 client configuration...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture

  # Stop and delete any existing client processes
  pm2 delete prod-client 2>/dev/null || true
  pm2 delete product-photo-client 2>/dev/null || true

  # Start client with correct serve command
  # The -s flag enables SPA mode (single page app) which is crucial for React Router
  pm2 start serve --name prod-client -- ./client/dist -l 5173 -s

  # Save PM2 configuration
  pm2 save

  # Wait for it to start
  sleep 2

  # Show status
  pm2 list

  echo ""
  echo "Testing if client is now serving correctly..."
  curl -s http://localhost:5173 | grep -o "<title>.*</title>" || echo "Could not fetch title"
ENDSSH

echo -e "${YELLOW}[4/4] Verifying fix...${NC}"
# Test from outside
echo "Testing public URL..."
curl -s https://productphotos.click | grep -o "<title>.*</title>" || echo "Could not fetch title from public URL"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Fix Applied!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Check the site now at:${NC}"
echo -e "  ${GREEN}https://productphotos.click${NC}"
echo ""
echo -e "${YELLOW}Note: If it still shows 'client', wait 30 seconds for cache to clear${NC}"
echo -e "${YELLOW}and try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)${NC}"
echo ""