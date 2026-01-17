/**
 * Executor Implementation
 *
 * Manages job execution, workers, and surface adapter dispatch.
 */

import { randomUUID } from 'crypto';
import type {
  Worker,
  WorkerConfig,
  JobExecutionRequest,
  JobExecutionResult,
  SurfaceAdapter,
  QueryContext,
  ExecutorConfig,
  ExecutorStats,
  ExecutorEvent,
  ExecutorEventHandler,
  RetryStrategy,
} from './types.js';
import { DEFAULT_EXECUTOR_CONFIG } from './types.js';
import type { SurfaceId } from '@bentham/core';

/**
 * Default exponential backoff retry strategy
 */
export class ExponentialBackoffRetry implements RetryStrategy {
  constructor(
    private baseDelayMs: number = 1000,
    private maxDelayMs: number = 60000
  ) {}

  getDelay(attemptNumber: number): number {
    const delay = this.baseDelayMs * Math.pow(2, attemptNumber - 1);
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, this.maxDelayMs);
  }

  shouldRetry(attemptNumber: number, maxAttempts: number, error?: { retryable: boolean }): boolean {
    if (attemptNumber >= maxAttempts) return false;
    if (error && !error.retryable) return false;
    return true;
  }
}

/**
 * Executor class
 */
export class Executor {
  private config: Required<ExecutorConfig>;
  private workers: Map<string, Worker> = new Map();
  private adapters: Map<SurfaceId, SurfaceAdapter> = new Map();
  private eventHandlers: Set<ExecutorEventHandler> = new Set();
  private retryStrategy: RetryStrategy;
  private jobQueue: JobExecutionRequest[] = [];
  private executingJobs: Map<string, { request: JobExecutionRequest; startTime: number }> = new Map();
  private completedJobsCount = 0;
  private failedJobsCount = 0;
  private totalExecutionTime = 0;
  private running = false;

  constructor(config: ExecutorConfig = {}) {
    this.config = {
      ...DEFAULT_EXECUTOR_CONFIG,
      ...config,
    };

    this.retryStrategy = new ExponentialBackoffRetry(
      this.config.baseRetryDelayMs,
      this.config.maxRetryDelayMs
    );
  }

  /**
   * Register a surface adapter
   */
  registerAdapter(adapter: SurfaceAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Unregister a surface adapter
   */
  unregisterAdapter(surfaceId: SurfaceId): void {
    this.adapters.delete(surfaceId);
  }

  /**
   * Get a registered adapter
   */
  getAdapter(surfaceId: SurfaceId): SurfaceAdapter | undefined {
    return this.adapters.get(surfaceId);
  }

  /**
   * Subscribe to executor events
   */
  on(handler: ExecutorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event
   */
  private async emit(event: ExecutorEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    }
  }

  /**
   * Set custom retry strategy
   */
  setRetryStrategy(strategy: RetryStrategy): void {
    this.retryStrategy = strategy;
  }

  /**
   * Start the executor with workers
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Create initial workers
    for (let i = 0; i < this.config.workerCount; i++) {
      await this.createWorker();
    }
  }

  /**
   * Stop the executor
   */
  async stop(): Promise<void> {
    this.running = false;

    // Stop all workers
    for (const worker of this.workers.values()) {
      await this.stopWorker(worker.id);
    }
  }

  /**
   * Create a new worker
   */
  async createWorker(config?: Partial<WorkerConfig>): Promise<Worker> {
    const workerId = config?.id ?? randomUUID();

    const worker: Worker = {
      id: workerId,
      status: 'idle',
      config: {
        id: workerId,
        maxConcurrentJobs: this.config.maxConcurrentJobsPerWorker,
        ...config,
      },
      currentJobs: new Set(),
      completedJobs: 0,
      failedJobs: 0,
      lastActivityAt: new Date(),
      startedAt: new Date(),
    };

    this.workers.set(workerId, worker);

    await this.emit({
      type: 'worker_started',
      timestamp: new Date(),
      workerId,
      details: { config: worker.config },
    });

    return worker;
  }

  /**
   * Stop a worker
   */
  async stopWorker(workerId: string): Promise<boolean> {
    const worker = this.workers.get(workerId);
    if (!worker) return false;

    worker.status = 'stopped';

    await this.emit({
      type: 'worker_stopped',
      timestamp: new Date(),
      workerId,
      details: {
        completedJobs: worker.completedJobs,
        failedJobs: worker.failedJobs,
      },
    });

    this.workers.delete(workerId);
    return true;
  }

  /**
   * Get a worker by ID
   */
  getWorker(workerId: string): Worker | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Get all workers
   */
  getAllWorkers(): Worker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get idle workers
   */
  getIdleWorkers(): Worker[] {
    return Array.from(this.workers.values())
      .filter(w => w.status === 'idle' && w.currentJobs.size < w.config.maxConcurrentJobs!);
  }

  /**
   * Submit a job for execution
   */
  async submitJob(request: JobExecutionRequest): Promise<void> {
    this.jobQueue.push(request);
    await this.processQueue();
  }

  /**
   * Submit multiple jobs
   */
  async submitJobs(requests: JobExecutionRequest[]): Promise<void> {
    this.jobQueue.push(...requests);
    await this.processQueue();
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    if (!this.running) return;

    // Sort queue by priority
    this.jobQueue.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Assign jobs to idle workers
    const idleWorkers = this.getIdleWorkers();

    for (const worker of idleWorkers) {
      const availableSlots = worker.config.maxConcurrentJobs! - worker.currentJobs.size;

      for (let i = 0; i < availableSlots && this.jobQueue.length > 0; i++) {
        // Find a job this worker can handle
        const jobIndex = this.findJobForWorker(worker);
        if (jobIndex === -1) break;

        const [request] = this.jobQueue.splice(jobIndex, 1);
        this.executeJobOnWorker(worker, request).catch(console.error);
      }
    }
  }

  /**
   * Find a job suitable for a worker
   */
  private findJobForWorker(worker: Worker): number {
    return this.jobQueue.findIndex(job => {
      // Check surface support
      if (worker.config.supportedSurfaces &&
          !worker.config.supportedSurfaces.includes(job.surfaceId)) {
        return false;
      }
      // Check location support
      if (worker.config.supportedLocations &&
          !worker.config.supportedLocations.includes(job.locationId)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Execute a job on a worker
   */
  private async executeJobOnWorker(
    worker: Worker,
    request: JobExecutionRequest
  ): Promise<JobExecutionResult> {
    const startTime = Date.now();

    // Update worker state
    worker.status = 'busy';
    worker.currentJobs.add(request.jobId);
    worker.lastActivityAt = new Date();

    this.executingJobs.set(request.jobId, { request, startTime });

    await this.emit({
      type: 'job_started',
      timestamp: new Date(),
      workerId: worker.id,
      jobId: request.jobId,
      studyId: request.studyId,
      details: {
        surfaceId: request.surfaceId,
        locationId: request.locationId,
        attemptNumber: request.attemptNumber,
      },
    });

    let result: JobExecutionResult;

    try {
      result = await this.executeJob(request, worker.id);
    } catch (error) {
      result = {
        jobId: request.jobId,
        studyId: request.studyId,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          sessionWaitTimeMs: 0,
          proxyWaitTimeMs: 0,
        },
        attemptNumber: request.attemptNumber,
        workerId: worker.id,
      };
    }

    // Update stats
    const executionTime = Date.now() - startTime;
    this.totalExecutionTime += executionTime;

    if (result.success) {
      worker.completedJobs++;
      this.completedJobsCount++;
    } else {
      worker.failedJobs++;
      this.failedJobsCount++;
    }

    // Update worker state
    worker.currentJobs.delete(request.jobId);
    worker.lastActivityAt = new Date();
    if (worker.currentJobs.size === 0) {
      worker.status = 'idle';
    }

    this.executingJobs.delete(request.jobId);

    // Emit completion event
    const eventType = result.success ? 'job_completed' : 'job_failed';
    await this.emit({
      type: eventType,
      timestamp: new Date(),
      workerId: worker.id,
      jobId: request.jobId,
      studyId: request.studyId,
      details: {
        success: result.success,
        executionTimeMs: executionTime,
        error: result.error,
      },
    });

    // Process more jobs
    this.processQueue().catch(console.error);

    return result;
  }

  /**
   * Execute a job
   */
  private async executeJob(
    request: JobExecutionRequest,
    workerId: string
  ): Promise<JobExecutionResult> {
    const startTime = Date.now();
    let sessionWaitTime = 0;
    let proxyWaitTime = 0;

    // Get adapter for surface
    const adapter = this.adapters.get(request.surfaceId);
    if (!adapter) {
      return {
        jobId: request.jobId,
        studyId: request.studyId,
        success: false,
        error: {
          code: 'ADAPTER_NOT_FOUND',
          message: `No adapter registered for surface: ${request.surfaceId}`,
          retryable: false,
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          sessionWaitTimeMs: 0,
          proxyWaitTimeMs: 0,
        },
        attemptNumber: request.attemptNumber,
        workerId,
      };
    }

    // Create query context
    const context: QueryContext = {
      sessionId: randomUUID(), // Would come from session pool in real implementation
      location: request.locationId,
      evidenceLevel: request.evidenceLevel,
      timeout: this.config.jobTimeout,
      studyId: request.studyId,
      tenantId: request.tenantId,
    };

    // Execute query via adapter
    const queryStartTime = Date.now();
    const queryResult = await adapter.executeQuery(request.queryText, context);
    const responseTime = Date.now() - queryStartTime;

    if (!queryResult.success) {
      return {
        jobId: request.jobId,
        studyId: request.studyId,
        success: false,
        error: queryResult.error ?? {
          code: 'QUERY_FAILED',
          message: 'Query execution failed',
          retryable: true,
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          sessionWaitTimeMs: sessionWaitTime,
          proxyWaitTimeMs: proxyWaitTime,
          responseTimeMs: responseTime,
        },
        attemptNumber: request.attemptNumber,
        workerId,
      };
    }

    // Validate against quality gates
    if (request.qualityGates.requireActualContent && !queryResult.responseText) {
      return {
        jobId: request.jobId,
        studyId: request.studyId,
        success: false,
        error: {
          code: 'QUALITY_GATE_FAILED',
          message: 'Response has no content',
          retryable: true,
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          sessionWaitTimeMs: sessionWaitTime,
          proxyWaitTimeMs: proxyWaitTime,
          responseTimeMs: responseTime,
        },
        attemptNumber: request.attemptNumber,
        workerId,
      };
    }

    if (request.qualityGates.minResponseLength &&
        queryResult.responseText &&
        queryResult.responseText.length < request.qualityGates.minResponseLength) {
      return {
        jobId: request.jobId,
        studyId: request.studyId,
        success: false,
        error: {
          code: 'QUALITY_GATE_FAILED',
          message: `Response too short: ${queryResult.responseText.length} < ${request.qualityGates.minResponseLength}`,
          retryable: true,
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          sessionWaitTimeMs: sessionWaitTime,
          proxyWaitTimeMs: proxyWaitTime,
          responseTimeMs: responseTime,
        },
        attemptNumber: request.attemptNumber,
        workerId,
      };
    }

    // Build successful result
    return {
      jobId: request.jobId,
      studyId: request.studyId,
      success: true,
      result: {
        success: true,
        response: {
          text: queryResult.responseText ?? '',
          structured: queryResult.structuredResponse,
          responseTimeMs: queryResult.responseTimeMs,
        },
        validation: {
          passedQualityGates: true,
          isActualContent: true,
          responseLength: queryResult.responseText?.length ?? 0,
        },
        context: {
          sessionId: context.sessionId,
          userAgent: 'Bentham/1.0',
        },
      },
      metrics: {
        executionTimeMs: Date.now() - startTime,
        sessionWaitTimeMs: sessionWaitTime,
        proxyWaitTimeMs: proxyWaitTime,
        responseTimeMs: responseTime,
      },
      attemptNumber: request.attemptNumber,
      workerId,
    };
  }

  /**
   * Calculate retry delay for a job
   */
  getRetryDelay(attemptNumber: number): number {
    return this.retryStrategy.getDelay(attemptNumber);
  }

  /**
   * Check if job should be retried
   */
  shouldRetry(attemptNumber: number, maxAttempts: number, error?: { retryable: boolean }): boolean {
    return this.retryStrategy.shouldRetry(attemptNumber, maxAttempts, error);
  }

  /**
   * Get executor statistics
   */
  getStats(): ExecutorStats {
    const workers = Array.from(this.workers.values());

    const totalCompleted = this.completedJobsCount;
    const totalFailed = this.failedJobsCount;
    const total = totalCompleted + totalFailed;

    return {
      totalWorkers: workers.length,
      idleWorkers: workers.filter(w => w.status === 'idle').length,
      busyWorkers: workers.filter(w => w.status === 'busy').length,
      errorWorkers: workers.filter(w => w.status === 'error').length,
      executingJobs: this.executingJobs.size,
      totalCompleted,
      totalFailed,
      avgExecutionTimeMs: total > 0 ? this.totalExecutionTime / total : 0,
      successRate: total > 0 ? totalCompleted / total : 0,
    };
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.jobQueue.length;
  }

  /**
   * Clear the job queue
   */
  clearQueue(): void {
    this.jobQueue = [];
  }

  /**
   * Check if executor is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

/**
 * Create a new executor instance
 */
export function createExecutor(config?: ExecutorConfig): Executor {
  return new Executor(config);
}
