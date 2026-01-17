# Bentham System Architecture

## Overview

Bentham is a headless execution engine that receives study manifests from tenant systems, executes them across AI surfaces and geographic locations, and returns structured results. It is deterministic, restartable, and self-healing.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TENANT SYSTEMS                                │
│                    (Kyanos, GLU, Future Tenants)                        │
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │   Manifest  │    │   Results   │    │   Alerts    │                │
│   │   Creator   │    │   Consumer  │    │   Receiver  │                │
│   └──────┬──────┘    └──────▲──────┘    └──────▲──────┘                │
└──────────┼──────────────────┼──────────────────┼────────────────────────┘
           │                  │                  │
           │ POST /studies    │ GET /results     │ Webhooks
           ▼                  │                  │
┌──────────────────────────────────────────────────────────────────────────┐
│                              BENTHAM                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                          API GATEWAY                               │ │
│  │   • Manifest validation    • Authentication    • Rate limiting     │ │
│  │   • Cost estimation        • Tenant routing    • Webhook dispatch  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         ORCHESTRATOR                               │ │
│  │   • Study lifecycle        • Dependency graph   • Checkpointing   │ │
│  │   • Progress tracking      • Deadline monitor   • Escalation      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌──────────────┬──────────────┬──────────────┬──────────────────────┐ │
│  │   EXECUTOR   │   VALIDATOR  │  AI ADVISOR  │     EVIDENCE        │ │
│  │              │              │              │     COLLECTOR        │ │
│  │  • Job queue │  • Schema    │  • Query gen │  • Screenshots      │ │
│  │  • Workers   │    check     │  • Scoring   │  • HTML archives    │ │
│  │  • Retry     │  • Quality   │  • Trouble-  │  • Timestamps       │ │
│  │    logic     │    gates     │    shooting  │  • Hashes           │ │
│  └──────────────┴──────────────┴──────────────┴──────────────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      SURFACE ADAPTERS                              │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │ │
│  │  │  API   │ │ ChatGPT│ │Perplx- │ │ Google │ │  Meta  │  ...     │ │
│  │  │Surfaces│ │  Web   │ │  ity   │ │ Search │ │   AI   │          │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                       INFRASTRUCTURE                               │ │
│  │   • Session Pool Manager    • Proxy Manager    • Account Manager  │ │
│  │   • Cost Tracker           • Notification Hub  • Audit Logger     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         DATA STORES                                │ │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │ │
│  │   │PostgreSQL│  │   S3     │  │  Redis   │  │   SQS    │         │ │
│  │   │ Studies  │  │ Evidence │  │  Cache   │  │  Queues  │         │ │
│  │   │ Results  │  │ Archives │  │ Sessions │  │  Jobs    │         │ │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────┘         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. API Gateway

**Responsibility:** Entry point for all tenant interactions.

**Functions:**
- Receive manifest submissions (POST /studies)
- Validate manifests against schema
- Check tenant quotas and permissions
- Estimate costs before execution
- Return study ID and validation errors
- Dispatch webhook notifications to tenants
- Serve results via API

**Technology:** Node.js/Express or Hono

### 2. Orchestrator

**Responsibility:** Manages study lifecycle and ensures completion commitments.

**Functions:**
- Parse manifest into job graph
- Track dependencies between jobs
- Manage checkpoints for restartability
- Monitor progress against deadlines
- Trigger escalations when at risk
- Declare study complete ONLY after validator approves

**Key State Machine:**
```
manifest_received → validating → queued → executing → validating_results → complete
                                    ↓           ↓
                                  paused ← human_intervention_required
                                    ↓
                                  failed (after max retries)
```

**Technology:** PostgreSQL for state, SQS for job queue

### 3. Executor

**Responsibility:** Runs individual jobs (query × surface × location).

**Functions:**
- Pull jobs from queue
- Dispatch to appropriate surface adapter
- Handle retries with exponential backoff
- Record results and evidence
- Report job completion to orchestrator

**Key Principle:** Executor CANNOT mark a study complete. It only reports individual job outcomes.

**Technology:** Worker processes (Node.js), SQS for job distribution

### 4. Validator

**Responsibility:** Independent authority on job and study completion.

**Functions:**
- Validate individual job outputs (quality gates)
- Check response is real content, not error page
- Verify evidence captured (if required)
- Count completed cells against thresholds
- Per-surface success rate checks
- Approve or reject study completion

**Key Principle:** Validator is separate from Executor. No self-attestation.

**Technology:** Stateless validation service

### 5. AI Advisor

**Responsibility:** Provides AI capabilities as services with validated outputs.

**Modules:**

| Module | Input | Output | Validation |
|--------|-------|--------|------------|
| Query Generator | Study goals, context | List of queries | Schema validation |
| Response Validator | Raw response | is_valid: boolean | Logged decision |
| Response Scorer | Response, criteria | Structured scores | Range checks |
| Troubleshooter | Error context | Suggested actions | System validates before acting |

**Key Principle:** AI provides suggestions, not commands. System validates before acting.

**Technology:** Claude API (MVP), with interfaces for SLM migration

### 6. Evidence Collector

**Responsibility:** Captures and preserves evidence of queries and responses.

**Evidence Levels:**
- **Full:** Screenshot, HTML archive, HAR file, video (for streaming), metadata
- **Metadata-only:** Response text, timestamps, source info
- **None:** Response text only

**Legal Hold Features:**
- SHA-256 hash at capture time
- RFC 3161 third-party timestamps
- S3 Object Lock (WORM storage)
- Chain of custody logging

**Technology:** S3 for storage, external timestamp authority

### 7. Surface Adapters

**Responsibility:** Interface with specific AI surfaces.

**Categories:**

| Category | Surfaces | Method |
|----------|----------|--------|
| **APIs** | OpenAI, Anthropic, Google AI, Perplexity API | Direct API calls |
| **Web Chatbots** | ChatGPT Web, Claude Web, Gemini, Perplexity Web, Meta AI, Grok | Browser automation (Playwright) |
| **Search** | Google (+ AI Overview), Bing (+ Copilot) | Browser automation |

**Each Adapter Implements:**
```typescript
interface SurfaceAdapter {
  id: string;
  name: string;
  category: 'api' | 'web_chatbot' | 'search';

  // Capabilities
  requiresAuth: boolean;
  supportsAnonymous: boolean;
  supportsGeoTargeting: boolean;

  // Operations
  executeQuery(query: string, context: QueryContext): Promise<QueryResult>;
  validateSession(): Promise<SessionStatus>;
  resetSession(): Promise<void>;
}
```

**Technology:** Playwright or Puppeteer for web (configurable per surface), native SDKs for APIs

**Browser Engine Selection:** The system supports both Playwright and Puppeteer as browser automation engines. Different surfaces may work better with different engines due to their detection mechanisms. The session pool automatically selects the recommended engine per surface, with fallback support if the primary engine fails.

### 8. Infrastructure Services

#### Session Pool Manager
- Maintains pool of browser sessions per surface
- Tracks session health (success rate, age, cooldown)
- Rotates sessions to avoid detection
- Supports dedicated study accounts (for session isolation)

#### Proxy Manager
- Interfaces with residential proxy providers (Bright Data, Oxylabs, etc.)
- Manages sticky sessions for geographic targeting
- Tracks proxy health and costs
- Rotates IPs on schedule or after blocks

#### Account Manager
- **Note:** Accounts are provisioned by humans (requires email/phone verification, payment, CAPTCHA). Account Manager manages the pool, not creates accounts.
- Tracks accounts provisioned by operators
- Assigns accounts to studies (shared vs dedicated isolation)
- Monitors account health (flagged, rate-limited, blocked)
- Alerts operators when pool is running low
- Manages account warming and retirement
- Calculates account costs for billing

#### Cost Tracker
- Records all billable events (API calls, proxy bandwidth, compute)
- Attributes costs to studies and tenants
- Provides real-time cost estimates
- Generates billing reports

#### Notification Hub
- Sends alerts via Slack, email, SMS
- Dispatches webhooks to tenant systems
- Manages notification preferences per tenant
- Rate limits to prevent alert fatigue

#### Audit Logger
- Records all system actions with timestamps
- Tenant-scoped views (no cross-tenant visibility)
- 7-year retention for regulatory compliance
- Tamper-evident storage

### 9. Observability & Demo Mode

**Purpose:** Provide visible evidence of system behavior during development, testing, and demos.

#### Development Visibility
- **Headed browser mode:** Run Playwright with visible browser windows during development
- **Slow-motion mode:** Configurable delay between actions for visual inspection
- **Action highlighting:** Visual indicators on page elements being interacted with
- **Live console:** Real-time logs of actions, decisions, and state changes

#### Phase Progress Dashboard
Real-time visibility into study execution:
```
┌─────────────────────────────────────────────────────────────┐
│ Study: brand-monitoring-q1    Status: EXECUTING             │
├─────────────────────────────────────────────────────────────┤
│ Progress: ████████████░░░░░░░░ 62% (1,860/3,000 cells)     │
├─────────────────────────────────────────────────────────────┤
│ By Surface:                                                 │
│   ChatGPT    ████████████████░░ 89%  [REQUIRED]            │
│   Gemini     ████████████░░░░░░ 67%  [REQUIRED]            │
│   Perplexity ████████████████░░ 85%  [REQUIRED]            │
│   Copilot    ████████░░░░░░░░░░ 45%  [OPTIONAL]            │
│   Meta AI    ██████░░░░░░░░░░░░ 32%  [OPTIONAL]            │
├─────────────────────────────────────────────────────────────┤
│ By Location:                                                │
│   US-NYC     ████████████████░░ 88%                        │
│   US-LA      ████████████████░░ 85%                        │
│   UK-LON     ██████████████░░░░ 72%                        │
│   DE-BER     ████████████░░░░░░ 61%                        │
├─────────────────────────────────────────────────────────────┤
│ Recent Activity:                                            │
│   14:32:15  ChatGPT/US-NYC  ✓ Query completed (1.2s)       │
│   14:32:14  Gemini/UK-LON   ✓ Query completed (0.8s)       │
│   14:32:12  Copilot/DE-BER  ⚠ CAPTCHA solved, retrying     │
│   14:32:10  Meta AI/US-LA   ✗ Rate limited, backing off    │
└─────────────────────────────────────────────────────────────┘
```

#### Evidence Review Interface
- **Screenshot gallery:** Browse captured screenshots with metadata
- **Side-by-side comparison:** Compare responses across surfaces/locations
- **Timeline view:** Replay session as sequence of screenshots
- **Video playback:** For streaming response captures

#### Demo Mode
Special configuration for stakeholder demonstrations:
- Visible browser with human-speed interactions
- Annotated actions ("Now typing query...", "Waiting for response...")
- Split-screen: browser on left, dashboard on right
- Configurable narration/commentary output

#### Structured Logging
All components emit structured logs for analysis:
```typescript
interface LogEvent {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;           // e.g., 'executor', 'chatgpt-adapter'
  studyId?: string;
  jobId?: string;
  event: string;               // e.g., 'query_started', 'captcha_detected'
  details: Record<string, any>;
  duration?: number;           // ms
}
```

#### Metrics & Alerts
- Success rates by surface, location, time
- Average response times
- CAPTCHA frequency trends
- Session health scores
- Cost accumulation in real-time
- **Proxy provider monitoring:**
  - Provider health status (healthy/degraded/down)
  - Per-provider success rates and latency
  - Geographic availability by provider
  - Bandwidth usage and costs
  - Automatic alerts on provider issues

---

### 10. Operator Dashboard (Mission Control)

**Purpose:** System-wide operational visibility for operators, like a power plant control room.

#### Mission Control Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BENTHAM MISSION CONTROL                                     2025-01-16 14:32 │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  ┌─── SYSTEM HEALTH ───┐  ┌─── ACTIVE STUDIES ───┐  ┌─── ALERTS ────────────┐ │
│  │  Status: NOMINAL    │  │  Running:     7      │  │  ⚠ 2 Active           │ │
│  │  ████████████ 98%   │  │  Queued:      3      │  │  ────────────────────  │ │
│  │                     │  │  At-Risk:     1      │  │  ⚠ Bright Data: High  │ │
│  │  Uptime: 14d 6h 23m │  │  Completed:   142    │  │    latency EU region  │ │
│  │  Last Incident: 3d  │  │  Failed:      2      │  │  ⚠ ChatGPT: Rate      │ │
│  └─────────────────────┘  └──────────────────────┘  │    limiting detected  │ │
│                                                      └───────────────────────┘ │
│  ┌─── INFRASTRUCTURE ──────────────────────────────────────────────────────┐   │
│  │                                                                          │   │
│  │  PROXY PROVIDERS              SESSIONS              ACCOUNTS             │   │
│  │  ┌──────────────────┐        ┌─────────────┐       ┌─────────────────┐  │   │
│  │  │ Bright Data  ✓   │        │ Active: 12  │       │ ChatGPT:  8/10  │  │   │
│  │  │ Oxylabs     ✓   │        │ Idle:    4  │       │ Gemini:   5/8   │  │   │
│  │  │ SmartProxy  ⚠   │        │ Warming: 2  │       │ Perplexity: 6/6 │  │   │
│  │  │ IPRoyal     ✓   │        │ Cooling: 1  │       │ Meta AI:  4/5   │  │   │
│  │  └──────────────────┘        └─────────────┘       └─────────────────┘  │   │
│  │                                                                          │   │
│  │  WORKERS                      QUEUES                EXTERNAL SERVICES    │   │
│  │  ┌──────────────────┐        ┌─────────────┐       ┌─────────────────┐  │   │
│  │  │ Running:   8/10  │        │ Jobs: 1,247 │       │ Claude API  ✓   │  │   │
│  │  │ Idle:       2    │        │ Priority: 89│       │ 2Captcha    ✓   │  │   │
│  │  │ CPU: 67%        │        │ Delayed: 23 │       │ SendGrid    ✓   │  │   │
│  │  │ Memory: 4.2GB   │        │ Dead: 0     │       │ Twilio      ✓   │  │   │
│  │  └──────────────────┘        └─────────────┘       └─────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─── GEOGRAPHIC STATUS ────────────────────────────────────────────────────┐  │
│  │  US-NYC ████ 95%   UK-LON ████ 92%   DE-BER ███░ 78%   JP-TOK ████ 89%  │  │
│  │  US-LA  ████ 94%   FR-PAR ███░ 81%   AU-SYD ████ 91%   SG-SG  ████ 88%  │  │
│  │  US-CHI ████ 96%   NL-AMS ████ 90%   IN-MUM ███░ 76%   BR-SAO ██░░ 67%  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── COST TRACKER (Today) ─────────────────────────────────────────────────┐  │
│  │  Total: $127.45    Proxies: $78.20    AI: $32.15    Compute: $12.10     │  │
│  │  Budget: $200/day  ████████████████████░░░░░ 64% used                    │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  [Studies] [Infrastructure] [Alerts] [Costs] [Audit] [Settings]    [? Help]   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Studies Panel (Drill-Down)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ACTIVE STUDIES                                                    [+ New Study]│
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  │ Study                  │ Tenant  │ Progress │ ETA      │ Status │ Actions  ││
│  ├────────────────────────┼─────────┼──────────┼──────────┼────────┼──────────┤│
│  │ brand-monitor-q1       │ Kyanos  │ ██████░░ │ 2h 15m   │ ✓ OK   │ [View]   ││
│  │ competitor-analysis    │ GLU     │ ████░░░░ │ 4h 30m   │ ✓ OK   │ [View]   ││
│  │ legal-discovery-jan    │ Kyanos  │ ███░░░░░ │ 6h 10m   │ ⚠ RISK │ [View]   ││
│  │ pricing-research       │ GLU     │ █████░░░ │ 1h 45m   │ ✓ OK   │ [View]   ││
│  │ sentiment-tracking     │ Kyanos  │ ███████░ │ 45m      │ ✓ OK   │ [View]   ││
│  └────────────────────────┴─────────┴──────────┴──────────┴────────┴──────────┘│
│                                                                                 │
│  ⚠ AT-RISK STUDY: legal-discovery-jan                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Deadline: 2025-01-16 20:00 UTC (5h 28m remaining)                      │   │
│  │  Progress: 38% (1,140/3,000 cells)                                      │   │
│  │  Required rate: 340 cells/hour    Current rate: 180 cells/hour          │   │
│  │  Bottleneck: ChatGPT rate limiting (success rate: 45%)                  │   │
│  │                                                                          │   │
│  │  Recommended Actions:                                                    │   │
│  │  • [Scale workers +2] • [Rotate accounts] • [Notify tenant] • [Pause]   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Infrastructure Panel

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE HEALTH                                          [Refresh 30s]  │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  ┌─── PROXY PROVIDERS ──────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Provider      Status    Latency   Success   Bandwidth    Cost Today    │  │
│  │  ──────────────────────────────────────────────────────────────────────  │  │
│  │  Bright Data   ✓ OK      142ms     97.2%     12.4 GB      $186.00       │  │
│  │  Oxylabs       ✓ OK      138ms     96.8%     8.2 GB       $123.00       │  │
│  │  SmartProxy    ⚠ SLOW    312ms     94.1%     3.1 GB       $37.20        │  │
│  │  IPRoyal       ✓ OK      156ms     95.5%     1.8 GB       $10.80        │  │
│  │                                                                          │  │
│  │  [Test All] [Rotate IPs] [Failover Settings]                            │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── SESSION POOL ─────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Surface        Active   Idle   Warming   Cooling   Health    Actions   │  │
│  │  ─────────────────────────────────────────────────────────────────────   │  │
│  │  ChatGPT        4        1      1         0         ████ 92%  [+] [-]   │  │
│  │  Gemini         3        2      0         1         ████ 95%  [+] [-]   │  │
│  │  Perplexity     2        1      1         0         ███░ 78%  [+] [-]   │  │
│  │  Google Search  3        1      0         0         ████ 98%  [+] [-]   │  │
│  │                                                                          │  │
│  │  [Warm All] [Cool All] [Rotate All]                                     │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── ACCOUNT POOL ─────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Surface        Available   In-Use   Flagged   Retired   Actions        │  │
│  │  ─────────────────────────────────────────────────────────────────────   │  │
│  │  ChatGPT        3           5        1         2         [Register]     │  │
│  │  Gemini         4           3        0         1         [Register]     │  │
│  │  Perplexity     2           4        0         0         [Register]     │  │
│  │  Meta AI        2           2        1         0         ⚠ LOW POOL     │  │
│  │                                                                          │  │
│  │  ⚠ Alert: Meta AI account pool below threshold (4 needed, 2 available)  │  │
│  │  [Request more accounts from operator]                                   │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Alerts & Incidents Panel

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ALERTS & INCIDENTS                                        [Acknowledge All]   │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  ACTIVE ALERTS (2)                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠ WARNING  14:28  Bright Data EU region latency > 300ms                 │  │
│  │            Affected locations: DE-BER, FR-PAR, NL-AMS                    │  │
│  │            Duration: 4 minutes                                           │  │
│  │            [Acknowledge] [Failover to Oxylabs] [Investigate]             │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ ⚠ WARNING  14:15  ChatGPT rate limiting detected                        │  │
│  │            Success rate dropped to 45% (threshold: 80%)                  │  │
│  │            Affected studies: legal-discovery-jan                         │  │
│  │            [Acknowledge] [Rotate accounts] [Scale back] [Investigate]    │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  RECENT INCIDENTS (Last 24h)                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ ✓ RESOLVED  12:45  Perplexity adapter timeout (45 min)                  │  │
│  │ ✓ RESOLVED  08:20  SmartProxy outage - failover to Bright Data (12 min) │  │
│  │ ✓ RESOLVED  Yesterday 22:15  Meta AI CAPTCHA spike (resolved by 2Captcha)│  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  [View All History] [Export Report] [Configure Thresholds]                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Operator Actions

The dashboard provides direct intervention capabilities:

| Action | Description | Confirmation Required |
|--------|-------------|----------------------|
| Scale workers | Add/remove executor workers | No |
| Rotate accounts | Force account rotation for surface | Yes |
| Rotate proxies | Force proxy rotation for location | No |
| Failover provider | Switch to backup proxy provider | Yes |
| Pause study | Temporarily halt study execution | Yes |
| Resume study | Resume paused study | No |
| Cancel study | Cancel with partial results | Yes (double) |
| Warm sessions | Pre-warm browser sessions | No |
| Register account | Add new account to pool | Validation |
| Acknowledge alert | Mark alert as seen/handled | No |
| **Remote session** | Take manual control of browser | No |
| **Manual CAPTCHA** | Solve CAPTCHA manually | No |
| **Create account** | Open browser to create new account | No |

#### Manual Intervention Mode (Remote Browser Control)

When automated systems fail, operators can take manual control:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  MANUAL INTERVENTION                                              [End Session] │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  Session: ChatGPT / US-NYC / Account: chatgpt-prod-07                          │
│  Reason: CAPTCHA stuck - 2Captcha unable to solve                              │
│  Study: legal-discovery-jan (paused, waiting for intervention)                 │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                         │   │
│  │                    [LIVE BROWSER VIEW]                                  │   │
│  │                                                                         │   │
│  │     ┌─────────────────────────────────────────────────────────┐       │   │
│  │     │                                                         │       │   │
│  │     │              ChatGPT Interface                          │       │   │
│  │     │                                                         │       │   │
│  │     │     [CAPTCHA Challenge displayed here]                  │       │   │
│  │     │                                                         │       │   │
│  │     │     Operator can click, type, and interact              │       │   │
│  │     │                                                         │       │   │
│  │     └─────────────────────────────────────────────────────────┘       │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Controls:                                                                      │
│  [Take Control] [Release Control] [Refresh] [Screenshot] [Mark Resolved]       │
│                                                                                 │
│  Actions after resolution:                                                      │
│  ( ) Resume study automatically                                                 │
│  ( ) Keep session for further investigation                                     │
│  (•) Return session to pool                                                     │
│                                                                                 │
│  Audit: All manual actions are logged with operator ID and timestamp            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Remote Session Capabilities:**

| Capability | Description |
|------------|-------------|
| Live view | Real-time view of browser session via VNC/WebRTC |
| Mouse control | Click, drag, scroll |
| Keyboard input | Type text, key combinations |
| Screenshot | Capture current state |
| CAPTCHA solving | Manually solve any CAPTCHA type |
| Form filling | Enter credentials, complete forms |
| Navigation | Go to URLs, refresh, back/forward |

#### Account Provisioning Workflow

Operators create new accounts through a guided workflow:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  CREATE NEW ACCOUNT                                                [Cancel]     │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  Step 1 of 4: Select Surface                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  ( ) ChatGPT Plus ($20/mo)                                              │   │
│  │  (•) Gemini (Free)                                                      │   │
│  │  ( ) Perplexity Pro ($20/mo)                                            │   │
│  │  ( ) Meta AI (Free)                                                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Step 2 of 4: Configure Proxy                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Location: [US-NYC ▼]    Provider: [Bright Data ▼]                      │   │
│  │  ⚠ Use residential IP to avoid detection during account creation        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Step 3 of 4: Open Browser Session                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  [Launch Browser]                                                        │   │
│  │                                                                          │   │
│  │  Browser will open with:                                                 │   │
│  │  • Fresh browser profile                                                 │   │
│  │  • Residential proxy (US-NYC)                                            │   │
│  │  • Human behavior simulation disabled (manual control)                   │   │
│  │                                                                          │   │
│  │  You will need to:                                                       │   │
│  │  1. Navigate to signup page                                              │   │
│  │  2. Complete registration (email, phone verification)                    │   │
│  │  3. Set up payment if required                                           │   │
│  │  4. Complete any initial setup                                           │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Step 4 of 4: Register Account                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Account Email: [_________________________]                              │   │
│  │  Account ID:    [_________________________] (internal reference)         │   │
│  │  Notes:         [_________________________]                              │   │
│  │                                                                          │   │
│  │  [Save cookies/session] [Test login] [Register Account]                  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Manual Login Recovery

When a session loses authentication:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  LOGIN RECOVERY                                                    [Cancel]     │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  Account: chatgpt-prod-03                                                       │
│  Surface: ChatGPT                                                               │
│  Last successful login: 2 hours ago                                             │
│  Failure reason: Session expired, re-authentication required                    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                         │   │
│  │                    [LIVE BROWSER VIEW]                                  │   │
│  │                                                                         │   │
│  │     Currently showing: ChatGPT login page                               │   │
│  │                                                                         │   │
│  │     Operator actions needed:                                            │   │
│  │     1. Enter credentials (retrieved from secure vault)                  │   │
│  │     2. Complete 2FA if prompted                                         │   │
│  │     3. Solve any CAPTCHAs                                               │   │
│  │     4. Verify login successful                                          │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Credentials: [Show Password] (from secure vault)                               │
│  2FA Method: Authenticator app / SMS                                            │
│                                                                                 │
│  [Take Control] [Auto-fill Credentials] [Mark Login Successful] [Mark Failed]  │
│                                                                                 │
│  After successful login:                                                        │
│  [✓] Save new session cookies                                                   │
│  [✓] Return account to active pool                                              │
│  [ ] Keep for investigation                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Audit Trail for Manual Interventions

All manual actions are logged:

```typescript
interface ManualInterventionLog {
  id: string;
  timestamp: Date;
  operatorId: string;
  operatorName: string;

  // What was done
  actionType: 'remote_control' | 'captcha_solve' | 'login_recovery' | 'account_creation';
  surfaceId: string;
  accountId?: string;
  sessionId: string;

  // Context
  reason: string;
  studyId?: string;

  // Duration
  startTime: Date;
  endTime: Date;

  // Outcome
  outcome: 'success' | 'failure' | 'escalated';
  notes?: string;

  // Evidence
  screenshotsBefore: string[];
  screenshotsAfter: string[];
}
```

#### Real-Time Updates

- WebSocket connection for live updates (no polling)
- Auto-refresh every 30 seconds for metrics
- Instant alerts pushed to dashboard
- Sound notifications for critical alerts (configurable)
- Desktop notifications when tab not focused

#### Multi-Tenant View

Operators see all tenants' studies with clear tenant labels. Tenant admins only see their own studies (separate tenant dashboard, not mission control).

```
┌─── TENANT FILTER ───┐
│ [✓] All Tenants     │
│ [✓] Kyanos          │
│ [✓] GLU             │
│ [ ] Show completed  │
└─────────────────────┘
```

---

### 11. Tenant Dashboard

**Purpose:** Self-service monitoring for tenants to track their studies, view results, and manage their account.

#### Tenant Dashboard Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  KYANOS DASHBOARD                                           [Account] [Logout]  │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  ┌─── MY STUDIES ───────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Active: 3     Scheduled: 2     Completed (30d): 47     Failed: 1       │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── ACTIVE STUDIES ───────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Study                    Progress        ETA          Status            │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  brand-monitoring-q1      ████████░░ 78%  1h 45m       ✓ On Track       │  │
│  │  legal-discovery-jan      ███░░░░░░░ 38%  5h 30m       ⚠ At Risk        │  │
│  │  competitor-weekly        █████████░ 92%  25m          ✓ On Track       │  │
│  │                                                                          │  │
│  │  [View All Studies]                                                      │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── SCHEDULED STUDIES ────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Study                    Schedule              Next Run      Actions    │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  daily-sentiment          Every day 06:00 UTC   Tomorrow      [Edit]    │  │
│  │  weekly-competitor        Mon 00:00 UTC         In 3 days     [Edit]    │  │
│  │                                                                          │  │
│  │  [+ Schedule New Study]                                                  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── RECENT COMPLETIONS ───────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Study                    Completed           Cells      Results         │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  brand-monitor-dec-30     2h ago              2,847/3,000  [Download]   │  │
│  │  pricing-analysis         Yesterday 18:30     1,450/1,500  [Download]   │  │
│  │  sentiment-weekly-52      2 days ago          2,998/3,000  [Download]   │  │
│  │                                                                          │  │
│  │  [View All Results]                                                      │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── USAGE & COSTS (This Month) ───────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Studies: 23    Cells: 68,400    Cost: $2,847.20    Budget: $5,000      │  │
│  │  ████████████████████████████░░░░░░░░░░░░░░░░░░░░░ 57%                  │  │
│  │                                                                          │  │
│  │  [View Detailed Billing]                                                 │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  [Studies] [Results] [Schedules] [Billing] [API Keys] [Settings]              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Study Detail View

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  STUDY: brand-monitoring-q1                                    [← Back]         │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  Status: EXECUTING          Started: 2025-01-16 12:00 UTC                       │
│  Deadline: 2025-01-16 18:00 UTC (4h 15m remaining)                             │
│                                                                                 │
│  ┌─── PROGRESS ─────────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Overall: ██████████████████████████░░░░░░░░ 78% (2,340/3,000 cells)    │  │
│  │                                                                          │  │
│  │  By Surface:                                          Completion Rate    │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  ChatGPT      [REQUIRED]   ████████████████████░░░░ 85%    425/500      │  │
│  │  Gemini       [REQUIRED]   ██████████████████░░░░░░ 76%    380/500      │  │
│  │  Perplexity   [REQUIRED]   █████████████████████░░░ 88%    440/500      │  │
│  │  Google AI    [OPTIONAL]   ██████████████░░░░░░░░░░ 62%    310/500      │  │
│  │  Copilot      [OPTIONAL]   █████████████████░░░░░░░ 71%    355/500      │  │
│  │  Meta AI      [OPTIONAL]   ████████████░░░░░░░░░░░░ 54%    270/500      │  │
│  │                                                                          │  │
│  │  By Location:                                                            │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  US-NYC       ████████████████████░░░░ 82%                              │  │
│  │  US-LA        ███████████████████░░░░░ 79%                              │  │
│  │  UK-LON       █████████████████████░░░ 86%                              │  │
│  │  DE-BER       ██████████████░░░░░░░░░░ 65%                              │  │
│  │  FR-PAR       █████████████████░░░░░░░ 72%                              │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── TIMELINE ─────────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  12:00 ──●── Study started                                              │  │
│  │  12:15 ──●── All workers active (8 workers)                             │  │
│  │  13:30 ──●── 25% complete                                               │  │
│  │  14:00 ──⚠── ChatGPT rate limiting detected, scaling back               │  │
│  │  14:45 ──●── 50% complete                                               │  │
│  │  15:30 ──●── 75% complete                                               │  │
│  │  ...    ──○── Estimated completion: 16:15 UTC                           │  │
│  │  18:00 ──○── Deadline                                                   │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── MANIFEST SUMMARY ─────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Queries: 50            Evidence: Full (screenshots + metadata)          │  │
│  │  Surfaces: 6            Legal Hold: Yes                                  │  │
│  │  Locations: 10          Session Isolation: Dedicated                     │  │
│  │  Total Cells: 3,000     Completion Threshold: 95% (required surfaces)   │  │
│  │                                                                          │  │
│  │  [View Full Manifest]                                                    │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── ESTIMATED COST ───────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Proxies: $28.50    AI: $12.30    Compute: $8.20    Total: ~$49.00      │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  Actions: [Pause Study] [Cancel Study] [Download Partial Results]              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Schedule Management

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SCHEDULED STUDIES                                           [+ New Schedule]   │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  ┌─── ACTIVE SCHEDULES ─────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Name                  Manifest        Schedule           Next Run       │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  daily-sentiment       sentiment.json  Daily 06:00 UTC    Tomorrow 06:00│  │
│  │  weekly-competitor     compete.json    Mon 00:00 UTC      Jan 20 00:00  │  │
│  │  monthly-brand         brand.json      1st of month       Feb 1 00:00   │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── EDIT SCHEDULE: daily-sentiment ───────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Name: [daily-sentiment_____________]                                    │  │
│  │                                                                          │  │
│  │  Manifest: [sentiment.json ▼]  [Upload New]                             │  │
│  │                                                                          │  │
│  │  Schedule Type:                                                          │  │
│  │  (•) Daily    ( ) Weekly    ( ) Monthly    ( ) Custom Cron              │  │
│  │                                                                          │  │
│  │  Time: [06:00] UTC                                                       │  │
│  │                                                                          │  │
│  │  Notifications:                                                          │  │
│  │  [✓] Email on completion                                                 │  │
│  │  [✓] Email on failure                                                    │  │
│  │  [✓] Webhook on completion                                               │  │
│  │  [ ] Slack notification                                                  │  │
│  │                                                                          │  │
│  │  Webhook URL: [https://kyanos.ai/webhooks/bentham___________]           │  │
│  │                                                                          │  │
│  │  [Save Schedule] [Delete Schedule] [Run Now]                             │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── SCHEDULE HISTORY ─────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Schedule              Last Run            Status     Duration   Cells   │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  daily-sentiment       Today 06:00         ✓ Success  2h 15m     3,000  │  │
│  │  daily-sentiment       Yesterday 06:00     ✓ Success  2h 08m     3,000  │  │
│  │  weekly-competitor     Jan 13 00:00        ✓ Success  4h 30m     6,000  │  │
│  │  daily-sentiment       Jan 14              ✗ Failed   45m        892    │  │
│  │                                                                          │  │
│  │  [View All History]                                                      │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Results Browser

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  STUDY RESULTS: brand-monitoring-q1                            [← Back]         │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  Completed: 2025-01-16 16:15 UTC    Cells: 2,847/3,000 (94.9%)                 │
│                                                                                 │
│  ┌─── FILTERS ──────────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Surface: [All ▼]    Location: [All ▼]    Status: [All ▼]               │  │
│  │  Query: [________________________] [Search]                              │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── RESULTS TABLE ────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Query              Surface    Location  Status   Response     Evidence  │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  "Brand X review"   ChatGPT    US-NYC    ✓        [View]       [📷]     │  │
│  │  "Brand X review"   ChatGPT    US-LA     ✓        [View]       [📷]     │  │
│  │  "Brand X review"   ChatGPT    UK-LON    ✓        [View]       [📷]     │  │
│  │  "Brand X review"   Gemini     US-NYC    ✓        [View]       [📷]     │  │
│  │  "Brand X review"   Gemini     US-LA     ✗ Failed  -           -        │  │
│  │  "Brand X review"   Gemini     UK-LON    ✓        [View]       [📷]     │  │
│  │  ...                                                                     │  │
│  │                                                                          │  │
│  │  Showing 1-50 of 2,847    [< Prev] [1] [2] [3] ... [57] [Next >]        │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── RESPONSE VIEWER ──────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Query: "What do customers say about Brand X?"                           │  │
│  │  Surface: ChatGPT    Location: US-NYC    Time: 2025-01-16 14:32:15      │  │
│  │                                                                          │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │  │
│  │  │                                                                 │    │  │
│  │  │  Response Text:                                                 │    │  │
│  │  │                                                                 │    │  │
│  │  │  "Based on customer reviews, Brand X is generally well-        │    │  │
│  │  │  regarded for its quality and customer service. Common         │    │  │
│  │  │  positive mentions include..."                                  │    │  │
│  │  │                                                                 │    │  │
│  │  │  [Full Response - 847 words]                                    │    │  │
│  │  │                                                                 │    │  │
│  │  └─────────────────────────────────────────────────────────────────┘    │  │
│  │                                                                          │  │
│  │  Evidence: [View Screenshot] [View HTML Archive] [View HAR]              │  │
│  │  Hash: SHA-256: a1b2c3d4e5...  Timestamp: RFC 3161 verified             │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  Export: [CSV] [JSON] [Excel] [Full Evidence Package (.zip)]                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Comparison View

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  COMPARE RESPONSES                                                              │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  Query: "What do customers say about Brand X?"                                  │
│                                                                                 │
│  Compare by: (•) Surface    ( ) Location    ( ) Time                           │
│                                                                                 │
│  ┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐     │
│  │    ChatGPT      │     Gemini      │   Perplexity    │   Google AI     │     │
│  │    US-NYC       │     US-NYC      │     US-NYC      │     US-NYC      │     │
│  ├─────────────────┼─────────────────┼─────────────────┼─────────────────┤     │
│  │                 │                 │                 │                 │     │
│  │ "Based on      │ "Customer       │ "According to   │ "Brand X has    │     │
│  │ customer       │ sentiment for   │ recent reviews  │ received mostly │     │
│  │ reviews,       │ Brand X is      │ on major        │ positive        │     │
│  │ Brand X is     │ largely         │ platforms,      │ feedback with   │     │
│  │ generally      │ positive..."    │ Brand X..."     │ 4.2/5 stars..." │     │
│  │ well-          │                 │                 │                 │     │
│  │ regarded..."   │                 │                 │                 │     │
│  │                 │                 │                 │                 │     │
│  │ [Full] [📷]    │ [Full] [📷]    │ [Full] [📷]    │ [Full] [📷]    │     │
│  └─────────────────┴─────────────────┴─────────────────┴─────────────────┘     │
│                                                                                 │
│  [Export Comparison]                                                            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Tenant Billing Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BILLING & USAGE                                               [Download PDF]   │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  Period: [January 2025 ▼]                                                       │
│                                                                                 │
│  ┌─── SUMMARY ──────────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Total Cost: $2,847.20          Budget: $5,000/month                    │  │
│  │  ████████████████████████████░░░░░░░░░░░░░░░░░░░░░ 57%                  │  │
│  │                                                                          │  │
│  │  Studies Run: 23        Total Cells: 68,400       Avg Cost/Cell: $0.042 │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── COST BREAKDOWN ───────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Category           Cost         % of Total    Trend                    │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  Proxy Bandwidth    $1,423.10    50.0%         ↑ +5% vs last month      │  │
│  │  AI (Claude API)    $712.30      25.0%         ↓ -8% vs last month      │  │
│  │  Compute            $427.38      15.0%         → same                   │  │
│  │  Storage            $142.31      5.0%          ↑ +12% vs last month     │  │
│  │  CAPTCHA Solving    $85.39       3.0%          ↓ -15% vs last month     │  │
│  │  Other              $56.72       2.0%          → same                   │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── BY STUDY ─────────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Study                          Cells      Cost        Cost/Cell        │  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  daily-sentiment (×16)          48,000     $1,920.00   $0.040           │  │
│  │  weekly-competitor (×4)         24,000     $1,080.00   $0.045           │  │
│  │  brand-monitoring-q1            3,000      $147.20     $0.049           │  │
│  │  ...                                                                     │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  [View Invoices] [Update Payment Method] [Change Plan]                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Tenant API Keys Management

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  API KEYS                                                    [+ Create New Key] │
│  ═══════════════════════════════════════════════════════════════════════════════│
│                                                                                 │
│  ┌─── ACTIVE KEYS ──────────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Name              Key                    Created      Last Used  Actions│  │
│  │  ────────────────────────────────────────────────────────────────────    │  │
│  │  Production        sk_live_****4a2b      Jan 1        2 min ago  [···]  │  │
│  │  Staging           sk_test_****8c3d      Jan 5        3 days ago [···]  │  │
│  │  CI/CD Pipeline    sk_live_****9e4f      Jan 10       1 hour ago [···]  │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─── CREATE NEW KEY ───────────────────────────────────────────────────────┐  │
│  │                                                                          │  │
│  │  Name: [_________________________]                                       │  │
│  │                                                                          │  │
│  │  Environment: (•) Production    ( ) Test                                 │  │
│  │                                                                          │  │
│  │  Permissions:                                                            │  │
│  │  [✓] Create studies                                                      │  │
│  │  [✓] View study status                                                   │  │
│  │  [✓] Download results                                                    │  │
│  │  [ ] Cancel studies                                                      │  │
│  │  [ ] Manage schedules                                                    │  │
│  │                                                                          │  │
│  │  Rate Limit: [100] requests/minute                                       │  │
│  │                                                                          │  │
│  │  [Create Key]                                                            │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  API Documentation: [View Docs] [Download OpenAPI Spec]                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Tenant Notifications

Tenants receive notifications through their configured channels:

| Event | Email | Webhook | Slack |
|-------|-------|---------|-------|
| Study started | Optional | ✓ | Optional |
| Study completed | ✓ | ✓ | Optional |
| Study failed | ✓ | ✓ | ✓ |
| Study at-risk | ✓ | ✓ | ✓ |
| Scheduled study missed | ✓ | ✓ | ✓ |
| Budget threshold (80%) | ✓ | Optional | Optional |
| Monthly invoice ready | ✓ | - | - |

---

## Data Models

### Study (Manifest + State)

```typescript
interface Study {
  id: string;
  tenantId: string;
  manifest: Manifest;

  // State
  status: 'validating' | 'queued' | 'executing' | 'validating_results' |
          'paused' | 'complete' | 'failed';

  // Progress
  totalCells: number;
  completedCells: number;
  failedCells: number;

  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  deadline: Date;

  // Checkpoints
  lastCheckpoint: Checkpoint;

  // Results
  resultSummary?: ResultSummary;

  // Costs
  estimatedCost: CostEstimate;
  actualCost: CostRecord;
}
```

### Manifest

```typescript
interface Manifest {
  version: string;

  // Study definition
  name: string;
  description?: string;

  // The matrix
  queries: Query[];
  surfaces: SurfaceConfig[];
  locations: LocationConfig[];

  // Completion criteria (multi-variate)
  completionCriteria: {
    // Required surfaces - must meet threshold for study to complete
    requiredSurfaces: {
      surfaceIds: string[];           // e.g., ['chatgpt', 'gemini', 'perplexity']
      coverageThreshold: number;      // e.g., 0.95 = 95%
    };
    // Optional surfaces - best effort, do not block completion
    optionalSurfaces?: {
      surfaceIds: string[];           // e.g., ['copilot', 'meta-ai', 'grok']
      // No threshold - capture what we can before deadline
    };
    maxRetriesPerCell: number;        // e.g., 3
    // Deadline priority: complete when required surfaces meet threshold
    // Don't miss deadline waiting for optional surfaces
  };

  // Quality gates
  qualityGates: {
    minResponseLength?: number;
    requireActualContent: boolean;  // not error page
  };

  // Evidence
  evidenceLevel: 'full' | 'metadata' | 'none';
  legalHold: boolean;

  // Timing
  deadline: Date;

  // Data retention
  retentionDays?: number;
  preserveForever?: boolean;

  // Session isolation
  sessionIsolation: 'shared' | 'dedicated_per_study';
}
```

### Job (Single Cell in Matrix)

```typescript
interface Job {
  id: string;
  studyId: string;

  // Coordinates
  queryIndex: number;
  surfaceId: string;
  locationId: string;

  // State
  status: 'pending' | 'executing' | 'validating' | 'complete' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;

  // Result
  result?: JobResult;

  // Dependencies
  dependsOn?: string[];  // job IDs
}
```

### JobResult

```typescript
interface JobResult {
  success: boolean;

  // Response
  response?: {
    text: string;
    structured?: {
      mainResponse: string;
      sources?: string[];
      followUps?: string[];
    };
    responseTimeMs: number;
  };

  // Evidence
  evidence?: {
    screenshotUrl?: string;
    htmlArchiveUrl?: string;
    harFileUrl?: string;
    videoUrl?: string;
    capturedAt: Date;
    sha256Hash: string;
    timestampToken?: string;  // RFC 3161
  };

  // Validation
  validation: {
    passedQualityGates: boolean;
    isActualContent: boolean;
    responseLength: number;
  };

  // Errors
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };

  // Context
  context: {
    sessionId: string;
    proxyIp?: string;
    proxyLocation?: string;      // Actual resolved location
    accountId?: string;
    userAgent: string;
  };
}
```

### LocationConfig

```typescript
interface LocationConfig {
  id: string;                     // e.g., 'us-nyc', 'uk-lon', 'de-ber'
  name: string;                   // e.g., 'New York, US', 'London, UK'
  country: string;                // ISO 3166-1 alpha-2 (e.g., 'US', 'GB', 'DE')
  region?: string;                // State/province (e.g., 'NY', 'CA')
  city?: string;                  // City name (e.g., 'New York', 'Los Angeles')

  // Proxy requirements
  proxyType: 'residential' | 'datacenter' | 'mobile';
  requireSticky: boolean;         // Same IP for entire session
}
```

---

## Geographic Targeting

Geographic targeting is a core capability of Bentham, enabling queries to be executed from specific locations to capture location-specific AI responses.

### Why Geographic Targeting Matters

AI systems often provide different responses based on:
- **Legal/regulatory context:** Different laws in different jurisdictions
- **Local knowledge:** Region-specific businesses, events, culture
- **Language variants:** US vs UK English, regional dialects
- **Market availability:** Products/services available in specific regions
- **Content filtering:** Region-specific content restrictions

### Supported Locations

```typescript
// packages/core/src/constants/locations.ts

export const LOCATIONS = {
  // United States
  'us-national': { country: 'US', name: 'United States (National)' },
  'us-nyc':      { country: 'US', region: 'NY', city: 'New York', name: 'New York, US' },
  'us-la':       { country: 'US', region: 'CA', city: 'Los Angeles', name: 'Los Angeles, US' },
  'us-chi':      { country: 'US', region: 'IL', city: 'Chicago', name: 'Chicago, US' },
  'us-hou':      { country: 'US', region: 'TX', city: 'Houston', name: 'Houston, US' },
  'us-mia':      { country: 'US', region: 'FL', city: 'Miami', name: 'Miami, US' },
  'us-sea':      { country: 'US', region: 'WA', city: 'Seattle', name: 'Seattle, US' },

  // Europe
  'uk-lon':      { country: 'GB', city: 'London', name: 'London, UK' },
  'de-ber':      { country: 'DE', city: 'Berlin', name: 'Berlin, Germany' },
  'de-mun':      { country: 'DE', city: 'Munich', name: 'Munich, Germany' },
  'fr-par':      { country: 'FR', city: 'Paris', name: 'Paris, France' },
  'nl-ams':      { country: 'NL', city: 'Amsterdam', name: 'Amsterdam, Netherlands' },
  'es-mad':      { country: 'ES', city: 'Madrid', name: 'Madrid, Spain' },
  'it-rom':      { country: 'IT', city: 'Rome', name: 'Rome, Italy' },

  // Asia Pacific
  'jp-tok':      { country: 'JP', city: 'Tokyo', name: 'Tokyo, Japan' },
  'au-syd':      { country: 'AU', city: 'Sydney', name: 'Sydney, Australia' },
  'sg-sg':       { country: 'SG', city: 'Singapore', name: 'Singapore' },
  'in-mum':      { country: 'IN', city: 'Mumbai', name: 'Mumbai, India' },

  // Americas
  'ca-tor':      { country: 'CA', city: 'Toronto', name: 'Toronto, Canada' },
  'ca-van':      { country: 'CA', city: 'Vancouver', name: 'Vancouver, Canada' },
  'br-sao':      { country: 'BR', city: 'São Paulo', name: 'São Paulo, Brazil' },
  'mx-mex':      { country: 'MX', city: 'Mexico City', name: 'Mexico City, Mexico' },
} as const;

export type LocationId = keyof typeof LOCATIONS;
```

### Location-to-Proxy Mapping

The proxy manager translates location requirements to proxy provider configurations:

```typescript
interface ProxyLocationMapping {
  locationId: LocationId;
  providers: {
    brightData: {
      country: string;      // ISO code for Bright Data
      city?: string;        // City targeting (premium feature)
    };
    oxylabs: {
      country: string;
      city?: string;
    };
  };
  // Fallback chain if primary provider unavailable
  fallbackOrder: ('brightData' | 'oxylabs' | 'smartProxy')[];
}
```

### Geographic Targeting Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Job Execution                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Job specifies: locationId = 'us-nyc'                        │
│                                                                  │
│  2. Proxy Manager receives location request                      │
│     ┌─────────────────────────────────────────┐                 │
│     │  getProxyForLocation('us-nyc')          │                 │
│     │    → Lookup provider mapping            │                 │
│     │    → Select available provider          │                 │
│     │    → Request sticky session             │                 │
│     │    → Return proxy config                │                 │
│     └─────────────────────────────────────────┘                 │
│                                                                  │
│  3. Session Pool configures browser with proxy                   │
│     ┌─────────────────────────────────────────┐                 │
│     │  Browser → Proxy (NYC residential IP)   │                 │
│     │    → Target Surface (ChatGPT, etc.)     │                 │
│     └─────────────────────────────────────────┘                 │
│                                                                  │
│  4. Evidence Collector records actual location                   │
│     - Proxy IP address                                          │
│     - Resolved geolocation                                      │
│     - Any location-specific response indicators                 │
└─────────────────────────────────────────────────────────────────┘
```

### Location Verification

To ensure queries actually execute from the intended location:

1. **IP Geolocation Check:** Verify proxy IP resolves to expected location
2. **Response Indicators:** Check for location-specific content in responses
3. **Timezone Signals:** Browser timezone matches location
4. **Language Headers:** Accept-Language headers match location

```typescript
interface LocationVerification {
  requested: LocationId;
  actual: {
    ip: string;
    country: string;
    region?: string;
    city?: string;
    confidence: number;     // 0-1 confidence in geolocation
  };
  match: boolean;           // Did actual match requested?
  warnings?: string[];      // Any concerns about the match
}
```

### Surface-Specific Location Behavior

Not all surfaces support or respond to geographic targeting equally:

| Surface | Geo-Targeting | Notes |
|---------|---------------|-------|
| ChatGPT Web | ✓ Strong | Different responses by location |
| Gemini Web | ✓ Strong | Google's geo-awareness |
| Perplexity | ✓ Moderate | Some location awareness |
| Google Search | ✓ Strong | Highly location-dependent |
| Bing/Copilot | ✓ Strong | Microsoft's geo features |
| Meta AI | ✓ Moderate | Regional availability varies |
| OpenAI API | ✗ None | API doesn't use client location |
| Anthropic API | ✗ None | API doesn't use client location |

### Location Costs

Geographic targeting affects costs:

| Location Type | Proxy Cost Multiplier | Notes |
|---------------|----------------------|-------|
| US National | 1.0x | Base rate |
| US City-specific | 1.2x | Premium for city targeting |
| Europe | 1.3x | Moderate premium |
| Asia Pacific | 1.5x | Higher premium |
| South America | 1.4x | Moderate-high premium |

---

## Deployment Architecture (AWS)

```
┌─────────────────────────────────────────────────────────────────────┐
│                              AWS                                     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                        VPC                                   │    │
│  │                                                              │    │
│  │  ┌────────────────┐    ┌────────────────┐                   │    │
│  │  │   ALB          │    │   API Gateway  │                   │    │
│  │  │   (Load        │    │   (REST API)   │                   │    │
│  │  │   Balancer)    │    │                │                   │    │
│  │  └───────┬────────┘    └───────┬────────┘                   │    │
│  │          │                     │                             │    │
│  │  ┌───────▼─────────────────────▼────────┐                   │    │
│  │  │              ECS Cluster              │                   │    │
│  │  │  ┌──────────┐  ┌──────────┐          │                   │    │
│  │  │  │   API    │  │  Orch-   │          │                   │    │
│  │  │  │ Service  │  │ estrator │          │                   │    │
│  │  │  │ (Fargate)│  │ (Fargate)│          │                   │    │
│  │  │  └──────────┘  └──────────┘          │                   │    │
│  │  │  ┌──────────┐  ┌──────────┐          │                   │    │
│  │  │  │ Executor │  │Validator │          │                   │    │
│  │  │  │ Workers  │  │ Service  │          │                   │    │
│  │  │  │ (Fargate)│  │ (Fargate)│          │                   │    │
│  │  │  └──────────┘  └──────────┘          │                   │    │
│  │  │  ┌──────────┐  ┌──────────┐          │                   │    │
│  │  │  │    AI    │  │ Evidence │          │                   │    │
│  │  │  │ Advisor  │  │Collector │          │                   │    │
│  │  │  │ (Fargate)│  │ (Fargate)│          │                   │    │
│  │  │  └──────────┘  └──────────┘          │                   │    │
│  │  └──────────────────────────────────────┘                   │    │
│  │                         │                                    │    │
│  │  ┌──────────────────────▼───────────────────────────────┐   │    │
│  │  │                   Data Layer                          │   │    │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │   │    │
│  │  │  │   RDS   │ │   S3    │ │ Elasti- │ │   SQS   │     │   │    │
│  │  │  │ Postgres│ │Evidence │ │  Cache  │ │ Queues  │     │   │    │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    External Services                         │    │
│  │  • Residential Proxies (Bright Data, Oxylabs)               │    │
│  │  • CAPTCHA Solving (2Captcha)                               │    │
│  │  • Timestamp Authority (RFC 3161)                           │    │
│  │  • Claude API (AI Advisor)                                  │    │
│  │  • Notification Services (Slack, SendGrid, Twilio)          │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Security Architecture

### Authentication
- Tenant API keys for programmatic access
- SSO integration (Google, Okta) for dashboard
- JWT tokens for session management

### Authorization (RBAC)
- Platform roles: System Admin, System Operator
- Tenant roles: Tenant Admin, Study Manager, Analyst, API Access
- All data access filtered by tenant ID

### Data Protection
- Encryption at rest (S3, RDS)
- Encryption in transit (TLS 1.3)
- Tenant data isolation at database level

### Audit Trail
- All actions logged with actor, timestamp, resource
- Immutable audit log storage
- 7-year retention

---

## Failure Handling

### Job-Level Failures
1. Automatic retry with exponential backoff
2. Surface-specific retry strategies
3. Session rotation on repeated failures
4. Proxy rotation on IP blocks
5. Mark failed after max retries

### Study-Level Recovery
1. Checkpoint state on every job completion
2. Resume from last checkpoint on restart
3. Skip completed jobs on resume
4. Recalculate progress from persistent state

### System-Level Escalation
1. Alert operator when study at risk
2. Auto-scale workers if behind schedule
3. Reprioritize queue to meet deadlines
4. Notify tenant if deadline cannot be met

### AI Advisor for Troubleshooting
1. System describes problem to AI
2. AI suggests resolution approaches
3. System validates suggestion is safe
4. System executes and verifies result
5. Log AI-assisted resolution

---

## Cost Tracking

### Billable Components

| Component | Unit | Tracking Method |
|-----------|------|-----------------|
| Proxy bandwidth | GB | Provider API/estimates |
| API calls | Tokens/calls | Response metadata |
| Compute | CPU-hours | ECS metrics |
| Storage | GB-months | S3 metrics |
| Accounts | Per account | Account manager |
| Timestamps | Per timestamp | Service invoices |

### Cost Attribution
- Every job tagged with study ID and tenant ID
- Aggregate costs at study level
- Roll up to tenant for billing
- Provide cost estimates before execution

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-16 | Claude Code | Initial architecture from interview |
