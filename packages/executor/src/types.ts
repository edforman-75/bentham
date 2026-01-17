/**
 * Executor Types
 *
 * Types for job execution, worker management, and result handling.
 */

import type { SurfaceId, LocationId, JobResult } from '@bentham/core';

/**
 * Worker status
 */
export type WorkerStatus = 'idle' | 'busy' | 'error' | 'stopped';

/**
 * Job execution request
 */
export interface JobExecutionRequest {
  /** Job ID */
  jobId: string;
  /** Study ID */
  studyId: string;
  /** Query text to execute */
  queryText: string;
  /** Target surface */
  surfaceId: SurfaceId;
  /** Target location */
  locationId: LocationId;
  /** Attempt number */
  attemptNumber: number;
  /** Maximum attempts */
  maxAttempts: number;
  /** Priority */
  priority: 'critical' | 'high' | 'normal' | 'low';
  /** Evidence level required */
  evidenceLevel: 'full' | 'metadata' | 'none';
  /** Quality gates */
  qualityGates: {
    minResponseLength?: number;
    requireActualContent: boolean;
  };
  /** Tenant ID */
  tenantId: string;
  /** Session isolation mode */
  sessionIsolation: 'shared' | 'dedicated_per_study';
}

/**
 * Job execution result
 */
export interface JobExecutionResult {
  /** Job ID */
  jobId: string;
  /** Study ID */
  studyId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Job result data */
  result?: JobResult;
  /** Error if failed */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  /** Execution metrics */
  metrics: {
    /** Total execution time in ms */
    executionTimeMs: number;
    /** Time waiting for session in ms */
    sessionWaitTimeMs: number;
    /** Time waiting for proxy in ms */
    proxyWaitTimeMs: number;
    /** Response time from surface in ms */
    responseTimeMs?: number;
  };
  /** Attempt number */
  attemptNumber: number;
  /** Worker ID that executed the job */
  workerId: string;
}

/**
 * Worker configuration
 */
export interface WorkerConfig {
  /** Worker ID */
  id: string;
  /** Maximum concurrent jobs */
  maxConcurrentJobs?: number;
  /** Surfaces this worker can handle */
  supportedSurfaces?: SurfaceId[];
  /** Locations this worker can handle */
  supportedLocations?: LocationId[];
}

/**
 * Worker state
 */
export interface Worker {
  /** Worker ID */
  id: string;
  /** Current status */
  status: WorkerStatus;
  /** Configuration */
  config: WorkerConfig;
  /** Current jobs being executed */
  currentJobs: Set<string>;
  /** Jobs completed */
  completedJobs: number;
  /** Jobs failed */
  failedJobs: number;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Started timestamp */
  startedAt: Date;
  /** Error message if in error state */
  error?: string;
}

/**
 * Surface adapter interface
 */
export interface SurfaceAdapter {
  /** Surface ID */
  id: SurfaceId;
  /** Surface name */
  name: string;
  /** Surface category */
  category: 'api' | 'web_chatbot' | 'search';
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Whether anonymous access is supported */
  supportsAnonymous: boolean;
  /** Whether geo-targeting is supported */
  supportsGeoTargeting: boolean;
  /** Execute a query */
  executeQuery(query: string, context: QueryContext): Promise<QueryResult>;
  /** Validate session is still active */
  validateSession?(sessionId: string): Promise<boolean>;
  /** Reset/refresh a session */
  resetSession?(sessionId: string): Promise<void>;
}

/**
 * Query execution context
 */
export interface QueryContext {
  /** Session ID to use */
  sessionId: string;
  /** Account ID (if authenticated) */
  accountId?: string;
  /** Proxy configuration */
  proxy?: {
    url: string;
    location: LocationId;
  };
  /** Target location */
  location: LocationId;
  /** Evidence level */
  evidenceLevel: 'full' | 'metadata' | 'none';
  /** Timeout in ms */
  timeout: number;
  /** Study ID for context */
  studyId: string;
  /** Tenant ID */
  tenantId: string;
}

/**
 * Query result from surface adapter
 */
export interface QueryResult {
  /** Whether query succeeded */
  success: boolean;
  /** Response text */
  responseText?: string;
  /** Structured response */
  structuredResponse?: {
    mainResponse: string;
    sources?: string[];
    followUps?: string[];
  };
  /** Response time in ms */
  responseTimeMs: number;
  /** Evidence captured */
  evidence?: {
    screenshot?: Buffer;
    html?: string;
    har?: object;
  };
  /** Error information */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  /** Number of workers */
  workerCount?: number;
  /** Maximum concurrent jobs per worker */
  maxConcurrentJobsPerWorker?: number;
  /** Job timeout in ms */
  jobTimeout?: number;
  /** Base retry delay in ms */
  baseRetryDelayMs?: number;
  /** Maximum retry delay in ms */
  maxRetryDelayMs?: number;
  /** Enable auto-scaling workers */
  enableAutoScale?: boolean;
  /** Minimum workers when auto-scaling */
  minWorkers?: number;
  /** Maximum workers when auto-scaling */
  maxWorkers?: number;
}

/**
 * Default executor configuration
 */
export const DEFAULT_EXECUTOR_CONFIG: Required<ExecutorConfig> = {
  workerCount: 4,
  maxConcurrentJobsPerWorker: 2,
  jobTimeout: 120000,         // 2 minutes
  baseRetryDelayMs: 1000,     // 1 second
  maxRetryDelayMs: 60000,     // 1 minute
  enableAutoScale: false,
  minWorkers: 2,
  maxWorkers: 10,
};

/**
 * Executor event types
 */
export type ExecutorEventType =
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'job_retry'
  | 'worker_started'
  | 'worker_stopped'
  | 'worker_error';

/**
 * Executor event
 */
export interface ExecutorEvent {
  /** Event type */
  type: ExecutorEventType;
  /** Timestamp */
  timestamp: Date;
  /** Worker ID */
  workerId?: string;
  /** Job ID */
  jobId?: string;
  /** Study ID */
  studyId?: string;
  /** Event details */
  details: Record<string, unknown>;
}

/**
 * Executor event handler
 */
export type ExecutorEventHandler = (event: ExecutorEvent) => void | Promise<void>;

/**
 * Executor statistics
 */
export interface ExecutorStats {
  /** Total workers */
  totalWorkers: number;
  /** Idle workers */
  idleWorkers: number;
  /** Busy workers */
  busyWorkers: number;
  /** Error workers */
  errorWorkers: number;
  /** Jobs currently executing */
  executingJobs: number;
  /** Total jobs completed */
  totalCompleted: number;
  /** Total jobs failed */
  totalFailed: number;
  /** Average job execution time in ms */
  avgExecutionTimeMs: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Retry strategy
 */
export interface RetryStrategy {
  /** Calculate delay for next retry */
  getDelay(attemptNumber: number): number;
  /** Check if should retry */
  shouldRetry(attemptNumber: number, maxAttempts: number, error?: { retryable: boolean }): boolean;
}
