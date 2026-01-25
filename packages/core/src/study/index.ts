/**
 * Study Runner Module
 *
 * Unified study execution for Bentham.
 */

export {
  // Types
  type StudyQuery,
  type QueryResult,
  type StudyConfig,
  type StudyProgress,
  // Functions
  extractBrandMentions,
  getCollectionMethod,
  shouldUseSerpApi,
  requiresBrowser,
  usesDirectApi,
  routeQuery,
  getStudyRoutingSummary,
  validateStudyConfig,
  getSurfaceOutputPath,
  sleep,
  randomDelay,
} from './study-runner.js';

// Retry Logic
export {
  type BackoffStrategy,
  type RetryConditions,
  type RetryConfig,
  type RetryState,
  type RetryStats,
  DEFAULT_RETRY_CONFIG,
  shouldRetry,
  calculateRetryDelay,
  createRetryState,
  updateRetryState,
  withRetry,
  createRetryStats,
  updateRetryStats,
} from './retry.js';

// Checkpoint/Resume
export {
  type CellStatus,
  type CellResult,
  type StudyCheckpoint,
  type CheckpointConfig,
  DEFAULT_CHECKPOINT_CONFIG,
  getCellKey,
  parseCellKey,
  createCheckpoint,
  updateCheckpointWithResult,
  updateCheckpointRetryState,
  getCheckpointPath,
  saveCheckpoint,
  loadCheckpoint,
  deleteCheckpoint,
  checkpointExists,
  getRemainingCells,
  canResume,
  CheckpointManager,
} from './checkpoint.js';
