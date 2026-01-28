/**
 * Execution Metadata Types
 *
 * Standard schemas for capturing execution context, timing, IP information,
 * costs, error characterization, and debugging information across all Bentham studies.
 *
 * Designed for full lights-out operations with comprehensive audit trails.
 */

// =============================================================================
// RUN IDENTIFICATION
// =============================================================================

/**
 * Unique identifiers for a study execution run.
 * Enables correlation across logs, results, and monitoring systems.
 */
export interface RunIdentification {
  /** Unique run ID (UUID v4) - correlates all artifacts from this execution */
  runId: string;

  /** Parent run ID if this is a retry or continuation */
  parentRunId?: string;

  /** Sequence number if part of a batch */
  batchSequence?: number;

  /** Total number of studies in the batch */
  batchTotal?: number;

  /** Timestamp when the run was initiated */
  initiatedAt: string;

  /** How the run was triggered */
  trigger: 'manual' | 'scheduled' | 'api' | 'retry' | 'webhook';

  /** User or system that initiated the run */
  initiatedBy?: string;

  /** Git commit hash of Bentham at execution time */
  benthamCommit?: string;
}

// =============================================================================
// IP INFORMATION
// =============================================================================

/**
 * Detailed IP address information captured at study execution time.
 * Data sourced from ipinfo.io or similar geolocation service.
 */
export interface IPInfo {
  /** The public IP address used for the request */
  ip: string;

  /** ISO 3166-1 alpha-2 country code (e.g., 'IN', 'US') */
  country: string;

  /** City name */
  city: string;

  /** State/province/region name */
  region: string;

  /** ISP or organization name */
  org: string;

  /** IANA timezone (e.g., 'Asia/Kolkata', 'America/New_York') */
  timezone: string;

  /** Coordinates as 'latitude,longitude' string */
  loc: string;

  /** Postal code if available */
  postal?: string;

  /** Hostname if available */
  hostname?: string;

  /** ASN (Autonomous System Number) if available */
  asn?: string;

  /** Whether this is a known proxy/VPN IP */
  isProxy?: boolean;
}

/**
 * IP verification result comparing actual vs expected location.
 */
export interface IPVerification {
  /** The captured IP information */
  ipInfo: IPInfo;

  /** Expected location identifier from manifest (e.g., 'in-mum', 'us-national') */
  expectedLocation: string;

  /** Expected country code derived from location */
  expectedCountry: string;

  /** Whether the IP country matches the expected country */
  verified: boolean;

  /** Timestamp when IP was verified */
  verifiedAt: string;

  /** IP lookup latency in milliseconds */
  lookupDurationMs?: number;

  /** Warning message if verification had issues but continued */
  warning?: string;
}

// =============================================================================
// TIMING INFORMATION
// =============================================================================

/**
 * Execution timing metadata with detailed breakdowns.
 */
export interface ExecutionTiming {
  /** ISO timestamp when study/query execution started */
  startTime: string;

  /** ISO timestamp when study/query execution ended */
  endTime: string;

  /** Total duration in milliseconds (wall clock time) */
  durationMs: number;

  /** Time spent waiting (rate limiting, retries, delays) in milliseconds */
  waitTimeMs?: number;

  /** Time spent on actual query execution in milliseconds */
  executionTimeMs?: number;

  /** Time spent on network operations in milliseconds */
  networkTimeMs?: number;

  /** Time spent parsing responses in milliseconds */
  parseTimeMs?: number;

  /** Time to first byte (TTFB) if applicable */
  ttfbMs?: number;
}

/**
 * Checkpoint information for long-running jobs.
 */
export interface CheckpointInfo {
  /** Path to the checkpoint file */
  filePath: string;

  /** Timestamp when checkpoint was saved */
  savedAt: string;

  /** Number of queries completed at checkpoint */
  queriesCompleted: number;

  /** Total queries in study */
  totalQueries: number;

  /** Size of checkpoint file in bytes */
  fileSizeBytes: number;
}

// =============================================================================
// COST TRACKING
// =============================================================================

/**
 * Detailed cost breakdown for a single query.
 */
export interface QueryCost {
  /** Cost for input tokens (API surfaces) */
  inputTokens: number;

  /** Cost for output tokens (API surfaces) */
  outputTokens: number;

  /** Cost for web search tool usage */
  webSearch: number;

  /** Cost for proxy bandwidth/requests */
  proxy: number;

  /** Amortized subscription cost (ChatGPT Plus, etc.) */
  subscription: number;

  /** Total cost for this query */
  total: number;

  /** Currency (always USD) */
  currency: 'USD';

  /** Token counts if available */
  tokenCounts?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };

  /** Pricing rates used for calculation */
  pricingRates?: {
    inputTokenRate: number;
    outputTokenRate: number;
    webSearchRate: number;
    proxyRate: number;
  };
}

/**
 * Proxy usage tracking for cost calculation.
 */
export interface ProxyUsage {
  /** Proxy identifier/name */
  proxyName: string;

  /** Number of requests made through this proxy */
  requestCount: number;

  /** Total bytes downloaded through proxy */
  bytesDownloaded: number;

  /** Total bytes uploaded through proxy */
  bytesUploaded: number;

  /** Total bandwidth in bytes */
  totalBandwidthBytes: number;

  /** Estimated cost based on bandwidth */
  estimatedCost: number;

  /** Cost per GB used for calculation */
  costPerGb: number;

  /** Whether proxy was blocked/rotated */
  wasBlocked: boolean;
}

/**
 * Aggregated cost summary for a study.
 */
export interface StudyCost {
  /** Breakdown by category */
  byCategory: {
    inputTokens: number;
    outputTokens: number;
    webSearch: number;
    proxy: number;
    subscription: number;
  };

  /** Total cost for all queries */
  total: number;

  /** Average cost per query */
  perQuery: number;

  /** Number of queries included in cost calculation */
  queryCount: number;

  /** Currency (always USD) */
  currency: 'USD';

  /** Cost estimation method */
  estimationMethod: 'actual' | 'estimated';

  /** Total token counts */
  totalTokenCounts?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };

  /** Proxy usage details */
  proxyUsage?: ProxyUsage[];

  /** Total proxy bandwidth in bytes */
  totalProxyBandwidthBytes?: number;
}

// =============================================================================
// ERROR CHARACTERIZATION
// =============================================================================

/**
 * Categories of query failures.
 */
export type FailureCategory =
  | 'rate_limit'           // Hit rate limit, need to wait
  | 'timeout'              // Query timed out
  | 'auth_failure'         // Authentication/authorization failed
  | 'network_error'        // Network connectivity issue
  | 'service_unavailable'  // Surface is down or unreachable
  | 'captcha_required'     // CAPTCHA challenge encountered
  | 'content_blocked'      // Response blocked by content policy
  | 'invalid_response'     // Response format unexpected
  | 'session_expired'      // Browser session expired
  | 'proxy_failure'        // Proxy connection failed
  | 'quota_exceeded'       // API quota exceeded
  | 'ip_mismatch'          // IP location doesn't match expected
  | 'parsing_error'        // Failed to parse response
  | 'browser_crash'        // Browser/Playwright crashed
  | 'unknown';             // Unclassified error

/**
 * Single retry attempt record.
 */
export interface RetryAttempt {
  /** Attempt number (1-indexed) */
  attemptNumber: number;

  /** Timestamp when retry was initiated */
  timestamp: string;

  /** Error that triggered this retry */
  error: string;

  /** Category of the error */
  errorCategory: FailureCategory;

  /** Wait time before this retry in milliseconds */
  waitBeforeMs: number;

  /** Whether this attempt succeeded */
  succeeded: boolean;

  /** Duration of this attempt in milliseconds */
  durationMs: number;
}

/**
 * Detailed characterization of a query failure.
 */
export interface FailureCharacterization {
  /** High-level failure category */
  category: FailureCategory;

  /** Original error message */
  message: string;

  /** Full stack trace if available */
  stackTrace?: string;

  /** HTTP status code if applicable */
  httpStatus?: number;

  /** HTTP status text if applicable */
  httpStatusText?: string;

  /** Error code from the service if available */
  serviceErrorCode?: string;

  /** Response body excerpt if available */
  responseExcerpt?: string;

  /** Whether the error is retryable */
  retryable: boolean;

  /** Suggested wait time before retry (ms) */
  retryAfterMs?: number;

  /** Number of retry attempts made */
  retryAttempts: number;

  /** Detailed retry history */
  retryHistory?: RetryAttempt[];

  /** Human-readable explanation */
  explanation: string;

  /** Suggested remediation action */
  remediation?: string;

  /** Timestamp when error occurred */
  occurredAt: string;

  /** Query index that failed */
  queryIndex?: number;

  /** Related error codes or IDs from upstream service */
  upstreamErrorIds?: string[];
}

/**
 * Summary of failures across a study.
 */
export interface FailureSummary {
  /** Total number of failed queries */
  totalFailures: number;

  /** Failures grouped by category */
  byCategory: Record<FailureCategory, number>;

  /** List of unique error messages */
  uniqueErrors: string[];

  /** Percentage of queries that failed */
  failureRate: number;

  /** Whether any failures were due to IP/location issues */
  hasLocationIssues: boolean;

  /** Whether any failures were due to rate limiting */
  hasRateLimitIssues: boolean;

  /** First failure timestamp */
  firstFailureAt?: string;

  /** Last failure timestamp */
  lastFailureAt?: string;

  /** Indices of failed queries for easy identification */
  failedQueryIndices: number[];

  /** Whether failures suggest systematic issue vs transient */
  failurePattern: 'transient' | 'systematic' | 'mixed' | 'none';
}

// =============================================================================
// WARNINGS (NON-FATAL ISSUES)
// =============================================================================

/**
 * Warning severity levels.
 */
export type WarningSeverity = 'low' | 'medium' | 'high';

/**
 * Non-fatal warning that occurred during execution.
 */
export interface ExecutionWarning {
  /** Warning code for programmatic handling */
  code: string;

  /** Human-readable warning message */
  message: string;

  /** Severity level */
  severity: WarningSeverity;

  /** Timestamp when warning occurred */
  timestamp: string;

  /** Query index if applicable */
  queryIndex?: number;

  /** Additional context */
  context?: Record<string, unknown>;

  /** Whether this warning was auto-resolved */
  autoResolved?: boolean;
}

// =============================================================================
// SERVICE HEALTH
// =============================================================================

/**
 * Health status of an upstream service.
 */
export interface ServiceHealth {
  /** Service identifier */
  service: string;

  /** Whether service is reachable */
  reachable: boolean;

  /** Response latency in milliseconds */
  latencyMs?: number;

  /** Last successful request timestamp */
  lastSuccessAt?: string;

  /** Last error timestamp */
  lastErrorAt?: string;

  /** Error rate over the study duration */
  errorRate?: number;

  /** API version or response headers of interest */
  apiVersion?: string;

  /** Rate limit status if known */
  rateLimitStatus?: {
    remaining?: number;
    limit?: number;
    resetAt?: string;
  };
}

/**
 * Proxy health information.
 */
export interface ProxyHealth {
  /** Proxy identifier/endpoint */
  proxyId: string;

  /** Whether proxy is connected */
  connected: boolean;

  /** Proxy response latency in milliseconds */
  latencyMs?: number;

  /** Bandwidth used in bytes */
  bandwidthUsedBytes?: number;

  /** Number of requests routed through proxy */
  requestCount?: number;

  /** Number of failed requests */
  failedRequests?: number;
}

// =============================================================================
// ENVIRONMENT & SYSTEM INFO
// =============================================================================

/**
 * Detailed environment information for debugging.
 */
export interface EnvironmentInfo {
  /** Node.js version */
  nodeVersion: string;

  /** Operating system platform */
  platform: string;

  /** OS version/release */
  osVersion: string;

  /** Bentham package version */
  benthamVersion: string;

  /** CPU architecture */
  arch: string;

  /** Available memory at start (bytes) */
  availableMemoryBytes?: number;

  /** Peak memory usage during execution (bytes) */
  peakMemoryUsageBytes?: number;

  /** Timezone of the execution environment */
  timezone: string;

  /** Locale settings */
  locale?: string;

  /** Whether running in CI environment */
  isCI: boolean;

  /** CI provider if applicable */
  ciProvider?: string;

  /** Relevant environment variables (sanitized - no secrets) */
  relevantEnvVars?: Record<string, string>;
}

/**
 * Browser/Playwright information for web scraping studies.
 */
export interface BrowserInfo {
  /** Browser type (chromium, firefox, webkit) */
  browserType: string;

  /** Browser version */
  browserVersion?: string;

  /** Playwright version */
  playwrightVersion?: string;

  /** Whether running headless */
  headless: boolean;

  /** Viewport dimensions */
  viewport?: {
    width: number;
    height: number;
  };

  /** User agent string used */
  userAgent?: string;

  /** Whether using remote debugging */
  remoteDebugging?: boolean;

  /** Remote debugging port if applicable */
  remoteDebuggingPort?: number;
}

// =============================================================================
// COMBINED EXECUTION METADATA
// =============================================================================

/**
 * Complete execution metadata for a query.
 */
export interface QueryExecutionMetadata {
  /** Query index within the study */
  queryIndex: number;

  /** The original query text from manifest */
  originalQuery: string;

  /** The query actually submitted (may have suffix added) */
  submittedQuery: string;

  /** Execution timing */
  timing: ExecutionTiming;

  /** Cost breakdown */
  cost: QueryCost;

  /** Whether the query succeeded */
  success: boolean;

  /** Failure characterization if query failed */
  failure?: FailureCharacterization;

  /** Warnings encountered during this query */
  warnings?: ExecutionWarning[];

  /** HTTP response status if applicable */
  httpStatus?: number;

  /** Response size in bytes */
  responseSizeBytes?: number;

  /** Whether response was truncated */
  responseTruncated?: boolean;

  /** Upstream request ID for correlation */
  upstreamRequestId?: string;
}

/**
 * Complete execution metadata for a study.
 */
export interface StudyExecutionMetadata {
  /** Run identification */
  run: RunIdentification;

  /** Study identifier */
  studyId: string;

  /** Study name */
  studyName: string;

  /** Surface used */
  surface: string;

  /** Location identifier from manifest */
  location: string;

  /** IP verification results */
  ipVerification: IPVerification;

  /** Overall timing */
  timing: ExecutionTiming;

  /** Aggregated costs */
  cost: StudyCost;

  /** Summary statistics */
  summary: {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    successRate: number;
    avgQueryDurationMs: number;
    medianQueryDurationMs?: number;
    p95QueryDurationMs?: number;
  };

  /** Failure summary if any queries failed */
  failures?: FailureSummary;

  /** Warnings summary */
  warnings?: {
    totalWarnings: number;
    bySeverity: Record<WarningSeverity, number>;
    warnings: ExecutionWarning[];
  };

  /** Checkpoint history */
  checkpoints?: CheckpointInfo[];

  /** Service health observed during execution */
  serviceHealth?: ServiceHealth[];

  /** Proxy health if proxy was used */
  proxyHealth?: ProxyHealth;

  /** Environment info */
  environment: EnvironmentInfo;

  /** Browser info if applicable */
  browserInfo?: BrowserInfo;

  /** Configuration snapshot (manifest excerpt) */
  configSnapshot: {
    manifestPath: string;
    studyConfig: Record<string, unknown>;
    executionConfig: {
      concurrency: number;
      delayBetweenQueries: number;
      timeout: number;
      maxRetries: number;
    };
  };

  /** Output file paths */
  outputFiles: {
    /** Primary results file */
    results: string;
    /** Intermediate checkpoint files */
    checkpoints?: string[];
    /** Screenshot directory if applicable */
    screenshots?: string;
    /** HTML evidence directory if applicable */
    html?: string;
    /** Log file if separate */
    logs?: string;
  };

  /** Schema version for future compatibility */
  schemaVersion: '1.0';
}

// =============================================================================
// BATCH EXECUTION METADATA
// =============================================================================

/**
 * Metadata for a batch of studies executed together.
 */
export interface BatchExecutionMetadata {
  /** Batch run identification */
  run: RunIdentification;

  /** Batch name/description */
  batchName: string;

  /** Studies included in batch */
  studyIds: string[];

  /** Overall timing for entire batch */
  timing: ExecutionTiming;

  /** Aggregated cost across all studies */
  totalCost: StudyCost;

  /** Summary across all studies */
  summary: {
    totalStudies: number;
    completedStudies: number;
    failedStudies: number;
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    overallSuccessRate: number;
  };

  /** Per-study summaries */
  studySummaries: Array<{
    studyId: string;
    studyName: string;
    success: boolean;
    queryCount: number;
    successRate: number;
    cost: number;
    durationMs: number;
  }>;

  /** Environment info */
  environment: EnvironmentInfo;

  /** Schema version */
  schemaVersion: '1.0';
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a unique run ID.
 */
export function generateRunId(): string {
  return crypto.randomUUID();
}

/**
 * Create an empty IP info object with unknown values.
 */
export function createEmptyIPInfo(): IPInfo {
  return {
    ip: 'unknown',
    country: 'unknown',
    city: 'unknown',
    region: 'unknown',
    org: 'unknown',
    timezone: 'unknown',
    loc: 'unknown',
  };
}

/**
 * Determine expected country code from location identifier.
 */
export function getExpectedCountry(location: string): string {
  const locationPrefixes: Record<string, string> = {
    'in-': 'IN',
    'us-': 'US',
    'uk-': 'GB',
    'gb-': 'GB',
    'de-': 'DE',
    'jp-': 'JP',
    'au-': 'AU',
    'ca-': 'CA',
    'fr-': 'FR',
    'br-': 'BR',
    'sg-': 'SG',
  };

  for (const [prefix, country] of Object.entries(locationPrefixes)) {
    if (location.startsWith(prefix)) return country;
  }
  return 'unknown';
}

/**
 * Verify IP matches expected location.
 */
export function verifyIPLocation(
  ipInfo: IPInfo,
  location: string,
  lookupDurationMs?: number
): IPVerification {
  const expectedCountry = getExpectedCountry(location);
  const verified = ipInfo.country.toUpperCase() === expectedCountry.toUpperCase();

  return {
    ipInfo,
    expectedLocation: location,
    expectedCountry,
    verified,
    verifiedAt: new Date().toISOString(),
    lookupDurationMs,
    warning: !verified
      ? `IP country ${ipInfo.country} does not match expected ${expectedCountry}`
      : undefined,
  };
}

/**
 * Characterize a failure from an error.
 */
export function characterizeFailure(
  error: Error | unknown,
  retryAttempts: number = 0,
  retryHistory?: RetryAttempt[]
): FailureCharacterization {
  const message = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error ? error.stack : undefined;
  const lowerMessage = message.toLowerCase();

  // Categorize by error message patterns
  let category: FailureCategory = 'unknown';
  let retryable = false;
  let retryAfterMs: number | undefined;
  let explanation = 'An unexpected error occurred';
  let remediation: string | undefined;
  let httpStatus: number | undefined;

  // Extract HTTP status from message if present
  const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    httpStatus = parseInt(statusMatch[1], 10);
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('429') || lowerMessage.includes('too many requests')) {
    category = 'rate_limit';
    retryable = true;
    retryAfterMs = 60000;
    httpStatus = httpStatus || 429;
    explanation = 'Request rate limit exceeded';
    remediation = 'Wait and retry with exponential backoff';
  } else if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out') || lowerMessage.includes('etimedout')) {
    category = 'timeout';
    retryable = true;
    retryAfterMs = 5000;
    explanation = 'Request timed out waiting for response';
    remediation = 'Retry with longer timeout or simpler query';
  } else if (lowerMessage.includes('auth') || lowerMessage.includes('401') || lowerMessage.includes('403') || lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
    category = 'auth_failure';
    retryable = false;
    httpStatus = httpStatus || (lowerMessage.includes('401') ? 401 : 403);
    explanation = 'Authentication or authorization failed';
    remediation = 'Check API key or session credentials';
  } else if (lowerMessage.includes('network') || lowerMessage.includes('econnrefused') || lowerMessage.includes('enotfound') || lowerMessage.includes('econnreset') || lowerMessage.includes('socket hang up')) {
    category = 'network_error';
    retryable = true;
    retryAfterMs = 10000;
    explanation = 'Network connectivity issue';
    remediation = 'Check network connection and retry';
  } else if (lowerMessage.includes('503') || lowerMessage.includes('502') || lowerMessage.includes('504') || lowerMessage.includes('service unavailable') || lowerMessage.includes('bad gateway')) {
    category = 'service_unavailable';
    retryable = true;
    retryAfterMs = 30000;
    httpStatus = httpStatus || 503;
    explanation = 'Service is temporarily unavailable';
    remediation = 'Wait for service to recover and retry';
  } else if (lowerMessage.includes('captcha') || lowerMessage.includes('unusual traffic') || lowerMessage.includes('bot') || lowerMessage.includes('automated')) {
    category = 'captcha_required';
    retryable = false;
    explanation = 'CAPTCHA challenge or bot detection triggered';
    remediation = 'Use different IP or solve CAPTCHA manually';
  } else if (lowerMessage.includes('content') || lowerMessage.includes('policy') || lowerMessage.includes('blocked') || lowerMessage.includes('safety') || lowerMessage.includes('harmful')) {
    category = 'content_blocked';
    retryable = false;
    explanation = 'Content blocked by safety policy';
    remediation = 'Modify query to avoid policy triggers';
  } else if (lowerMessage.includes('session') || lowerMessage.includes('expired') || lowerMessage.includes('login') || lowerMessage.includes('sign in')) {
    category = 'session_expired';
    retryable = true;
    explanation = 'Browser session has expired';
    remediation = 'Refresh session and retry';
  } else if (lowerMessage.includes('proxy') || lowerMessage.includes('socks') || lowerMessage.includes('tunnel')) {
    category = 'proxy_failure';
    retryable = true;
    retryAfterMs = 5000;
    explanation = 'Proxy connection failed';
    remediation = 'Check proxy configuration or try different proxy';
  } else if (lowerMessage.includes('quota') || lowerMessage.includes('limit exceeded') || lowerMessage.includes('billing')) {
    category = 'quota_exceeded';
    retryable = false;
    explanation = 'API quota exceeded';
    remediation = 'Wait for quota reset or upgrade plan';
  } else if (lowerMessage.includes('parse') || lowerMessage.includes('json') || lowerMessage.includes('unexpected token') || lowerMessage.includes('syntax')) {
    category = 'parsing_error';
    retryable = true;
    retryAfterMs = 2000;
    explanation = 'Failed to parse response';
    remediation = 'Retry - response may have been malformed';
  } else if (lowerMessage.includes('browser') || lowerMessage.includes('playwright') || lowerMessage.includes('chromium') || lowerMessage.includes('crash') || lowerMessage.includes('target closed')) {
    category = 'browser_crash';
    retryable = true;
    retryAfterMs = 5000;
    explanation = 'Browser or Playwright crashed';
    remediation = 'Restart browser session and retry';
  } else if (lowerMessage.includes('ip') && (lowerMessage.includes('mismatch') || lowerMessage.includes('location') || lowerMessage.includes('country'))) {
    category = 'ip_mismatch';
    retryable = false;
    explanation = 'IP location does not match expected location';
    remediation = 'Verify proxy configuration and IP address';
  }

  return {
    category,
    message,
    stackTrace,
    httpStatus,
    retryable,
    retryAfterMs,
    retryAttempts,
    retryHistory,
    explanation,
    remediation,
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Calculate failure summary from list of query results.
 */
export function calculateFailureSummary(
  failures: FailureCharacterization[],
  totalQueries: number
): FailureSummary {
  const byCategory: Record<FailureCategory, number> = {
    rate_limit: 0,
    timeout: 0,
    auth_failure: 0,
    network_error: 0,
    service_unavailable: 0,
    captcha_required: 0,
    content_blocked: 0,
    invalid_response: 0,
    session_expired: 0,
    proxy_failure: 0,
    quota_exceeded: 0,
    ip_mismatch: 0,
    parsing_error: 0,
    browser_crash: 0,
    unknown: 0,
  };

  const uniqueErrors = new Set<string>();
  const failedQueryIndices: number[] = [];
  let firstFailureAt: string | undefined;
  let lastFailureAt: string | undefined;

  for (const failure of failures) {
    byCategory[failure.category]++;
    uniqueErrors.add(failure.message);

    if (failure.queryIndex !== undefined) {
      failedQueryIndices.push(failure.queryIndex);
    }

    if (failure.occurredAt) {
      if (!firstFailureAt || failure.occurredAt < firstFailureAt) {
        firstFailureAt = failure.occurredAt;
      }
      if (!lastFailureAt || failure.occurredAt > lastFailureAt) {
        lastFailureAt = failure.occurredAt;
      }
    }
  }

  // Determine failure pattern
  let failurePattern: 'transient' | 'systematic' | 'mixed' | 'none' = 'none';
  if (failures.length > 0) {
    const systematicCategories = ['auth_failure', 'quota_exceeded', 'ip_mismatch', 'content_blocked'];
    const systematicCount = failures.filter(f => systematicCategories.includes(f.category)).length;
    const transientCount = failures.length - systematicCount;

    if (systematicCount === failures.length) {
      failurePattern = 'systematic';
    } else if (transientCount === failures.length) {
      failurePattern = 'transient';
    } else {
      failurePattern = 'mixed';
    }
  }

  return {
    totalFailures: failures.length,
    byCategory,
    uniqueErrors: Array.from(uniqueErrors),
    failureRate: totalQueries > 0 ? (failures.length / totalQueries) * 100 : 0,
    hasLocationIssues: byCategory.proxy_failure > 0 || byCategory.captcha_required > 0 || byCategory.ip_mismatch > 0,
    hasRateLimitIssues: byCategory.rate_limit > 0 || byCategory.quota_exceeded > 0,
    firstFailureAt,
    lastFailureAt,
    failedQueryIndices,
    failurePattern,
  };
}

/**
 * Calculate total cost from query costs.
 */
export function aggregateQueryCosts(costs: QueryCost[]): StudyCost {
  const byCategory = {
    inputTokens: 0,
    outputTokens: 0,
    webSearch: 0,
    proxy: 0,
    subscription: 0,
  };

  let total = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const cost of costs) {
    byCategory.inputTokens += cost.inputTokens;
    byCategory.outputTokens += cost.outputTokens;
    byCategory.webSearch += cost.webSearch;
    byCategory.proxy += cost.proxy;
    byCategory.subscription += cost.subscription;
    total += cost.total;

    if (cost.tokenCounts) {
      totalInputTokens += cost.tokenCounts.inputTokens;
      totalOutputTokens += cost.tokenCounts.outputTokens;
    }
  }

  return {
    byCategory,
    total,
    perQuery: costs.length > 0 ? total / costs.length : 0,
    queryCount: costs.length,
    currency: 'USD',
    estimationMethod: 'actual',
    totalTokenCounts: totalInputTokens > 0 || totalOutputTokens > 0
      ? {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        }
      : undefined,
  };
}

/**
 * Get current environment information.
 */
export function getEnvironmentInfo(benthamVersion: string): EnvironmentInfo {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    osVersion: process.version, // Will be enhanced at runtime
    benthamVersion,
    arch: process.arch,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isCI: !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI || process.env.JENKINS_URL),
    ciProvider: process.env.GITHUB_ACTIONS ? 'github-actions' :
                process.env.GITLAB_CI ? 'gitlab-ci' :
                process.env.JENKINS_URL ? 'jenkins' :
                process.env.CI ? 'unknown' : undefined,
  };
}

/**
 * Create a warning object.
 */
export function createWarning(
  code: string,
  message: string,
  severity: WarningSeverity,
  queryIndex?: number,
  context?: Record<string, unknown>
): ExecutionWarning {
  return {
    code,
    message,
    severity,
    timestamp: new Date().toISOString(),
    queryIndex,
    context,
  };
}

/**
 * Calculate percentile from sorted array.
 */
export function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

/**
 * Calculate timing statistics from query durations.
 */
export function calculateTimingStats(durationsMs: number[]): {
  avg: number;
  median: number;
  p95: number;
} {
  if (durationsMs.length === 0) {
    return { avg: 0, median: 0, p95: 0 };
  }

  const sorted = [...durationsMs].sort((a, b) => a - b);
  const avg = durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length;
  const median = calculatePercentile(sorted, 50);
  const p95 = calculatePercentile(sorted, 95);

  return { avg, median, p95 };
}
