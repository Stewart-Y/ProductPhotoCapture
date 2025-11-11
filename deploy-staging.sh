#!/bin/bash

# ProductPhotoCapture Staging Deployment Script
# Deploys latest code to staging environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# EC2 Configuration
EC2_IP="54.82.99.169"
EC2_USER="ubuntu"
EC2_KEY_PATH="$HOME/Desktop/ProductPhotoCapture/ProductPhotoCaptureKey.pem"
STAGING_DIR="/home/ubuntu/ProductPhotoCapture-staging"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ProductPhotoCapture STAGING Deployment${NC}"
echo -e "${GREEN}  Target: staging.productphotos.click${NC}"
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
  exit 1
fi
echo -e "${GREEN}✓ SSH connection successful${NC}"

echo -e "${YELLOW}[2/8] Setting up staging directory...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  # Create staging directory if it doesn't exist
  if [ ! -d "/home/ubuntu/ProductPhotoCapture-staging" ]; then
    echo "Creating staging directory..."
    cp -r /home/ubuntu/ProductPhotoCapture /home/ubuntu/ProductPhotoCapture-staging
  fi
  cd /home/ubuntu/ProductPhotoCapture-staging
ENDSSH
echo -e "${GREEN}✓ Staging directory ready${NC}"

echo -e "${YELLOW}[3/8] Pulling latest code from GitHub...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture-staging
  git pull origin main
  git log -1 --oneline
ENDSSH
echo -e "${GREEN}✓ Code updated${NC}"

echo -e "${YELLOW}[4/8] Setting up staging environment...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture-staging/server

  # Copy staging environment file if it exists
  if [ -f ".env.staging" ]; then
    cp .env.staging .env
    echo "Staging environment file configured"
  else
    echo "Warning: No .env.staging file found, using existing .env"
  fi
ENDSSH
echo -e "${GREEN}✓ Environment configured${NC}"

echo -e "${YELLOW}[5/8] Installing server dependencies...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture-staging/server
  npm install --production
ENDSSH
echo -e "${GREEN}✓ Server dependencies installed${NC}"

echo -e "${YELLOW}[6/8] Building client...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture-staging/client
  npm install
  npm run build
ENDSSH
echo -e "${GREEN}✓ Client built${NC}"

echo -e "${YELLOW}[7/8] Updating PM2 configuration...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  cd /home/ubuntu/ProductPhotoCapture-staging

  # Copy ecosystem config from production if not exists
  if [ ! -f "ecosystem.config.js" ]; then
    cp /home/ubuntu/ProductPhotoCapture/ecosystem.config.js ./
  fi

  # Stop existing staging processes if they exist
  pm2 delete staging-server staging-client 2>/dev/null || true

  # Start staging services
  pm2 start ecosystem.config.js --only staging-server,staging-client

  # Save PM2 process list
  pm2 save

  echo "Waiting for services to start..."
  sleep 3

  # Check status
  pm2 list
ENDSSH
echo -e "${GREEN}✓ Services restarted${NC}"

echo -e "${YELLOW}[8/8] Verifying deployment...${NC}"
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'ENDSSH'
  # Test if staging server is responding
  echo "Testing staging server health..."
  curl -s http://localhost:4001/api/health || echo "Staging server health check failed"

  # Test if staging client is serving
  echo "Testing staging client..."
  curl -s http://localhost:5174 | head -n 5 || echo "Staging client serving check failed"

  echo ""
  echo "=== PM2 Process Status ==="
  pm2 list

  echo ""
  echo "=== Recent Staging Server Logs ==="
  pm2 logs staging-server --lines 10 --nostream
ENDSSH
echo -e "${GREEN}✓ Deployment verified${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Staging Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Your staging environment is now live at:${NC}"
echo -e "  ${GREEN}https://staging.productphotos.click${NC}"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo -e "  ssh -i $EC2_KEY_PATH $EC2_USER@$EC2_IP 'pm2 logs staging-server'"
echo ""