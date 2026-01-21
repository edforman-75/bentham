# Bentham

**Multi-tenant AI extraction service for systematically querying AI chatbots and search engines across geographic locations.**

Named after Jeremy Bentham (1748-1832), the philosopher who designed the Panopticon — a structure where an observer could watch without being seen. Bentham captures AI systems in their natural state, querying them without revealing that systematic research is underway.

---

## Quick Links

| Document | Description |
|----------|-------------|
| **[Operator Quickstart](OPERATOR_QUICKSTART.md)** | Start here! Setup guide for running Bentham |
| **[Overview](OVERVIEW.md)** | System overview for developers and AI assistants |
| **[Charter](docs/CHARTER.md)** | Design principles, guardrails, and governance |

---

## Documentation Index

### Getting Started

| Document | Description |
|----------|-------------|
| [Operator Quickstart](OPERATOR_QUICKSTART.md) | Step-by-step setup: install, configure `.env`, browser setup, run |
| [Overview](OVERVIEW.md) | Architecture overview, key concepts, repository structure |

### Architecture & Design

| Document | Description |
|----------|-------------|
| [Charter](docs/CHARTER.md) | Core principles, guardrails, AI usage boundaries, roles |
| [Architecture](docs/ARCHITECTURE.md) | Full system design with diagrams and component details |
| [Modules](docs/MODULES.md) | Module breakdown with isolation boundaries and interfaces |
| [Repo Structure](docs/REPO_STRUCTURE.md) | Directory layout and conventions |

### Development

| Document | Description |
|----------|-------------|
| [Build Guide](docs/BUILD_GUIDE.md) | Build process, tools (Turbo, tsup), CI/CD pipeline |
| [Testing Guide](docs/TESTING_GUIDE.md) | Running tests, phase gates, debugging, coverage |
| [Testing Strategy](docs/TESTING_STRATEGY.md) | Testing philosophy, pyramid, patterns |
| [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) | Phased implementation roadmap |

### Operations

| Document | Description |
|----------|-------------|
| [Operations Runbook](docs/OPERATIONS_RUNBOOK.md) | Monitoring, incidents, maintenance, disaster recovery |
| [Tenant Onboarding](docs/TENANT_ONBOARDING.md) | Adding new tenants to the platform |
| [API Reference](docs/API_REFERENCE.md) | REST API endpoints and usage |
| [Surface Defaults](docs/SURFACE_DEFAULTS.md) | Default configurations for AI surfaces |

### Analysis

| Document | Description |
|----------|-------------|
| [Cost Analysis](docs/COST_ANALYSIS.md) | Build vs buy analysis, cost projections |

---

## What Bentham Does

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT SYSTEMS (GLU, Kyanos)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ Study Manifests
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                          BENTHAM                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ API Gateway → Orchestrator → Executor → Surface Adapters  │ │
│  │                     ↓                                      │ │
│  │               Validator (QA Gates)                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                             │                                   │
│  Surfaces: ChatGPT, Perplexity, Claude, Google, Amazon Rufus   │
└────────────────────────────┬────────────────────────────────────┘
                             │ Structured Results + Evidence
                             ▼
                    Back to Tenant Systems
```

**Capabilities:**
- Query AI chatbots (ChatGPT, Claude, Perplexity, Grok, Meta AI, Copilot)
- Query search engines (Google, Bing with AI features)
- Query e-commerce (Amazon, Amazon Rufus, Zappos)
- Execute from multiple geographic locations via proxies
- Capture evidence (screenshots, HTML archives, timestamps)
- Track brand visibility and positioning in AI answers

---

## Repository Structure

```
bentham/
├── OPERATOR_QUICKSTART.md   # Start here
├── OVERVIEW.md              # System overview
├── README.md                # This file
│
├── docs/                    # Documentation
│   ├── CHARTER.md          # Design principles
│   ├── ARCHITECTURE.md     # System design
│   ├── MODULES.md          # Module breakdown
│   ├── BUILD_GUIDE.md      # Build process
│   ├── TESTING_GUIDE.md    # Testing guide
│   └── ...
│
├── packages/                # Monorepo packages
│   ├── core/               # Shared types, utilities
│   ├── surface-adapters/   # AI surface implementations
│   ├── orchestrator/       # Study lifecycle
│   ├── executor/           # Job execution
│   ├── validator/          # Quality gates
│   └── ...                 # 12 more packages
│
├── apps/                    # Deployable applications
│   ├── api/                # REST API server
│   ├── scheduler/          # Cron jobs
│   └── worker/             # Job processor
│
├── scripts/                 # CLI tools and utilities
├── studies/                 # Study results (gitignored)
├── e2e/                     # End-to-end tests
├── terraform/               # Infrastructure as code
├── k8s/                     # Kubernetes manifests
└── docker/                  # Docker configurations
```

---

## Quick Start

```bash
# Clone
git clone git@github.com:edforman-75/bentham.git
cd bentham

# Install
pnpm install

# Configure (REQUIRED)
cp .env.example .env
# Edit .env with your API keys and database credentials

# Build
pnpm build

# Test
pnpm test

# Run
pnpm dev
```

**For web chatbot surfaces**, you must also set up Chrome with debug port and log into chatbot websites manually. See [Operator Quickstart](OPERATOR_QUICKSTART.md) for details.

---

## Core Principles

From the [Charter](docs/CHARTER.md):

1. **Manifest-Driven** — Studies are defined declaratively
2. **Separation of Execution and Validation** — Executor cannot self-attest completion
3. **Deterministic** — Production code, not AI making judgments
4. **Self-Healing with Transparency** — Auto-recovery with human notification
5. **Tenant Isolation** — Strict data separation
6. **Judicial-Grade Evidence** — Legal hold studies get cryptographic timestamps
7. **Cost Transparency** — Track all costs per study
8. **Completion Commitments** — Monitor against deadlines

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ |
| Package Manager | pnpm 8+ |
| Language | TypeScript 5.3+ |
| Build | Turbo, tsup |
| Testing | Vitest |
| Database | PostgreSQL 15+ |
| Cache/Queue | Redis 7+ |
| Browser Automation | Playwright, CDP |
| Infrastructure | Terraform, Kubernetes |

---

## License

Proprietary — All rights reserved

---

## Version

0.0.1 (Pre-release)
