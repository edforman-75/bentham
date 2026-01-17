/**
 * Study and manifest types for Bentham
 */

import type { Query, Checkpoint, ResultSummary } from './common.js';
import type { SurfaceConfig } from './surface.js';
import type { LocationConfig } from './location.js';
import type { CostEstimate, CostRecord } from './cost.js';

/**
 * Study status values
 */
export type StudyStatus =
  | 'validating'
  | 'queued'
  | 'executing'
  | 'validating_results'
  | 'paused'
  | 'complete'
  | 'failed';

/**
 * Session isolation modes for a study
 */
export type SessionIsolation = 'shared' | 'dedicated_per_study';

/**
 * Evidence levels for result capture
 */
export type EvidenceLevel = 'full' | 'metadata' | 'none';

/**
 * Completion criteria for a study
 */
export interface CompletionCriteria {
  /** Required surfaces that must meet threshold */
  requiredSurfaces: {
    /** Surface IDs that are required */
    surfaceIds: string[];
    /** Coverage threshold (0-1, e.g., 0.95 = 95%) */
    coverageThreshold: number;
  };
  /** Optional surfaces - best effort, do not block completion */
  optionalSurfaces?: {
    /** Surface IDs that are optional */
    surfaceIds: string[];
  };
  /** Maximum retries per cell before giving up */
  maxRetriesPerCell: number;
}

/**
 * Quality gates for response validation
 */
export interface QualityGates {
  /** Minimum response length in characters */
  minResponseLength?: number;
  /** Require actual content, not error page */
  requireActualContent: boolean;
}

/**
 * Study manifest - the input definition for a study
 */
export interface Manifest {
  /** Manifest version */
  version: string;

  // Study definition
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;

  // The matrix
  /** Queries to execute */
  queries: Query[];
  /** Surfaces to query */
  surfaces: SurfaceConfig[];
  /** Locations to execute from */
  locations: LocationConfig[];

  // Completion criteria
  /** Multi-variate completion criteria */
  completionCriteria: CompletionCriteria;

  // Quality gates
  /** Quality validation rules */
  qualityGates: QualityGates;

  // Evidence
  /** Level of evidence to capture */
  evidenceLevel: EvidenceLevel;
  /** Whether to enable legal hold */
  legalHold: boolean;

  // Timing
  /** Deadline for study completion */
  deadline: Date;

  // Data retention
  /** Days to retain data (optional) */
  retentionDays?: number;
  /** Whether to preserve data forever */
  preserveForever?: boolean;

  // Session isolation
  /** How sessions should be isolated */
  sessionIsolation: SessionIsolation;
}

/**
 * Study - a manifest combined with execution state
 */
export interface Study {
  /** Unique study identifier */
  id: string;
  /** Tenant this study belongs to */
  tenantId: string;
  /** The study manifest */
  manifest: Manifest;

  // State
  /** Current study status */
  status: StudyStatus;

  // Progress
  /** Total cells in the matrix */
  totalCells: number;
  /** Cells completed successfully */
  completedCells: number;
  /** Cells that failed */
  failedCells: number;

  // Timing
  /** When the study was created */
  createdAt: Date;
  /** When execution started */
  startedAt?: Date;
  /** When the study completed */
  completedAt?: Date;
  /** Deadline for completion */
  deadline: Date;

  // Checkpoints
  /** Last checkpoint for restartability */
  lastCheckpoint?: Checkpoint;

  // Results
  /** Summary of results (when complete) */
  resultSummary?: ResultSummary;

  // Costs
  /** Estimated cost before execution */
  estimatedCost: CostEstimate;
  /** Actual cost during execution */
  actualCost: CostRecord;
}

/**
 * Job status values
 */
export type JobStatus = 'pending' | 'executing' | 'validating' | 'complete' | 'failed';

/**
 * Evidence captured for a job result
 */
export interface JobEvidence {
  /** URL to screenshot */
  screenshotUrl?: string;
  /** URL to HTML archive */
  htmlArchiveUrl?: string;
  /** URL to HAR file */
  harFileUrl?: string;
  /** URL to video (for streaming responses) */
  videoUrl?: string;
  /** When evidence was captured */
  capturedAt: Date;
  /** SHA-256 hash of evidence */
  sha256Hash: string;
  /** RFC 3161 timestamp token */
  timestampToken?: string;
}

/**
 * Validation results for a job
 */
export interface JobValidation {
  /** Whether all quality gates passed */
  passedQualityGates: boolean;
  /** Whether response is actual content (not error) */
  isActualContent: boolean;
  /** Length of the response */
  responseLength: number;
}

/**
 * Context information for a job result
 */
export interface JobResultContext {
  /** Session ID used */
  sessionId: string;
  /** Proxy IP address */
  proxyIp?: string;
  /** Actual resolved proxy location */
  proxyLocation?: string;
  /** Account ID used (if any) */
  accountId?: string;
  /** User agent string */
  userAgent: string;
}

/**
 * Result of a job execution
 */
export interface JobResult {
  /** Whether the job succeeded */
  success: boolean;

  /** Response data */
  response?: {
    /** Response text */
    text: string;
    /** Structured response data */
    structured?: {
      mainResponse: string;
      sources?: string[];
      followUps?: string[];
    };
    /** Response time in milliseconds */
    responseTimeMs: number;
  };

  /** Evidence captured */
  evidence?: JobEvidence;

  /** Validation results */
  validation: JobValidation;

  /** Error information if failed */
  error?: {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Whether error is retryable */
    retryable: boolean;
  };

  /** Execution context */
  context: JobResultContext;
}

/**
 * Job - a single cell in the study matrix
 */
export interface Job {
  /** Unique job identifier */
  id: string;
  /** Study this job belongs to */
  studyId: string;

  // Coordinates in the matrix
  /** Index of the query */
  queryIndex: number;
  /** Surface to execute on */
  surfaceId: string;
  /** Location to execute from */
  locationId: string;

  // State
  /** Current job status */
  status: JobStatus;
  /** Number of attempts made */
  attempts: number;
  /** When last attempt was made */
  lastAttemptAt?: Date;

  /** Job result (when complete) */
  result?: JobResult;

  /** IDs of jobs this depends on */
  dependsOn?: string[];
}
