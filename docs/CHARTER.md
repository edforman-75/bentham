# Bentham System Charter

**Note:** The authoritative charter is now at `/CHARTER.md` in the repository root.

This document is retained for historical reference. See `/CHARTER.md` for current scope definition.

---

## Summary of v2.0 Changes (2026-01-24)

Bentham's scope has been clarified and narrowed:

**Bentham IS:**
- Prompt execution engine
- Response capture system
- Cost tracker
- Evidence collector

**Bentham is NOT:**
- Analysis platform
- Reporting tool
- Visualization system
- Insight generator

All analysis and reporting functionality belongs to **each tenant** (not Bentham).

---

## Historical Charter (v1.x)

The content below represents the original charter from v1.0-1.1. Some principles remain valid (manifest-driven execution, tenant isolation, evidence collection) while others (AI advisor integration, response scoring) have been moved out of scope.

[Original v1.1 content preserved below for reference]

---

## Mission (v1.x)

Bentham is a multi-tenant, manifest-driven AI extraction service that reliably executes studies across AI surfaces, geographic locations, and query sets. It provides deterministic, restartable, self-healing execution with human escalation when needed.

## Name Origin

Named after Jeremy Bentham (1748-1832), the philosopher who designed the Panopticon—a circular prison where a single guard in a central tower could potentially observe any prisoner at any time. The prisoners, arranged around the perimeter, could not see into the tower to know whether the guard was watching them at any given moment. This uncertainty—the mere possibility of being observed—caused prisoners to regulate their own behavior constantly, as if always watched.

Bentham (the service) captures AI systems in their natural state. Like the unseen observer, we query AI surfaces without revealing that we are conducting systematic research, allowing us to see how these systems actually behave rather than how they might perform if they knew they were being evaluated.

---

## Core Principles (v1.x - Still Valid)

### P1: Manifest-Driven Execution
Every study is defined by a declarative manifest that specifies exactly what needs to happen and what "done" means. The system executes against the manifest, not against implicit goals.

### P2: Separation of Execution and Validation
The executor cannot self-attest completion. A separate validator checks results against manifest criteria. Only the orchestrator can declare a study complete, and only after the validator approves.

### P3: Deterministic by Default
The production system is deterministic code, not an AI agent making judgments. AI is used as an advisor (not executor) and for specific modules (query generation, response scoring) with validated outputs.

**Note (v2.0):** Response scoring has been moved to tenant repos. Bentham no longer uses AI for analysis.

### P4: Self-Healing with Transparency
The system attempts automatic recovery AND notifies humans of problems and actions taken. It doesn't stop and wait for permission—it acts and informs.

### P5: Parallel Until Dependencies
Jobs run independently until they hit a dependency gate. Failed cells don't block the study; they're logged and summarized.

### P6: Graceful Degradation
Escalation tiers: Auto-retry → Alternative strategy → Human alert → Block only if dependency required.

### P7: Tenant Isolation
Strict data isolation between tenants. Shared infrastructure (proxies, compute) but separate data stores. No cross-tenant visibility at any layer.

### P8: Judicial-Grade Evidence (When Required)
Legal hold studies get full evidentiary package: SHA-256 hashes, RFC 3161 timestamps, S3 Object Lock (WORM), complete audit trail.

### P9: Cost Transparency
Track all costs per study: proxy bandwidth, API calls, compute, storage, accounts, third-party services. Enable pass-through billing.

### P10: Completion Commitments
Manifests specify delivery deadlines. System monitors progress against commitments and escalates when at risk.

### P11: Resilience Through Provider Abstraction
Execution is provider-agnostic. The system can failover from in-house execution to outsourced providers (Apify, Browserless, Bright Data, etc.) when anti-bot defenses, rate limits, or infrastructure issues make in-house execution unreliable. Maintain active accounts with backup providers. Test failover quarterly.

---

## Guardrails (v1.x - Updated in v2.0)

### What Bentham Does
- Executes studies defined by external manifests
- Queries AI APIs, web chatbot surfaces, and search engines
- Captures responses with configurable evidence levels
- ~~Validates results against manifest criteria~~ (Mechanical validation only in v2.0)
- Tracks costs and completion progress
- Notifies tenants of status, problems, and completions

### What Bentham Does NOT Do
- Create manifests (tenants create these externally)
- **Generate reports or analyses** (tenants consume raw data and create their own reports)
- **Build visualizations or dashboards** for tenant end-users
- Make subjective judgments about study completion
- Access data across tenant boundaries
- Push to production without validation
- Self-attest completion of any work item
- **Score or rate responses** (moved to tenant repos in v2.0)
- **Compare results across surfaces** (moved to tenant repos in v2.0)
- **Generate insights or recommendations** (moved to tenant repos in v2.0)

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-16 | Claude Code | Initial charter from interview |
| 1.1 | 2025-01-21 | Claude Code | Added P11: Resilience Through Provider Abstraction |
| 2.0 | 2026-01-24 | Claude Code | **Major scope reduction**: Bentham is execution + capture only. Analysis, scoring, and reporting moved to tenant repos. See /CHARTER.md for current scope. |
