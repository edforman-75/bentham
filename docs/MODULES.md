# Bentham Module Breakdown

## Module Isolation Principles

Each module:

- Lives in its own directory under `/packages/`
- Has its own `package.json` with explicit dependencies
- Exposes a clean public API via `index.ts`
- Has its own test suite (unit + integration)
- Can be developed, tested, and deployed independently
- Communicates with other modules only through defined interfaces

---

## Module Overview

```
packages/
├── core/                    # Shared types, utilities, constants
├── api-gateway/             # REST API, validation, routing
├── orchestrator/            # Study lifecycle, checkpointing
├── executor/                # Job execution, retry logic
├── validator/               # Quality gates, completion checking
├── ai-advisor/              # AI modules (query gen, scoring, troubleshooting)
├── evidence-collector/      # Screenshots, archives, hashing
├── surface-adapters/        # AI surface implementations
│   ├── api-surfaces/        # OpenAI, Anthropic, Google, etc.
│   ├── web-chatbots/        # ChatGPT Web, Perplexity, etc.
│   └── search-surfaces/     # Google, Bing
├── infrastructure/          # Cross-cutting infrastructure
│   ├── session-pool/        # Browser session management
│   ├── captcha-solver/      # 2Captcha integration
│   ├── proxy-manager/       # Residential proxy management
│   ├── account-manager/     # Surface account management
│   ├── cost-tracker/        # Billing and cost attribution
│   ├── notification-hub/    # Alerts and webhooks
│   ├── audit-logger/        # Compliance logging
│   └── observability/       # Dashboards, demo mode, evidence review
└── database/                # Schema, migrations, repositories
```

---

## Module Specifications

### 1. Core (`packages/core`)

**Purpose:** Shared types, utilities, and constants used across all modules.

**Public API:**
```typescript
// Types
export type { Study, Manifest, Job, JobResult, QueryContext };
export type { Tenant, User, Role };
export type { CostRecord, CostEstimate };

// Utilities
export { generateId, hashContent, validateSchema };
export { formatError, isRetryableError };

// Constants
export { SURFACES, LOCATIONS, ERROR_CODES };
export { DEFAULT_TIMEOUTS, MAX_RETRIES };
```

**Dependencies:** None (leaf module)

**Testing:** Unit tests for all utilities

---

### 2. API Gateway (`packages/api-gateway`)

**Purpose:** HTTP API for tenant interactions.

**Public API:**
```typescript
// Express/Hono app
export { createApp };

// Route handlers
export { studyRoutes, resultRoutes, webhookRoutes };

// Middleware
export { authMiddleware, tenantMiddleware, rateLimitMiddleware };
```

**Endpoints:**
```
POST   /v1/studies                    # Submit manifest
GET    /v1/studies                    # List studies (with filters)
GET    /v1/studies/:id                # Get study status and summary
GET    /v1/studies/:id/results        # Get study results (paginated)
GET    /v1/studies/:id/results/export # Export results (see formats below)
GET    /v1/studies/:id/evidence       # List evidence artifacts
GET    /v1/studies/:id/evidence/:eid  # Download specific evidence
DELETE /v1/studies/:id                # Cancel study
GET    /v1/health                     # Health check
```

**Data Access Formats:**

Bentham makes completed study data available in multiple formats. Tenants consume this data and create their own reports/analyses.

| Format | Endpoint | Description |
|--------|----------|-------------|
| JSON | `GET /results` | Paginated JSON array of results |
| JSON (full) | `GET /results/export?format=json` | Complete results as JSON file |
| CSV | `GET /results/export?format=csv` | Flat CSV with one row per cell |
| Excel | `GET /results/export?format=xlsx` | Excel workbook with sheets per surface |
| Evidence ZIP | `GET /results/export?format=evidence` | ZIP with screenshots, HTML, HAR files |

**Result Data Structure:**
```typescript
interface ResultItem {
  queryIndex: number;
  queryText: string;
  surfaceId: string;
  locationId: string;
  success: boolean;
  response?: {
    text: string;
    responseTimeMs: number;
  };
  evidence?: {
    screenshotUrl: string;
    htmlArchiveUrl: string;
    harFileUrl?: string;
    sha256Hash: string;
    capturedAt: string;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

**Webhook Payload:**
When a study completes, Bentham POSTs to the tenant's webhook URL:
```typescript
interface WebhookPayload {
  event: 'study.complete' | 'study.failed' | 'study.at_risk';
  studyId: string;
  tenantId: string;
  timestamp: string;
  data: {
    status: string;
    completedCells: number;
    failedCells: number;
    totalCells: number;
    completionRate: number;
    resultsUrl: string;    // Direct link to results
    exportUrl: string;     // Direct link to download
  };
}
```

**Dependencies:** `core`, `orchestrator` (client), `validator` (for manifest validation)

**Testing:**
- Unit: Route handlers, middleware
- Integration: Full HTTP request/response cycles

---

### 3. Orchestrator (`packages/orchestrator`)

**Purpose:** Manages study lifecycle, checkpointing, and deadline monitoring.

**Public API:**
```typescript
// Study lifecycle
export { createStudy, cancelStudy, getStudyStatus };
export { resumeStudy, pauseStudy };

// Progress
export { getProgress, updateProgress };

// Checkpointing
export { saveCheckpoint, loadCheckpoint };

// Deadline monitoring
export { checkDeadlines, escalateAtRiskStudies };

// Event handlers
export { onJobComplete, onJobFailed };
```

**State Machine:**
```
manifest_received → validating → queued → executing → validating_results → complete
                                    ↓           ↓
                                  paused ← human_intervention_required
                                    ↓
                                  failed
```

**Dependencies:** `core`, `database`, `executor` (client), `validator` (client), `notification-hub` (client)

**Testing:**
- Unit: State transitions, checkpoint logic
- Integration: Full study lifecycle with mocked dependencies

---

### 4. Executor (`packages/executor`)

**Purpose:** Executes individual jobs from the queue.

**Public API:**
```typescript
// Worker
export { createWorker, WorkerConfig };

// Job management
export { enqueueJob, getJobStatus };

// Retry logic
export { RetryStrategy, calculateBackoff };
```

**Internal Flow:**
1. Pull job from SQS queue
2. Resolve surface adapter
3. Acquire session and proxy
4. Execute query via adapter (with human behavior simulation)
5. Collect evidence (if required)
6. Submit result to validator
7. Report completion to orchestrator

**Human Behavior Simulation:**
The executor must mimic realistic human interaction patterns to avoid detection:
- **Typing:** Variable typing speed (40-80 WPM), occasional pauses, realistic keystroke timing
- **Mouse movement:** Natural cursor paths with acceleration/deceleration, realistic click delays
- **Timing:** Random delays between actions (1-5s for reading, 0.5-2s for navigation)
- **Scrolling:** Gradual scroll with variable speed, occasional scroll-back
- **Focus patterns:** Tab switches, window focus changes like real users
- **Session behavior:** Warm-up browsing before queries, natural session duration

**Key Principle:** Executor NEVER determines study completion. Only reports job outcomes.

**Dependencies:** `core`, `surface-adapters`, `session-pool`, `proxy-manager`, `evidence-collector`

**Testing:**
- Unit: Retry logic, job dispatching
- Integration: End-to-end job execution with mock surfaces

---

### 5. Validator (`packages/validator`)

**Purpose:** Independent authority on job quality and study completion.

**Public API:**
```typescript
// Manifest validation
export { validateManifest, ManifestValidationResult };

// Job validation
export { validateJobResult, JobValidationResult };

// Study completion
export { checkStudyCompletion, StudyCompletionResult };

// Quality gates
export { QualityGate, evaluateQualityGates };
```

**Quality Gates:**
- Response length minimum
- Actual content (not error page)
- Evidence captured (if required)
- Response format valid

**Completion Criteria:**
- Coverage threshold met
- Per-surface minimums met
- No active jobs remaining

**Dependencies:** `core`, `database` (read-only)

**Testing:**
- Unit: Each quality gate, completion logic
- Integration: Full validation flows

---

### 6. AI Advisor (`packages/ai-advisor`)

**Purpose:** Provides AI capabilities with validated outputs.

**Public API:**
```typescript
// Query generation
export { generateQueries, QueryGenerationRequest, GeneratedQuery };

// Response validation
export { validateResponse, ResponseValidationResult };

// Response scoring
export { scoreResponse, ResponseScore };

// Troubleshooting
export { getTroubleshootingAdvice, TroubleshootingAdvice };

// Model interface (for SLM migration)
export { AIModelInterface, ClaudeModel, SLMModel };
```

**Model Abstraction:**
```typescript
interface AIModelInterface {
  generateQueries(context: QueryContext): Promise<GeneratedQuery[]>;
  validateResponse(response: string): Promise<boolean>;
  scoreResponse(response: string, criteria: Criteria): Promise<Score>;
  suggestResolution(error: ErrorContext): Promise<Suggestion[]>;
}
```

**Key Principle:** AI provides suggestions, not commands. All outputs validated before use.

**Dependencies:** `core`, Claude API (external)

**Testing:**
- Unit: Input/output validation, model interface
- Integration: Full AI flows with mocked or real API

---

### 7. Evidence Collector (`packages/evidence-collector`)

**Purpose:** Captures and preserves evidence.

**Public API:**
```typescript
// Capture
export { captureScreenshot, captureHtmlArchive, captureHar };
export { captureVideo, stopVideoCapture };

// Hashing and timestamping
export { hashEvidence, getTimestamp };

// Storage
export { storeEvidence, getEvidenceUrl };

// Legal hold
export { enableLegalHold, getLegalHoldStatus };
```

**Evidence Levels:**
```typescript
type EvidenceLevel = 'full' | 'metadata' | 'none';

// Full: screenshot, HTML, HAR, video (if streaming), all metadata
// Metadata: response text, timestamps, context
// None: response text only
```

**Dependencies:** `core`, S3, RFC 3161 timestamp authority

**Testing:**
- Unit: Hashing, metadata extraction
- Integration: Full capture and storage flow

---

### 8. Surface Adapters (`packages/surface-adapters`)

**Purpose:** Interface with specific AI surfaces.

**Structure:**
```
surface-adapters/
├── index.ts                 # Adapter registry and factory
├── types.ts                 # Common adapter interface
├── api-surfaces/
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── google-ai.ts
│   └── perplexity-api.ts
├── web-chatbots/
│   ├── chatgpt-web.ts
│   ├── claude-web.ts
│   ├── gemini-web.ts
│   ├── perplexity-web.ts
│   ├── meta-ai.ts
│   └── grok.ts
└── search-surfaces/
    ├── google-search.ts     # + AI Overview
    └── bing-search.ts       # + Copilot
```

**Common Interface:**
```typescript
interface SurfaceAdapter {
  id: string;
  name: string;
  category: 'api' | 'web_chatbot' | 'search';

  // Capabilities
  requiresAuth: boolean;
  supportsAnonymous: boolean;
  supportsGeoTargeting: boolean;
  supportedLocations: string[];

  // Operations
  initialize(config: AdapterConfig): Promise<void>;
  executeQuery(query: string, context: QueryContext): Promise<QueryResult>;
  validateSession(): Promise<SessionStatus>;
  resetSession(): Promise<void>;
  cleanup(): Promise<void>;
}
```

**Human Behavior Simulation (Web Adapters):**
Web chatbot and search adapters must implement realistic human behavior:
```typescript
interface HumanBehaviorConfig {
  typing: {
    minWPM: number;           // e.g., 40
    maxWPM: number;           // e.g., 80
    mistakeRate: number;      // e.g., 0.02 (2% typos, corrected)
    pauseProbability: number; // e.g., 0.1 (10% chance of mid-typing pause)
  };
  mouse: {
    movementStyle: 'bezier' | 'natural';
    clickDelay: [number, number];  // e.g., [50, 200] ms
  };
  timing: {
    readingDelay: [number, number];     // e.g., [1000, 5000] ms
    navigationDelay: [number, number];  // e.g., [500, 2000] ms
    scrollBehavior: 'gradual' | 'instant';
  };
}
```

**Dependencies:** `core`, `session-pool`, `proxy-manager`, `captcha-solver`, Playwright

**Testing:**
- Unit: Input validation, error handling
- Integration: Real execution against test accounts (for web surfaces)
- E2E: Full query flow with evidence capture

---

### 9. Infrastructure Modules (`packages/infrastructure/`)

#### 9.1 Session Pool (`packages/infrastructure/session-pool`)

**Purpose:** Manages browser sessions for web surfaces.

**Public API:**
```typescript
export { createSessionPool, SessionPoolConfig };
export { acquireSession, releaseSession };
export { getSessionHealth, rotateSession };

// Browser engine selection
export { BrowserEngine, BrowserEngineConfig };
```

**Browser Engine Support:**
The session pool supports both Playwright and Puppeteer as browser engines. Different surfaces may work better with different engines due to detection patterns and compatibility:

```typescript
type BrowserEngine = 'playwright' | 'puppeteer';

interface BrowserEngineConfig {
  /** Default engine to use */
  defaultEngine: BrowserEngine;
  /** Surface-specific engine overrides */
  surfaceOverrides?: Record<string, BrowserEngine>;
  /** Fallback engine if primary fails */
  fallbackEngine?: BrowserEngine;
}
```

| Surface | Recommended Engine | Reason |
|---------|-------------------|--------|
| ChatGPT Web | Playwright | Better stealth plugins |
| Gemini Web | Playwright | Google detection |
| Perplexity Web | Either | No strong preference |
| Meta AI | Puppeteer | Better with Meta's detection |
| Google Search | Playwright | Puppeteer-extra-stealth issues |
| Bing/Copilot | Either | No strong preference |

**CAPTCHA Integration:**
- Detects CAPTCHA challenges during session operations
- Delegates to captcha-solver for resolution
- Retries operation after CAPTCHA solved

**Dependencies:** `core`, `captcha-solver`, Playwright, Puppeteer, Redis (for state)

---

#### 9.2 CAPTCHA Solver (`packages/infrastructure/captcha-solver`)

**Purpose:** Integrates with external CAPTCHA solving services.

**Public API:**
```typescript
export { createCaptchaSolver, CaptchaSolverConfig };
export { solveCaptcha, CaptchaType };
export { getCaptchaUsage, getCaptchaCost };
```

**Supported CAPTCHA Types:**
- reCAPTCHA v2/v3
- hCaptcha
- Cloudflare Turnstile
- FunCaptcha
- Image-based CAPTCHAs

**Providers:**
- 2Captcha (primary)
- Anti-Captcha (fallback)

**Dependencies:** `core`, 2Captcha API

---

#### 9.3 Proxy Manager (`packages/infrastructure/proxy-manager`)

**Purpose:** Manages residential proxy connections with geographic targeting and provider monitoring.

**Public API:**
```typescript
export { createProxyManager, ProxyConfig };

// Proxy acquisition
export { acquireProxy, releaseProxy };
export { getProxyForLocation, rotateProxy };

// Cost tracking
export { getProxyUsage, getProxyCost };

// Provider monitoring
export { getProviderStatus, ProviderHealth };
export { getProviderMetrics, ProviderMetrics };
export { testProviderConnectivity };
export { getLocationAvailability };
```

**Supported Providers:**
- Bright Data
- Oxylabs
- SmartProxy
- IPRoyal

**Provider Monitoring:**
Real-time monitoring of external IP providers:
```typescript
interface ProviderHealth {
  providerId: string;
  status: 'healthy' | 'degraded' | 'down';
  lastChecked: Date;

  // Availability
  uptime24h: number;              // Percentage
  currentlyAvailable: boolean;

  // Performance
  avgLatencyMs: number;
  successRate: number;            // Last 100 requests

  // Geographic coverage
  locationStatus: Map<LocationId, {
    available: boolean;
    successRate: number;
    avgLatencyMs: number;
  }>;

  // Alerts
  activeAlerts: string[];
}

interface ProviderMetrics {
  providerId: string;
  period: '1h' | '24h' | '7d' | '30d';

  // Usage
  requestCount: number;
  bandwidthGB: number;
  uniqueIPs: number;

  // Quality
  successRate: number;
  avgResponseTimeMs: number;
  blockRate: number;              // Rate of detected blocks
  captchaRate: number;            // Rate of CAPTCHA triggers

  // Cost
  totalCost: number;
  costPerGB: number;
  costPerRequest: number;

  // By location
  byLocation: Map<LocationId, {
    requestCount: number;
    successRate: number;
    avgLatencyMs: number;
  }>;
}
```

**Provider Health Checks:**
- Periodic connectivity tests to each provider
- Per-location availability verification
- Latency monitoring by geographic region
- Success rate tracking per provider/location
- Automatic failover when provider degraded

**Alerting Integration:**
- Triggers notification-hub when provider goes down
- Alerts on sustained high latency or low success rate
- Alerts when location becomes unavailable
- Daily digest of provider health metrics

**Dependencies:** `core`, `notification-hub`, provider APIs

---

#### 9.4 Account Manager (`packages/infrastructure/account-manager`)

**Purpose:** Manages accounts for surfaces requiring login.

**Important:** Accounts are provisioned by humans (operators), not automatically. Account creation for AI surfaces typically requires email/phone verification, payment methods, and CAPTCHA solving that cannot be reliably automated. The Account Manager tracks and assigns accounts from a human-provisioned pool.

**Public API:**
```typescript
export { createAccountManager };

// Account lifecycle (operator actions)
export { registerAccount, retireAccount };     // Register human-provisioned accounts
export { getAccountHealth, markAccountFlagged };

// Study assignment
export { acquireAccount, releaseAccount };

// Monitoring
export { getAccountUsage, getAccountCost };
export { getPoolStatus, checkPoolThresholds }; // Triggers alerts when pool low
```

**Session Isolation Modes:**
- `shared`: Accounts shared across studies (cost-effective)
- `dedicated_per_study`: Fresh accounts per study (unbiased)

**Pool Monitoring:**
- Tracks available accounts per surface
- Monitors account health (active, flagged, rate-limited, blocked)
- Triggers notification-hub alerts when pool falls below threshold
- Alerts include: surface name, current count, threshold, urgency level

**Dependencies:** `core`, `database`, `notification-hub` (client)

---

#### 9.5 Cost Tracker (`packages/infrastructure/cost-tracker`)

**Purpose:** Tracks and attributes costs.

**Public API:**
```typescript
export { createCostTracker };
export { recordCost, getCostByStudy, getCostByTenant };
export { estimateCost, generateBillingReport };
```

**Cost Categories:**
- Proxy bandwidth
- API calls (tokens)
- Compute (CPU-hours)
- Storage (GB-months)
- Accounts
- Third-party services

**Dependencies:** `core`, database

---

#### 9.6 Notification Hub (`packages/infrastructure/notification-hub`)

**Purpose:** Sends alerts and dispatches webhooks.

**Public API:**
```typescript
export { createNotificationHub };
export { sendAlert, AlertChannel };
export { dispatchWebhook, registerWebhook };
export { getNotificationHistory };
```

**Channels:**
- Slack
- Email (SendGrid)
- SMS (Twilio)
- Webhooks (tenant-configured)

**Dependencies:** `core`, external services

---

#### 9.7 Audit Logger (`packages/infrastructure/audit-logger`)

**Purpose:** Compliance logging for all actions.

**Public API:**
```typescript
export { createAuditLogger };
export { logAction, ActionType };
export { queryAuditLog, AuditQuery };
export { exportAuditLog, retainAuditLog };
```

**Logged Actions:**
- Study lifecycle events
- User authentication/authorization
- Data access
- Configuration changes
- AI-assisted resolutions

**Dependencies:** `core`, database or S3 (for long-term storage)

---

#### 9.8 Observability (`packages/infrastructure/observability`)

**Purpose:** Provides visible evidence of system behavior during development, testing, and demos.

**Public API:**
```typescript
// Configuration
export { createObserver, ObserverConfig };
export { enableDemoMode, disableDemoMode };

// Real-time visibility
export { getStudyProgress, streamStudyEvents };
export { getDashboardState, DashboardState };

// Evidence review
export { getScreenshotGallery, getSessionTimeline };
export { compareResponses, ComparisonView };

// Logging
export { createStructuredLogger, LogEvent };
export { streamLogs, queryLogs };

// Metrics
export { getMetrics, MetricType };
export { getSuccessRates, getResponseTimes };
```

**Development Modes:**
```typescript
interface ObserverConfig {
  // Browser visibility
  headless: boolean;              // false for visible browser
  slowMo: number;                 // ms delay between actions (0-2000)
  highlightActions: boolean;      // visual indicators on elements

  // Demo mode
  demoMode: boolean;
  demoNarration: boolean;         // text annotations of actions
  demoSpeed: 'slow' | 'normal' | 'fast';

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  streamToConsole: boolean;

  // Evidence
  captureScreenshotsOnError: boolean;
  captureVideoInDemo: boolean;
}
```

**Dashboard Capabilities:**
- Real-time study progress (cells completed, by surface, by location)
- Activity feed with success/failure/retry events
- Cost accumulation tracker
- Session and proxy health monitors
- CAPTCHA frequency trends

**Evidence Review:**
- Screenshot gallery with filtering and search
- Side-by-side response comparison across surfaces
- Session replay as screenshot timeline
- Video playback for streaming captures

**Dependencies:** `core`, `database` (read-only for progress), WebSocket (for real-time)

---

#### 9.9 Credential Vault (`packages/credential-vault`)

**Purpose:** Secure storage and rotation of credentials for surface adapters.

**Public API:**
```typescript
export { createCredentialVault, CredentialVault };

// Providers
export { MemoryCredentialProvider };
export { EnvironmentCredentialProvider };
export { EncryptedFileCredentialProvider };

// Credential Pool
export { CredentialPool, CredentialPoolManager };

// Types
export type { Credential, CredentialType, CredentialProvider };
export type { CredentialPoolConfig, RotationStrategy };
```

**Credential Types:**
- `api_key`: API keys for surface APIs
- `oauth_token`: OAuth access/refresh tokens
- `session_cookie`: Browser session cookies
- `username_password`: Login credentials
- `bearer_token`: Bearer authentication tokens
- `custom`: Custom credential formats

**Rotation Strategies:**
- `round_robin`: Cycle through credentials in order
- `random`: Random selection
- `least_used`: Prefer credentials with lowest usage count
- `least_errors`: Prefer credentials with lowest error rate
- `weighted`: Use configured weights

**Providers:**
- **Memory**: In-memory storage for testing
- **Environment**: Read from environment variables
- **Encrypted File**: AES-256-GCM encrypted file storage

**Dependencies:** `core`

---

### 10. Database (`packages/database`)

**Purpose:** Schema, migrations, and data access layer.

**Public API:**
```typescript
// Repositories
export { StudyRepository, JobRepository, ResultRepository };
export { TenantRepository, UserRepository };
export { AuditRepository, CostRepository };

// Migrations
export { runMigrations, rollbackMigration };

// Connection
export { createConnection, getConnection };
```

**Schema Design:**
- Tenant isolation via `tenant_id` column on all tables
- Row-level security policies
- Soft deletes for audit trail
- JSON columns for flexible structured data

**Dependencies:** `core`, PostgreSQL (via Prisma or raw SQL)

**Testing:**
- Unit: Repository methods with test database
- Integration: Full CRUD operations

---

## Module Dependency Graph

```
                              ┌──────────┐
                              │   core   │
                              └────┬─────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  api-gateway │          │   database   │          │ infrastructure│
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │
       │                         ▼                         │
       │                  ┌──────────────┐                 │
       │                  │ orchestrator │◄────────────────┤
       │                  └──────┬───────┘                 │
       │                         │                         │
       │         ┌───────────────┼───────────────┐         │
       │         ▼               ▼               ▼         │
       │  ┌──────────┐    ┌──────────┐    ┌──────────┐    │
       │  │ executor │    │ validator│    │ai-advisor│    │
       │  └────┬─────┘    └──────────┘    └──────────┘    │
       │       │                                           │
       │       ▼                                           │
       │  ┌──────────────┐                                 │
       │  │   surface-   │◄────────────────────────────────┤
       │  │   adapters   │                                 │
       │  └──────┬───────┘                                 │
       │         │                                         │
       │         ▼                                         │
       │  ┌──────────────┐                                 │
       └─►│   evidence-  │◄────────────────────────────────┘
          │   collector  │
          └──────────────┘
```

---

## Parallel Development Guidelines

### Module Ownership
- Each module can be developed by a different Claude Code worker
- Worker owns all code within their module directory
- Cross-module changes require coordination

### Interface Contracts
- Public APIs defined in `types.ts` and `index.ts`
- Changes to public API require review
- Use TypeScript interfaces for compile-time checking

### Integration Points
- Modules communicate via defined interfaces
- No direct imports of internal module code
- Use dependency injection for testability

### Branch Strategy
- Feature branches per module: `feature/executor-retry-logic`
- Integration branches for cross-module work: `integration/study-lifecycle`
- Main branch always deployable

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-16 | Claude Code | Initial module breakdown |
.