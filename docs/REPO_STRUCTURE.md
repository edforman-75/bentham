# Bentham Repository Structure

## Clean Tree Philosophy

**Principles:**
1. Every directory has a clear, single purpose
2. Module boundaries are physical (separate directories)
3. No circular dependencies
4. Dependencies flow downward (leaf modules at bottom)
5. Shared code lives in explicit shared packages
6. Tests live alongside the code they test

---

## Root Structure

```
bentham/
├── .github/                    # GitHub workflows and templates
│   ├── workflows/
│   │   ├── ci.yml             # Continuous integration
│   │   ├── release.yml        # Release automation
│   │   └── security.yml       # Security scanning
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
│
├── docs/                       # Project documentation
│   ├── CHARTER.md             # System charter and guardrails
│   ├── ARCHITECTURE.md        # System architecture
│   ├── MODULES.md             # Module breakdown
│   ├── IMPLEMENTATION_PLAN.md # Phased implementation
│   ├── TESTING_STRATEGY.md    # Testing approach
│   ├── COST_ANALYSIS.md       # Build vs buy analysis
│   ├── REPO_STRUCTURE.md      # This document
│   └── api/                   # API documentation
│       └── openapi.yaml       # OpenAPI spec
│
├── packages/                   # All modules (monorepo packages)
│   ├── core/                  # Shared types and utilities
│   ├── database/              # Schema and repositories
│   ├── api-gateway/           # REST API
│   ├── orchestrator/          # Study lifecycle
│   ├── executor/              # Job execution
│   ├── validator/             # Quality gates
│   ├── ai-advisor/            # AI modules
│   ├── evidence-collector/    # Evidence capture
│   ├── surface-adapters/      # AI surface implementations
│   └── infrastructure/        # Supporting services
│       ├── session-pool/
│       ├── proxy-manager/
│       ├── account-manager/
│       ├── cost-tracker/
│       ├── notification-hub/
│       └── audit-logger/
│
├── apps/                       # Deployable applications
│   ├── api/                   # API server (uses api-gateway)
│   ├── worker/                # Executor workers
│   └── scheduler/             # Deadline monitoring, escalation
│
├── e2e/                        # End-to-end tests
│   ├── scenarios/
│   └── fixtures/
│
├── scripts/                    # Development and deployment scripts
│   ├── setup-dev.sh
│   ├── run-tests.sh
│   └── deploy.sh
│
├── docker/                     # Docker configurations
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   └── docker-compose.yml     # Local development
│
├── terraform/                  # Infrastructure as code
│   ├── modules/
│   ├── environments/
│   │   ├── staging/
│   │   └── production/
│   └── main.tf
│
├── .env.example                # Environment variable template
├── .gitignore
├── .prettierrc
├── .eslintrc.js
├── tsconfig.json               # Base TypeScript config
├── tsconfig.build.json         # Build-specific config
├── pnpm-workspace.yaml         # Monorepo workspace config
├── package.json                # Root package.json
├── turbo.json                  # Turborepo config
└── README.md                   # Project overview
```

---

## Package Structure (Standard)

Each package follows this structure:

```
packages/<module>/
├── src/
│   ├── index.ts               # Public API exports
│   ├── types.ts               # Type definitions
│   ├── <feature>/             # Feature-specific code
│   │   ├── index.ts
│   │   └── <file>.ts
│   └── __tests__/             # Tests
│       ├── unit/
│       │   └── <file>.test.ts
│       └── integration/
│           └── <file>.integration.test.ts
├── package.json               # Module dependencies
├── tsconfig.json              # Extends root config
├── vitest.config.ts           # Test configuration
└── README.md                  # Module documentation
```

---

## Detailed Package Structure

### `packages/core`

```
packages/core/
├── src/
│   ├── index.ts               # Export all public APIs
│   ├── types/
│   │   ├── index.ts
│   │   ├── study.ts           # Study, Manifest, Job types
│   │   ├── tenant.ts          # Tenant, User, Role types
│   │   ├── result.ts          # JobResult, Evidence types
│   │   └── cost.ts            # CostRecord, CostEstimate types
│   ├── utils/
│   │   ├── index.ts
│   │   ├── id.ts              # ID generation
│   │   ├── hash.ts            # Content hashing
│   │   ├── validation.ts      # Schema validation
│   │   └── errors.ts          # Error utilities
│   ├── constants/
│   │   ├── index.ts
│   │   ├── surfaces.ts        # Surface definitions
│   │   ├── locations.ts       # Location definitions
│   │   └── errors.ts          # Error codes
│   └── __tests__/
│       └── unit/
│           ├── id.test.ts
│           ├── hash.test.ts
│           └── validation.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

### `packages/orchestrator`

```
packages/orchestrator/
├── src/
│   ├── index.ts               # Public API
│   ├── types.ts               # Internal types
│   ├── study/
│   │   ├── index.ts
│   │   ├── create.ts          # createStudy
│   │   ├── lifecycle.ts       # State transitions
│   │   └── cancel.ts          # cancelStudy
│   ├── checkpoint/
│   │   ├── index.ts
│   │   ├── save.ts            # saveCheckpoint
│   │   └── load.ts            # loadCheckpoint
│   ├── progress/
│   │   ├── index.ts
│   │   ├── track.ts           # Progress tracking
│   │   └── deadline.ts        # Deadline monitoring
│   ├── escalation/
│   │   ├── index.ts
│   │   └── handlers.ts        # Escalation logic
│   └── __tests__/
│       ├── unit/
│       │   ├── lifecycle.test.ts
│       │   └── checkpoint.test.ts
│       └── integration/
│           └── study-lifecycle.integration.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

### `packages/surface-adapters`

```
packages/surface-adapters/
├── src/
│   ├── index.ts               # Adapter registry
│   ├── types.ts               # SurfaceAdapter interface
│   ├── base/
│   │   ├── index.ts
│   │   ├── api-adapter.ts     # Base class for API surfaces
│   │   └── web-adapter.ts     # Base class for web surfaces
│   ├── api-surfaces/
│   │   ├── index.ts
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   ├── google-ai.ts
│   │   └── perplexity-api.ts
│   ├── web-chatbots/
│   │   ├── index.ts
│   │   ├── chatgpt-web.ts
│   │   ├── claude-web.ts
│   │   ├── gemini-web.ts
│   │   ├── perplexity-web.ts
│   │   ├── meta-ai.ts
│   │   └── grok.ts
│   ├── search-surfaces/
│   │   ├── index.ts
│   │   ├── google-search.ts
│   │   └── bing-search.ts
│   └── __tests__/
│       ├── unit/
│       │   └── registry.test.ts
│       └── integration/
│           ├── openai.integration.test.ts
│           └── chatgpt-web.integration.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

### `packages/infrastructure/session-pool`

```
packages/infrastructure/session-pool/
├── src/
│   ├── index.ts               # Public API
│   ├── types.ts               # Session types
│   ├── pool/
│   │   ├── index.ts
│   │   ├── manager.ts         # Pool management
│   │   └── health.ts          # Health tracking
│   ├── session/
│   │   ├── index.ts
│   │   ├── create.ts          # Session creation
│   │   ├── lifecycle.ts       # Warm, cool, expire
│   │   └── browser.ts         # Playwright integration
│   └── __tests__/
│       ├── unit/
│       │   ├── manager.test.ts
│       │   └── health.test.ts
│       └── integration/
│           └── pool.integration.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Dependency Rules

### Allowed Dependencies

```
apps/* → packages/*           ✓ Apps can import any package
packages/api-gateway → packages/core, packages/orchestrator  ✓
packages/orchestrator → packages/core, packages/database     ✓
packages/executor → packages/core, packages/surface-adapters ✓
packages/core → (nothing)     ✓ Leaf module
```

### Forbidden Dependencies

```
packages/core → packages/*    ✗ Core cannot import other packages
packages/executor → packages/orchestrator  ✗ No circular deps
packages/infrastructure/* → packages/orchestrator  ✗ Infrastructure is lower level
```

### Enforcement

Use ESLint rules to enforce dependency boundaries:

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          {
            target: './packages/core',
            from: './packages',
            except: ['./core'],
          },
        ],
      },
    ],
  },
};
```

---

## Configuration Files

### Root `package.json`

```json
{
  "name": "bentham",
  "private": true,
  "workspaces": ["packages/*", "packages/infrastructure/*", "apps/*"],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "dev": "turbo run dev"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "prettier": "^3.0.0",
    "eslint": "^8.0.0"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
  - 'packages/infrastructure/*'
  - 'apps/*'
  - 'e2e'
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "test:unit": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "test:integration": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### Base `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

---

## Naming Conventions

### Files

| Type | Convention | Example |
|------|------------|---------|
| Module entry | `index.ts` | `src/index.ts` |
| Types | `types.ts` or `<name>.types.ts` | `study.types.ts` |
| Constants | `constants.ts` or `<name>.constants.ts` | `surfaces.constants.ts` |
| Utilities | `<name>.ts` | `hash.ts` |
| Tests | `<name>.test.ts` | `hash.test.ts` |
| Integration tests | `<name>.integration.test.ts` | `pool.integration.test.ts` |

### Exports

- Use named exports (not default exports)
- Re-export from `index.ts` for public API
- Keep internal code private (don't export)

```typescript
// Good
export { createStudy, getStudyStatus } from './study';

// Bad
export default createStudy;
```

### Functions

- Use camelCase: `createStudy`, `validateManifest`
- Prefix with verb: `create`, `get`, `update`, `delete`, `validate`, `check`

### Types

- Use PascalCase: `Study`, `Manifest`, `JobResult`
- Suffix interfaces with purpose if needed: `StudyCreateInput`, `StudyUpdateInput`

---

## Git Workflow

### Branch Naming

```
main                           # Production-ready
├── feature/<module>-<desc>   # Feature branches
├── fix/<module>-<desc>       # Bug fixes
├── integration/<phase>       # Integration work
└── release/<version>         # Release preparation
```

**Examples:**
- `feature/executor-retry-logic`
- `fix/orchestrator-checkpoint-race`
- `integration/phase-1`
- `release/0.1.0`

### Commit Messages

Follow Conventional Commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
```
feat(orchestrator): add checkpoint save/restore

Implements saveCheckpoint and loadCheckpoint functions for
study state persistence.

Closes #123
```

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-16 | Claude Code | Initial repo structure |
