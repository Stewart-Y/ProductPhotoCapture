#!/bin/bash
set -e

echo "🚀 Setting up ProductPhotoCapture on EC2..."

# Update system
echo "📦 Updating system packages..."
sudo apt-get update -y

# Install Node.js 20.x
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build essentials for native dependencies
echo "📦 Installing build tools..."
sudo apt-get install -y build-essential python3 git

# Verify installations
echo "✅ Node version: $(node --version)"
echo "✅ NPM version: $(npm --version)"

# Install PM2 globally for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

echo "✅ EC2 setup complete!"
