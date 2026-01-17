# Bentham Implementation Plan

## Philosophy

**Slow but steady.** Each phase delivers working, tested functionality. No phase begins until the previous phase passes all tests. Parallel work is allowed within phases where modules have no dependencies on each other.

**Gate Requirements:** Before any phase can be considered complete:
1. All acceptance tests must pass
2. All regression tests must pass (for modules from previous phases)
3. Code must be committed and pushed to the repository
4. Phase completion must be tagged (e.g., `phase-0-complete`, `phase-1-complete`)

---

## Phase Overview

```
Phase 0: Foundation          ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Phase 1: Core Infrastructure ░░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░
Phase 2: Execution Engine    ░░░░░░░░░░░░░░░░░░░░████████████░░░░░░░░
Phase 3: Surfaces & AI       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████
Phase 4: Integration & MVP   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████
```

---

## Phase 0: Foundation

**Goal:** Establish repo, tooling, and core module.

**Parallelization:** None (must complete before other phases)

### Tasks

| Task | Description | Exit Criteria |
|------|-------------|---------------|
| 0.1 | Initialize repo with monorepo structure | `pnpm install` works, TypeScript compiles |
| 0.2 | Set up CI/CD pipeline | Tests run on PR, lint passes |
| 0.3 | Configure test framework | Vitest configured, example test passes |
| 0.4 | Create `packages/core` module | All shared types defined, utilities implemented |
| 0.5 | Create `packages/database` schema | Prisma schema defined, migrations run |
| 0.6 | Set up local development environment | Docker compose for Postgres, Redis |

### Deliverables
- Clean repo with monorepo structure
- Working CI/CD pipeline
- `core` module with types and utilities
- Database schema with migrations
- Development environment documentation

### Testing Requirements
- `core`: 100% unit test coverage for utilities
- `database`: Migration tests, repository unit tests

---

## Phase 1: Core Infrastructure

**Goal:** Build the supporting infrastructure modules.

**Parallelization:** Tasks 1.1-1.6 can run in parallel (no interdependencies)

### Tasks

| Task | Description | Dependencies | Parallel Group |
|------|-------------|--------------|----------------|
| 1.1 | Implement `session-pool` | Phase 0 complete | A |
| 1.2 | Implement `proxy-manager` | Phase 0 complete | A |
| 1.3 | Implement `account-manager` | Phase 0 complete | A |
| 1.4 | Implement `cost-tracker` | Phase 0 complete | B |
| 1.5 | Implement `notification-hub` | Phase 0 complete | B |
| 1.6 | Implement `audit-logger` | Phase 0 complete | B |
| 1.7 | Integration testing | 1.1-1.6 complete | - |

### Module Specifications

#### 1.1 Session Pool (`session-pool`)
```
Inputs:  Surface ID, session requirements
Outputs: Browser session with configured proxy
State:   Session health, usage counts, TTL
```

**Implementation Steps:**
1. Define session lifecycle (create, warm, use, cool, expire)
2. Implement Playwright browser management
3. Add session health tracking (success rate, age)
4. Implement session rotation logic
5. Add Redis state persistence for recovery
6. Write unit tests for each state transition
7. Write integration tests with real browser

#### 1.2 Proxy Manager (`proxy-manager`)
```
Inputs:  Location requirement, session ID
Outputs: Proxy configuration (host, port, auth)
State:   Proxy usage, block status, costs
```

**Implementation Steps:**
1. Define proxy provider interface
2. Implement Bright Data adapter
3. Implement sticky session logic
4. Add geographic targeting
5. Track usage and costs per session
6. Implement rotation on block detection
7. Write unit tests for routing logic
8. Write integration tests with proxy provider

#### 1.3 Account Manager (`account-manager`)
```
Inputs:  Surface ID, isolation mode
Outputs: Account credentials
State:   Account pool, usage history, retirement status
```

**Implementation Steps:**
1. Define account lifecycle (provision, warm, active, retired)
2. Implement account pool per surface
3. Add isolation modes (shared vs dedicated)
4. Track usage per study for session isolation
5. Implement account cost tracking
6. Write unit tests for allocation logic
7. Write integration tests with mock accounts

#### 1.4 Cost Tracker (`cost-tracker`)
```
Inputs:  Billable events (API call, proxy bytes, etc.)
Outputs: Cost aggregations by study, tenant
State:   Cost records, estimates
```

**Implementation Steps:**
1. Define cost categories and units
2. Implement event recording
3. Add aggregation queries (by study, tenant, time)
4. Implement estimation logic
5. Add billing report generation
6. Write unit tests for calculations
7. Write integration tests with real data

#### 1.5 Notification Hub (`notification-hub`)
```
Inputs:  Alert or webhook event
Outputs: Delivery status
State:   Notification history, delivery attempts
```

**Implementation Steps:**
1. Define notification types and channels
2. Implement Slack integration
3. Implement email (SendGrid) integration
4. Implement webhook dispatch
5. Add retry logic for failed deliveries
6. Write unit tests for formatting
7. Write integration tests with mock services

#### 1.6 Audit Logger (`audit-logger`)
```
Inputs:  Action event with context
Outputs: Confirmation
State:   Immutable log entries
```

**Implementation Steps:**
1. Define action types and schema
2. Implement logging to database
3. Add tenant-scoped queries
4. Implement retention policies
5. Add export functionality
6. Write unit tests for formatting
7. Write integration tests for queries

### Deliverables
- Six working infrastructure modules
- Unit tests for each module (>80% coverage)
- Integration tests for each module
- Documentation for each module API

---

## Phase 2: Execution Engine

**Goal:** Build the core execution pipeline (orchestrator, executor, validator).

**Parallelization:** Tasks 2.1-2.3 can run in parallel initially, then integration.

### Tasks

| Task | Description | Dependencies | Parallel Group |
|------|-------------|--------------|----------------|
| 2.1 | Implement `orchestrator` | Phase 1 complete | A |
| 2.2 | Implement `executor` | Phase 1 complete | A |
| 2.3 | Implement `validator` | Phase 1 complete | A |
| 2.4 | Implement `evidence-collector` | Phase 1 complete | A |
| 2.5 | Integration: Orchestrator ↔ Executor | 2.1, 2.2 complete | B |
| 2.6 | Integration: Executor ↔ Validator | 2.2, 2.3 complete | B |
| 2.7 | Integration: Full pipeline | 2.5, 2.6 complete | - |

### Module Specifications

#### 2.1 Orchestrator (`orchestrator`)
```
Inputs:  Manifest
Outputs: Study state, progress updates
State:   Study lifecycle, job graph, checkpoints
```

**Implementation Steps:**
1. Implement manifest parsing and job graph creation
2. Implement study state machine
3. Add checkpointing (save/load state)
4. Implement progress tracking
5. Add deadline monitoring
6. Implement escalation logic
7. Wire up to notification hub
8. Write unit tests for state transitions
9. Write integration tests for full lifecycle

#### 2.2 Executor (`executor`)
```
Inputs:  Job from queue
Outputs: Job result (success/failure)
State:   Worker status, job attempts
```

**Implementation Steps:**
1. Implement SQS job consumer
2. Add job dispatching to surface adapters
3. Implement retry logic with backoff
4. Add session/proxy acquisition
5. Wire up to evidence collector
6. Implement job completion reporting
7. Write unit tests for retry logic
8. Write integration tests with mock adapters

#### 2.3 Validator (`validator`)
```
Inputs:  Job result, manifest criteria
Outputs: Validation result (pass/fail)
State:   Stateless
```

**Implementation Steps:**
1. Implement manifest schema validation
2. Implement quality gates (response length, content check)
3. Implement completion criteria checking
4. Add per-surface threshold checking
5. Write unit tests for each validation rule
6. Write integration tests for full validation flow

#### 2.4 Evidence Collector (`evidence-collector`)
```
Inputs:  Browser page, evidence level
Outputs: Evidence URLs, hashes
State:   Stateless (stores to S3)
```

**Implementation Steps:**
1. Implement screenshot capture
2. Implement HTML archive capture
3. Implement HAR file capture
4. Add SHA-256 hashing
5. Integrate RFC 3161 timestamp authority
6. Implement S3 storage with Object Lock
7. Write unit tests for hashing
8. Write integration tests for full capture

### Deliverables
- Working orchestrator with checkpointing
- Working executor with retry logic
- Working validator with all quality gates
- Working evidence collector
- Full pipeline integration tests
- Documentation for execution flow

---

## Phase 3: Surfaces & AI

**Goal:** Implement surface adapters and AI advisor modules.

**Parallelization:** All surface adapters can run in parallel. AI modules can run in parallel.

### Tasks

| Task | Description | Dependencies | Parallel Group |
|------|-------------|--------------|----------------|
| 3.1 | Implement API surfaces | Phase 2 complete | A |
| 3.2 | Implement web chatbot surfaces | Phase 2 complete | A |
| 3.3 | Implement search surfaces | Phase 2 complete | A |
| 3.4 | Implement AI query generator | Phase 2 complete | B |
| 3.5 | Implement AI response validator | Phase 2 complete | B |
| 3.6 | Implement AI response scorer | Phase 2 complete | B |
| 3.7 | Implement AI troubleshooter | Phase 2 complete | B |
| 3.8 | Surface adapter integration tests | 3.1-3.3 complete | C |
| 3.9 | AI module integration tests | 3.4-3.7 complete | C |

### Surface Adapter Priority

**Tier 1 (MVP):**
1. OpenAI API
2. Anthropic API
3. Google Search + AI Overview
4. ChatGPT Web
5. Perplexity Web

**Tier 2 (Post-MVP):**
6. Bing + Copilot
7. Gemini Web
8. Meta AI
9. Claude Web
10. Grok

### AI Module Specifications

#### 3.4 Query Generator
```typescript
interface QueryGeneratorInput {
  studyGoals: string;
  surfaceType: string;
  existingQueries?: string[];
  constraints?: QueryConstraints;
}

interface GeneratedQuery {
  query: string;
  rationale: string;
  expectedResponseType: string;
}
```

#### 3.5 Response Validator
```typescript
interface ResponseValidatorInput {
  response: string;
  surfaceType: string;
}

interface ValidationResult {
  isValidResponse: boolean;
  isErrorPage: boolean;
  confidence: number;
  reason: string;
}
```

#### 3.6 Response Scorer
```typescript
interface ResponseScorerInput {
  response: string;
  query: string;
  criteria: ScoringCriteria;
}

interface ResponseScore {
  overall: number;
  dimensions: {
    accuracy?: number;
    completeness?: number;
    attribution?: number;
    recency?: number;
  };
  explanation: string;
}
```

#### 3.7 Troubleshooter
```typescript
interface TroubleshooterInput {
  errorContext: ErrorContext;
  surfaceId: string;
  attemptHistory: AttemptRecord[];
}

interface TroubleshootingAdvice {
  suggestedActions: Action[];
  confidence: number;
  requiresHumanReview: boolean;
}
```

### Deliverables
- 5 working surface adapters (Tier 1)
- 4 working AI modules
- Integration tests for each adapter
- Integration tests for each AI module
- Model abstraction layer for SLM migration

---

## Phase 4: Integration & MVP

**Goal:** Wire everything together, build API gateway, and deliver MVP.

**Parallelization:** Limited (integration work requires coordination)

### Tasks

| Task | Description | Dependencies |
|------|-------------|--------------|
| 4.1 | Implement `api-gateway` | Phase 3 complete |
| 4.2 | End-to-end integration | 4.1 complete |
| 4.3 | Multi-tenant testing | 4.2 complete |
| 4.4 | Performance testing | 4.2 complete |
| 4.5 | Security review | 4.2 complete |
| 4.6 | Documentation | 4.2 complete |
| 4.7 | Deployment to staging | 4.3-4.6 complete |
| 4.8 | UAT with Kyanos | 4.7 complete |
| 4.9 | UAT with GLU | 4.7 complete |
| 4.10 | Production deployment | 4.8, 4.9 complete |

### API Gateway Implementation

**Endpoints:**
```
POST   /v1/studies              # Submit manifest
GET    /v1/studies/:id          # Get study status
GET    /v1/studies/:id/results  # Get study results
DELETE /v1/studies/:id          # Cancel study
POST   /v1/studies/:id/pause    # Pause study
POST   /v1/studies/:id/resume   # Resume study
GET    /v1/health               # Health check
GET    /v1/costs/:studyId       # Get study costs
```

**Middleware Stack:**
1. Rate limiting
2. Authentication (API key)
3. Tenant identification
4. Request logging
5. Error handling

### MVP Acceptance Criteria

| Criterion | Requirement |
|-----------|-------------|
| Study execution | 50 queries × 5 surfaces × 3 locations completes |
| Completion rate | >95% of cells succeed |
| Restartability | Interrupted study resumes correctly |
| Evidence capture | Screenshots and metadata collected |
| Cost tracking | Costs attributed to study |
| Notifications | Slack alerts on completion/failure |
| API | All endpoints functional |
| Multi-tenant | Two tenants isolated correctly |

### Deliverables
- Working API gateway
- End-to-end tested system
- Staging deployment
- Production deployment
- Tenant onboarding documentation
- API documentation
- Runbook for operations

---

## Milestone Schedule

| Phase | Milestone | Exit Gate |
|-------|-----------|-----------|
| 0 | Foundation complete | CI passes, core tests pass |
| 1 | Infrastructure complete | All 6 modules tested |
| 2 | Execution engine complete | Full pipeline integration test passes |
| 3 | Surfaces & AI complete | All Tier 1 adapters tested |
| 4 | MVP complete | Acceptance criteria met |

---

## Phase Gate Procedures

Each phase must complete the following gate procedure before the next phase begins:

### 1. Acceptance Testing
- Run all unit tests for modules developed in the phase
- Run all integration tests for module interactions
- Verify all exit criteria from the phase specification
- Document any known issues or limitations

### 2. Regression Testing
- Run full regression test suite for ALL modules from previous phases
- No regressions allowed—all previously passing tests must still pass
- If regressions found, fix before proceeding

### 3. Code Quality Gate
```bash
# All of these must pass before proceeding
pnpm lint                    # No lint errors
pnpm typecheck               # No type errors
pnpm test                    # All tests pass
pnpm test:regression         # All regression tests pass
```

### 4. Commit and Push
```bash
# After all tests pass
git add .
git commit -m "Phase N complete: [summary of deliverables]"
git push origin main
git tag phase-N-complete
git push origin phase-N-complete
```

### 5. Phase Gate Checklist

| Check | Command/Action | Must Pass |
|-------|----------------|-----------|
| Lint | `pnpm lint` | ✓ |
| Type check | `pnpm typecheck` | ✓ |
| Unit tests | `pnpm test:unit` | ✓ |
| Integration tests | `pnpm test:integration` | ✓ |
| Regression tests | `pnpm test:regression` | ✓ |
| Coverage threshold | `pnpm test:coverage` | ✓ (>80%) |
| Git status clean | `git status` | No uncommitted changes |
| Pushed to remote | `git push` | ✓ |
| Tagged | `git tag phase-N-complete` | ✓ |

### 6. Phase Gate Sign-off
Before proceeding to next phase, confirm:
- [ ] All acceptance criteria met
- [ ] All regression tests pass
- [ ] Code committed and pushed
- [ ] Phase tagged in git
- [ ] Documentation updated
- [ ] Known issues documented

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Surface adapter breaks due to UI change | AI troubleshooter suggests fixes, alert operator |
| Proxy provider rate limits | Multi-provider support, automatic failover |
| Claude API costs too high | SLM migration path designed in |
| Study misses deadline | Early warning at 50%, auto-scale at 75% |
| Cross-tenant data leak | Row-level security, tenant ID on all queries, audit logging |

---

## Parallel Work Guidelines

### Within Phase
- Modules in same parallel group can be developed simultaneously
- Each module lives in its own directory
- No direct imports between parallel modules during development
- Integration happens after both modules complete

### Branch Strategy
```
main
├── feature/phase-0-foundation
├── feature/phase-1-session-pool      (parallel group A)
├── feature/phase-1-proxy-manager     (parallel group A)
├── feature/phase-1-account-manager   (parallel group A)
├── feature/phase-1-cost-tracker      (parallel group B)
├── feature/phase-1-notification-hub  (parallel group B)
├── feature/phase-1-audit-logger      (parallel group B)
├── integration/phase-1               (after all complete)
└── ...
```

### Code Review
- Each module PR reviewed before merge
- Integration PRs reviewed by multiple module owners
- Main branch always deployable

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-16 | Claude Code | Initial implementation plan |
