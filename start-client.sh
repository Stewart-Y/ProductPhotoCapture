#!/bin/bash
cd /home/ubuntu/client/dist

# Start the client with serve on port 5173
pm2 start "serve -s . -p 5173" --name "product-photo-client"
pm2 save

echo "✅ Client started successfully!"
echo "Application running at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):5173"
