# Bentham Testing Guide

Practical guide for running tests as an operator. For testing philosophy and strategy, see [TESTING_STRATEGY.md](TESTING_STRATEGY.md).

---

## Quick Start

```bash
# Run all tests
pnpm test

# Run specific test types
pnpm test:unit           # Fast unit tests only
pnpm test:integration    # Integration tests (slower)
pnpm test:regression     # Full regression suite
```

---

## Before You Test

### 1. Build First

Tests require compiled code:

```bash
pnpm build
```

### 2. Set Up Test Environment

Copy the test environment file:

```bash
cp .env.example .env.test
```

Edit `.env.test` with test-specific values (use test database, etc.):

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/bentham_test
REDIS_URL=redis://localhost:6379/1
```

### 3. Start Test Infrastructure (for integration tests)

```bash
# Option A: Docker
docker-compose -f docker/docker-compose.test.yml up -d

# Option B: Local services
# Ensure PostgreSQL and Redis are running
```

---

## Test Commands

### All Tests

```bash
pnpm test
```

Runs unit tests across all packages via Turbo (parallel execution).

### Unit Tests Only

```bash
pnpm test:unit
```

Fast tests with mocked dependencies. No database or external services needed.

### Integration Tests

```bash
pnpm test:integration
```

Tests with real database and services. Requires test infrastructure running.

### Single Package

```bash
# Test specific package
pnpm --filter @bentham/surface-adapters test
pnpm --filter @bentham/orchestrator test
pnpm --filter @bentham/core test
```

### Watch Mode (Development)

```bash
# Watch tests in a specific package
pnpm --filter @bentham/surface-adapters test -- --watch
```

### Coverage Report

```bash
pnpm test:coverage
```

Generates coverage report in `coverage/` folder. Open `coverage/index.html` in browser.

---

## Regression Testing (Phase Gates)

Bentham uses phased regression testing to validate builds progressively:

### Phase 0: Core Infrastructure

```bash
pnpm test:regression:phase-0
```

Tests: `@bentham/core`, `@bentham/database`

**What it validates:**
- Core utilities and types
- Database schema and repositories
- Basic CRUD operations

### Phase 1: Supporting Services

```bash
pnpm test:regression:phase-1
```

Tests: Session pool, proxy manager, account manager, cost tracker, notifications, audit logger

**What it validates:**
- Session management
- Proxy rotation
- Tenant isolation
- Cost tracking accuracy
- Notification delivery

### Phase 2: Execution Pipeline

```bash
pnpm test:regression:phase-2
```

Tests: Orchestrator, executor, validator, evidence collector

**What it validates:**
- Study lifecycle management
- Job execution and retries
- Validation gates
- Evidence capture

### Phase 3: AI Integration

```bash
pnpm test:regression:phase-3
```

Tests: Surface adapters, AI advisor

**What it validates:**
- API surface connectivity
- Web adapter selectors
- Query generation
- Response parsing

### Full Phase Gate

```bash
pnpm phase-gate
```

Runs everything: lint → typecheck → test → test:regression (all phases)

**Use this before:** Merging PRs, deploying to production.

---

## Testing Surface Adapters

### Test All CDP Surfaces (Live)

Requires Chrome running with debug port:

```bash
# Start Chrome with debug port
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Log into chatbot surfaces in Chrome tabs

# Run live test
npx tsx scripts/test-all-cdp.ts "What is 2+2?"
```

### Test Specific Adapter

```bash
# Unit tests (mocked)
pnpm --filter @bentham/surface-adapters test

# Live test against real API
OPENAI_API_KEY=sk-... npx tsx scripts/test-surface.ts openai-api "Hello"
```

### Mock Testing (No Live Services)

```bash
# Use mock browser provider
pnpm --filter @bentham/surface-adapters test -- --grep "mock"
```

---

## Testing Studies (End-to-End)

### Create Test Study

```bash
# Start API server
pnpm dev

# Create a test study
curl -X POST http://localhost:3000/v1/studies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "name": "Test Study",
    "surfaces": ["openai-api"],
    "queries": ["What is 2+2?"],
    "completionCriteria": { "minSuccessRate": 1.0 }
  }'
```

### Check Study Status

```bash
curl http://localhost:3000/v1/studies/STUDY_ID \
  -H "Authorization: Bearer $API_KEY"
```

### E2E Test Suite

```bash
# Full E2E tests (requires running services)
cd e2e
pnpm test
```

---

## Test File Locations

```
packages/<module>/
├── src/
│   └── __tests__/
│       ├── unit/              # Unit tests (*.test.ts)
│       └── integration/       # Integration tests (*.integration.test.ts)
└── ...

e2e/
├── src/
│   ├── study-lifecycle.test.ts
│   ├── surface-queries.test.ts
│   └── security.test.ts
└── ...
```

---

## Writing Tests

### Unit Test Example

```typescript
// packages/core/src/__tests__/unit/utils.test.ts
import { describe, it, expect } from 'vitest';
import { generateId } from '../../utils';

describe('generateId', () => {
  it('generates unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });
});
```

### Integration Test Example

```typescript
// packages/database/src/__tests__/integration/study-repo.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, cleanupTestDatabase } from '@bentham/test-utils';
import { StudyRepository } from '../../repositories/study';

describe('StudyRepository', () => {
  let db: TestDatabase;
  let repo: StudyRepository;

  beforeAll(async () => {
    db = await createTestDatabase();
    repo = new StudyRepository(db);
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  it('creates and retrieves a study', async () => {
    const study = await repo.create({
      tenantId: 'test-tenant',
      name: 'Test Study',
    });

    const retrieved = await repo.findById(study.id);
    expect(retrieved?.name).toBe('Test Study');
  });
});
```

---

## Debugging Failing Tests

### Verbose Output

```bash
pnpm test -- --reporter=verbose
```

### Run Single Test File

```bash
pnpm --filter @bentham/core test -- src/__tests__/unit/utils.test.ts
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
  "args": ["run", "--reporter=verbose"],
  "cwd": "${workspaceFolder}/packages/core"
}
```

### Check Test Database State

```bash
# Connect to test database
psql $DATABASE_URL

# Check studies table
SELECT * FROM studies ORDER BY created_at DESC LIMIT 10;
```

---

## CI/CD Testing

Tests run automatically on:

- **Pull Request:** Unit tests, lint, typecheck
- **Merge to main:** Full regression suite
- **Pre-deployment:** E2E tests against staging

### Simulating CI Locally

```bash
# Run exactly what CI runs
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:regression
```

---

## Troubleshooting

### "Cannot connect to database"

```bash
# Check database is running
docker ps | grep postgres

# Check DATABASE_URL in .env.test
echo $DATABASE_URL
```

### "Test timeout"

Integration tests may need longer timeouts:

```typescript
it('slow operation', async () => {
  // ...
}, { timeout: 30000 }); // 30 seconds
```

### "Flaky tests"

Run multiple times to confirm:

```bash
for i in {1..5}; do pnpm test; done
```

### "Stale cache"

Clear Turbo cache:

```bash
rm -rf .turbo
pnpm test
```

---

## Test Coverage Goals

| Package | Target Coverage |
|---------|----------------|
| @bentham/core | 90%+ |
| @bentham/database | 85%+ |
| @bentham/orchestrator | 80%+ |
| @bentham/executor | 80%+ |
| @bentham/validator | 90%+ |
| @bentham/surface-adapters | 70%+ |

View current coverage:

```bash
pnpm test:coverage
open coverage/index.html
```
