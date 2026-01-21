# Bentham System Charter

## Mission

Bentham is a multi-tenant, manifest-driven AI extraction service that reliably executes studies across AI surfaces, geographic locations, and query sets. It provides deterministic, restartable, self-healing execution with human escalation when needed.

## Name Origin

Named after Jeremy Bentham (1748-1832), the philosopher who designed the Panopticon—a circular prison where a single guard in a central tower could potentially observe any prisoner at any time. The prisoners, arranged around the perimeter, could not see into the tower to know whether the guard was watching them at any given moment. This uncertainty—the mere possibility of being observed—caused prisoners to regulate their own behavior constantly, as if always watched.

Bentham (the service) captures AI systems in their natural state. Like the unseen observer, we query AI surfaces without revealing that we are conducting systematic research, allowing us to see how these systems actually behave rather than how they might perform if they knew they were being evaluated.

---

## Core Principles

### P1: Manifest-Driven Execution
Every study is defined by a declarative manifest that specifies exactly what needs to happen and what "done" means. The system executes against the manifest, not against implicit goals.

### P2: Separation of Execution and Validation
The executor cannot self-attest completion. A separate validator checks results against manifest criteria. Only the orchestrator can declare a study complete, and only after the validator approves.

### P3: Deterministic by Default
The production system is deterministic code, not an AI agent making judgments. AI is used as an advisor (not executor) and for specific modules (query generation, response scoring) with validated outputs.

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

## Guardrails

### What Bentham Does
- Executes studies defined by external manifests
- Queries AI APIs, web chatbot surfaces, and search engines
- Captures responses with configurable evidence levels
- Validates results against manifest criteria
- Tracks costs and completion progress
- Notifies tenants of status, problems, and completions

### What Bentham Does NOT Do
- Create manifests (tenants create these externally)
- Generate reports or analyses (tenants consume raw data and create their own reports)
- Build visualizations or dashboards for tenant end-users
- Make subjective judgments about study completion
- Access data across tenant boundaries
- Push to production without validation
- Self-attest completion of any work item

**Data Boundary:** Bentham collects and makes data available. Tenants are responsible for:
- Consuming results via API or export
- Generating reports and analyses for their clients
- Building visualizations and dashboards
- Deriving insights and recommendations

### AI Usage Boundaries

| Use Case | AI Role | Guardrails |
|----------|---------|------------|
| Query generation | Generator | Outputs validated by schema |
| Response validation | Classifier | Binary output, logged |
| Response scoring | Analyzer | Structured output, auditable |
| Troubleshooting | Advisor | Suggestions only, system validates before acting |
| Study completion | PROHIBITED | Only validator/orchestrator can determine completion |

### Security Guardrails
- No cross-tenant data access
- All actions audit logged
- 7-year regulatory retention for audit logs
- Encryption at rest and in transit
- Role-based access control at all layers

---

## Roles and Access Control

### Platform Level

| Role | Capabilities |
|------|--------------|
| **System Admin** | Superuser. All access, manages operators, system policies, sensitive config |
| **System Operator** | Day-to-day ops: monitoring, incidents, proxy management, tenant onboarding. No tenant data access |

### Tenant Level

| Role | Capabilities |
|------|--------------|
| **Tenant Admin** | Manages org users, studies, API keys, billing |
| **Study Manager** | Create/run/manage studies |
| **Analyst** | View results, read-only |
| **API Access** | Programmatic, scoped permissions |

---

## Service Level Objectives

### Reliability
- Studies must complete by manifest-specified deadlines
- System monitors progress and escalates when at risk
- Human response SLA: 4 hours for escalations

### Completion Criteria (Configurable per Study)

Completion criteria are multi-variate, supporting required vs optional surfaces:

- **Required surfaces:** Must meet threshold (e.g., 95% of ChatGPT, Gemini, Perplexity)
- **Optional surfaces:** Best effort, do not block completion (e.g., Copilot, Meta, Grok)
- **Deadline priority:** Study completes when required surfaces meet thresholds; don't miss deadline waiting for optional surfaces
- **Max retries per cell:** Before marking failed
- **Quality gates:** Real content vs error pages
- **Evidence requirements:** Full, metadata-only, or none

### Escalation Path for At-Risk Studies
1. Notify operator → Request resolution guidance
2. Operator timeout → Auto-scale resources
3. Queue optimization → Reprioritize jobs
4. Tenant notification → If deadline still at risk

---

## Multi-Tenancy Model

### Shared Resources
- Proxy pools (residential IP providers)
- Session pools (browser automation)
- Compute infrastructure (AWS)

### Isolated Resources
- Study data and results
- Evidence storage
- API keys and credentials
- Audit logs (per-tenant views)
- Cost tracking

### Future Tenants
Architecture supports additional tenants. Initial implementation focuses on two tenants (Kyanos, GLU) without self-service onboarding complexity.

---

## Data Retention

### Audit Logs
- Default: 7-year regulatory retention
- Manifest-level overrides possible

### Study Data
- Configurable per study in manifest
- Tiered storage: Hot → Cold → Deletion
- Explicit "preserve forever" flag for legal hold

### Evidence (Screenshots, HTML, HAR)
- Follows study data retention policy
- Legal hold studies: immutable, indefinite

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-16 | Claude Code | Initial charter from interview |
| 1.1 | 2025-01-21 | Claude Code | Added P11: Resilience Through Provider Abstraction |
