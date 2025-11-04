#!/bin/bash

# ProductPhotoCapture Deployment Script
# Deploys latest code to EC2 instance

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# EC2 Configuration
EC2_IP="98.89.71.150"
EC2_USER="ubuntu"
EC2_KEY_PATH="c:/Users/Stewart/Desktop/ProductPhotoCapture/ProductPhotoCaptureKey.pem"
APP_DIR="/home/ubuntu/ProductPhotoCapture"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ProductPhotoCapture Deployment${NC}"
echo -e "${GREEN}  Target: ${EC2_IP}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if SSH key exists
if [ ! -f "$EC2_KEY_PATH" ]; then
  echo -e "${RED}Error: SSH key not found at ${EC2_KEY_PATH}${NC}"
  echo -e "${YELLOW}Please update EC2_KEY_PATH in this script to point to your .pem file${NC}"
  exit 1
fi

# Check SSH key permissions
chmod 400 "$EC2_KEY_PATH"

echo -e "${YELLOW}[1/8] Testing SSH connection...${NC}"
if ! ssh -i "$EC2_KEY_PATH" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" "echo 'Connected successfully'" > /dev/null 2>&1; then
  echo -e "${RED}Error: Cannot connect to EC2 instance${NC}"
  echo -e "${YELLOW}Please verify:${NC}"
  echo -e "  - EC2 instance is running"
  echo -e "  - Security group allows SSH (port 22) from your IP"
  echo -e "  - SSH key path is correct: ${EC2_KEY_PATH}"
  exit 1
fi
echo -e "${GREEN}✓ SSH connection successful${NC}"

echo -e "${YELLOW}[2/8] Pulling latest code from GitHub...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture
  echo "Current branch:"
  git branch
  echo "Pulling latest changes..."
  git pull origin main
  echo "Latest commit:"
  git log -1 --oneline
ENDSSH
echo -e "${GREEN}✓ Code updated${NC}"

echo -e "${YELLOW}[3/8] Installing server dependencies...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture/server
  npm install --production
ENDSSH
echo -e "${GREEN}✓ Server dependencies installed${NC}"

echo -e "${YELLOW}[4/8] Running database migrations...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture/server
  # Migrations run automatically on server start via db.js
  # But we can verify the migration version
  if [ -f "db.sqlite" ]; then
    echo "Database exists, migrations will run on server restart"
  else
    echo "No database found - migrations will run on first server start"
  fi
ENDSSH
echo -e "${GREEN}✓ Database ready${NC}"

echo -e "${YELLOW}[5/8] Installing client dependencies...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture/client
  npm install
ENDSSH
echo -e "${GREEN}✓ Client dependencies installed${NC}"

echo -e "${YELLOW}[6/8] Building client for production...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture/client
  npm run build
ENDSSH
echo -e "${GREEN}✓ Client built${NC}"

echo -e "${YELLOW}[7/8] Restarting server (PM2)...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  # Restart server
  pm2 restart product-photo-server || pm2 start /home/ubuntu/ProductPhotoCapture/server/server.js --name product-photo-server

  # Save PM2 process list
  pm2 save

  echo "Waiting for server to start..."
  sleep 3

  # Check server status
  pm2 list
ENDSSH
echo -e "${GREEN}✓ Server restarted${NC}"

echo -e "${YELLOW}[8/8] Restarting client (PM2)...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  # Restart client
  pm2 restart product-photo-client || pm2 start npx --name product-photo-client -- serve /home/ubuntu/ProductPhotoCapture/client/dist -l 5173

  # Save PM2 process list
  pm2 save

  echo "Waiting for client to start..."
  sleep 2

  # Show final status
  echo ""
  echo "=== PM2 Process Status ==="
  pm2 list

  echo ""
  echo "=== Recent Server Logs ==="
  pm2 logs product-photo-server --lines 10 --nostream
ENDSSH
echo -e "${GREEN}✓ Client restarted${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Your application is now live at:${NC}"
echo -e "  ${GREEN}https://product-photos.click${NC}"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo -e "  ssh -i $EC2_KEY_PATH $EC2_USER@$EC2_IP 'pm2 logs'"
echo ""
echo -e "${YELLOW}To check status:${NC}"
echo -e "  ssh -i $EC2_KEY_PATH $EC2_USER@$EC2_IP 'pm2 status'"
echo ""
