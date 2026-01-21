# Bentham

Multi-tenant AI extraction service for systematically querying AI chatbots and search engines across geographic locations.

Named after Jeremy Bentham (1748-1832), the philosopher who designed the Panopticon—a circular prison where a single guard could potentially observe any prisoner, but prisoners could never know if they were being watched at any given moment. This uncertainty caused constant self-regulation. Bentham (the service) captures AI systems in their natural state, querying them without revealing systematic research is underway.

## Overview

Bentham is a headless execution engine that:

- Receives **study manifests** from tenant systems
- Executes queries across **AI surfaces** (ChatGPT, Perplexity, Google AI, etc.)
- Captures responses from multiple **geographic locations**
- Validates results against **completion criteria**
- Returns structured results with optional **evidence** (screenshots, archives)

## Key Principles

- **Manifest-driven:** Every study is defined declaratively
- **Separation of execution and validation:** Executor cannot self-attest completion
- **Deterministic:** Production system is code, not AI making judgments
- **Self-healing with transparency:** Automatic recovery with human notification
- **Tenant isolation:** Strict data separation between tenants

## Documentation

- **[Operator Quickstart](OPERATOR_QUICKSTART.md)** - Start here! Setup guide for running Bentham
- [CLAUDE.md](CLAUDE.md) - Context for AI coding assistants
- [Charter](docs/CHARTER.md) - System charter and guardrails
- [Architecture](docs/ARCHITECTURE.md) - System design
- [Modules](docs/MODULES.md) - Module breakdown with isolation boundaries
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) - Phased implementation
- [Testing Strategy](docs/TESTING_STRATEGY.md) - Testing approach
- [Cost Analysis](docs/COST_ANALYSIS.md) - Build vs buy analysis
- [Repo Structure](docs/REPO_STRUCTURE.md) - Directory structure and conventions

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker (for local development)
- PostgreSQL 15+
- Redis 7+

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd bentham

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration

# Start local services
docker-compose up -d

# Run database migrations
pnpm --filter @bentham/database migrate

# Run tests
pnpm test

# Start development
pnpm dev
```

## Project Structure

```
bentham/
├── docs/                    # Documentation
├── packages/                # Monorepo packages
│   ├── core/               # Shared types and utilities
│   ├── database/           # Schema and repositories
│   ├── api-gateway/        # REST API
│   ├── orchestrator/       # Study lifecycle
│   ├── executor/           # Job execution
│   ├── validator/          # Quality gates
│   ├── ai-advisor/         # AI modules
│   ├── evidence-collector/ # Evidence capture
│   ├── surface-adapters/   # AI surface implementations
│   └── infrastructure/     # Supporting services
├── apps/                    # Deployable applications
├── e2e/                     # End-to-end tests
└── terraform/               # Infrastructure as code
```

## Development

### Running Tests

```bash
# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration

# Specific package
pnpm --filter @bentham/orchestrator test
```

### Code Quality

```bash
# Lint
pnpm lint

# Format
pnpm format

# Type check
pnpm typecheck
```

## License

Proprietary - All rights reserved

## Version

0.0.1 (Pre-release)
