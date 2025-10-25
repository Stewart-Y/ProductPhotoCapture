#!/bin/bash
# Generate self-signed SSL certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/nginx-selfsigned.key \
  -out /etc/ssl/certs/nginx-selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=productphoto"

# Install Nginx
sudo apt-get update
sudo apt-get install -y nginx

# Create Nginx config
sudo tee /etc/nginx/sites-available/productphoto > /dev/null <<'EOF'
server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/ssl/certs/nginx-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/nginx-selfsigned.key;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Uploads
    location /uploads {
        proxy_pass http://localhost:4000;
    }
}

server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/productphoto /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t && sudo systemctl reload nginx

echo "✅ HTTPS setup complete!"
echo "Access your app at: https://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "⚠️  You'll see a security warning - click 'Advanced' and 'Proceed' to continue"
