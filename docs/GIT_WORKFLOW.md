# Git Workflow Guide

Quick reference for daily git operations in the ProductPhotoCapture project.

## Quick Reference

### Daily Development Flow
```bash
# Start your day - get latest code
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# During the day - commit often
git add .
git commit -m "feat: what I did"

# End your day - push your work
git push origin feature/my-feature
```

## Common Tasks

### 1. Start New Feature

```bash
# Ensure you're on latest develop
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/descriptive-name

# Examples:
# git checkout -b feature/add-user-auth
# git checkout -b feature/improve-job-processing
# git checkout -b feature/dashboard-redesign
```

### 2. Make Changes and Commit

```bash
# Check what files changed
git status

# See detailed changes
git diff

# Stage files
git add .                    # Stage all changes
git add server/file.js       # Stage specific file

# Commit with descriptive message
git commit -m "feat: add user authentication"

# Or commit with detailed message
git commit  # Opens editor for multi-line message
```

### 3. Push Changes

```bash
# First time pushing a new branch
git push -u origin feature/my-feature

# Subsequent pushes
git push
```

### 4. Create Pull Request

1. Push your branch to GitHub
2. Go to https://github.com/Stewart-Y/ProductPhotoCapture
3. Click "Pull requests" → "New pull request"
4. Select:
   - base: `develop`
   - compare: `feature/your-feature`
5. Fill out PR template
6. Click "Create pull request"

### 5. Fix a Bug

```bash
git checkout develop
git pull origin develop
git checkout -b bugfix/fix-description

# Example:
# git checkout -b bugfix/fix-cors-error
# git checkout -b bugfix/resolve-migration-issue
```

### 6. Update Your Branch with Latest Develop

```bash
# While on your feature branch
git fetch origin
git merge origin/develop

# Or use rebase (cleaner history)
git fetch origin
git rebase origin/develop
```

### 7. Handle Merge Conflicts

```bash
# If merge/rebase causes conflicts
# 1. Git will tell you which files have conflicts
# 2. Open each file and look for:
#    <<<<<<< HEAD
#    your changes
#    =======
#    their changes
#    >>>>>>> branch-name

# 3. Edit the file to resolve conflicts
# 4. Remove conflict markers
# 5. Stage the resolved files
git add file-with-conflict.js

# 6. Continue the merge
git commit
# or if rebasing
git rebase --continue
```

### 8. Emergency Production Fix (Hotfix)

```bash
# Create from main branch
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue

# Make the fix
git add .
git commit -m "fix: critical production issue"
git push origin hotfix/critical-issue

# Create TWO PRs:
# 1. hotfix/critical-issue → main (production)
# 2. hotfix/critical-issue → develop (keep in sync)
```

## Branch Naming Conventions

Follow these patterns for consistency:

| Purpose | Pattern | Examples |
|---------|---------|----------|
| New Feature | `feature/description` | `feature/add-pagination`<br>`feature/user-dashboard`<br>`feature/ai-retry-logic` |
| Bug Fix | `bugfix/description` | `bugfix/fix-cors-error`<br>`bugfix/resolve-null-ref`<br>`bugfix/login-timeout` |
| Hotfix | `hotfix/description` | `hotfix/security-patch`<br>`hotfix/data-corruption` |
| Documentation | `docs/description` | `docs/update-readme`<br>`docs/api-guide` |
| Refactoring | `refactor/description` | `refactor/simplify-jobs`<br>`refactor/extract-utils` |

## Commit Message Examples

### Good Commit Messages ✅

```
feat(api): add pagination to items endpoint

Implements limit/offset pagination for GET /api/items.
Defaults to 50 items per page with max of 100.

Closes #45

---

fix(jobs): prevent duplicate job processing

Adds unique constraint on jobs table and checks for
existing jobs before creating new ones.

Fixes #67

---

security: remove hardcoded API keys from source code

BREAKING CHANGE: TJMS_API_KEY environment variable now required.

---

perf(images): optimize derivative generation

Reduces image processing time by 40% by using
parallel processing with sharp library.
```

### Bad Commit Messages ❌

```
fixed stuff           ❌ Too vague
update                ❌ What was updated?
wip                   ❌ Work in progress (don't commit)
asdf                  ❌ Not descriptive
Fixed bug             ❌ Which bug? No details
```

## Deployment Flow

```mermaid
Developer
  ↓
feature/xxx branch
  ↓
Pull Request → develop
  ↓ (auto-deploy)
Staging Server
  ↓ (testing)
Pull Request → main
  ↓ (manual approval + deploy)
Production Server
```

### Staging Deployment
- **Trigger:** Merge to `develop` branch
- **Automatic:** Yes (via GitHub Actions)
- **Runs:** Tests, linting, build, deploy
- **URL:** https://staging.product-photos.click
- **Purpose:** Test changes before production

### Production Deployment
- **Trigger:** Merge to `main` branch
- **Automatic:** Requires manual approval
- **Runs:** Full test suite, backup, deploy, health checks
- **URL:** https://product-photos.click
- **Purpose:** Live production environment

## Workflow Scenarios

### Scenario 1: Simple Feature

```bash
# Day 1
git checkout develop
git pull origin develop
git checkout -b feature/add-button
# ... add button ...
git commit -m "feat: add export button to dashboard"
git push origin feature/add-button
# Create PR on GitHub

# After review and merge
git checkout develop
git pull origin develop
git branch -d feature/add-button
```

### Scenario 2: Long-Running Feature

```bash
# Week 1
git checkout -b feature/complex-feature
# ... work work work ...
git commit -m "feat: initial complex feature structure"
git push origin feature/complex-feature

# Week 2 - keep up with develop
git fetch origin
git merge origin/develop
# ... continue work ...
git commit -m "feat: add feature logic"
git push

# Week 3 - ready for review
git fetch origin
git merge origin/develop  # Final sync
git push
# Create PR on GitHub
```

### Scenario 3: Found Bug While Working on Feature

```bash
# You're on feature/my-feature
# You discover a bug in develop

# Option A: Quick fix in your branch
git commit -m "fix: bug found during feature work"
# Mention in PR description

# Option B: Separate bugfix (better)
git commit -m "feat: save current work"
git checkout develop
git pull origin develop
git checkout -b bugfix/the-bug
# ... fix bug ...
git commit -m "fix: resolve the bug"
git push origin bugfix/the-bug
# Create PR for bug fix

# Return to your feature
git checkout feature/my-feature
```

## Troubleshooting

### Undo Last Commit (Not Pushed)

```bash
# Keep changes, undo commit
git reset --soft HEAD~1

# Discard changes, undo commit
git reset --hard HEAD~1
```

### Accidentally Committed to Wrong Branch

```bash
# You committed to develop instead of feature branch
git checkout develop
git reset --soft HEAD~1  # Undo commit, keep changes

# Create proper branch
git checkout -b feature/my-feature
git commit -m "feat: my changes"
```

### Forgot to Pull Before Starting Work

```bash
# You have local commits but develop has moved ahead
git fetch origin
git rebase origin/develop
# Or
git merge origin/develop
```

### Need to Update PR with New Changes

```bash
# Make more changes
git add .
git commit -m "fix: address review feedback"
git push origin feature/my-feature
# PR updates automatically
```

### Delete Branch After Merge

```bash
# Delete local branch
git branch -d feature/my-feature

# Delete remote branch
git push origin --delete feature/my-feature

# Or delete via GitHub UI after merging PR
```

## Best Practices

1. **Commit Often**
   - Small, focused commits
   - Each commit should be a logical unit
   - Easier to review and revert if needed

2. **Pull Before Push**
   - Always pull latest before pushing
   - Resolves conflicts locally

3. **Keep Branches Short-Lived**
   - Merge within 2-3 days if possible
   - Easier to review
   - Fewer merge conflicts

4. **Write Good Commit Messages**
   - Future you will thank you
   - Helps with code review
   - Useful for changelog generation

5. **Don't Commit Generated Files**
   - `node_modules/`
   - `dist/` or `build/`
   - `.env` files
   - Check `.gitignore`

6. **Test Before Pushing**
   - Run tests locally
   - Check application works
   - Review your own changes

## Need Help?

- **Merge conflicts?** → See "Handle Merge Conflicts" above
- **Forgot branch name?** → `git branch -a`
- **What changed?** → `git status` and `git diff`
- **Undo mistake?** → See "Troubleshooting" section
- **Still stuck?** → Check [CONTRIBUTING.md](../CONTRIBUTING.md) or ask in PR

---

Quick tip: Add these aliases to your `~/.gitconfig`:

```bash
[alias]
  co = checkout
  br = branch
  ci = commit
  st = status
  last = log -1 HEAD
  unstage = reset HEAD --
```

Then use: `git co develop`, `git st`, etc.
