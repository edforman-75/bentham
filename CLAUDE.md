# Bentham - AI Assistant Context

This file provides context for AI coding assistants (Claude Code, Cursor, etc.) working in this repository.

## What is Bentham?

Bentham is a **multi-tenant AI extraction service** for systematically querying AI chatbots and search engines across geographic locations. Named after Jeremy Bentham's Panopticon concept — it observes AI systems in their natural state without revealing that systematic research is underway.

## Purpose

Bentham enables GLU and other tenant systems to:
- Monitor how AI surfaces (ChatGPT, Perplexity, Google AI, etc.) respond to queries
- Track brand visibility and positioning in AI-generated answers
- Capture evidence (screenshots, HTML archives) with cryptographic timestamps
- Execute studies across multiple geographic locations via proxy infrastructure

## Architecture Overview

```
Tenant Systems (GLU, Kyanos)
        │
        ▼
┌─────────────────────────────────────────────┐
│              BENTHAM                        │
│  ┌─────────────────────────────────────┐   │
│  │          API Gateway                 │   │
│  │  (validation, auth, rate limiting)   │   │
│  └─────────────────────────────────────┘   │
│                    │                        │
│  ┌─────────────────────────────────────┐   │
│  │          Orchestrator                │   │
│  │  (study lifecycle, job scheduling)   │   │
│  └─────────────────────────────────────┘   │
│           │              │                  │
│  ┌────────┴───┐   ┌──────┴──────┐         │
│  │  Executor  │   │  Validator  │          │
│  │  (workers) │   │  (QA gates) │          │
│  └────────────┘   └─────────────┘          │
│           │                                 │
│  ┌─────────────────────────────────────┐   │
│  │       Surface Adapters               │   │
│  │  (ChatGPT, Perplexity, Google, etc.) │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Repository Structure

```
bentham/
├── packages/                 # Monorepo packages
│   ├── core/                # Shared types, utilities, errors
│   ├── database/            # Prisma schema, repositories
│   ├── api-gateway/         # REST API entry point
│   ├── orchestrator/        # Study lifecycle management
│   ├── executor/            # Job execution workers
│   ├── validator/           # Quality gates, completion checks
│   ├── ai-advisor/          # AI-powered modules (query gen, scoring)
│   ├── evidence-collector/  # Screenshots, archives, timestamps
│   ├── surface-adapters/    # AI surface implementations
│   ├── proxy-manager/       # Geographic proxy distribution
│   ├── session-pool/        # Browser session management
│   ├── credential-vault/    # Secure credential storage
│   ├── account-manager/     # Tenant/API key management
│   ├── cost-tracker/        # Usage and cost tracking
│   ├── audit-logger/        # Audit trail logging
│   ├── notification-hub/    # Alerts and notifications
│   └── infrastructure/      # Supporting services
├── apps/                    # Deployable applications
│   ├── api/                # API server
│   ├── scheduler/          # Cron jobs
│   └── worker/             # Job processor
├── scripts/                # CLI tools and utilities
├── studies/                # Study results and data
├── docs/                   # Documentation
├── e2e/                    # End-to-end tests
├── terraform/              # Infrastructure as code
├── k8s/                    # Kubernetes manifests
└── docker/                 # Docker configurations
```

## Key Packages

### @bentham/surface-adapters
The most important package for AI interaction. Contains adapters for:
- **API Surfaces**: OpenAI, Anthropic, Google AI, Perplexity API, xAI
- **Web Chatbots**: ChatGPT, Claude, Perplexity, Grok, Meta AI, Copilot
- **Search Engines**: Google Search, Bing Search
- **E-commerce**: Amazon, Amazon Rufus, Zappos

Web adapters use **Chrome DevTools Protocol (CDP)** to interact with authenticated browser sessions.

### @bentham/orchestrator
Manages study lifecycle:
- Parses manifests into job graphs
- Tracks dependencies and progress
- Handles checkpointing for restartability
- Enforces completion criteria

### @bentham/executor
Runs individual jobs:
- Pulls from job queue
- Dispatches to surface adapters
- Handles retries with exponential backoff
- Reports results to orchestrator

### @bentham/validator
Independent completion authority:
- Validates job outputs against quality gates
- Verifies evidence capture
- Approves/rejects study completion
- Prevents self-attestation (executor can't mark own work complete)

## Key Concepts

### Study Manifest
A declarative specification of what to query:
```typescript
{
  surfaces: ['chatgpt-web', 'perplexity-web'],
  locations: ['us-nyc', 'uk-london'],
  queries: ['best running shoes for beginners'],
  products: [{ name: 'HOKA Bondi 8', brand: 'HOKA' }],
  completionCriteria: { minSuccessRate: 0.8 }
}
```

### Surface Adapters
Abstraction layer for AI services. All adapters implement:
```typescript
interface SurfaceAdapter {
  id: SurfaceId;
  initialize(): Promise<void>;
  executeQuery(query: AdapterQuery): Promise<AdapterResult>;
  cleanup(): Promise<void>;
}
```

### CDP Fallback
When primary adapters fail, the system falls back to Chrome DevTools Protocol to query surfaces via existing authenticated browser tabs. Requires Chrome running with `--remote-debugging-port=9222`.

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start development servers
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm test:unit        # Unit tests only
pnpm lint             # Lint code
pnpm typecheck        # Type checking
```

### Package-specific commands
```bash
pnpm --filter @bentham/surface-adapters test
pnpm --filter @bentham/orchestrator build
```

## Configuration

Environment variables are in `.env` (copy from `.env.example`):
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — Redis connection
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — API surface credentials
- `BRIGHT_DATA_*` — Proxy provider credentials

**Never commit `.env` files** — they contain secrets.

## Testing Surfaces

```bash
# Test all CDP surfaces (requires Chrome with debug port)
npx tsx scripts/test-all-cdp.ts "test query"

# Test specific adapter
pnpm --filter @bentham/surface-adapters test
```

## Key Design Principles

From `docs/CHARTER.md`:

1. **Manifest-driven**: Every study is defined declaratively
2. **Separation of execution and validation**: Executor cannot self-attest completion
3. **Deterministic**: Production system is code, not AI making judgments
4. **Self-healing with transparency**: Automatic recovery with human notification
5. **Tenant isolation**: Strict data separation between tenants
6. **Judicial-grade evidence**: Legal hold studies get SHA-256 hashes, RFC 3161 timestamps, WORM storage
7. **Cost transparency**: Track all costs per study for pass-through billing
8. **Completion commitments**: Monitor progress against manifest-specified deadlines

**AI Usage Boundaries:** AI is used as *advisor* (query generation, scoring) with validated outputs — never as *executor* for completion decisions.

## Important Files

- `packages/surface-adapters/src/index.ts` — Surface adapter exports
- `packages/surface-adapters/src/recovery/cdp-query.ts` — CDP fallback implementation
- `packages/orchestrator/src/study-manager.ts` — Study lifecycle
- `packages/core/src/types.ts` — Core type definitions
- `docs/ARCHITECTURE.md` — Full system architecture
- `docs/MODULES.md` — Module breakdown with isolation boundaries

## Common Tasks

### Adding a new surface adapter
1. Create adapter in `packages/surface-adapters/src/`
2. Implement `SurfaceAdapter` interface
3. Register in adapter registry
4. Add CDP support in `recovery/cdp-query.ts` if web-based
5. Add tests

### Debugging a failed study
1. Check study status via API or database
2. Look at job-level failures in `jobs` table
3. Check surface adapter logs
4. Verify Chrome sessions are authenticated (for web surfaces)

### Running a manual query
```bash
# Via CDP (web surfaces)
npx tsx scripts/test-all-cdp.ts "your query"

# Via API
curl -X POST http://localhost:3000/v1/query \
  -H "Content-Type: application/json" \
  -d '{"surface": "openai-api", "query": "your query"}'
```
