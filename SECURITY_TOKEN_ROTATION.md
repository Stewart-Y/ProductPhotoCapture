# Security Alert: Token Rotation Required

## Status: URGENT ACTION REQUIRED

### Summary
A hardcoded TJMS API token was found in git commit history and needs to be rotated immediately.

---

## Exposed Token Details

### 🚨 CRITICAL: Token in Git History
**Location:** `server/tjms-client.js` (commit history before `be0cc2e`)
**Exposed Token:** `f289f50fac528195af803f2932835c1992b305b0`
**Status:** Publicly visible in git history
**Risk Level:** HIGH

### Current Token Status
**Current Token:** `b1358354225414522ed2b4ae007257ad0f2802e7` (in server/.env)
**Status:** Not committed to git (safe for now)
**Action:** Should be rotated as a precaution

### Other API Keys in .env
The following keys are also in your .env file and should be protected:
- `FREEPIK_API_KEY`: FPSX19f7a74f6cb4beca4f2222bb3f9000c3
- `NANOBANANA_API_KEY`: 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

---

## Required Actions

### 1. Rotate TJMS API Token (IMMEDIATE)

**Steps:**
1. Log in to 3JMS admin panel: https://3jms.vistawinespirits.com
2. Navigate to: **Settings > API > API Tokens**
3. **Revoke** the old token: `f289f50fac528195af803f2932835c1992b305b0`
4. **Generate** a new token
5. Update `server/.env`:
   ```bash
   TJMS_API_KEY=your_new_token_here
   ```
6. Restart the server

### 2. Verify .env Protection

✅ **COMPLETE** - .env files are in .gitignore
✅ **COMPLETE** - No .env files tracked in git
✅ **COMPLETE** - .env.example has placeholders

### 3. Review Other Tokens (Recommended)

While these tokens are not in git history, consider rotating them as a security best practice:

#### Freepik API Key
- Dashboard: https://www.freepik.com/api/dashboard
- Generate new key and update `FREEPIK_API_KEY` in .env

#### OpenRouter/Nano Banana API Key
- Dashboard: https://openrouter.ai/keys
- Generate new key and update `NANOBANANA_API_KEY` in .env

---

## Git History Cleanup (Optional but Recommended)

The exposed token exists in git history. Options to clean it:

### Option A: BFG Repo-Cleaner (Recommended)
```bash
# Install BFG
# macOS: brew install bfg
# Linux: Download from https://rtyley.github.io/bfg-repo-cleaner/

# Replace the exposed token with placeholder
echo 'f289f50fac528195af803f2932835c1992b305b0==>REDACTED_TOKEN_REMOVED' > replacements.txt
bfg --replace-text replacements.txt --no-blob-protection .git

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push to remote (if repo is pushed)
# WARNING: This rewrites history
git push --force --all
```

### Option B: git-filter-repo
```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove the token from history
git filter-repo --replace-text <(echo 'f289f50fac528195af803f2932835c1992b305b0==>REDACTED')

# Force push (if needed)
git push --force --all
```

### Option C: Do Nothing (If Private Repo)
If this is a private repository with limited access:
- Simply rotate the token on 3JMS side
- No git history cleanup needed
- Monitor for unauthorized access

---

## Prevention: Secret Scanning

### Add Pre-commit Hook
```bash
# Install gitleaks
# macOS: brew install gitleaks
# Linux: Download from https://github.com/gitleaks/gitleaks

# Add to .git/hooks/pre-commit
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
gitleaks protect --staged --verbose
EOF

chmod +x .git/hooks/pre-commit
```

### GitHub Secret Scanning (If using GitHub)
- Enable: Repository Settings > Security > Code security and analysis
- Turn on: "Secret scanning" and "Push protection"

---

## Verification Checklist

After completing token rotation, verify:

- [ ] Old TJMS token revoked in 3JMS dashboard
- [ ] New TJMS token generated and saved in server/.env
- [ ] Server restarted and able to authenticate with 3JMS
- [ ] Test webhook endpoint: `POST /webhooks/3jms/images`
- [ ] .env files not tracked in git: `git ls-files | grep .env` (should be empty)
- [ ] .env in .gitignore: `cat .gitignore | grep .env` (should show .env)
- [ ] No secrets in recent commits: `git log -p | grep -i "api.*key"` (manual review)

---

## Timeline

- **Discovered:** 2025-11-06
- **Last Commit with Hardcoded Token:** Before commit `be0cc2e` (2025-11-06)
- **Token Removed from Code:** Commit `be0cc2e` (2025-11-06)
- **Action Required By:** ASAP (within 24 hours)

---

## Support

If you need help with token rotation:
1. Check 3JMS API documentation
2. Contact 3JMS support: support@vistawinespirits.com
3. Review .env.example for configuration reference

---

**Generated:** 2025-11-06
**Priority:** CRITICAL
**Assigned To:** Repository owner
