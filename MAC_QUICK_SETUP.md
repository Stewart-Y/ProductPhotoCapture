# Mac Setup - Quick Reference (15 Minutes)

The fastest way to get your Mac development environment running.

---

## The Smoothest Approach: Step-by-Step

### Part 1: System Setup (5 min)
```bash
# 1. Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install everything at once
brew install node git awscli gh
brew install --cask visual-studio-code

# 3. Install Claude CLI
npm install -g @anthropic/claude-code

# 4. Verify installations
node --version && git --version && aws --version && claude --version
```

### Part 2: GitHub Setup (2 min)
```bash
# Option 1: GitHub CLI (Easiest - Recommended!)
gh auth login
# Choose: GitHub.com → HTTPS → Login with browser

# Option 2: SSH (if you prefer)
ssh-keygen -t ed25519 -C "stewartyousif1@gmail.com"
cat ~/.ssh/id_ed25519.pub | pbcopy
# Then add to: https://github.com/settings/keys
```

### Part 3: Clone & Configure Git (1 min)
```bash
cd ~/Desktop
git clone https://github.com/Stewart-Y/ProductPhotoCapture.git
cd ProductPhotoCapture

git config user.name "Stewart-Y"
git config user.email "stewartyousif1@gmail.com"
```

### Part 4: AWS Setup (2 min)
```bash
# Configure AWS (use same credentials as Windows)
aws configure
# Enter:
#   Access Key: [your key]
#   Secret Key: [your secret]
#   Region: us-east-1
#   Format: json

# Test it works
aws s3 ls s3://product-photos-ai-vws/
```

### Part 5: Environment Variables (1 min)
```bash
cd ~/Desktop/ProductPhotoCapture/server

# Create .env file (copy-paste this entire block)
cat > .env << 'EOF'
PORT=4000
DB_PATH=./db.sqlite
AWS_REGION=us-east-1
S3_BUCKET=product-photos-ai-vws
S3_PUBLIC_BASE=https://product-photos-ai-vws.s3.us-east-1.amazonaws.com
S3_PRESIGNED_URL_EXPIRY=3600
AI_COMPOSITOR=freepik
FREEPIK_API_KEY=FPSX19f7a74f6cb4beca4f2222bb3f9000c3
NANOBANANA_API_KEY=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
AI_PROVIDER=freepik
TJMS_API_BASE_URL=https://3jms.vistawinespirits.com
TJMS_API_KEY=b1358354225414522ed2b4ae007257ad0f2802e7
SKIP_WEBHOOK_VERIFICATION=true
NODE_ENV=development
EOF
```

### Part 6: Install Dependencies (3 min)
```bash
# Install server deps
cd ~/Desktop/ProductPhotoCapture/server
npm install

# Install client deps
cd ../client
npm install
```

### Part 7: Start Everything (1 min)
```bash
# Terminal 1 - Start server
cd ~/Desktop/ProductPhotoCapture/server
npm start

# Terminal 2 - Start client (new tab: Cmd+T)
cd ~/Desktop/ProductPhotoCapture/client
npm run dev

# Terminal 3 - Open VS Code (new tab: Cmd+T)
cd ~/Desktop/ProductPhotoCapture
code .
```

### Part 8: Verify (30 sec)
- Open browser: http://localhost:5173
- Dashboard should load
- In VS Code, install Claude Code extension
- Test Claude: Type "hi" in Claude panel

---

## Copy-Paste Credentials from Windows

On your Windows machine, copy these files:

### 1. AWS Credentials
```powershell
# Windows PowerShell
type %USERPROFILE%\.aws\credentials
type %USERPROFILE%\.aws\config
```

### 2. Environment Variables
Already shown in your Windows .env file - copied above!

---

## What You Need

### ✅ From Windows (Copy These)
- AWS Access Key ID
- AWS Secret Access Key
- All API keys (already in .env template above)
- GitHub credentials (reuse same account)

### ❌ Don't Copy These
- `node_modules/` - Reinstall on Mac (platform-specific binaries)
- `db.sqlite` - Let it recreate (or copy if you want existing data)
- OS-specific files

---

## Pro Tips for Smooth Setup

### 1. Use GitHub CLI (gh) - Easiest Auth
```bash
brew install gh
gh auth login
# One command, browser-based, done!
```

### 2. Keep Same AWS Account
You don't need a new IAM user - use the same credentials from Windows.
Just run `aws configure` on Mac with your existing keys.

### 3. VS Code Extensions Auto-Sync
If you enable Settings Sync in VS Code:
1. VS Code → Settings (Cmd+,)
2. Search "Settings Sync"
3. Turn on → Sign in with GitHub
4. Extensions auto-install on Mac!

### 4. Terminal Tabs vs Windows
Mac Terminal = Windows PowerShell tabs
```bash
Cmd+T = New tab (like Ctrl+Shift+T in Windows Terminal)
Cmd+W = Close tab
Cmd+1,2,3 = Switch tabs
```

---

## One-Line Full Setup (Advanced)

If you're comfortable with command line, here's everything in one go:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && \
brew install node git awscli gh && \
brew install --cask visual-studio-code && \
npm install -g @anthropic/claude-code && \
cd ~/Desktop && \
gh auth login && \
git clone https://github.com/Stewart-Y/ProductPhotoCapture.git && \
cd ProductPhotoCapture && \
git config user.name "Stewart-Y" && \
git config user.email "stewartyousif1@gmail.com" && \
echo "Now run: aws configure (enter your credentials)" && \
echo "Then create server/.env file (see MAC_SETUP_GUIDE.md)" && \
echo "Then: cd server && npm install && cd ../client && npm install"
```

---

## Troubleshooting

### "command not found" after Homebrew install
```bash
# Add Homebrew to PATH (if needed)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
source ~/.zprofile
```

### AWS credentials not working
```bash
# Check file exists
ls -la ~/.aws/
cat ~/.aws/credentials

# Recreate
aws configure
```

### Git push asks for password
```bash
# Use GitHub CLI instead
gh auth login

# Or check credential helper
git config --global credential.helper osxkeychain
```

---

## Time Estimate

| Task | Time |
|------|------|
| Install Homebrew & tools | 5 min |
| GitHub auth | 2 min |
| Clone repo | 1 min |
| AWS setup | 2 min |
| Create .env | 1 min |
| npm install (both) | 3 min |
| Start & test | 1 min |
| **Total** | **~15 min** |

---

## What's Different on Mac?

### Paths
- Windows: `C:\Users\Stewart\Desktop\ProductPhotoCapture`
- Mac: `~/Desktop/ProductPhotoCapture` or `/Users/stewart/Desktop/ProductPhotoCapture`

### Commands
| Windows | Mac |
|---------|-----|
| `dir` | `ls` |
| `type` | `cat` |
| `cls` | `clear` |
| `del` | `rm` |
| Ctrl+C | Cmd+C |

### Everything Else
Pretty much the same! Node.js, npm, git all work identically.

---

## After Setup: Daily Workflow

```bash
# Start work session
cd ~/Desktop/ProductPhotoCapture

# Tab 1: Server
cd server && npm start

# Tab 2: Client (Cmd+T for new tab)
cd client && npm run dev

# Tab 3: VS Code (Cmd+T for new tab)
code .

# When done: Cmd+W to close tabs
```

---

**Need more details?** See `MAC_SETUP_GUIDE.md` for comprehensive instructions.

**Questions?** Common issues and solutions in the main guide.

