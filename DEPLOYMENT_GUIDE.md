# Deployment Guide: Staging & Production

Complete guide to understanding and deploying to staging and production environments.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EC2 Instance (98.89.71.150)              │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │   PRODUCTION         │  │   STAGING                │   │
│  │   Port 4000 (API)    │  │   Port 4001 (API)        │   │
│  │   Port 5173 (Client) │  │   Port 5174 (Client)     │   │
│  │                      │  │                          │   │
│  │   /home/ubuntu/      │  │   /home/ubuntu/          │   │
│  │   ProductPhotoCapture│  │   ProductPhotoCapture-   │   │
│  │                      │  │   staging/               │   │
│  │                      │  │                          │   │
│  │   db.sqlite          │  │   db-staging.sqlite      │   │
│  │   S3: prod bucket    │  │   S3: staging bucket     │   │
│  └──────────────────────┘  └──────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Caddy Reverse Proxy                     │  │
│  │   - Auto SSL (Let's Encrypt)                        │  │
│  │   - HTTP → HTTPS redirect                           │  │
│  │   - Domain routing                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
           │                              │
           │                              │
           ▼                              ▼
  productphotos.click          staging.productphotos.click
  (Production)                 (Staging)
```

---

## Environment Comparison

| Feature | Development | Staging | Production |
|---------|------------|---------|------------|
| **Location** | Your local machine | EC2 (same instance as prod) | EC2 (98.89.71.150) |
| **Domain** | localhost:5173 | staging.productphotos.click | productphotos.click |
| **API Port** | 4000 | 4001 | 4000 |
| **Client Port** | 5173 (Vite dev) | 5174 (serve) | 5173 (serve) |
| **Database** | `./db.sqlite` | `./db-staging.sqlite` | `./db.sqlite` |
| **S3 Bucket** | `product-photos-ai-vws` | `product-photos-ai-vws-staging` | `product-photos-ai-vws` |
| **SSL/HTTPS** | No (HTTP only) | Yes (Caddy auto) | Yes (Caddy auto) |
| **Process Manager** | Manual (npm start) | PM2 | PM2 |
| **Git Branch** | Any (local dev) | `main` (or `develop`) | `main` |
| **Webhook Verification** | Disabled | Disabled (easier testing) | Enabled |
| **Error Details** | Verbose | Verbose | Minimal (security) |
| **Node Env** | `development` | `staging` | `production` |

---

## How It Works

### 1. Development (Local)
You code on your machine:
```bash
# Terminal 1
cd server
npm start  # Port 4000

# Terminal 2
cd client
npm run dev  # Port 5173 (Vite hot reload)
```

**Environment:**
- Uses `server/.env` (not committed to git)
- Shares S3 bucket with prod (careful!)
- SQLite database is local
- Vite dev server with hot module replacement

---

### 2. Staging (EC2)
Testing environment that mirrors production:

**Purpose:**
- Test deployments before production
- Test with production-like setup (PM2, Caddy, HTTPS)
- Separate database and S3 bucket
- Safe to experiment without affecting prod users

**Location on Server:**
```
/home/ubuntu/ProductPhotoCapture-staging/
├── server/
│   ├── .env          # Copied from .env.staging
│   ├── db-staging.sqlite
│   └── node_modules/
├── client/
│   ├── dist/         # Built static files
│   └── node_modules/
└── ...
```

**How to Deploy:**
```bash
# From your local machine
./deploy-staging.sh
```

**What it does:**
1. Connects to EC2 via SSH
2. Pulls latest code from GitHub (`main` branch)
3. Copies `server/.env.staging` → `server/.env`
4. Installs dependencies (`npm install`)
5. Builds client (`npm run build`)
6. Restarts PM2 processes (`staging-server`, `staging-client`)

**Access:**
- URL: https://staging.productphotos.click
- Caddy routes requests to port 4001 (API) and 5174 (client)

---

### 3. Production (EC2)
Live environment serving real users:

**Location on Server:**
```
/home/ubuntu/ProductPhotoCapture/
├── server/
│   ├── .env          # Production secrets (manually created)
│   ├── db.sqlite
│   └── node_modules/
├── client/
│   ├── dist/         # Built static files
│   └── node_modules/
└── ...
```

**How to Deploy:**
```bash
# From your local machine
./deploy.sh
```

**What it does:**
1. Connects to EC2 via SSH
2. Pulls latest code from GitHub (`main` branch)
3. Installs dependencies
4. Builds client
5. Restarts PM2 processes (`prod-server`, `prod-client`)

**Access:**
- URL: https://productphotos.click
- Caddy routes requests to port 4000 (API) and 5173 (client)

---

## PM2 Process Manager

PM2 keeps your Node.js apps running 24/7 and auto-restarts on crashes.

### Process Overview
```
┌─────────────────────┬──────┬──────────┬──────┐
│ App name            │ Port │ Status   │ CPU  │
├─────────────────────┼──────┼──────────┼──────┤
│ prod-server         │ 4000 │ online   │ 2%   │
│ prod-client         │ 5173 │ online   │ 0%   │
│ staging-server      │ 4001 │ online   │ 1%   │
│ staging-client      │ 5174 │ online   │ 0%   │
└─────────────────────┴──────┴──────────┴──────┘
```

### Common PM2 Commands
```bash
# On EC2 server (via SSH)
pm2 list                              # Show all processes
pm2 logs                              # View all logs (live)
pm2 logs prod-server                  # View specific app logs
pm2 restart prod-server               # Restart production server
pm2 restart staging-server            # Restart staging server
pm2 stop prod-server                  # Stop (but keep registered)
pm2 delete prod-server                # Remove from PM2
pm2 monit                             # Live monitoring dashboard

# Start only production
pm2 start ecosystem.config.js --only prod-server,prod-client

# Start only staging
pm2 start ecosystem.config.js --only staging-server,staging-client

# Save current process list (survives reboot)
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

---

## Caddy Reverse Proxy

Caddy handles:
- SSL certificates (automatic from Let's Encrypt)
- HTTP → HTTPS redirects
- Domain routing
- Request proxying to backend

### How Caddy Routes Requests

**Production (productphotos.click):**
```
https://productphotos.click/api/jobs
  ↓ Caddy
  → localhost:4000/api/jobs (Node.js API)

https://productphotos.click/
  ↓ Caddy
  → localhost:5173/ (React app via serve)
```

**Staging (staging.productphotos.click):**
```
https://staging.productphotos.click/api/jobs
  ↓ Caddy
  → localhost:4001/api/jobs (Staging Node.js API)

https://staging.productphotos.click/
  ↓ Caddy
  → localhost:5174/ (Staging React app)
```

### Caddy Commands
```bash
# On EC2 server
sudo systemctl status caddy          # Check if running
sudo systemctl restart caddy         # Restart Caddy
sudo systemctl reload caddy          # Reload config without downtime
sudo journalctl -u caddy -f          # View Caddy logs

# Update Caddy config
sudo cp Caddyfile.production /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## Deployment Workflow

### Quick Deploy (Production)
```bash
# 1. Make sure your changes are committed and pushed
git add .
git commit -m "Your changes"
git push origin main

# 2. Deploy to production
./deploy.sh

# 3. Verify deployment
# Visit https://productphotos.click
# Check logs: ssh -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150 "pm2 logs"
```

### Safe Deploy (Staging First)
```bash
# 1. Commit and push changes
git add .
git commit -m "Your changes"
git push origin main

# 2. Deploy to staging first
./deploy-staging.sh

# 3. Test staging thoroughly
# Visit https://staging.productphotos.click
# Test all features
# Check logs

# 4. If staging looks good, deploy to production
./deploy.sh

# 5. Monitor production
ssh -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150 "pm2 monit"
```

---

## Environment Variables

### Development (.env)
```bash
# Location: server/.env
# NOT committed to git
NODE_ENV=development
PORT=4000
S3_BUCKET=product-photos-ai-vws
SKIP_WEBHOOK_VERIFICATION=true
# ... all your API keys
```

### Staging (.env.staging)
```bash
# Location: server/.env.staging
# Committed to git (if keys are for staging only)
NODE_ENV=staging
PORT=4001
S3_BUCKET=product-photos-ai-vws-staging  # Separate bucket!
DB_PATH=./db-staging.sqlite
SKIP_WEBHOOK_VERIFICATION=true  # Easier testing
DETAILED_ERRORS=true
# ... staging API keys
```

### Production (EC2: /home/ubuntu/ProductPhotoCapture/server/.env)
```bash
# Manually created on server (NEVER committed to git)
NODE_ENV=production
PORT=4000
S3_BUCKET=product-photos-ai-vws
SKIP_WEBHOOK_VERIFICATION=false  # MUST verify webhooks
DETAILED_ERRORS=false  # Don't expose errors
# ... production API keys (possibly different from staging)
```

---

## AWS S3 Buckets

You have **separate S3 buckets** for staging and production:

### Production Bucket
- **Name:** `product-photos-ai-vws`
- **Region:** `us-east-1`
- **Used by:** Production and local development
- **Contents:** Real product images for production use

### Staging Bucket
- **Name:** `product-photos-ai-vws-staging`
- **Region:** `us-east-1`
- **Used by:** Staging environment only
- **Contents:** Test images, safe to delete

**Why separate buckets?**
- Test safely without affecting production images
- Different IAM policies for staging
- Can delete staging bucket contents anytime

---

## Database Files

### Development
- **File:** `server/db.sqlite`
- **Location:** Your local machine
- **Safe to delete:** Yes (recreated on next run)

### Staging
- **File:** `server/db-staging.sqlite`
- **Location:** EC2 `/home/ubuntu/ProductPhotoCapture-staging/server/`
- **Safe to delete:** Yes (test data only)

### Production
- **File:** `server/db.sqlite`
- **Location:** EC2 `/home/ubuntu/ProductPhotoCapture/server/`
- **Safe to delete:** NO! Contains real data
- **Backup strategy:** Should be backed up regularly

**Backups (TODO):**
```bash
# Manual backup on EC2
cd /home/ubuntu/ProductPhotoCapture/server
cp db.sqlite "db-backup-$(date +%Y%m%d).sqlite"

# Download backup to local machine
scp -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150:/home/ubuntu/ProductPhotoCapture/server/db.sqlite ./backups/
```

---

## DNS Configuration

Your domain `productphotos.click` points to the EC2 instance:

```
productphotos.click           →  98.89.71.150 (A record)
staging.productphotos.click   →  98.89.71.150 (A record)
```

**How it works:**
1. Browser requests `https://productphotos.click`
2. DNS resolves to `98.89.71.150`
3. Request hits Caddy on EC2
4. Caddy checks domain and routes accordingly:
   - `productphotos.click` → localhost:4000 & :5173
   - `staging.productphotos.click` → localhost:4001 & :5174

---

## Troubleshooting

### Deployment fails
```bash
# Check if you can SSH to server
ssh -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150

# Check if git pull works
cd /home/ubuntu/ProductPhotoCapture
git status
git pull origin main
```

### Server not responding
```bash
# Check PM2 status
pm2 list
pm2 logs prod-server --lines 50

# Check if server is listening on port
netstat -tulpn | grep 4000

# Restart if needed
pm2 restart prod-server
```

### SSL certificate issues
```bash
# Check Caddy status
sudo systemctl status caddy

# Check Caddy logs
sudo journalctl -u caddy -f

# Reload Caddy
sudo systemctl reload caddy
```

### Database locked error
```bash
# Check if multiple processes are accessing DB
lsof /home/ubuntu/ProductPhotoCapture/server/db.sqlite

# Stop PM2, backup DB, restart
pm2 stop prod-server
cp server/db.sqlite server/db-backup.sqlite
pm2 start prod-server
```

### Out of disk space
```bash
# Check disk usage
df -h

# Find large files
du -sh /home/ubuntu/* | sort -h

# Clean up PM2 logs
pm2 flush  # Clear all logs

# Clean up old node_modules
cd /home/ubuntu/ProductPhotoCapture-staging
rm -rf node_modules
npm install
```

---

## Security Best Practices

### ✅ DO:
- Keep `.env` files out of git (already in `.gitignore`)
- Use separate API keys for staging and production
- Enable webhook verification in production
- Regularly update dependencies (`npm audit`)
- Keep EC2 security groups restricted
- Backup production database regularly
- Monitor logs for errors and intrusions

### ❌ DON'T:
- Commit `.env` files to git
- Share AWS credentials in Slack/Discord
- Use production API keys in staging
- Expose detailed error messages in production
- Leave SSH (port 22) open to 0.0.0.0/0
- Test destructive operations in production

---

## Quick Reference Commands

### From Your Local Machine

```bash
# Deploy to staging
./deploy-staging.sh

# Deploy to production
./deploy.sh

# SSH to server
ssh -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150

# View logs remotely
ssh -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150 "pm2 logs prod-server --lines 50"

# Check PM2 status remotely
ssh -i ProductPhotoCaptureKey.pem ubuntu@98.89.71.150 "pm2 list"
```

### On EC2 Server (after SSH)

```bash
# View all logs
pm2 logs

# Restart production
pm2 restart prod-server prod-client

# Restart staging
pm2 restart staging-server staging-client

# Monitor resources
pm2 monit

# Check Caddy
sudo systemctl status caddy

# View recent deployments
cd /home/ubuntu/ProductPhotoCapture
git log --oneline -5
```

---

## Deployment Checklist

Before deploying to production:

- [ ] All changes tested locally
- [ ] Changes committed and pushed to GitHub
- [ ] Deployed to staging first
- [ ] Tested on staging environment
- [ ] No errors in staging logs
- [ ] Database migrations tested
- [ ] Environment variables updated (if needed)
- [ ] PM2 ecosystem config updated (if changed)
- [ ] Backup production database
- [ ] Deploy to production
- [ ] Monitor logs after deployment
- [ ] Test critical features on production
- [ ] Verify no errors in production logs

---

## Next Steps / TODOs

### Immediate
- [ ] Set up automated database backups
- [ ] Configure alerts (Slack/email) for server errors
- [ ] Add health check endpoint
- [ ] Set up monitoring (e.g., UptimeRobot)

### Future Enhancements
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Automated testing before deployment
- [ ] Blue-green deployments
- [ ] Load balancing (if scaling needed)
- [ ] Database migration strategy
- [ ] Rollback procedure documentation

---

## Resources

- **EC2 Instance:** 98.89.71.150
- **Production URL:** https://productphotos.click
- **Staging URL:** https://staging.productphotos.click
- **GitHub Repo:** https://github.com/Stewart-Y/ProductPhotoCapture
- **PM2 Docs:** https://pm2.keymetrics.io/docs/usage/quick-start/
- **Caddy Docs:** https://caddyserver.com/docs/

---

**Last Updated:** 2025-11-06
**Server IP:** 98.89.71.150
**Domains:** productphotos.click, staging.productphotos.click

