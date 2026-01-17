/**
 * Common types used across the Bentham system
 */

/**
 * Query to be executed against AI surfaces
 */
export interface Query {
  /** The query text to submit */
  text: string;
  /** Optional context to include with the query */
  context?: string;
  /** Optional category for grouping */
  category?: string;
  /** Optional tags for filtering */
  tags?: string[];
}

/**
 * Context provided to surface adapters during query execution
 */
export interface QueryContext {
  /** The study this query belongs to */
  studyId: string;
  /** The job executing this query */
  jobId: string;
  /** Index of the query in the study's query list */
  queryIndex: number;
  /** The surface being queried */
  surfaceId: string;
  /** The target location */
  locationId: string;
  /** Session identifier for tracking */
  sessionId: string;
  /** Account being used (if any) */
  accountId?: string;
  /** Whether this is a retry attempt */
  isRetry: boolean;
  /** Attempt number (1-based) */
  attemptNumber: number;
  /** Evidence level required */
  evidenceLevel: 'full' | 'metadata' | 'none';
  /** Whether legal hold is enabled */
  legalHold: boolean;
}

/**
 * Result of a query execution
 */
export interface QueryResult {
  /** Whether the query succeeded */
  success: boolean;
  /** The response text */
  response?: {
    text: string;
    structured?: {
      mainResponse: string;
      sources?: string[];
      followUps?: string[];
    };
    responseTimeMs: number;
  };
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/**
 * Checkpoint for study restartability
 */
export interface Checkpoint {
  /** Checkpoint identifier */
  id: string;
  /** Study this checkpoint belongs to */
  studyId: string;
  /** When this checkpoint was created */
  createdAt: Date;
  /** Completed job IDs at checkpoint time */
  completedJobs: string[];
  /** Failed job IDs at checkpoint time */
  failedJobs: string[];
  /** Jobs in progress at checkpoint time */
  inProgressJobs: string[];
  /** Additional state data */
  stateData?: Record<string, unknown>;
}

/**
 * Summary of study results
 */
export interface ResultSummary {
  /** Total cells completed */
  completedCells: number;
  /** Total cells failed */
  failedCells: number;
  /** Completion rate (0-1) */
  completionRate: number;
  /** Per-surface completion rates */
  bySurface: Record<string, {
    completed: number;
    failed: number;
    rate: number;
  }>;
  /** Per-location completion rates */
  byLocation: Record<string, {
    completed: number;
    failed: number;
    rate: number;
  }>;
}
