# Proposal: CLI Location Control for Bentham

**Author:** Bentham Research
**Date:** January 24, 2026
**Status:** Draft

---

## Summary

Add CLI commands that enable researchers to control IP geolocation when running queries, building on Bentham's existing `proxy-manager` and `LocationConfig` infrastructure. This eliminates the need for ad-hoc scripts and manual proxy configuration.

---

## Motivation

During the HUFT visibility study, we learned:

1. **IP location significantly affects results** - ChatGPT Web from India IP showed 70+ HUFT mentions vs 31 from US IP
2. **Manual proxy setup is error-prone** - Required configuring Chrome extensions, verifying IPs, switching profiles
3. **Bentham already has the infrastructure** - `proxy-manager` supports pools, providers, locations, but no CLI exposes it
4. **Reproducibility requires location control** - Studies must document and replicate geographic conditions

---

## Proposed CLI Commands

### 1. `bentham query` - Single Query Execution

```bash
# Basic usage
bentham query "best dog food brands" --surface chatgpt-web

# With location control
bentham query "best dog food brands" \
  --surface chatgpt-web \
  --location in-mum \
  --proxy-type residential

# Multiple surfaces
bentham query "best dog food brands" \
  --surface chatgpt-web,chat-api,websearch-api \
  --location in-mum

# Output options
bentham query "best dog food brands" \
  --surface chatgpt-web \
  --location in-mum \
  --output result.json \
  --format json|text|markdown
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--surface, -s` | Surface ID(s), comma-separated | Required |
| `--location, -l` | Location ID (e.g., `in-mum`, `us-nyc`) | `us-national` |
| `--proxy-type` | `residential`, `datacenter`, `mobile` | `residential` |
| `--proxy-provider` | `auto`, `2captcha`, `brightdata`, etc. | `auto` |
| `--sticky` | Maintain same IP for session | `false` |
| `--output, -o` | Output file path | stdout |
| `--format, -f` | Output format | `text` |
| `--verbose, -v` | Show IP verification, timing | `false` |

### 2. `bentham compare` - Cross-Location Comparison

```bash
# Compare same query across locations
bentham compare "best dog food brands" \
  --surface chatgpt-web \
  --locations in-mum,us-nyc,uk-lon \
  --output comparison.json

# Compare across surfaces AND locations
bentham compare "best dog food brands" \
  --surfaces chatgpt-web,chat-api \
  --locations in-mum,us-nyc \
  --output matrix.json
```

**Output includes:**
- Response from each surface/location combination
- IP verification for each request
- Timing metadata
- Diff summary (optional)

### 3. `bentham study` - Run Full Study from Manifest

```bash
# Run study with manifest
bentham study run manifest.json

# Override location for entire study
bentham study run manifest.json --location in-mum

# Dry run (validate + estimate)
bentham study validate manifest.json
bentham study estimate manifest.json
```

### 4. `bentham proxy` - Proxy Management

```bash
# List available locations
bentham proxy locations

# List configured providers
bentham proxy providers

# Test a location
bentham proxy test in-mum
# Output: ✓ in-mum: 103.x.x.x (Mumbai, Maharashtra, India) via 2captcha [342ms]

# Verify current IP
bentham proxy whoami
# Output: 184.183.124.126 (Sun Valley, Idaho, US)

# Add custom proxy
bentham proxy add \
  --name "cherry-mumbai" \
  --host proxy.example.com \
  --port 1080 \
  --protocol socks5 \
  --location in-mum
```

---

## Implementation Architecture

### CLI Layer (`packages/cli`)

```
packages/cli/
├── src/
│   ├── index.ts           # Entry point
│   ├── commands/
│   │   ├── query.ts       # bentham query
│   │   ├── compare.ts     # bentham compare
│   │   ├── study.ts       # bentham study
│   │   └── proxy.ts       # bentham proxy
│   ├── utils/
│   │   ├── output.ts      # Formatting helpers
│   │   └── spinner.ts     # Progress indicators
│   └── config.ts          # CLI configuration
├── package.json
└── README.md
```

### Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI (new)                               │
│  bentham query/compare/study/proxy                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Orchestrator (existing)                     │
│  Coordinates execution across surfaces/locations            │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│  Proxy    │  │  Surface  │  │  Session  │
│  Manager  │  │  Adapters │  │  Pool     │
│ (existing)│  │ (existing)│  │ (existing)│
└───────────┘  └───────────┘  └───────────┘
```

### Configuration File (`~/.bentham/config.yaml`)

```yaml
# Default settings
defaults:
  location: us-national
  proxy_type: residential
  proxy_provider: auto

# Proxy provider credentials
providers:
  2captcha:
    api_key: ${TWOCAPTCHA_API_KEY}
  brightdata:
    username: ${BRIGHTDATA_USER}
    password: ${BRIGHTDATA_PASS}

# Custom proxy definitions
proxies:
  cherry-mumbai:
    host: proxy.cherryproxy.com
    port: 1080
    protocol: socks5
    username: ${CHERRY_USER}
    password: ${CHERRY_PASS}
    locations: [in-mum]

# Surface authentication
surfaces:
  chatgpt-web:
    session_file: ~/.bentham/sessions/chatgpt.json
```

---

## Example Workflows

### 1. Quick Brand Check

```bash
# Check HUFT visibility from India
bentham query "best dog food brands in India" \
  --surface chatgpt-web \
  --location in-mum \
  --verbose

# Output:
# Location: in-mum (Mumbai, India)
# IP: 103.45.67.89 via 2captcha [residential]
# Surface: chatgpt-web
#
# Response:
# Here are some popular dog food brands in India...
# - Pedigree
# - Royal Canin
# - Heads Up For Tails (HUFT)
# ...
#
# Metadata:
#   Response time: 3.2s
#   Response length: 1,847 chars
#   HUFT mentioned: Yes (3 times)
```

### 2. Location Comparison Study

```bash
# Compare visibility across locations
bentham compare "best dog food brands" \
  --surface chatgpt-web \
  --locations in-mum,us-nyc \
  --output huft-location-test.json \
  --verbose

# Output:
# ┌─────────────┬───────────┬──────────────┬─────────────┐
# │ Location    │ IP        │ HUFT Mention │ Prominence  │
# ├─────────────┼───────────┼──────────────┼─────────────┤
# │ in-mum      │ 103.x.x.x │ Yes (3x)     │ Position 2  │
# │ us-nyc      │ 45.x.x.x  │ No           │ N/A         │
# └─────────────┴───────────┴──────────────┴─────────────┘
```

### 3. Full Study with Manifest

```yaml
# study-manifest.yaml
name: "HUFT Visibility Q1 2026"
queries:
  - text: "best dog food brands"
  - text: "premium dog treats"
  - text: "dog accessories online"

surfaces:
  - id: chatgpt-web
  - id: chat-api
  - id: websearch-api

locations:
  - id: in-mum
    proxyType: residential
  - id: us-nyc
    proxyType: residential

completionCriteria:
  requiredSurfaces:
    surfaceIds: [chatgpt-web, chat-api, websearch-api]
    coverageThreshold: 0.95
```

```bash
bentham study run study-manifest.yaml --output results/

# Output:
# Study: HUFT Visibility Q1 2026
# Matrix: 3 queries × 3 surfaces × 2 locations = 18 cells
#
# [████████████████████] 18/18 complete
#
# Results saved to:
#   results/study-results.json
#   results/verbatims.xlsx
#   results/summary.md
```

---

## Phases

### Phase 1: Core CLI (2 weeks)
- [ ] `bentham query` with location support
- [ ] `bentham proxy locations/test/whoami`
- [ ] Integration with existing proxy-manager
- [ ] Config file support

### Phase 2: Comparison Tools (1 week)
- [ ] `bentham compare` command
- [ ] Tabular output formatting
- [ ] JSON/CSV export

### Phase 3: Study Runner (2 weeks)
- [ ] `bentham study run/validate/estimate`
- [ ] Progress reporting
- [ ] Resume capability
- [ ] Excel/report generation

### Phase 4: Advanced Features (ongoing)
- [ ] `bentham watch` - continuous monitoring
- [ ] `bentham diff` - compare two study results
- [ ] Shell completions
- [ ] Interactive mode

---

## Design Goal: Minimal Human Intervention

The system should accept a manifest and run to completion without requiring human interaction. This requires solving several automation challenges:

### 1. Session Management (Critical Path)

**Problem:** Web surfaces like ChatGPT require authentication. Current approach requires manual browser login.

**Solution: Session Pool with Auto-Refresh**

```yaml
# ~/.bentham/sessions.yaml
sessions:
  chatgpt-web:
    type: cookie
    storage: ~/.bentham/sessions/chatgpt/
    refresh_strategy: on_401
    max_age_hours: 24

  amazon-rufus:
    type: cookie
    storage: ~/.bentham/sessions/amazon/
    credentials_env: AMAZON_EMAIL, AMAZON_PASSWORD
    auto_login: true  # Attempt automated login if session expired
```

**Session lifecycle:**
1. Check session validity before study starts
2. If invalid, attempt auto-refresh or auto-login
3. If auto-login fails, queue study and alert operator
4. Never block on human intervention during execution

**Implementation:**
```typescript
// packages/session-pool - enhance existing
interface SessionConfig {
  surfaceId: string;
  storageType: 'cookie' | 'token' | 'browser_profile';
  storagePath: string;
  refreshStrategy: 'on_401' | 'proactive' | 'manual';
  maxAgeHours: number;
  autoLogin?: {
    credentialsEnv: [string, string];  // [email_var, password_var]
    mfaHandler?: 'totp_env' | 'email_code' | 'manual';
  };
}
```

### 2. Proxy Auto-Selection

**Problem:** Manual proxy configuration per study.

**Solution: Location-aware proxy pools with auto-failover**

```yaml
# Manifest specifies intent, not implementation
locations:
  - id: in-mum
    proxyType: residential
    # System auto-selects provider based on:
    # 1. Availability
    # 2. Cost
    # 3. Recent success rate
    # 4. Rate limit headroom
```

**Failover chain:**
```
2captcha (primary) → brightdata (backup) → oxylabs (backup) → FAIL
```

### 3. Headless Execution Mode

```bash
# Submit manifest, get job ID, exit immediately
bentham study submit manifest.yaml
# Output: Study submitted. Job ID: stdy_abc123

# Check status later
bentham study status stdy_abc123

# Or run synchronously with full automation
bentham study run manifest.yaml --headless --timeout 2h
```

**Headless requirements:**
- No browser windows (use headless Chrome/Playwright)
- No interactive prompts
- Structured logging to file
- Webhook notifications on completion/failure
- Automatic retry with backoff

### 4. Error Recovery Without Human Intervention

| Error Type | Auto-Recovery Strategy |
|------------|----------------------|
| Proxy timeout | Rotate to next proxy in pool |
| Rate limit (429) | Exponential backoff, switch provider |
| Session expired | Auto-refresh, re-queue failed queries |
| CAPTCHA | Route to solver service (2captcha) |
| Surface down | Skip, mark as retriable, continue |
| Partial completion | Save progress, resume on restart |

### 5. Manifest-Driven Execution

```yaml
# Full manifest with automation settings
name: "HUFT Weekly Monitor"
version: "1.0"

# What to query
queries:
  - text: "best dog food brands"
  - text: "premium dog treats"

surfaces:
  - id: chatgpt-web
  - id: chat-api
  - id: websearch-api

locations:
  - id: in-mum
  - id: us-nyc

# Automation settings
execution:
  mode: headless
  timeout: 2h
  concurrency: 4

  retry:
    maxAttempts: 3
    backoffMs: [1000, 5000, 15000]

  sessions:
    prevalidate: true      # Check all sessions before starting
    autoRefresh: true      # Refresh expired sessions automatically

  proxies:
    failoverEnabled: true
    verifyLocation: true   # Confirm IP geolocation matches request

  notifications:
    onComplete:
      webhook: https://hooks.example.com/bentham
    onFailure:
      webhook: https://hooks.example.com/bentham
      email: ops@example.com

# Output
output:
  format: [json, xlsx]
  destination: s3://bentham-results/${study_id}/
  includeVerbatims: true
  includeMetadata: true
```

### 6. Scheduled/Recurring Studies

```bash
# Run weekly
bentham study schedule manifest.yaml --cron "0 9 * * MON"

# List scheduled studies
bentham study scheduled

# Cancel
bentham study unschedule stdy_abc123
```

---

## Revised Architecture for Automation

```
┌─────────────────────────────────────────────────────────────┐
│                    Manifest Submission                       │
│                 (CLI, API, or Scheduler)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Study Queue                               │
│              (Redis/Postgres job queue)                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Orchestrator                              │
│         • Session validation (auto-refresh)                 │
│         • Proxy selection (auto-failover)                   │
│         • Work distribution                                 │
│         • Progress tracking                                 │
│         • Error recovery                                    │
└───────────┬─────────────┬─────────────┬─────────────────────┘
            │             │             │
     ┌──────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
     │   Worker 1  │ │ Worker 2│ │   Worker N  │
     │  (headless) │ │         │ │             │
     └──────┬──────┘ └────┬────┘ └──────┬──────┘
            │             │             │
            └─────────────┼─────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                  Results Storage                             │
│           (S3, local, database)                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Notifications                              │
│          (webhook, email, Slack)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Open Questions

1. **MFA handling** - Some surfaces require 2FA. Options:
   - TOTP secret in env var (auto-generate codes)
   - Email code extraction (if we control the email)
   - Flag surface as "requires manual session setup"

2. **Browser profile persistence** - For surfaces that detect headless:
   - Maintain persistent browser profiles with history/cookies
   - Rotate profiles to avoid fingerprinting

3. **Cost controls** - Prevent runaway costs:
   - Per-study budget limits in manifest
   - Auto-pause if exceeding threshold

---

## Success Metrics

- Researchers can run location-controlled queries without writing scripts
- Study reproduction requires only manifest file + CLI command
- IP verification logged for every request
- 90% reduction in setup time vs current ad-hoc approach

---

## Appendix: Location IDs

| ID | Location | Country |
|----|----------|---------|
| `us-national` | United States (National) | US |
| `us-nyc` | New York | US |
| `us-la` | Los Angeles | US |
| `us-chi` | Chicago | US |
| `uk-lon` | London | GB |
| `de-ber` | Berlin | DE |
| `fr-par` | Paris | FR |
| `jp-tok` | Tokyo | JP |
| `au-syd` | Sydney | AU |
| `sg-sg` | Singapore | SG |
| `in-mum` | Mumbai | IN |
| `br-sao` | São Paulo | BR |

See `packages/core/src/types/location.ts` for full list.
