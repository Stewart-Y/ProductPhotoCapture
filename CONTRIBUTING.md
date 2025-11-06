# Contributing to ProductPhotoCapture

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the ProductPhotoCapture project.

## Table of Contents
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Security Guidelines](#security-guidelines)
- [Testing](#testing)

## Getting Started

### Prerequisites
- Node.js 20+
- Git
- Access to AWS S3 (for testing)
- 3JMS API credentials (for inventory integration)

### Local Setup
```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/ProductPhotoCapture.git
cd ProductPhotoCapture

# 3. Add upstream remote
git remote add upstream https://github.com/Stewart-Y/ProductPhotoCapture.git

# 4. Install server dependencies
cd server
npm install

# 5. Install client dependencies
cd ../client
npm install

# 6. Set up environment variables
cd ../server
cp .env.example .env
# Edit .env with your credentials:
# - TJMS_API_KEY
# - AWS credentials
# - S3_BUCKET
# - FREEPIK_API_KEY or NANOBANANA_API_KEY

# 7. Run the application
npm start
```

## Development Workflow

We use **GitFlow** for managing our codebase:

### Branch Structure
```
main        → Production (protected, requires PR approval)
  ↑
develop     → Staging (protected, requires PR)
  ↑
feature/*   → New features
bugfix/*    → Bug fixes
hotfix/*    → Emergency production fixes
```

### Creating a Feature

```bash
# 1. Start from develop branch
git checkout develop
git pull upstream develop

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make your changes
# ... code code code ...

# 4. Commit your changes (see Commit Messages below)
git add .
git commit -m "feat: add your feature description"

# 5. Push to your fork
git push origin feature/your-feature-name

# 6. Create Pull Request
# Go to GitHub and create PR from your feature branch to upstream/develop
```

### Working on Bug Fixes

```bash
# Same as feature, but use bugfix/ prefix
git checkout develop
git pull upstream develop
git checkout -b bugfix/fix-description
# ... make fixes ...
git commit -m "fix: resolve bug description"
git push origin bugfix/fix-description
# Create PR to develop
```

### Hotfixes (Production Emergencies)

```bash
# Create from main branch for critical production issues
git checkout main
git pull upstream main
git checkout -b hotfix/critical-fix
# ... fix issue ...
git commit -m "fix: critical production issue"
git push origin hotfix/critical-fix
# Create PR to BOTH main and develop
```

## Coding Standards

### JavaScript/Node.js (Server)
- Use ES6+ features and modules
- Use `const` by default, `let` when reassignment needed, never use `var`
- Use descriptive variable and function names
- Add JSDoc comments for public functions
- Use async/await instead of callbacks
- Handle errors properly - no silent failures

#### Example
```javascript
/**
 * Process job and generate AI backgrounds
 * @param {string} jobId - The job ID to process
 * @returns {Promise<Object>} Processing result
 */
async function processJob(jobId) {
  try {
    const job = await getJob(jobId);
    const result = await generateBackgrounds(job);
    return result;
  } catch (error) {
    console.error(`Failed to process job ${jobId}:`, error);
    throw error;
  }
}
```

### TypeScript (Client)
- Define proper types, avoid `any` when possible
- Use interfaces for object shapes
- Export types that are reused across files
- Use TypeScript strict mode

#### Example
```typescript
interface Job {
  id: string;
  sku: string;
  status: JobStatus;
  createdAt: string;
}

type JobStatus = 'NEW' | 'PROCESSING' | 'DONE' | 'FAILED';
```

### File Organization
```
server/
  ├── config/          # Configuration files
  ├── providers/       # External API integrations (Freepik, OpenRouter)
  ├── workflows/       # Business logic for job processing
  ├── jobs/            # Job queue management
  ├── migrations/      # Database migrations (versioned SQL)
  ├── storage/         # S3 and file storage
  └── tests/           # Test files

client/
  ├── src/
  │   ├── components/  # Reusable React components
  │   ├── hooks/       # Custom React hooks
  │   ├── pages/       # Page components (routes)
  │   ├── lib/         # Utilities and API client
  │   └── styles/      # Global styles
```

### Code Style
- Use 2 spaces for indentation
- Use single quotes for strings (except in JSON)
- Add trailing commas in multi-line objects/arrays
- Keep line length under 100 characters
- Add blank lines between logical sections

## Commit Messages

We follow **Conventional Commits** specification:

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting (no logic changes)
- `refactor`: Code restructuring (no behavior change)
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `security`: Security improvements
- `perf`: Performance improvements

### Scopes (optional)
- `api`: API endpoints
- `ui`: User interface
- `db`: Database
- `jobs`: Job processing
- `providers`: External integrations

### Examples
```bash
feat(jobs): add retry mechanism for failed jobs

Implements exponential backoff retry logic for jobs that
fail due to temporary API errors.

Closes #123

---

fix(api): correct CORS configuration for staging environment

---

security: remove hardcoded API keys from source code

BREAKING CHANGE: TJMS_API_KEY environment variable now required.
Add TJMS_API_KEY to your .env file.

---

docs: update deployment guide with Docker instructions
```

## Pull Request Process

### Before Creating a PR

1. **Update your branch with latest develop**
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout your-feature-branch
   git merge develop
   # Resolve any conflicts
   ```

2. **Run tests locally**
   ```bash
   cd server && npm test
   cd ../client && npm test
   ```

3. **Self-review your code**
   - Remove any console.log statements
   - Remove commented-out code
   - Check for hardcoded values that should be configurable
   - Verify error handling

### Creating the PR

1. Push your branch to your fork
2. Go to GitHub and create Pull Request
3. Select base: `develop` (or `main` for hotfixes)
4. Fill out the PR template completely
5. Link related issues
6. Add screenshots if UI changed

### PR Requirements

- ✅ All CI checks must pass
- ✅ At least 1 approval required (from code owner)
- ✅ No merge conflicts with base branch
- ✅ PR template filled out completely
- ✅ Tests added for new features
- ✅ Documentation updated if needed
- ✅ No decrease in test coverage

### Addressing Review Feedback

```bash
# Make requested changes
git add .
git commit -m "fix: address review feedback"
git push origin your-feature-branch
# PR updates automatically
```

### After PR is Merged

```bash
# Update your local develop
git checkout develop
git pull upstream develop

# Delete your feature branch
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

## Security Guidelines

### Never Commit
- API keys or tokens
- Passwords or secrets
- `.env` files
- Private keys (`.pem`, `.key`)
- AWS credentials
- Database connection strings with passwords

### Always
- Use environment variables for secrets
- Add sensitive files to `.gitignore`
- Review code for security issues before committing
- Validate and sanitize all user inputs
- Use parameterized queries for SQL
- Enable CORS only for specific origins
- Check authentication/authorization on protected routes

### Security Checklist for PRs
- [ ] No secrets in code
- [ ] Input validation implemented
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized output)
- [ ] CSRF protection where needed
- [ ] Authentication checked on protected routes
- [ ] Sensitive data not logged

## Testing

### Running Tests

```bash
# Server tests
cd server
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report

# Client tests
cd client
npm test
```

### Writing Tests

#### Unit Tests
- Test individual functions in isolation
- Mock external dependencies
- Test edge cases and error conditions
- Use descriptive test names

```javascript
describe('Job Processing', () => {
  test('should validate job input correctly', () => {
    const validJob = { sku: 'TEST-123', imageUrl: 'https://...' };
    expect(validateJobInput(validJob)).toBe(true);
  });

  test('should reject job with invalid URL', () => {
    const invalidJob = { sku: 'TEST-123', imageUrl: 'not-a-url' };
    expect(() => validateJobInput(invalidJob)).toThrow('Invalid URL');
  });
});
```

#### Integration Tests
- Test API endpoints end-to-end
- Use test database
- Clean up test data after tests

```javascript
describe('POST /api/jobs', () => {
  test('should create new job with valid input', async () => {
    const response = await request(app)
      .post('/api/jobs')
      .send({ sku: 'TEST-123', imageUrl: 'https://...' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });
});
```

### Test Coverage

- Aim for at least 70% code coverage
- Critical paths should have 100% coverage
- Test error handling, not just happy paths

## Code Review Guidelines

### For Reviewers
- Be constructive and respectful
- Explain the "why" behind suggestions
- Approve PRs that meet standards, even if not perfect
- Request changes for security issues or breaking bugs
- Comment for style suggestions (non-blocking)

### For Authors
- Respond to all comments
- Ask for clarification if feedback is unclear
- Don't take feedback personally
- Mark conversations as resolved when addressed

## Getting Help

- Check existing [Issues](https://github.com/Stewart-Y/ProductPhotoCapture/issues)
- Check existing [Pull Requests](https://github.com/Stewart-Y/ProductPhotoCapture/pulls)
- Review documentation in `/docs` folder
- Ask questions in PR comments
- Review the [Git Workflow Guide](docs/GIT_WORKFLOW.md)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to ProductPhotoCapture! 🚀
