/**
 * Checkpoint System for Bentham Studies
 *
 * Provides save/resume capability for long-running studies.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Cell status in study progress
 */
export type CellStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/**
 * Cell result tracking
 */
export interface CellResult {
  queryIndex: number;
  surfaceId: string;
  locationId: string;
  status: CellStatus;
  attempt: number;
  success?: boolean;
  responseText?: string;
  error?: string;
  errorCode?: string;
  responseTimeMs?: number;
  timestamp?: string;
  brandMentions?: Array<{ brand: string; count: number }>;
}

/**
 * Study checkpoint data
 */
export interface StudyCheckpoint {
  /** Checkpoint version for compatibility */
  version: string;
  /** Study identifier */
  studyId: string;
  /** Study name */
  studyName: string;
  /** When checkpoint was created */
  createdAt: string;
  /** When checkpoint was last updated */
  updatedAt: string;
  /** Total cells in study */
  totalCells: number;
  /** Completed cells */
  completedCells: number;
  /** Failed cells (exhausted retries) */
  failedCells: number;
  /** Current progress as percentage */
  progressPercent: number;
  /** Cell results indexed by key: queryIndex-surfaceId-locationId */
  cellResults: Record<string, CellResult>;
  /** Current position in execution queue */
  queuePosition: number;
  /** Execution queue order (cell keys) */
  executionQueue: string[];
  /** Retry state per cell key */
  retryStates: Record<string, {
    attempts: number;
    lastError?: string;
    lastErrorCode?: string;
    exhausted: boolean;
  }>;
  /** Study-level metadata */
  metadata: {
    startTime: string;
    estimatedEndTime?: string;
    surfaces: string[];
    locations: string[];
    queryCount: number;
  };
}

/**
 * Checkpoint configuration
 */
export interface CheckpointConfig {
  enabled: boolean;
  saveIntervalCells: number;
  saveIntervalSeconds: number;
  preserveCheckpoint: boolean;
  checkpointDir?: string;
}

/**
 * Default checkpoint configuration
 */
export const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  enabled: true,
  saveIntervalCells: 10,
  saveIntervalSeconds: 30,
  preserveCheckpoint: false,
  checkpointDir: './checkpoints',
};

/**
 * Generate cell key from indices
 */
export function getCellKey(queryIndex: number, surfaceId: string, locationId: string): string {
  return `${queryIndex}-${surfaceId}-${locationId}`;
}

/**
 * Parse cell key back to components
 */
export function parseCellKey(key: string): { queryIndex: number; surfaceId: string; locationId: string } {
  const parts = key.split('-');
  // Handle surfaceId and locationId that may contain hyphens
  const queryIndex = parseInt(parts[0], 10);
  // Find the split point - locationId is at the end and surfaceId is in the middle
  // This is tricky because both can contain hyphens. We need a more robust approach.
  // For now, assume the format is consistent and split carefully
  const remaining = parts.slice(1).join('-');

  // Find a known location prefix to split
  // Common locations: in-mum, us-national, uk-lon, etc.
  const locationPatterns = ['in-mum', 'in-blr', 'in-del', 'us-national', 'us-nyc', 'uk-lon', 'de-ber'];
  let surfaceId = remaining;
  let locationId = '';

  for (const loc of locationPatterns) {
    const locIdx = remaining.lastIndexOf(loc);
    if (locIdx > 0 && remaining.charAt(locIdx - 1) === '-') {
      surfaceId = remaining.substring(0, locIdx - 1);
      locationId = remaining.substring(locIdx);
      break;
    }
  }

  // Fallback: if no location found, try to split on last hyphen group
  if (!locationId) {
    const lastHyphen = remaining.lastIndexOf('-');
    if (lastHyphen > 0) {
      // Check if this looks like a location (has another hyphen after)
      surfaceId = remaining;
      locationId = 'unknown';
    }
  }

  return { queryIndex, surfaceId, locationId };
}

/**
 * Create empty checkpoint for a study
 */
export function createCheckpoint(
  studyId: string,
  studyName: string,
  surfaces: string[],
  locations: string[],
  queryCount: number
): StudyCheckpoint {
  const totalCells = queryCount * surfaces.length * locations.length;

  return {
    version: '1.0.0',
    studyId,
    studyName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalCells,
    completedCells: 0,
    failedCells: 0,
    progressPercent: 0,
    cellResults: {},
    queuePosition: 0,
    executionQueue: [],
    retryStates: {},
    metadata: {
      startTime: new Date().toISOString(),
      surfaces,
      locations,
      queryCount,
    },
  };
}

/**
 * Update checkpoint with cell result
 */
export function updateCheckpointWithResult(
  checkpoint: StudyCheckpoint,
  result: CellResult
): StudyCheckpoint {
  const key = getCellKey(result.queryIndex, result.surfaceId, result.locationId);

  const updated = { ...checkpoint };
  updated.cellResults = { ...checkpoint.cellResults, [key]: result };
  updated.updatedAt = new Date().toISOString();

  // Update counters
  if (result.status === 'completed') {
    updated.completedCells = Object.values(updated.cellResults)
      .filter(r => r.status === 'completed').length;
  } else if (result.status === 'failed') {
    updated.failedCells = Object.values(updated.cellResults)
      .filter(r => r.status === 'failed').length;
  }

  updated.progressPercent = Math.round(
    ((updated.completedCells + updated.failedCells) / updated.totalCells) * 100
  );

  return updated;
}

/**
 * Update retry state in checkpoint
 */
export function updateCheckpointRetryState(
  checkpoint: StudyCheckpoint,
  cellKey: string,
  attempts: number,
  lastError?: string,
  lastErrorCode?: string,
  exhausted: boolean = false
): StudyCheckpoint {
  return {
    ...checkpoint,
    retryStates: {
      ...checkpoint.retryStates,
      [cellKey]: { attempts, lastError, lastErrorCode, exhausted },
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get checkpoint file path
 */
export function getCheckpointPath(studyId: string, checkpointDir: string = './checkpoints'): string {
  return path.join(checkpointDir, `${studyId}.checkpoint.json`);
}

/**
 * Save checkpoint to disk
 */
export function saveCheckpoint(
  checkpoint: StudyCheckpoint,
  checkpointDir: string = './checkpoints'
): void {
  const filePath = getCheckpointPath(checkpoint.studyId, checkpointDir);

  // Ensure directory exists
  fs.mkdirSync(checkpointDir, { recursive: true });

  // Write atomically (write to temp then rename)
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(checkpoint, null, 2));
  fs.renameSync(tempPath, filePath);
}

/**
 * Load checkpoint from disk
 */
export function loadCheckpoint(
  studyId: string,
  checkpointDir: string = './checkpoints'
): StudyCheckpoint | null {
  const filePath = getCheckpointPath(studyId, checkpointDir);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as StudyCheckpoint;
  } catch {
    return null;
  }
}

/**
 * Delete checkpoint file
 */
export function deleteCheckpoint(
  studyId: string,
  checkpointDir: string = './checkpoints'
): void {
  const filePath = getCheckpointPath(studyId, checkpointDir);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Check if checkpoint exists
 */
export function checkpointExists(
  studyId: string,
  checkpointDir: string = './checkpoints'
): boolean {
  return fs.existsSync(getCheckpointPath(studyId, checkpointDir));
}

/**
 * Get remaining cells to process from checkpoint
 */
export function getRemainingCells(checkpoint: StudyCheckpoint): string[] {
  const completedOrFailed = new Set(
    Object.entries(checkpoint.cellResults)
      .filter(([_, result]) => result.status === 'completed' || result.status === 'failed')
      .map(([key]) => key)
  );

  return checkpoint.executionQueue.filter(key => !completedOrFailed.has(key));
}

/**
 * Check if study can be resumed from checkpoint
 */
export function canResume(checkpoint: StudyCheckpoint): {
  canResume: boolean;
  reason?: string;
  remainingCells: number;
} {
  const remaining = getRemainingCells(checkpoint);

  if (checkpoint.completedCells + checkpoint.failedCells >= checkpoint.totalCells) {
    return {
      canResume: false,
      reason: 'Study is already complete',
      remainingCells: 0,
    };
  }

  return {
    canResume: true,
    remainingCells: remaining.length,
  };
}

/**
 * Checkpoint manager for automated saving
 */
export class CheckpointManager {
  private checkpoint: StudyCheckpoint;
  private config: CheckpointConfig;
  private lastSaveTime: number = Date.now();
  private cellsSinceLastSave: number = 0;
  private saveTimer?: ReturnType<typeof setInterval>;

  constructor(checkpoint: StudyCheckpoint, config: Partial<CheckpointConfig> = {}) {
    this.checkpoint = checkpoint;
    this.config = { ...DEFAULT_CHECKPOINT_CONFIG, ...config };

    if (this.config.enabled) {
      this.startAutoSave();
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastSaveTime;
      if (elapsed >= this.config.saveIntervalSeconds * 1000) {
        this.save();
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop auto-save timer
   */
  stop(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  /**
   * Record a cell result
   */
  recordResult(result: CellResult): void {
    this.checkpoint = updateCheckpointWithResult(this.checkpoint, result);
    this.cellsSinceLastSave++;

    // Save if we've hit the cell interval
    if (this.cellsSinceLastSave >= this.config.saveIntervalCells) {
      this.save();
    }
  }

  /**
   * Record retry state
   */
  recordRetry(
    cellKey: string,
    attempts: number,
    lastError?: string,
    lastErrorCode?: string,
    exhausted: boolean = false
  ): void {
    this.checkpoint = updateCheckpointRetryState(
      this.checkpoint,
      cellKey,
      attempts,
      lastError,
      lastErrorCode,
      exhausted
    );
  }

  /**
   * Save checkpoint to disk
   */
  save(): void {
    if (!this.config.enabled) return;

    saveCheckpoint(this.checkpoint, this.config.checkpointDir);
    this.lastSaveTime = Date.now();
    this.cellsSinceLastSave = 0;
  }

  /**
   * Get current checkpoint
   */
  getCheckpoint(): StudyCheckpoint {
    return this.checkpoint;
  }

  /**
   * Finalize - save final state and optionally cleanup
   */
  finalize(): void {
    this.stop();
    this.save();

    if (!this.config.preserveCheckpoint) {
      deleteCheckpoint(this.checkpoint.studyId, this.config.checkpointDir);
    }
  }
}
