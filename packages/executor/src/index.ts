/**
 * @bentham/executor
 *
 * Job execution and worker management for Bentham.
 */

// Types
export type {
  WorkerStatus,
  JobExecutionRequest,
  JobExecutionResult,
  WorkerConfig,
  Worker,
  SurfaceAdapter,
  QueryContext,
  QueryResult,
  ExecutorConfig,
  ExecutorEventType,
  ExecutorEvent,
  ExecutorEventHandler,
  ExecutorStats,
  RetryStrategy,
} from './types.js';

export { DEFAULT_EXECUTOR_CONFIG } from './types.js';

// Executor
export { Executor, createExecutor, ExponentialBackoffRetry } from './executor.js';
