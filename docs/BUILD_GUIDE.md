# Bentham Build Guide

This guide explains how to build Bentham and what each build step does.

---

## Prerequisites

Before building, ensure you have:

- **Node.js 20+** — JavaScript runtime
- **pnpm 8+** — Package manager (faster than npm, strict dependency management)
- **TypeScript 5.3+** — Comes with dev dependencies

---

## Quick Build

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Verify the build
pnpm typecheck
pnpm lint
```

---

## What Each Command Does

### `pnpm install`

Installs all dependencies for the monorepo:

1. Reads `pnpm-workspace.yaml` to find all packages
2. Resolves dependencies across workspace packages
3. Creates symlinks between local packages (e.g., `@bentham/core`)
4. Installs external dependencies from npm registry
5. Creates `pnpm-lock.yaml` lockfile

**Output:** `node_modules/` at root and in each package

---

### `pnpm build`

Compiles TypeScript to JavaScript for all packages:

1. **Turbo** orchestrates the build (parallel where possible)
2. Each package runs its own build script via `tsup`
3. Dependencies are built first (respects `dependsOn` in `turbo.json`)
4. TypeScript compiles to JavaScript (ESM format)
5. Type declarations (`.d.ts`) are generated

**Output:** `dist/` folder in each package containing:
- Compiled JavaScript (`*.js`)
- Source maps (`*.js.map`)
- Type declarations (`*.d.ts`)

**Build Order (via Turbo):**
```
@bentham/core (no deps)
    ↓
@bentham/database (depends on core)
    ↓
@bentham/orchestrator, @bentham/executor, etc. (depend on core, database)
    ↓
@bentham/surface-adapters (depends on core)
    ↓
apps/api, apps/worker (depend on packages)
```

---

### `pnpm typecheck`

Runs TypeScript compiler in check-only mode (no emit):

1. Validates all type annotations
2. Checks cross-package type compatibility
3. Reports type errors without building

**Use this when:** You want to quickly check for type errors without a full build.

---

### `pnpm lint`

Runs ESLint across all packages:

1. Checks code style and patterns
2. Enforces consistent formatting
3. Catches common bugs (unused variables, etc.)

**Configuration:** `.eslintrc.json` at root

---

### `pnpm format`

Runs Prettier to auto-format code:

1. Formats all `.ts`, `.js`, `.json`, `.md` files
2. Applies consistent style (tabs, quotes, line length)

**Configuration:** `.prettierrc` at root

---

### `pnpm format:check`

Checks if code matches Prettier style (without modifying):

1. Reports files that need formatting
2. Used in CI to enforce style

---

### `pnpm dev`

Starts development servers with hot reload:

1. Runs `tsup --watch` on each package
2. Recompiles on file changes
3. Useful for active development

---

### `pnpm clean`

Removes build artifacts:

1. Deletes `dist/` folders in all packages
2. Deletes `node_modules/` at root
3. Clears Turbo cache (`.turbo/`)

**Use this when:** Build is corrupted or you want a fresh start.

---

## Build Tools

### Turbo

**What it is:** Monorepo build orchestrator from Vercel

**What it does:**
- Runs tasks in parallel where possible
- Caches build outputs (skips unchanged packages)
- Respects dependency order

**Configuration:** `turbo.json`

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],  // Build deps first
      "outputs": ["dist/**"]    // Cache these outputs
    },
    "test": {
      "dependsOn": ["build"]    // Tests need build
    }
  }
}
```

---

### tsup

**What it is:** TypeScript bundler (fast, zero-config)

**What it does:**
- Compiles TypeScript to JavaScript
- Generates type declarations
- Bundles for ESM format

**Configuration:** `tsup.config.ts` in each package

```typescript
export default {
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,           // Generate .d.ts files
  clean: true,         // Clean dist/ before build
  sourcemap: true,     // Generate source maps
};
```

---

### Vitest

**What it is:** Test runner (Vite-powered, fast)

**What it does:**
- Runs unit and integration tests
- Supports TypeScript natively
- Watch mode for development

**Configuration:** `vitest.config.ts` at root

---

## CI/CD Build

The CI pipeline runs these steps:

```yaml
steps:
  - name: Install
    run: pnpm install --frozen-lockfile

  - name: Build
    run: pnpm build

  - name: Type Check
    run: pnpm typecheck

  - name: Lint
    run: pnpm lint

  - name: Test
    run: pnpm test

  - name: Regression Tests
    run: pnpm test:regression
```

**`--frozen-lockfile`:** Ensures CI uses exact versions from lockfile (no updates).

---

## Build Phases (Regression Testing)

Bentham uses phased regression testing to validate the build:

### Phase 0: Core Infrastructure
```bash
pnpm test:regression:phase-0
```
Tests: `@bentham/core`, `@bentham/database`

### Phase 1: Supporting Services
```bash
pnpm test:regression:phase-1
```
Tests: Session pool, proxy manager, account manager, cost tracker, notifications, audit logger

### Phase 2: Execution Pipeline
```bash
pnpm test:regression:phase-2
```
Tests: Orchestrator, executor, validator, evidence collector

### Phase 3: AI Integration
```bash
pnpm test:regression:phase-3
```
Tests: Surface adapters, AI advisor

### Full Phase Gate
```bash
pnpm phase-gate
```
Runs: lint → typecheck → test → test:regression (all phases)

---

## Troubleshooting

### "Module not found" errors

```bash
# Clean and reinstall
pnpm clean
pnpm install
pnpm build
```

### Build cache issues

```bash
# Clear Turbo cache
rm -rf .turbo
pnpm build
```

### Type errors after dependency update

```bash
# Regenerate type declarations
pnpm build --force
```

### Outdated lockfile

```bash
# Update lockfile
pnpm install
# Commit the updated pnpm-lock.yaml
```

---

## Package Structure

Each package follows this structure:

```
packages/example/
├── src/
│   ├── index.ts          # Main entry point (exports)
│   ├── types.ts          # Type definitions
│   ├── utils.ts          # Utility functions
│   └── __tests__/        # Test files
│       ├── unit/         # Unit tests
│       └── integration/  # Integration tests
├── dist/                 # Build output (gitignored)
│   ├── index.js
│   ├── index.js.map
│   └── index.d.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## Deployment Builds

### API Server (Vercel)

```bash
# Build API for Vercel
cd apps/api
pnpm build
```

Output: `api/index.js` (Vercel serverless function)

### Worker (Docker)

```bash
# Build worker container
docker build -f docker/worker.Dockerfile -t bentham-worker .
```

### Full Stack (Kubernetes)

```bash
# Build all images
pnpm build
docker-compose build
```

---

## Version Information

- **Node.js:** 20.0.0+
- **pnpm:** 8.12.0+
- **TypeScript:** 5.3.0+
- **Turbo:** 2.0.0+
- **tsup:** 8.0.1+
- **Vitest:** 1.0.0+
