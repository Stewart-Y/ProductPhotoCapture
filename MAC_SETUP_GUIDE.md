# Mac Development Setup Guide

Complete guide to replicate your Windows development environment on Mac.

---

## Prerequisites Installation

### 1. Install Homebrew (Package Manager)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install Node.js
```bash
brew install node
node --version  # Should be v20+
```

### 3. Install Git
```bash
brew install git
git --version
```

### 4. Install VS Code
Download from: https://code.visualstudio.com/download
Or via Homebrew:
```bash
brew install --cask visual-studio-code
```

### 5. Install Claude CLI
```bash
npm install -g @anthropic/claude-code
claude --version  # Should show 2.0.35 or later
```

---

## Step 1: GitHub Authentication

### Option A: Using GitHub CLI (Recommended - Easiest)
```bash
# Install GitHub CLI
brew install gh

# Authenticate with GitHub
gh auth login
# Choose: GitHub.com → HTTPS → Login with browser

# Test authentication
gh auth status
```

### Option B: Using SSH Keys (More Secure)
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "stewartyousif1@gmail.com"
# Press Enter to accept default location (~/.ssh/id_ed25519)
# Enter passphrase (or press Enter for no passphrase)

# Start SSH agent and add key
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Copy public key to clipboard
cat ~/.ssh/id_ed25519.pub | pbcopy

# Add to GitHub:
# 1. Go to: https://github.com/settings/keys
# 2. Click "New SSH key"
# 3. Paste the key from clipboard
# 4. Click "Add SSH key"

# Test connection
ssh -T git@github.com
# Should see: "Hi Stewart-Y! You've successfully authenticated..."
```

### Option C: Personal Access Token (Classic Method)
```bash
# Create token at: https://github.com/settings/tokens
# Scopes needed: repo (full control of private repositories)
# Copy token and save it securely

# Configure git to use token
git config --global credential.helper osxkeychain
# When you push, it will prompt for username and token (paste token as password)
```

---

## Step 2: Clone Repository

### If using HTTPS (GitHub CLI or Token):
```bash
cd ~/Desktop  # or wherever you want the project
git clone https://github.com/Stewart-Y/ProductPhotoCapture.git
cd ProductPhotoCapture
```

### If using SSH:
```bash
cd ~/Desktop
git clone git@github.com:Stewart-Y/ProductPhotoCapture.git
cd ProductPhotoCapture
```

### Configure Git User
```bash
git config user.name "Stewart-Y"
git config user.email "stewartyousif1@gmail.com"
```

---

## Step 3: AWS Configuration

### Install AWS CLI
```bash
brew install awscli
aws --version
```

### Configure AWS Credentials
You have two options:

#### Option A: Use Your Existing IAM User Credentials
```bash
aws configure
```
**Enter when prompted:**
- AWS Access Key ID: `[Your existing access key - same as Windows]`
- AWS Secret Access Key: `[Your existing secret key - same as Windows]`
- Default region name: `us-east-1`
- Default output format: `json`

**To get your credentials from Windows:**
```powershell
# On Windows, run:
type %USERPROFILE%\.aws\credentials
type %USERPROFILE%\.aws\config
```

#### Option B: Create New IAM User (Recommended for Multi-Device)
1. Go to AWS Console → IAM → Users
2. Create new user: `ProductPhotos-Mac-Dev`
3. Attach policies:
   - `AmazonS3FullAccess` (or custom policy for your bucket)
4. Create access key → Download credentials
5. Run `aws configure` and enter new credentials

### Verify AWS Access
```bash
# Test S3 access
aws s3 ls s3://product-photos-ai-vws/
# Should list bucket contents

# Test credentials
aws sts get-caller-identity
# Should show your AWS account info
```

---

## Step 4: Environment Variables (.env Files)

### Create Server .env File
```bash
cd ~/Desktop/ProductPhotoCapture/server
cat > .env << 'EOF'
PORT=4000
DB_PATH=./db.sqlite

# AWS S3 Storage (configured via AWS CLI)
AWS_REGION=us-east-1
S3_BUCKET=product-photos-ai-vws
S3_PUBLIC_BASE=https://product-photos-ai-vws.s3.us-east-1.amazonaws.com
S3_PRESIGNED_URL_EXPIRY=3600

# AI Compositor Configuration
# Options: 'freepik' (Seedream 4) or 'nanobanana' (Gemini 2.5 Flash)
AI_COMPOSITOR=freepik

# Freepik API (Seedream 4 Edit - $0.02/image)
FREEPIK_API_KEY=FPSX19f7a74f6cb4beca4f2222bb3f9000c3

# Nano Banana API via OpenRouter (Gemini 2.5 Flash Image - $0.03/image)
NANOBANANA_API_KEY=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

AI_PROVIDER=freepik

# 3JMS Integration
TJMS_API_BASE_URL=https://3jms.vistawinespirits.com
TJMS_API_KEY=b1358354225414522ed2b4ae007257ad0f2802e7

# Skip webhook verification in development
SKIP_WEBHOOK_VERIFICATION=true

# Environment
NODE_ENV=development
EOF
```

### Verify .env File Created
```bash
cat .env
# Should show all environment variables
```

**Security Note:** The `.env` file is in `.gitignore` so it won't be committed to GitHub.

---

## Step 5: Install Dependencies

### Install Server Dependencies
```bash
cd ~/Desktop/ProductPhotoCapture/server
npm install
# Should install ~278 packages
```

### Install Client Dependencies
```bash
cd ~/Desktop/ProductPhotoCapture/client
npm install
# Should install ~270 packages
```

### Verify Installations
```bash
# Check server
cd ~/Desktop/ProductPhotoCapture/server
npm list --depth=0

# Check client
cd ~/Desktop/ProductPhotoCapture/client
npm list --depth=0
```

---

## Step 6: Database Setup

The SQLite database will be created automatically when you first run the server.

```bash
cd ~/Desktop/ProductPhotoCapture/server
npm start
# Server will create db.sqlite and run migrations
# Ctrl+C to stop after it starts successfully
```

**Optional:** If you want to copy your existing database from Windows:

```bash
# On Windows, find your db.sqlite
# Location: C:\Users\Stewart\Desktop\ProductPhotoCapture\server\db.sqlite

# Copy to Mac (use one of these methods):
# 1. Via USB drive
# 2. Via cloud storage (Dropbox, Google Drive)
# 3. Via network share
# 4. Via git LFS (if set up)

# On Mac, place in:
# ~/Desktop/ProductPhotoCapture/server/db.sqlite
```

---

## Step 7: VS Code Setup

### Install VS Code Extensions
```bash
code --install-extension anthropics.claude-code
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
```

### Configure Claude Code Extension
1. Open VS Code
2. Install Claude Code extension from marketplace
3. Sign in with your Anthropic account
4. Set working directory: `~/Desktop/ProductPhotoCapture`

### Recommended VS Code Settings
Create/edit: `~/Desktop/ProductPhotoCapture/.vscode/settings.json`
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.enable": true,
  "files.exclude": {
    "node_modules": true,
    "*.sqlite": true
  }
}
```

---

## Step 8: Test Everything

### Test 1: Server
```bash
cd ~/Desktop/ProductPhotoCapture/server
npm start
```
Expected output:
```
🚀 Server running on http://localhost:4000
✅ Database connected
✅ Migrations complete
```
Keep this running and open a new terminal tab.

### Test 2: Client
```bash
cd ~/Desktop/ProductPhotoCapture/client
npm run dev
```
Expected output:
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Test 3: Access Application
Open browser: http://localhost:5173
- Should see dashboard
- Should be able to create jobs
- Should be able to upload images

### Test 4: AWS S3 Integration
- Upload a test image
- Check that it appears in S3 bucket
```bash
aws s3 ls s3://product-photos-ai-vws/originals/
```

### Test 5: Claude Code
```bash
cd ~/Desktop/ProductPhotoCapture
code .
# In VS Code, open Claude Code panel
# Type: "hi" to test Claude
```

---

## Complete Checklist

Use this checklist to verify everything is set up:

### System Setup
- [ ] Homebrew installed
- [ ] Node.js v20+ installed
- [ ] Git installed
- [ ] VS Code installed
- [ ] Claude CLI installed

### GitHub Access
- [ ] GitHub authenticated (gh CLI / SSH / Token)
- [ ] Repository cloned
- [ ] Git user configured
- [ ] Can push/pull from repository

### AWS Access
- [ ] AWS CLI installed
- [ ] AWS credentials configured
- [ ] Can list S3 bucket contents
- [ ] Correct region (us-east-1) configured

### Project Setup
- [ ] Server dependencies installed (node_modules exists)
- [ ] Client dependencies installed (node_modules exists)
- [ ] Server .env file created with all keys
- [ ] Database created (db.sqlite)
- [ ] Server starts on port 4000
- [ ] Client starts on port 5173

### VS Code Extensions
- [ ] Claude Code extension installed
- [ ] ESLint extension installed
- [ ] Prettier extension installed
- [ ] Signed into Claude Code

### Testing
- [ ] Server runs without errors
- [ ] Client runs without errors
- [ ] Can access dashboard in browser
- [ ] Can create test jobs
- [ ] Images upload to S3 successfully
- [ ] Claude Code responds to commands

---

## Troubleshooting

### Issue: AWS credentials not found
```bash
# Check credentials file
cat ~/.aws/credentials
cat ~/.aws/config

# Reconfigure
aws configure
```

### Issue: Port already in use
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Kill process on port 5173
lsof -ti:5173 | xargs kill -9
```

### Issue: npm install fails
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: Database errors
```bash
# Delete and recreate database
cd ~/Desktop/ProductPhotoCapture/server
rm db.sqlite
npm start  # Will recreate database
```

### Issue: Git authentication fails
```bash
# For HTTPS: Update credential helper
git config --global credential.helper osxkeychain

# For SSH: Check SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
ssh -T git@github.com
```

---

## Key Differences: Windows vs Mac

| Aspect | Windows | Mac |
|--------|---------|-----|
| **Paths** | `C:\Users\Stewart\...` | `~/Desktop/...` or `/Users/stewart/...` |
| **Shell** | PowerShell/CMD | zsh/bash |
| **Package Manager** | npm (manual install) | Homebrew + npm |
| **AWS Credentials** | `%USERPROFILE%\.aws\` | `~/.aws/` |
| **Git Credential** | Windows Credential Manager | macOS Keychain |
| **Node Modules** | Windows binaries | macOS binaries (different!) |
| **Line Endings** | CRLF | LF (git handles this) |

**Important:** After cloning on Mac, you MUST run `npm install` again even though you have node_modules on Windows. The native binaries (like `better-sqlite3`, `sharp`) are platform-specific.

---

## Quick Start Commands (After Initial Setup)

```bash
# Start development environment
cd ~/Desktop/ProductPhotoCapture

# Terminal 1 - Server
cd server && npm start

# Terminal 2 - Client (new tab)
cd client && npm run dev

# Terminal 3 - Claude Code (new tab)
code .
```

---

## Syncing Between Windows and Mac

### Option 1: Git (Recommended)
```bash
# On Windows - commit and push your changes
git add .
git commit -m "Your changes"
git push

# On Mac - pull changes
git pull
npm install  # If package.json changed
```

### Option 2: Database Sync (If Needed)
```bash
# Export from Windows
# Copy server/db.sqlite to cloud storage

# Import to Mac
# Download to ~/Desktop/ProductPhotoCapture/server/db.sqlite
```

### What NOT to Sync
- `node_modules/` - Always reinstall on each platform
- `.env` files - Already in .gitignore, manually create
- `db.sqlite` - Only sync if you need the same data

---

## Security Reminders

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Rotate API keys** if you accidentally expose them
3. **Use different AWS IAM users** for different devices (optional but recommended)
4. **Keep credentials secure** - Don't share screenshots with keys visible
5. **Enable 2FA** on GitHub and AWS accounts

---

## Next Steps After Setup

1. Run the test suite
2. Try creating a test job
3. Verify S3 uploads work
4. Test Claude Code integration
5. Continue development where you left off!

---

**Setup Date:** 2025-11-06
**Platform:** macOS (from Windows)
**Node Version:** v20+
**Repository:** https://github.com/Stewart-Y/ProductPhotoCapture.git

