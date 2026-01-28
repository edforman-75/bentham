# Migration Guide: Bentham to Tenant Repositories

This document identifies content that should migrate from Bentham to tenant-owned repositories.

## Background

Bentham is **shared multi-tenant infrastructure** for prompt execution and response capture.

Each tenant:
- Provides manifests to Bentham
- Receives structured JSON results
- Owns their analysis, scoring, and reporting

## Separation of Concerns

```
TENANT REPO                          BENTHAM                         TENANT REPO
(GLU, Kyanos, etc.)                 (Shared)                        (GLU, Kyanos, etc.)

┌──────────────┐                 ┌──────────────┐                 ┌──────────────┐
│   Manifest   │ ──────────────► │   Execute    │ ──────────────► │   Analyze    │
│   (YAML)     │                 │   Capture    │                 │   Report     │
│              │                 │   Track Cost │                 │   Visualize  │
└──────────────┘                 └──────────────┘                 └──────────────┘
     INPUT                         PROCESSING                         OUTPUT
```

---

## Content to Migrate

### Analysis Scripts → Tenant Repos

| Script | Purpose | Destination |
|--------|---------|-------------|
| `analyze-study-costs.ts` | Cost breakdown analysis | GLU repo |
| `analyze-chatgpt-web-layers.ts` | Response layer analysis | GLU repo |
| `analyze-huft-web-layers.ts` | HUFT-specific analysis | GLU repo |
| `correlation-analysis.ts` | Statistical correlation | GLU repo |
| `add-cost-tab.ts` | Excel workbook generation | GLU repo |
| `add-influence-tab.ts` | Source influence analysis | GLU repo |
| `generate-*-report.ts` | Report generation | GLU repo |
| `merge-study-results.ts` | Data aggregation | GLU repo |

### Study Outputs → Tenant Repos

| Pattern | Description | Destination |
|---------|-------------|-------------|
| `*.xlsx` | Excel workbooks | GLU repo |
| `*-report.md` | Markdown reports | GLU repo |
| `*-report.html` | HTML reports | GLU repo |
| `*-email-*.md` | Email drafts | GLU repo |
| `*-recommendations.*` | Strategic recommendations | GLU repo |
| `*-comparison.*` | Comparative analysis | GLU repo |
| `executive-summary.*` | Summaries | GLU repo |

### Stays in Bentham

| Pattern | Description | Reason |
|---------|-------------|--------|
| `study*.json` | Raw execution results | Bentham output |
| `*-results.json` | Raw execution results | Bentham output |
| `*-intermediate-*.json` | Checkpoints | Bentham recovery |
| `*.png` | Screenshots | Evidence |
| Evidence HTML | Response captures | Evidence |

---

## Tenant Repository Structure

Each tenant should have their own analysis repo:

```
glu-analysis/
├── manifests/              # Study definitions (input to Bentham)
│   ├── huft-visibility.yaml
│   └── brand-monitoring.yaml
├── scripts/                # Analysis scripts
│   ├── analyze-*.ts
│   ├── generate-*.ts
│   └── utils/
├── outputs/                # Generated reports
│   ├── huft/
│   │   ├── huft-analysis.xlsx
│   │   ├── huft-report.md
│   │   └── huft-email.md
│   └── ...
├── lib/                    # Reusable analysis code
│   ├── scoring/
│   ├── correlation/
│   └── reporting/
└── data/                   # Raw data from Bentham (or symlink)
    └── studies/
```

---

## Workflow After Migration

### 1. Tenant Creates Manifest

```yaml
# glu-analysis/manifests/huft-visibility.yaml
name: huft-visibility-study
tenant: glu

queries:
  - text: "best dog food in India"
  - text: "premium dog treats"

surfaces:
  - id: chatgpt-web
  - id: chat-api
  - id: websearch-api

locations:
  - id: in-mum
  - id: us-national
```

### 2. Tenant Submits to Bentham

```bash
bentham study run manifests/huft-visibility.yaml --output ./data/studies/
```

### 3. Bentham Returns Raw JSON

```json
{
  "study": "huft-visibility-study",
  "tenant": "glu",
  "results": [
    { "query": "...", "surface": "...", "response": "...", "cost": {...} }
  ]
}
```

### 4. Tenant Analyzes Results

```bash
# In tenant repo
npx tsx scripts/analyze-huft-study.ts ./data/studies/huft-visibility-results.json
npx tsx scripts/generate-huft-report.ts ./data/studies/huft-visibility-results.json
```

### 5. Tenant Delivers to Client

Reports, workbooks, emails—all owned by tenant.

---

## Packages to Evaluate

### @bentham/ai-advisor

| Module | Recommendation |
|--------|----------------|
| `ResponseScorer` | Move to tenant repos |
| `ResponseValidator` (quality) | Move to tenant repos |
| `ResponseValidator` (mechanical) | Keep in Bentham |
| `QueryGenerator` | Keep if used for manifest expansion |
| `Troubleshooter` | Keep for operational diagnostics |

---

## Migration Checklist

### For GLU Tenant

- [ ] Create `glu-analysis` repository
- [ ] Move manifests from Bentham `/studies/` to `glu-analysis/manifests/`
- [ ] Move analysis scripts from Bentham `/scripts/` to `glu-analysis/scripts/`
- [ ] Move report outputs from Bentham `/studies/` to `glu-analysis/outputs/`
- [ ] Update script paths to reference Bentham's JSON output format
- [ ] Keep raw JSON results in Bentham (or copy to `glu-analysis/data/`)

### For Bentham

- [ ] Remove analysis scripts from `/scripts/`
- [ ] Remove report files from `/studies/`
- [ ] Keep raw JSON results and evidence
- [ ] Update CHARTER.md (done)
- [ ] Add deprecation notices to ai-advisor scoring modules (done)

---

## Specific Files to Move (GLU)

### From /studies/ to glu-analysis/outputs/huft/

```
huft-analysis.xlsx
huft-email-to-ranjan.md
huft-visibility-study-report.md
huft-visibility-study-report.html
huft-strategic-recommendations.html
huft-strategic-recommendations.md
huft-verbatims.xlsx
huft-verbatims-full.csv
huft-comparison.csv
executive-summary.md
executive-summary.html
```

### From /scripts/ to glu-analysis/scripts/

```
analyze-study-costs.ts
analyze-chatgpt-web-layers.ts
analyze-huft-web-layers.ts
correlation-analysis.ts
add-cost-tab.ts
add-influence-tab.ts
add-ip-to-excel.ts
generate-comparison-report.ts
generate-detailed-comparison.ts
generate-rated-comparison-report.ts
generate-web-layer-report.ts
merge-study-results.ts
```

---

## Timeline

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Create tenant repo structure | 0.5 day |
| 2 | Move analysis scripts | 1 day |
| 3 | Move report outputs | 0.5 day |
| 4 | Update script dependencies | 1 day |
| 5 | Clean up Bentham repo | 0.5 day |
| 6 | Validate end-to-end workflow | 0.5 day |

**Total: ~4 days**
