#!/bin/bash

DOMAIN="product-photos.click"
EMAIL="stewartyousif1@gmail.com"

echo "🔍 Waiting for DNS propagation..."
echo "Checking if $DOMAIN resolves to 98.89.71.150..."

# Wait for DNS to propagate (max 30 minutes)
for i in {1..60}; do
    IP=$(dig +short $DOMAIN @8.8.8.8 | tail -n1)
    if [ "$IP" = "98.89.71.150" ]; then
        echo "✅ DNS is ready! IP: $IP"
        break
    fi
    echo "⏳ Attempt $i/60: DNS not ready yet (got: $IP), waiting 30 seconds..."
    sleep 30
done

if [ "$IP" != "98.89.71.150" ]; then
    echo "❌ DNS propagation timeout. Please try again later."
    exit 1
fi

echo "🔐 Generating SSL certificate with Let's Encrypt..."

# Stop nginx temporarily for standalone mode
sudo systemctl stop nginx

# Get certificate
sudo certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    --domains $DOMAIN \
    --domains www.$DOMAIN

if [ $? -eq 0 ]; then
    echo "✅ SSL certificate generated successfully!"
    
    # Update Nginx configuration
    sudo tee /etc/nginx/sites-available/productphoto > /dev/null <<EOF
server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Uploads
    location /uploads {
        proxy_pass http://localhost:4000;
    }
}

server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$host\$request_uri;
}
EOF

    # Test and reload nginx
    sudo nginx -t && sudo systemctl start nginx && sudo systemctl reload nginx
    
    # Set up auto-renewal
    echo "⚙️  Setting up automatic certificate renewal..."
    sudo systemctl enable --now certbot.timer
    
    echo ""
    echo "🎉 Setup complete!"
    echo "✅ SSL certificate installed"
    echo "✅ Nginx configured"
    echo "✅ Auto-renewal enabled"
    echo ""
    echo "🌐 Your site is now live at: https://$DOMAIN"
else
    echo "❌ Failed to generate SSL certificate"
    sudo systemctl start nginx
    exit 1
fi
