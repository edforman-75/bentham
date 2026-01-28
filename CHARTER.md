# Bentham Charter

## Mission

Bentham is a **multi-tenant prompt execution service**. It runs queries against AI surfaces, captures responses with provenance, and tracks costs. Tenants consume the raw data and perform their own analysis and reporting.

## Name Origin

Named after Jeremy Bentham (1748-1832), who designed the Panopticon—a structure where an observer could watch without being seen. Bentham captures AI systems in their natural state, querying surfaces without revealing systematic research is underway.

---

## Multi-Tenant Model

```
┌─────────────────────────────────────────────────────────────┐
│                        BENTHAM                              │
│                  (Shared Infrastructure)                    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Surface  │  │  Proxy   │  │   Cost   │  │ Evidence │   │
│  │ Adapters │  │ Manager  │  │ Tracker  │  │Collector │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Orchestrator / Executor                 │   │
│  │         (Manifest execution, job scheduling)         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │   GLU    │    │  Kyanos  │    │ Tenant N │
        │ (tenant) │    │ (tenant) │    │ (tenant) │
        └──────────┘    └──────────┘    └──────────┘
              │               │               │
              ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │  Their   │    │  Their   │    │  Their   │
        │ Analysis │    │ Analysis │    │ Analysis │
        │ Reports  │    │ Reports  │    │ Reports  │
        └──────────┘    └──────────┘    └──────────┘
```

### Shared Resources (Bentham)
- Surface adapters (OpenAI, Anthropic, ChatGPT Web, etc.)
- Proxy pools (residential IP providers)
- Session management (browser automation)
- Cost tracking engine
- Evidence collection (screenshots, HTML, HAR)
- Job orchestration and retry logic

### Tenant-Owned (Not Bentham)
- Study manifests (tenants create these)
- Analysis and scoring logic
- Reports and visualizations
- Insights and recommendations
- Client deliverables

---

## Scope: What Bentham Does

### Core Capabilities

1. **Execute Prompts** - Send queries to AI surfaces (APIs, web chatbots, search engines)
2. **Capture Responses** - Store response text with metadata (timestamps, latency, model)
3. **Collect Evidence** - Screenshots, HTML archives, HAR files (optional per study)
4. **Track Costs** - API tokens, web search fees, proxy bandwidth, subscriptions
5. **Manage Geography** - Route queries through proxies for location simulation

### Supported Surfaces

| Category | Surfaces |
|----------|----------|
| **API** | OpenAI, Anthropic, Google AI, Perplexity, xAI, Together.ai |
| **Web Chatbot** | ChatGPT, Claude, Perplexity, Grok, Meta AI, Copilot |
| **Search** | Google Search, Bing Search |
| **E-commerce** | Amazon Rufus, Amazon Web, Zappos |

### Output Format

Bentham produces **structured JSON** that tenants consume:

```json
{
  "study": "study-id",
  "tenant": "glu",
  "timestamp": "2026-01-24T12:00:00Z",
  "results": [
    {
      "query": "best dog food in India",
      "surface": "chatgpt-web",
      "location": "in-mum",
      "response": "Here are some popular dog food brands...",
      "responseTimeMs": 2340,
      "cost": {
        "apiTokens": 0,
        "webSearch": 0,
        "proxy": 0.025,
        "subscription": 0.02
      },
      "evidence": {
        "screenshot": "evidence/screenshot-001.png",
        "html": "evidence/response-001.html"
      }
    }
  ],
  "totalCost": 1.50
}
```

---

## Scope: What Bentham Does NOT Do

### Analysis (tenant responsibility)
- Score or rate responses
- Compare responses across surfaces
- Identify brand mentions or sentiment
- Compute correlations or statistics
- Generate insights or recommendations

### Reporting (tenant responsibility)
- Generate reports (HTML, PDF, Markdown)
- Create Excel workbooks
- Build dashboards or visualizations
- Draft communications

### Interpretation (tenant responsibility)
- Determine if a response is "good" or "bad"
- Assess brand visibility or positioning
- Make strategic recommendations

**Bentham provides data. Tenants derive meaning.**

---

## Tenant Isolation

| Aspect | Isolation Level |
|--------|-----------------|
| Study data | Fully isolated per tenant |
| Results | Fully isolated per tenant |
| Evidence storage | Fully isolated per tenant |
| API credentials | Per-tenant credential vault |
| Audit logs | Per-tenant views |
| Cost tracking | Per-tenant billing |
| Proxy pools | Shared infrastructure |
| Surface adapters | Shared infrastructure |
| Compute | Shared infrastructure |

Tenants cannot see each other's data at any layer.

---

## Manifest Schema

Tenants define studies via declarative manifests:

```yaml
name: brand-visibility-study
tenant: glu
description: Query 20 prompts across 12 surface configurations

queries:
  - text: "best dog food in India"
  - text: "premium dog treats for puppies"

surfaces:
  - id: chatgpt-web
  - id: chat-api
    options:
      model: gpt-4o
  - id: websearch-api

locations:
  - id: in-mum
    proxyType: residential
  - id: us-national

execution:
  concurrency: 4
  timeout: 30s
  retry:
    maxAttempts: 3

output:
  format: json
  evidence: screenshots
```

Bentham executes the manifest and returns structured results. The tenant then analyzes those results using their own tools.

---

## Cost Model

Bentham tracks costs per query per tenant:

| Cost Category | Rate | Notes |
|---------------|------|-------|
| GPT-4o Input | $2.50/1M tokens | OpenAI pricing |
| GPT-4o Output | $10.00/1M tokens | OpenAI pricing |
| Web Search Tool | $0.03/query | OpenAI Responses API |
| Residential Proxy (India) | $0.025/request | Cherry Proxy |
| ChatGPT Subscription | $20/month | Amortized per query |

Costs are tracked per tenant for pass-through billing. Cost **analysis** (comparisons, optimization recommendations) is tenant responsibility.

---

## Validation

### Manifest Validation (Tenant-Agnostic)

Bentham validates that manifests are well-formed and executable:

- Required fields present (name, queries, surfaces, locations)
- Surface IDs are recognized
- Location IDs are valid
- Execution parameters within bounds
- Schema compliance

This validation is **tenant-agnostic**—the same rules apply to all tenants. Bentham does not validate tenant-specific business logic or query content.

### Response Validation (Mechanical Only)

Bentham performs mechanical checks on captured responses:

- Response is non-empty
- Response is not an error page
- Response was captured within timeout
- Evidence was collected (if required)

Bentham does NOT assess response **quality**, **relevance**, or **accuracy**. That's analysis, which tenants own.

---

## CLI Interface

```bash
# Execute a study for a tenant
bentham study run manifest.yaml --tenant glu --output ./results/

# Validate manifest
bentham study validate manifest.yaml

# Estimate cost
bentham study estimate manifest.yaml

# Single query (testing)
bentham query "best dog food" --surface chat-api --location in-mum

# Proxy management
bentham proxy test in-mum
bentham proxy list
```

---

## API Interface

```
POST /v1/studies
  - Create and execute a study from manifest
  - Tenant identified via API key

GET /v1/studies/{id}
  - Get study status and results
  - Tenant-scoped

GET /v1/studies/{id}/results
  - Download raw JSON results
  - Tenant-scoped

GET /v1/studies/{id}/evidence
  - Download evidence package
  - Tenant-scoped

GET /v1/costs
  - Get cost summary for tenant
  - Filterable by date range, study
```

---

## Current Tenants

| Tenant | Use Case |
|--------|----------|
| GLU | Brand visibility research, AI recommendation analysis |
| Kyanos | [TBD] |

Architecture supports additional tenants without code changes.

---

## Out of Scope Content

The following content exists in this repository but belongs to tenant-specific analysis systems, not Bentham core:

### /scripts/ (move to tenant repos)
- `analyze-*.ts` - Analysis scripts
- `generate-*-report.ts` - Report generation
- `correlation-analysis.ts` - Statistical analysis
- `add-*-tab.ts` - Excel manipulation

### /studies/ (move to tenant repos)
- `*.xlsx` - Analysis workbooks
- `*-report.md` - Generated reports
- `*-email-*.md` - Communication drafts
- `*-recommendations.*` - Strategic recommendations

**Keep in Bentham:**
- Raw `study*.json` results (execution output)
- Evidence files (screenshots, HTML, HAR)
- Intermediate checkpoints

---

## Core Principles

### P1: Manifest-Driven Execution
Every study is defined by a declarative manifest. Bentham executes what the manifest specifies.

### P2: Tenant Isolation
Strict data separation. No cross-tenant visibility. Shared infrastructure only.

### P3: Deterministic Execution
Code executes queries. No AI judgment in the execution loop.

### P4: Cost Transparency
Track all costs per tenant. Enable pass-through billing.

### P5: Evidence Collection
Capture provenance (timestamps, screenshots, hashes) for audit and legal hold.

### P6: Self-Healing
Auto-retry, proxy rotation, session refresh. Notify on persistent failures.

### P7: Human in the Loop
Automation prepares, humans approve. No content is published to client systems without explicit human approval. Scheduled jobs and webhooks can trigger analysis, queue recommendations, and stage content—but the final publish action requires human consent. This applies to all write-back operations: PDP updates, collection descriptions, llms.txt changes, tag modifications. Notification mechanisms (email, Slack, dashboard) inform humans when content is ready for review.

### P8: Platform-Agnostic Core
Bentham core contains NO platform-specific logic (Shopify, BigCommerce, Magento) and NO vertical-specific logic (ecommerce, SaaS, publishing). Bentham executes scripts generated by tenant-owned manifest interpreters. Platform adapters, content-type handlers, and industry-specific transformations live in tenant modules or a shared interpreter layer—never in Bentham core. This ensures Bentham remains a generic, multi-tenant execution service that any tenant can use without inheriting another tenant's domain assumptions.

### P9: Pluggable Execution Layer
Bentham is one execution engine among potentially many. The architecture supports adapters that translate interpreter scripts for different scraping/execution engines. This allows:
- Swapping Bentham for alternative scrapers
- Using different engines for different tasks (cost, capability, geography)
- Adding new execution backends without changing upstream layers

```
┌─────────────────────────────────────────┐
│            MANIFEST                      │
│  (tenant-owned, platform-specific)       │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│       MANIFEST INTERPRETER               │
│  (tenant-owned or shared library)        │
│  - Shopify, BigCommerce logic           │
│  - PDP, Collection, Blog handlers       │
│  - Outputs scraper-agnostic scripts     │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│            ADAPTERS                      │
│  - Bentham adapter (default)            │
│  - Alternative scraper adapters         │
│  - Translate scripts for target engine  │
└──────────────────┬──────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
┌──────────────────┐ ┌──────────────────┐
│     BENTHAM      │ │  Other Scraper   │
│  (our default)   │ │   (pluggable)    │
│  - AI surfaces   │ │  - Web scraping  │
│  - Web scraping  │ │  - Specialized   │
│  - Evidence      │ │    services      │
└──────────────────┘ └──────────────────┘
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-16 | Initial charter |
| 1.1 | 2025-01-21 | Added provider abstraction |
| 2.0 | 2026-01-24 | **Clarified multi-tenant model**: Bentham is shared execution infrastructure. Analysis and reporting belong to each tenant. |
| 2.1 | 2026-01-27 | **Added P7 Human in the Loop**: Automation prepares, humans approve. No content published without explicit human consent. |
| 2.2 | 2026-01-27 | **Added P8 Platform-Agnostic Core**: Bentham contains no platform-specific (Shopify, etc.) or vertical-specific (ecommerce, etc.) logic. Platform adapters live in tenant modules or interpreter layer. |
| 2.3 | 2026-01-27 | **Added P9 Pluggable Execution Layer**: Bentham is one execution engine among potentially many. Adapters translate interpreter scripts for different scraping/execution backends. |
