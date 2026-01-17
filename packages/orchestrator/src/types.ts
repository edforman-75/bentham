/**
 * Orchestrator Types
 *
 * Types for study lifecycle management, job graph, and checkpointing.
 */

import type { Manifest, SurfaceId, LocationId } from '@bentham/core';

/**
 * Study status in the state machine
 */
export type StudyStatus =
  | 'manifest_received'
  | 'validating'
  | 'queued'
  | 'executing'
  | 'validating_results'
  | 'paused'
  | 'human_intervention_required'
  | 'complete'
  | 'failed';

/**
 * Job status
 */
export type JobStatus =
  | 'pending'
  | 'queued'
  | 'executing'
  | 'validating'
  | 'complete'
  | 'failed'
  | 'skipped';

/**
 * Job priority levels
 */
export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * A single job (query × surface × location cell)
 */
export interface Job {
  /** Unique job ID */
  id: string;
  /** Parent study ID */
  studyId: string;
  /** Current status */
  status: JobStatus;
  /** Priority level */
  priority: JobPriority;
  /** Query index in the manifest */
  queryIndex: number;
  /** The actual query text */
  queryText: string;
  /** Target surface */
  surfaceId: SurfaceId;
  /** Target location */
  locationId: LocationId;
  /** Number of attempts */
  attempts: number;
  /** Maximum attempts allowed */
  maxAttempts: number;
  /** Timestamp of last attempt */
  lastAttemptAt?: Date;
  /** Next scheduled attempt time (for backoff) */
  nextAttemptAt?: Date;
  /** Job dependencies (other job IDs that must complete first) */
  dependsOn: string[];
  /** Created timestamp */
  createdAt: Date;
  /** Started timestamp */
  startedAt?: Date;
  /** Completed timestamp */
  completedAt?: Date;
  /** Error message if failed */
  error?: string;
  /** Whether this is for a required surface */
  isRequired: boolean;
}

/**
 * Job graph for tracking dependencies and execution order
 */
export interface JobGraph {
  /** All jobs in the graph */
  jobs: Map<string, Job>;
  /** Jobs ready to execute (no pending dependencies) */
  readyQueue: string[];
  /** Jobs currently executing */
  executing: Set<string>;
  /** Completed jobs */
  completed: Set<string>;
  /** Failed jobs */
  failed: Set<string>;
}

/**
 * Study checkpoint for restartability
 */
export interface StudyCheckpoint {
  /** Checkpoint ID */
  id: string;
  /** Study ID */
  studyId: string;
  /** Study status at checkpoint */
  status: StudyStatus;
  /** Completed job IDs */
  completedJobs: string[];
  /** Failed job IDs */
  failedJobs: string[];
  /** In-progress job IDs (should be restarted) */
  inProgressJobs: string[];
  /** Progress metrics at checkpoint */
  progress: StudyProgress;
  /** Checkpoint timestamp */
  createdAt: Date;
  /** Checkpoint sequence number */
  sequenceNumber: number;
}

/**
 * Study progress tracking
 */
export interface StudyProgress {
  /** Total cells in the matrix */
  totalCells: number;
  /** Completed cells */
  completedCells: number;
  /** Failed cells (after max retries) */
  failedCells: number;
  /** Cells currently executing */
  executingCells: number;
  /** Cells pending */
  pendingCells: number;
  /** Completion percentage (0-100) */
  completionPercentage: number;
  /** Progress by surface */
  bySurface: Record<string, {
    total: number;
    completed: number;
    failed: number;
    isRequired: boolean;
  }>;
  /** Progress by location */
  byLocation: Record<string, {
    total: number;
    completed: number;
    failed: number;
  }>;
  /** Estimated completion time */
  estimatedCompletionAt?: Date;
  /** Current execution rate (cells per hour) */
  cellsPerHour: number;
}

/**
 * Study deadline tracking
 */
export interface DeadlineStatus {
  /** Study deadline */
  deadline: Date;
  /** Time remaining in ms */
  timeRemainingMs: number;
  /** Whether study is at risk of missing deadline */
  atRisk: boolean;
  /** Required completion rate to meet deadline (cells/hour) */
  requiredRate: number;
  /** Current completion rate (cells/hour) */
  currentRate: number;
  /** Bottleneck surface (if any) */
  bottleneck?: {
    surfaceId: SurfaceId;
    reason: string;
  };
}

/**
 * Study state
 */
export interface Study {
  /** Unique study ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Study manifest */
  manifest: Manifest;
  /** Current status */
  status: StudyStatus;
  /** Progress tracking */
  progress: StudyProgress;
  /** Job graph */
  jobGraph: JobGraph;
  /** Latest checkpoint */
  latestCheckpoint?: StudyCheckpoint;
  /** Deadline status */
  deadlineStatus: DeadlineStatus;
  /** Cost tracking */
  costs: {
    estimated: number;
    actual: number;
  };
  /** Timestamps */
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  /** Pause reason if paused */
  pauseReason?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Study creation options
 */
export interface CreateStudyOptions {
  /** Tenant ID */
  tenantId: string;
  /** Study manifest */
  manifest: Manifest;
  /** Override estimated cost */
  estimatedCost?: number;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Checkpoint interval in ms */
  checkpointInterval?: number;
  /** Progress update interval in ms */
  progressUpdateInterval?: number;
  /** Deadline warning threshold in ms (warn when this much time remains) */
  deadlineWarningThreshold?: number;
  /** Maximum concurrent jobs per study */
  maxConcurrentJobsPerStudy?: number;
  /** Maximum concurrent studies */
  maxConcurrentStudies?: number;
  /** Default job max attempts */
  defaultMaxAttempts?: number;
  /** Enable automatic escalation */
  enableAutoEscalation?: boolean;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: Required<OrchestratorConfig> = {
  checkpointInterval: 30000,        // 30 seconds
  progressUpdateInterval: 5000,     // 5 seconds
  deadlineWarningThreshold: 3600000, // 1 hour
  maxConcurrentJobsPerStudy: 10,
  maxConcurrentStudies: 50,
  defaultMaxAttempts: 3,
  enableAutoEscalation: true,
};

/**
 * Study state transition
 */
export interface StudyTransition {
  /** From status */
  from: StudyStatus;
  /** To status */
  to: StudyStatus;
  /** Transition timestamp */
  timestamp: Date;
  /** Reason for transition */
  reason?: string;
  /** Actor (system or operator ID) */
  actor: string;
}

/**
 * Orchestrator events
 */
export type OrchestratorEventType =
  | 'study_created'
  | 'study_started'
  | 'study_paused'
  | 'study_resumed'
  | 'study_completed'
  | 'study_failed'
  | 'study_at_risk'
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'checkpoint_created'
  | 'escalation_triggered';

/**
 * Orchestrator event
 */
export interface OrchestratorEvent {
  /** Event type */
  type: OrchestratorEventType;
  /** Study ID */
  studyId: string;
  /** Job ID (if job-related) */
  jobId?: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event details */
  details: Record<string, unknown>;
}

/**
 * Orchestrator event handler
 */
export type OrchestratorEventHandler = (event: OrchestratorEvent) => void | Promise<void>;

/**
 * Orchestrator hooks
 */
export interface OrchestratorHooks {
  /** Called when a study transitions state */
  onStudyTransition?: (study: Study, transition: StudyTransition) => Promise<void>;
  /** Called when progress is updated */
  onProgressUpdate?: (study: Study) => Promise<void>;
  /** Called when a checkpoint is created */
  onCheckpoint?: (checkpoint: StudyCheckpoint) => Promise<void>;
  /** Called when deadline is at risk */
  onDeadlineAtRisk?: (study: Study, deadlineStatus: DeadlineStatus) => Promise<void>;
  /** Called when escalation is needed */
  onEscalation?: (study: Study, reason: string) => Promise<void>;
}

/**
 * Job queue message
 */
export interface JobQueueMessage {
  /** Job ID */
  jobId: string;
  /** Study ID */
  studyId: string;
  /** Priority */
  priority: JobPriority;
  /** Message timestamp */
  timestamp: Date;
  /** Attempt number */
  attemptNumber: number;
}

/**
 * Study statistics
 */
export interface OrchestratorStats {
  /** Total studies */
  totalStudies: number;
  /** Studies by status */
  byStatus: Record<StudyStatus, number>;
  /** Active studies count */
  activeStudies: number;
  /** Total jobs pending */
  pendingJobs: number;
  /** Total jobs executing */
  executingJobs: number;
  /** Studies at risk */
  studiesAtRisk: number;
}
