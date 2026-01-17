# Bentham Testing Strategy

## Philosophy

**Test at every level, test early, test often.** No code merges without passing tests. Tests are first-class code with the same quality standards as production code.

---

## Testing Pyramid

```
                    ┌─────────────┐
                    │    E2E      │  Few, slow, high confidence
                    │   Tests     │
                    ├─────────────┤
                    │ Integration │  Medium quantity
                    │   Tests     │  Medium speed
                    ├─────────────┤
                    │   Unit      │  Many, fast
                    │   Tests     │  Low-level confidence
                    └─────────────┘
```

---

## Testing Levels

### 1. Unit Tests

**Scope:** Single function or class in isolation

**Characteristics:**
- No external dependencies (mocked)
- Fast (<100ms per test)
- High coverage (>80% per module)
- Run on every commit

**Framework:** Vitest

**Location:** `packages/<module>/src/__tests__/`

**Naming:** `<filename>.test.ts`

**Example:**
```typescript
// packages/core/src/__tests__/utils.test.ts
import { describe, it, expect } from 'vitest';
import { generateId, hashContent } from '../utils';

describe('generateId', () => {
  it('generates unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('generates IDs of correct length', () => {
    const id = generateId();
    expect(id.length).toBe(21); // nanoid default
  });
});

describe('hashContent', () => {
  it('produces consistent hash for same input', () => {
    const hash1 = hashContent('test content');
    const hash2 = hashContent('test content');
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different input', () => {
    const hash1 = hashContent('content A');
    const hash2 = hashContent('content B');
    expect(hash1).not.toBe(hash2);
  });
});
```

### 2. Integration Tests

**Scope:** Multiple modules working together, or module with real dependencies

**Characteristics:**
- May use real database (test instance)
- May use real external services (sandboxed)
- Medium speed (seconds per test)
- Run on PR merge

**Framework:** Vitest with test containers

**Location:** `packages/<module>/src/__tests__/integration/`

**Naming:** `<feature>.integration.test.ts`

**Example:**
```typescript
// packages/orchestrator/src/__tests__/integration/study-lifecycle.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, cleanupTestDatabase } from '@bentham/test-utils';
import { createStudy, getStudyStatus, cancelStudy } from '../index';

describe('Study Lifecycle', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  it('creates study from valid manifest', async () => {
    const manifest = createValidManifest();
    const study = await createStudy(manifest, 'tenant-1');

    expect(study.id).toBeDefined();
    expect(study.status).toBe('validating');
  });

  it('transitions through lifecycle states', async () => {
    const manifest = createValidManifest();
    const study = await createStudy(manifest, 'tenant-1');

    // Simulate validation complete
    await simulateValidationComplete(study.id);
    const status1 = await getStudyStatus(study.id);
    expect(status1.status).toBe('queued');

    // Simulate execution
    await simulateExecutionStart(study.id);
    const status2 = await getStudyStatus(study.id);
    expect(status2.status).toBe('executing');
  });

  it('can be cancelled', async () => {
    const manifest = createValidManifest();
    const study = await createStudy(manifest, 'tenant-1');

    await cancelStudy(study.id);
    const status = await getStudyStatus(study.id);
    expect(status.status).toBe('cancelled');
  });
});
```

### 3. End-to-End Tests

**Scope:** Full system from API to results

**Characteristics:**
- Uses staging environment
- May use real AI surfaces (test accounts)
- Slow (minutes per test)
- Run before release

**Framework:** Playwright for API tests + assertions

**Location:** `e2e/`

**Naming:** `<scenario>.e2e.test.ts`

**Example:**
```typescript
// e2e/study-completion.e2e.test.ts
import { describe, it, expect } from 'vitest';
import { BenthamClient } from '@bentham/client';

describe('Study Completion E2E', () => {
  const client = new BenthamClient({
    baseUrl: process.env.STAGING_URL,
    apiKey: process.env.STAGING_API_KEY,
  });

  it('completes a small study successfully', async () => {
    // Submit manifest
    const manifest = {
      name: 'E2E Test Study',
      queries: [{ text: 'What is the capital of France?' }],
      surfaces: [{ id: 'openai-api' }],
      locations: [{ id: 'us-national' }],
      completionCriteria: { coverageThreshold: 0.95, maxRetriesPerCell: 3 },
      evidenceLevel: 'metadata',
      deadline: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    };

    const study = await client.createStudy(manifest);
    expect(study.id).toBeDefined();

    // Wait for completion
    const result = await client.waitForCompletion(study.id, {
      timeout: 5 * 60 * 1000, // 5 minutes
      pollInterval: 5000,
    });

    expect(result.status).toBe('complete');
    expect(result.completedCells).toBe(1);
    expect(result.failedCells).toBe(0);

    // Verify results
    const results = await client.getResults(study.id);
    expect(results.length).toBe(1);
    expect(results[0].response.text).toContain('Paris');
  }, 10 * 60 * 1000); // 10 minute timeout
});
```

---

## Regression Testing

**Purpose:** Ensure that changes in later phases do not break functionality from earlier phases.

### Regression Test Requirements

Each module must maintain a regression test suite that:
1. Captures all critical functionality of the module
2. Runs quickly enough to be part of every build
3. Is maintained as the module evolves
4. Never decreases in coverage

### Regression Test Location

```
packages/<module>/src/__tests__/regression/
├── core-functionality.regression.test.ts
├── edge-cases.regression.test.ts
└── integration-points.regression.test.ts
```

### Regression Test Categories

| Category | Description | Run Frequency |
|----------|-------------|---------------|
| Smoke tests | Critical path functionality | Every commit |
| Core regression | Full module functionality | Every PR |
| Integration regression | Module interaction points | Phase gates |
| Full regression | All tests from all phases | Before release |

### Regression Test Suite by Phase

#### Phase 0 Regression Suite
```typescript
// packages/core/src/__tests__/regression/
- generateId produces valid IDs
- hashContent is deterministic
- validateSchema rejects invalid data
- all error codes defined
- all type exports present

// packages/database/src/__tests__/regression/
- migrations run successfully
- repositories perform CRUD
- tenant isolation enforced
```

#### Phase 1 Regression Suite
Includes Phase 0 suite plus:
```typescript
// packages/infrastructure/*/src/__tests__/regression/
- session-pool: acquire/release sessions
- proxy-manager: geo-targeting works
- account-manager: allocation respects isolation mode
- cost-tracker: records accumulate correctly
- notification-hub: dispatches to all channels
- audit-logger: entries are queryable
```

#### Phase 2 Regression Suite
Includes Phase 0+1 suites plus:
```typescript
// packages/orchestrator/src/__tests__/regression/
- study state transitions valid
- checkpoint save/restore works
- deadline monitoring triggers

// packages/executor/src/__tests__/regression/
- job execution completes
- retry logic works
- evidence collection triggered

// packages/validator/src/__tests__/regression/
- manifest validation works
- quality gates applied
- completion criteria checked
```

#### Phase 3 Regression Suite
Includes Phase 0+1+2 suites plus:
```typescript
// packages/surface-adapters/src/__tests__/regression/
- each adapter executes queries
- error handling works
- session management works

// packages/ai-advisor/src/__tests__/regression/
- query generation works
- response validation works
- scoring in valid ranges
```

### Running Regression Tests

```bash
# Run regression tests for a specific module
pnpm --filter @bentham/core test:regression

# Run regression tests for a specific phase
pnpm test:regression:phase-0
pnpm test:regression:phase-1
pnpm test:regression:phase-2
pnpm test:regression:phase-3

# Run ALL regression tests (required before phase gate)
pnpm test:regression

# Run regression tests with coverage
pnpm test:regression --coverage
```

### Regression Test Rules

1. **No Deletion:** Regression tests can only be added, not removed (unless the feature is removed)
2. **No Modification:** Existing regression tests should not be modified unless the behavior intentionally changed
3. **Fast Execution:** Each regression test should complete in <1 second
4. **Independent:** Regression tests must not depend on execution order
5. **Deterministic:** Regression tests must produce same result on every run

### Regression Failure Policy

If any regression test fails:
1. **Stop:** Do not proceed with the phase gate
2. **Investigate:** Determine if it's a real regression or test issue
3. **Fix:** Either fix the regression or update the test (with documented justification)
4. **Re-run:** All regression tests must pass before proceeding

### Regression Test Maintenance

| Event | Action |
|-------|--------|
| Bug fix | Add regression test for the bug |
| New feature | Add regression tests for key functionality |
| API change | Update regression tests, document reason |
| Dependency update | Run full regression suite |
| Performance optimization | Verify regression tests still pass |

---

## Module-Specific Testing Requirements

### Core (`packages/core`)

| Test Type | Coverage | Focus |
|-----------|----------|-------|
| Unit | 100% | All utility functions |
| Integration | N/A | No external dependencies |

**TDD Approach:** Yes - all utilities have clear inputs/outputs

### Database (`packages/database`)

| Test Type | Coverage | Focus |
|-----------|----------|-------|
| Unit | 80% | Repository methods |
| Integration | Key flows | Full CRUD with test DB |

**TDD Approach:** Yes for repositories

**Test Database:** PostgreSQL in Docker, fresh schema per test suite

### Orchestrator (`packages/orchestrator`)

| Test Type | Coverage | Focus |
|-----------|----------|-------|
| Unit | 90% | State transitions, checkpoint logic |
| Integration | Full lifecycle | Create → Execute → Complete |

**TDD Approach:** Yes for state machine

**Key Test Cases:**
- Valid state transitions
- Invalid state transitions rejected
- Checkpoint save/restore
- Deadline monitoring triggers alerts
- Escalation on at-risk studies

### Executor (`packages/executor`)

| Test Type | Coverage | Focus |
|-----------|----------|-------|
| Unit | 80% | Retry logic, job dispatching |
| Integration | Job execution | With mock adapters |

**TDD Approach:** Yes for retry logic

**Key Test Cases:**
- Successful job execution
- Retry on transient failure
- Max retries exhausted → failed
- Session acquisition
- Evidence capture triggered

### Validator (`packages/validator`)

| Test Type | Coverage | Focus |
|-----------|----------|-------|
| Unit | 95% | Each validation rule |
| Integration | Full validation | Manifest + job result |

**TDD Approach:** Yes for all validation rules

**Key Test Cases:**
- Valid manifest passes
- Invalid manifest rejected with clear errors
- Quality gate: response length
- Quality gate: actual content (not error)
- Completion criteria: coverage threshold
- Completion criteria: per-surface minimum

### AI Advisor (`packages/ai-advisor`)

| Test Type | Coverage | Focus |
|-----------|----------|-------|
| Unit | 80% | Input validation, output parsing |
| Integration | Full AI flow | With real or mock API |

**TDD Approach:** Tests alongside (AI outputs are variable)

**Key Test Cases:**
- Query generation produces valid queries
- Response validation detects error pages
- Response scoring in expected ranges
- Troubleshooter returns actionable suggestions
- Model interface abstraction works

### Evidence Collector (`packages/evidence-collector`)

| Test Type | Coverage | Focus |
|-----------|----------|-------|
| Unit | 90% | Hashing, metadata extraction |
| Integration | Full capture | Screenshot, archive, storage |

**TDD Approach:** Yes for hashing and validation

**Key Test Cases:**
- Screenshot captured
- HTML archive complete
- Hash is deterministic
- Timestamp from authority
- S3 Object Lock enabled for legal hold

### Surface Adapters (`packages/surface-adapters`)

| Test Type | Coverage | Focus |
|-----------|----------|-------|
| Unit | 70% | Input validation, error handling |
| Integration | Real execution | With test accounts |

**TDD Approach:** Tests alongside (external dependencies)

**Key Test Cases (per adapter):**
- Successful query execution
- Error page detection
- Session validation
- Timeout handling
- Rate limit handling

### Infrastructure Modules

| Module | Unit Coverage | Integration Focus |
|--------|---------------|-------------------|
| session-pool | 80% | Session lifecycle with real browser |
| proxy-manager | 80% | Proxy acquisition with mock provider |
| account-manager | 80% | Account allocation logic |
| cost-tracker | 90% | Cost aggregation queries |
| notification-hub | 80% | Delivery with mock services |
| audit-logger | 90% | Query and retention logic |

---

## Test Data Management

### Fixtures

Location: `packages/<module>/src/__tests__/fixtures/`

```typescript
// fixtures/manifests.ts
export const validManifest: Manifest = {
  version: '1.0',
  name: 'Test Study',
  queries: [{ text: 'Test query' }],
  surfaces: [{ id: 'openai-api' }],
  locations: [{ id: 'us-national' }],
  completionCriteria: { coverageThreshold: 0.95, maxRetriesPerCell: 3 },
  evidenceLevel: 'metadata',
  legalHold: false,
  deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
};

export const invalidManifest = {
  // missing required fields
  name: 'Invalid',
};
```

### Test Database

- Use Docker Compose for local Postgres
- Fresh schema per test suite (not per test for speed)
- Transaction rollback for test isolation where possible
- Seed data for integration tests

### Mock Services

```typescript
// mocks/claude-api.mock.ts
export const mockClaudeAPI = {
  generateQueries: vi.fn().mockResolvedValue([
    { query: 'Generated query 1', rationale: 'Test rationale' },
  ]),
  scoreResponse: vi.fn().mockResolvedValue({
    overall: 0.85,
    dimensions: { accuracy: 0.9, completeness: 0.8 },
  }),
};
```

---

## CI/CD Pipeline

### On Every Push

```yaml
- Lint (ESLint, Prettier)
- Type check (TypeScript)
- Unit tests (all modules)
```

### On PR

```yaml
- All of the above
- Integration tests (all modules)
- Coverage report
- Security scan (npm audit)
```

### On Merge to Main

```yaml
- All of the above
- Build Docker images
- Deploy to staging
- E2E tests on staging
```

### On Release Tag

```yaml
- All of the above
- Deploy to production
- Smoke tests on production
```

---

## Coverage Requirements

| Module Type | Unit Coverage | Integration Coverage |
|-------------|---------------|---------------------|
| Core utilities | 100% | N/A |
| Business logic | 90% | Key flows |
| Infrastructure | 80% | Real dependencies |
| Adapters | 70% | Real services |

**Enforcement:** CI fails if coverage drops below thresholds

---

## Test Environment Configuration

### Local Development

```bash
# Start test dependencies
docker-compose -f docker-compose.test.yml up -d

# Run unit tests
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run all tests
pnpm test
```

### CI Environment

```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_DB: bentham_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test

  redis:
    image: redis:7
```

### Staging Environment

- Separate AWS account
- Test proxy provider accounts
- Test AI surface accounts
- Isolated from production data

---

## Test Documentation

Each module must include:

1. `README.md` with testing instructions
2. Description of test categories
3. How to run tests locally
4. How to add new tests
5. Known limitations

---

## Acceptance Test Criteria (MVP)

| Scenario | Pass Criteria |
|----------|---------------|
| Submit valid manifest | Returns study ID, status is 'validating' |
| Submit invalid manifest | Returns 400 with validation errors |
| Execute 1×1×1 study | Completes within 2 minutes |
| Execute 5×3×2 study | Completes within 15 minutes |
| Interrupt and resume | Resumes from checkpoint, no duplicate work |
| Surface adapter failure | Retries, marks failed after max attempts |
| Deadline at risk | Alerts sent at 50% and 75% thresholds |
| Multi-tenant isolation | Tenant A cannot see Tenant B data |
| Evidence capture | Screenshot and metadata stored correctly |
| Cost tracking | Costs attributed to correct study |

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-16 | Claude Code | Initial testing strategy |
