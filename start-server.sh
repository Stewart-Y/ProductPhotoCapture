#!/bin/bash
cd /home/ubuntu/server

# Set environment variable for production
export NODE_ENV=production
export PORT=4000

# Start server with PM2
pm2 start server.js --name "product-photo-server"
pm2 save
pm2 startup

echo "✅ Server started successfully!"
echo "Server running at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):4000"
