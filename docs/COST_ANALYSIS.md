# Bentham Cost Analysis

## Build vs Buy Analysis

This document compares building the extraction infrastructure in-house versus using outsourced services.

---

## Component Breakdown

### 1. Browser Automation & Scraping

#### Option A: Build (Current Approach)

**Stack:** Playwright + AWS Fargate + Residential Proxies

| Cost Category | Monthly Estimate | Notes |
|---------------|------------------|-------|
| Compute (Fargate) | $300-500 | 2-4 concurrent workers |
| Residential Proxies | $500-1,000 | 50-100 GB/month |
| Session Management | Included | Part of our code |
| Anti-detection | Included | Part of our code |
| **Subtotal** | **$800-1,500** | |

**Pros:**
- Full control over execution
- Can optimize for our specific surfaces
- No per-query fees
- Data stays in our infrastructure

**Cons:**
- Maintenance burden
- Need to update when surfaces change
- Session/account management complexity

#### Option B: Buy (Outsourced Scraping Services)

**Providers:** Apify, ScrapingBee, Browserless, Bright Data Web Scraper

| Provider | Pricing Model | Est. Monthly Cost | Notes |
|----------|---------------|-------------------|-------|
| Apify | $0.25-0.50/actor run | $750-1,500 | For 3,000 queries |
| ScrapingBee | $49-249/mo + credits | $300-800 | Limited browser features |
| Browserless | $0.01-0.02/session | $600-1,200 | Good Playwright support |
| Bright Data Scraping | $500-2,000/mo | $1,000-2,000 | Enterprise, includes proxies |

**Pros:**
- Lower maintenance burden
- Proxy management included
- Some anti-detection built in
- Faster initial deployment

**Cons:**
- Per-query costs scale with volume
- Less control over execution
- May not support all our surfaces
- Data leaves our infrastructure
- Vendor lock-in risk

#### Recommendation: Hybrid

**Phase 1 (MVP):** Build for API surfaces, consider Browserless for complex web surfaces
**Phase 2:** Bring web automation fully in-house as we learn patterns

---

### 2. Geographic Residential Proxy Services

**Requirement:** Execute queries from specific geographic locations using residential IP addresses to capture location-specific AI responses.

#### Why Residential Proxies?

- AI surfaces detect and may alter responses for datacenter IPs
- Residential IPs appear as normal consumer traffic
- Geographic targeting requires proxies in specific cities/regions
- Some surfaces are geo-restricted (only available in certain countries)

#### Provider Comparison

| Provider | Pricing Model | Geographic Coverage | City Targeting | Notes |
|----------|---------------|---------------------|----------------|-------|
| **Bright Data** | $15-25/GB | 195+ countries | Yes (premium) | Market leader, best coverage |
| **Oxylabs** | $15-20/GB | 195+ countries | Yes | Strong enterprise support |
| **SmartProxy** | $12-14/GB | 195+ countries | Limited | Good value option |
| **IPRoyal** | $5-7/GB | 190+ countries | No | Budget option |

#### Geographic Coverage Requirements

| Region | Priority | Use Case |
|--------|----------|----------|
| US (National) | Critical | Baseline US responses |
| US (City-specific) | High | NYC, LA, Chicago, Houston, Miami, Seattle |
| UK | High | English-speaking comparison |
| Germany | Medium | EU market leader |
| France | Medium | EU market |
| Japan | Medium | APAC representation |
| Australia | Medium | English-speaking APAC |
| Canada | Medium | North America comparison |
| Brazil | Low | LATAM representation |

#### Cost Estimates by Usage

| Usage Level | GB/Month | Bright Data | Oxylabs | SmartProxy |
|-------------|----------|-------------|---------|------------|
| MVP | 50 GB | $750-1,250 | $750-1,000 | $600-700 |
| Moderate | 100 GB | $1,500-2,500 | $1,500-2,000 | $1,200-1,400 |
| Full Scale | 200 GB | $3,000-5,000 | $3,000-4,000 | $2,400-2,800 |

#### City-Specific Targeting Premium

City-level targeting costs more than country-level:

| Targeting Type | Cost Multiplier | Notes |
|----------------|-----------------|-------|
| Country only | 1.0x | Standard residential rate |
| State/Region | 1.1-1.2x | Some providers include this |
| City | 1.2-1.5x | Premium feature, not all providers |

#### Build vs Buy for Proxy Management

| Aspect | Build | Buy (Managed) |
|--------|-------|---------------|
| Proxy acquisition | ✗ Not feasible | ✓ Provider handles |
| Geographic routing | ✓ Build our router | ✓ Provider API |
| Session management | ✓ Build for control | Varies by provider |
| Failover logic | ✓ Build multi-provider | Single provider risk |
| Cost tracking | ✓ Build for attribution | Basic reporting |

**Recommendation:** **Buy** residential proxy bandwidth from providers, **Build** our own routing/management layer for:
- Multi-provider failover
- Location-based routing
- Session management for sticky IPs
- Cost attribution per study
- Health monitoring and rotation

---

### 3. AI APIs (Query Generation, Scoring)

#### Option A: Claude API (Current Plan)

| Usage | Est. Tokens/Month | Cost @ $15/1M in, $75/1M out |
|-------|-------------------|------------------------------|
| Query generation | 500K in, 200K out | $22.50 |
| Response validation | 2M in, 100K out | $37.50 |
| Response scoring | 3M in, 500K out | $82.50 |
| Troubleshooting | 200K in, 100K out | $10.50 |
| **Subtotal** | | **$150-200/month** |

**Note:** Costs scale with study volume. Above assumes ~10 studies/month with 3,000 queries each.

#### Option B: OpenAI GPT-4

Similar pricing structure, slightly lower quality for nuanced tasks.

#### Option C: Fine-tuned SLM (Future)

| Component | One-time Cost | Monthly Cost | Notes |
|-----------|---------------|--------------|-------|
| Fine-tuning | $1,000-5,000 | - | Per model |
| Inference (hosted) | - | $50-200 | Via Replicate, Modal |
| Inference (self-hosted) | $300-500 | $100-200 | GPU instance |

**Recommendation:** Start with Claude API, design for SLM migration. Migrate high-volume, low-complexity tasks (response validation) first.

---

### 4. Evidence Storage

| Tier | Storage Type | Cost/GB/Month | Est. Monthly Cost |
|------|--------------|---------------|-------------------|
| Hot | S3 Standard | $0.023 | $50-100 |
| Cold | S3 Glacier | $0.004 | $10-20 |
| Archive | S3 Deep Archive | $0.00099 | $2-5 |

**Evidence Volume Estimates:**
- Screenshot: ~500KB each
- HTML archive: ~2MB each
- HAR file: ~1MB each
- Metadata: ~5KB each

**Per Study (3,000 queries, full evidence):**
- ~10 GB per study
- ~100 GB/month at 10 studies

**Recommendation:** Tiered storage with lifecycle policies. Move to cold after 30 days, archive after 90 days (unless legal hold).

---

### 5. Database

| Option | Monthly Cost | Notes |
|--------|--------------|-------|
| RDS PostgreSQL (db.t3.medium) | $60-80 | Development/small prod |
| RDS PostgreSQL (db.r6g.large) | $150-200 | Production scale |
| Aurora Serverless v2 | $100-300 | Auto-scaling, variable |

**Recommendation:** Start with RDS db.t3.medium, scale up as needed.

---

### 6. Queue & Cache

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| SQS | $10-50 | Per million requests |
| ElastiCache Redis | $50-100 | t3.micro to t3.small |

---

### 7. Account Costs (Session Isolation)

**Challenge:** Dedicated accounts per study for unbiased results.

| Surface | Account Cost | Notes |
|---------|--------------|-------|
| ChatGPT Plus | $20/month | Required for reliable access |
| Perplexity Pro | $20/month | For API-like access |
| Google Account | Free | But may need workspace for volume |
| Meta Account | Free | But may get flagged |

**Cost per Study (Dedicated Accounts):**
- Conservative: $0 (shared accounts, accept bias)
- Moderate: $20-40 (1-2 dedicated accounts for key surfaces)
- Full isolation: $100-200 (fresh accounts all surfaces)

**Recommendation:** Start with shared accounts, track bias as a research question. Add dedicated accounts for specific research needs.

---

### 8. CAPTCHA Solving

**Provider:** 2Captcha (primary), Anti-Captcha (backup)

| CAPTCHA Type | Cost per Solve | Est. Monthly Volume | Monthly Cost |
|--------------|----------------|---------------------|--------------|
| reCAPTCHA v2 | $2.99/1000 | 500-2,000 | $1.50-6.00 |
| reCAPTCHA v3 | $2.99/1000 | 200-500 | $0.60-1.50 |
| hCaptcha | $2.99/1000 | 500-1,000 | $1.50-3.00 |
| Cloudflare Turnstile | $2.99/1000 | 1,000-3,000 | $3.00-9.00 |
| **Subtotal** | | | **$10-50** |

**Notes:**
- CAPTCHA frequency depends on surface aggressiveness and session health
- Fresh accounts encounter more CAPTCHAs initially
- Healthy sessions with good proxy rotation see fewer CAPTCHAs
- Budget 1-2% of total queries requiring CAPTCHA solve

---

### 9. Third-Party Services

| Service | Purpose | Monthly Cost |
|---------|---------|--------------|
| RFC 3161 Timestamp Authority | Legal hold evidence | $50-100 |
| SendGrid | Email notifications | $15-50 |
| Twilio | SMS alerts | $20-50 |
| Slack API | Alerting | Free (within limits) |

---

## Total Cost Estimates

### MVP (Minimal)

| Category | Monthly Cost |
|----------|--------------|
| Compute (Fargate) | $300 |
| Proxies | $500 |
| AI APIs | $150 |
| Storage | $50 |
| Database | $60 |
| Queue/Cache | $60 |
| CAPTCHA Solving | $10 |
| Third-party | $50 |
| **Total** | **$1,180** |

### Production (Moderate Scale)

| Category | Monthly Cost |
|----------|--------------|
| Compute (Fargate) | $500 |
| Proxies | $1,000 |
| AI APIs | $300 |
| Storage | $150 |
| Database | $150 |
| Queue/Cache | $100 |
| CAPTCHA Solving | $25 |
| Third-party | $150 |
| Accounts (partial) | $100 |
| **Total** | **$2,475** |

### Production (Full Scale)

| Category | Monthly Cost |
|----------|--------------|
| Compute (Fargate) | $1,000 |
| Proxies | $2,000 |
| AI APIs | $500 |
| Storage | $300 |
| Database | $300 |
| Queue/Cache | $150 |
| CAPTCHA Solving | $50 |
| Third-party | $200 |
| Accounts (full) | $500 |
| **Total** | **$5,000** |

---

## Per-Study Cost Attribution

### Example: Standard Study (50 queries × 6 surfaces × 10 locations = 3,000 cells)

| Component | Unit Cost | Units | Cost |
|-----------|-----------|-------|------|
| Proxy bandwidth | $10/GB | 1 GB | $10 |
| API compute | $0.002/query | 3,000 | $6 |
| AI (Claude) | $0.003/query | 3,000 | $9 |
| Storage (30 days) | $0.003/query | 3,000 | $9 |
| Overhead (15%) | | | $5 |
| **Total** | | | **$39** |

**Per query cost:** ~$0.013

---

## Cost Optimization Opportunities

### Short-term
1. Use spot instances for non-critical compute
2. Aggressive S3 lifecycle policies
3. Cache AI responses for identical queries
4. Batch proxy sessions to reduce handshake overhead

### Medium-term
1. Migrate response validation to SLM
2. Build surface adapter intelligence to reduce retries
3. Implement smart query routing to cheapest working surface

### Long-term
1. Fine-tune SLMs for all AI modules
2. Self-host LLMs on dedicated GPU instances
3. Negotiate volume discounts with proxy providers
4. Consider mobile device farm for surfaces that require it

---

## Build vs Buy Decision Matrix

| Component | Build | Buy | Recommendation |
|-----------|-------|-----|----------------|
| Browser automation | Control, optimization | Faster start | **Build** (core competency) |
| Geographic proxy bandwidth | Not feasible | Provider handles | **Buy** (Bright Data, Oxylabs) |
| Proxy routing/management | Multi-provider, control | Single provider | **Build** (our routing layer) |
| AI for queries | Fine-tuning path | Quality now | **Buy → Build** (Claude → SLM) |
| CAPTCHA solving | Complex, unreliable | Human workers | **Buy** (2Captcha) |
| Evidence storage | Control | N/A | **Build** (S3 is commodity) |
| Timestamps | Compliance | Specialized | **Buy** (RFC 3161 provider) |
| Notifications | Customize | Fast | **Buy** (SendGrid, Twilio) |

---

## Risk-Adjusted Costs

| Risk | Probability | Impact | Mitigation Cost |
|------|-------------|--------|-----------------|
| Proxy provider outage | 20%/year | $500 | Multi-provider: +$200/mo |
| Surface breaks, needs fix | 50%/year | $1,000 | AI troubleshooter: included |
| AI API price increase | 30%/year | $200/mo | SLM migration: $5K one-time |
| Account bans | 40%/year | $500 | Account buffer: +$100/mo |

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-16 | Claude Code | Initial cost analysis |
