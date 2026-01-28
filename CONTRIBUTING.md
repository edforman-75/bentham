# Contributing to Bentham

## Charter Compliance

Before contributing, read `/CHARTER.md`. Bentham is **multi-tenant execution infrastructure only**.

### The Golden Rule

> **Bentham provides data. Tenants derive meaning.**

If your change interprets, scores, compares, or reports on data—it belongs in a tenant repo, not Bentham.

---

## Scope Checklist

Before submitting code, verify:

### IN SCOPE (Bentham)

- [ ] Executes prompts against AI surfaces
- [ ] Captures responses with metadata
- [ ] Collects evidence (screenshots, HTML, HAR)
- [ ] Tracks costs per query
- [ ] Manages proxies and sessions
- [ ] Validates manifest structure (tenant-agnostic)
- [ ] Performs mechanical response checks (non-empty, timeout, error)
- [ ] Orchestrates job execution and retry

### OUT OF SCOPE (Tenant Repos)

- [ ] Scores or rates responses
- [ ] Compares responses across surfaces
- [ ] Identifies brand mentions or sentiment
- [ ] Computes correlations or statistics
- [ ] Generates reports (HTML, PDF, Excel, Markdown)
- [ ] Creates visualizations or charts
- [ ] Drafts communications or summaries
- [ ] Makes recommendations based on results

**If any OUT OF SCOPE box is checked, the code does not belong in Bentham.**

---

## Directory Rules

### /packages/ - Core Bentham

Only execution infrastructure belongs here:
- `surface-adapters/` - Query AI services
- `orchestrator/` - Job scheduling
- `executor/` - Query execution
- `evidence-collector/` - Capture artifacts
- `cost-tracker/` - Track costs
- `proxy-manager/` - Geographic routing
- `validator/` - Mechanical validation only

### /scripts/ - Execution Utilities Only

Allowed:
- `run-*.ts` - Execute studies
- `test-*.ts` - Test surfaces
- `debug-*.ts` - Debug execution

Not allowed:
- `analyze-*.ts` - Analysis belongs to tenants
- `generate-*-report.ts` - Reporting belongs to tenants
- `*-correlation*.ts` - Statistics belong to tenants

### /studies/ - Raw Output Only

Allowed:
- `study*.json` - Raw execution results
- `*-results.json` - Execution output
- Evidence files (screenshots, HTML)

Not allowed:
- `*.xlsx` - Workbooks belong to tenants
- `*-report.*` - Reports belong to tenants
- `*-analysis.*` - Analysis belongs to tenants

---

## Code Review Checklist

Reviewers must verify:

1. **No Analysis Logic**
   - No scoring functions
   - No comparison logic
   - No statistical computations
   - No sentiment detection

2. **No Reporting**
   - No HTML/PDF generation
   - No Excel manipulation
   - No chart creation
   - No email drafting

3. **No Tenant-Specific Logic**
   - No hardcoded tenant names in business logic
   - No tenant-specific scoring criteria
   - No tenant-specific report formats

4. **Tenant Isolation**
   - Data queries include tenant filter
   - No cross-tenant data access
   - Tenant identified via API key or manifest

---

## AI Advisor Package

The `@bentham/ai-advisor` package has mixed scope:

| Module | Status | Use |
|--------|--------|-----|
| `QueryGenerator` | IN SCOPE | Manifest expansion |
| `Troubleshooter` | IN SCOPE | Operational diagnostics |
| `ResponseValidator` (mechanical) | IN SCOPE | isEmpty, isError, timeout |
| `ResponseScorer` | **DEPRECATED** | Do not use |
| `ResponseValidator` (quality) | **DEPRECATED** | Do not use |

Do not add analysis features to this package.

---

## Testing Charter Compliance

Run before committing:

```bash
# Check for analysis scripts in wrong location
ls scripts/analyze-*.ts 2>/dev/null && echo "ERROR: Analysis scripts belong in tenant repos"

# Check for reports in wrong location
ls studies/*-report.* 2>/dev/null && echo "ERROR: Reports belong in tenant repos"

# Check for Excel files in wrong location
ls studies/*.xlsx 2>/dev/null && echo "ERROR: Workbooks belong in tenant repos"
```

---

## When in Doubt

Ask these questions:

1. **Does this interpret results?** → Tenant repo
2. **Does this generate a deliverable?** → Tenant repo
3. **Does this compare across surfaces?** → Tenant repo
4. **Does this score quality?** → Tenant repo
5. **Is this tenant-agnostic infrastructure?** → Bentham

If still uncertain, discuss in PR review before implementing.

---

## Architectural Decision Records

Major scope decisions are documented in `/docs/adr/`. Before proposing scope changes, review existing ADRs and create a new one for discussion.

---

## Version History

| Date | Change |
|------|--------|
| 2026-01-24 | Initial CONTRIBUTING.md with charter compliance rules |
