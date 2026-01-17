/**
 * Executor Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  Executor,
  createExecutor,
  ExponentialBackoffRetry,
  type SurfaceAdapter,
  type JobExecutionRequest,
  type QueryResult,
  DEFAULT_EXECUTOR_CONFIG,
} from '../../index.js';

describe('Executor', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = createExecutor();
  });

  afterEach(async () => {
    await executor.stop();
  });

  describe('constructor', () => {
    it('should create executor with default config', () => {
      const stats = executor.getStats();
      expect(stats.totalCompleted).toBe(0);
      expect(stats.totalFailed).toBe(0);
    });

    it('should create executor with custom config', () => {
      const customExecutor = createExecutor({
        workerCount: 2,
        jobTimeout: 60000,
      });
      expect(customExecutor).toBeInstanceOf(Executor);
    });
  });

  describe('worker management', () => {
    it('should create a worker', async () => {
      const worker = await executor.createWorker({ id: 'worker-1' });
      expect(worker.id).toBe('worker-1');
      expect(worker.status).toBe('idle');
    });

    it('should get worker by id', async () => {
      await executor.createWorker({ id: 'worker-1' });
      const retrieved = executor.getWorker('worker-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('worker-1');
    });

    it('should return undefined for unknown worker', () => {
      const retrieved = executor.getWorker('unknown');
      expect(retrieved).toBeUndefined();
    });

    it('should get all workers', async () => {
      await executor.createWorker({ id: 'worker-1' });
      await executor.createWorker({ id: 'worker-2' });
      const workers = executor.getAllWorkers();
      expect(workers).toHaveLength(2);
    });

    it('should get idle workers', async () => {
      await executor.createWorker({ id: 'worker-1' });
      const idle = executor.getIdleWorkers();
      expect(idle).toHaveLength(1);
      expect(idle[0].id).toBe('worker-1');
    });

    it('should stop a worker', async () => {
      await executor.createWorker({ id: 'worker-1' });
      const result = await executor.stopWorker('worker-1');
      expect(result).toBe(true);
      expect(executor.getWorker('worker-1')).toBeUndefined();
    });

    it('should return false when stopping non-existent worker', async () => {
      const result = await executor.stopWorker('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('surface adapter management', () => {
    it('should register a surface adapter', () => {
      const adapter: SurfaceAdapter = {
        id: 'chatgpt-web',
        name: 'ChatGPT Adapter',
        category: 'web_chatbot',
        requiresAuth: true,
        supportsAnonymous: false,
        supportsGeoTargeting: false,
        executeQuery: vi.fn(),
      };

      executor.registerAdapter(adapter);
      const retrieved = executor.getAdapter('chatgpt-web');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('ChatGPT Adapter');
    });

    it('should unregister a surface adapter', () => {
      const adapter: SurfaceAdapter = {
        id: 'chatgpt-web',
        name: 'ChatGPT Adapter',
        category: 'web_chatbot',
        requiresAuth: true,
        supportsAnonymous: false,
        supportsGeoTargeting: false,
        executeQuery: vi.fn(),
      };

      executor.registerAdapter(adapter);
      expect(executor.getAdapter('chatgpt-web')).toBeDefined();

      executor.unregisterAdapter('chatgpt-web');
      expect(executor.getAdapter('chatgpt-web')).toBeUndefined();
    });
  });

  describe('start and stop', () => {
    it('should start executor', async () => {
      await executor.start();
      expect(executor.isRunning()).toBe(true);
    });

    it('should create initial workers on start', async () => {
      const customExecutor = createExecutor({ workerCount: 3 });
      await customExecutor.start();
      expect(customExecutor.getAllWorkers()).toHaveLength(3);
      await customExecutor.stop();
    });

    it('should stop executor', async () => {
      await executor.start();
      await executor.stop();
      expect(executor.isRunning()).toBe(false);
      expect(executor.getAllWorkers()).toHaveLength(0);
    });

    it('should not start twice', async () => {
      await executor.start();
      await executor.start(); // Should be no-op
      expect(executor.isRunning()).toBe(true);
    });
  });

  describe('job submission', () => {
    let mockAdapter: SurfaceAdapter;

    beforeEach(async () => {
      mockAdapter = {
        id: 'chatgpt-web',
        name: 'ChatGPT Adapter',
        category: 'web_chatbot',
        requiresAuth: true,
        supportsAnonymous: false,
        supportsGeoTargeting: false,
        executeQuery: vi.fn().mockResolvedValue({
          success: true,
          responseText: 'Test response',
          responseTimeMs: 100,
        } as QueryResult),
      };

      executor.registerAdapter(mockAdapter);
      await executor.start();
    });

    it('should submit a job', async () => {
      const request: JobExecutionRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        queryText: 'Test query',
        surfaceId: 'chatgpt-web',
        locationId: 'us-nyc',
        attemptNumber: 1,
        maxAttempts: 3,
        priority: 'normal',
        evidenceLevel: 'metadata',
        qualityGates: { requireActualContent: true },
        tenantId: 'tenant-1',
        sessionIsolation: 'shared',
      };

      await executor.submitJob(request);
      // Job should be processed by the executor
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockAdapter.executeQuery).toHaveBeenCalled();
    });

    it('should submit multiple jobs', async () => {
      const requests: JobExecutionRequest[] = [
        {
          jobId: 'job-1',
          studyId: 'study-1',
          queryText: 'Test query 1',
          surfaceId: 'chatgpt-web',
          locationId: 'us-nyc',
          attemptNumber: 1,
          maxAttempts: 3,
          priority: 'normal',
          evidenceLevel: 'metadata',
          qualityGates: { requireActualContent: true },
          tenantId: 'tenant-1',
          sessionIsolation: 'shared',
        },
        {
          jobId: 'job-2',
          studyId: 'study-1',
          queryText: 'Test query 2',
          surfaceId: 'chatgpt-web',
          locationId: 'us-nyc',
          attemptNumber: 1,
          maxAttempts: 3,
          priority: 'normal',
          evidenceLevel: 'metadata',
          qualityGates: { requireActualContent: true },
          tenantId: 'tenant-1',
          sessionIsolation: 'shared',
        },
      ];

      await executor.submitJobs(requests);
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockAdapter.executeQuery).toHaveBeenCalledTimes(2);
    });

    it('should prioritize jobs by priority', async () => {
      // Temporarily stop to queue jobs
      await executor.stop();
      executor = createExecutor({ workerCount: 0 }); // No workers initially
      executor.registerAdapter(mockAdapter);
      await executor.start();

      const lowPriorityJob: JobExecutionRequest = {
        jobId: 'job-low',
        studyId: 'study-1',
        queryText: 'Low priority',
        surfaceId: 'chatgpt-web',
        locationId: 'us-nyc',
        attemptNumber: 1,
        maxAttempts: 3,
        priority: 'low',
        evidenceLevel: 'metadata',
        qualityGates: { requireActualContent: false },
        tenantId: 'tenant-1',
        sessionIsolation: 'shared',
      };

      const highPriorityJob: JobExecutionRequest = {
        jobId: 'job-high',
        studyId: 'study-1',
        queryText: 'High priority',
        surfaceId: 'chatgpt-web',
        locationId: 'us-nyc',
        attemptNumber: 1,
        maxAttempts: 3,
        priority: 'high',
        evidenceLevel: 'metadata',
        qualityGates: { requireActualContent: false },
        tenantId: 'tenant-1',
        sessionIsolation: 'shared',
      };

      await executor.submitJob(lowPriorityJob);
      await executor.submitJob(highPriorityJob);

      // Queue length should be 2
      expect(executor.getQueueLength()).toBe(2);
    });
  });

  describe('queue management', () => {
    it('should get queue length', async () => {
      expect(executor.getQueueLength()).toBe(0);
    });

    it('should clear queue', async () => {
      await executor.start();

      // Add jobs to queue without workers available to process
      await executor.stop();

      const anotherExecutor = createExecutor({ workerCount: 0 });
      await anotherExecutor.start();

      await anotherExecutor.submitJob({
        jobId: 'job-1',
        studyId: 'study-1',
        queryText: 'Test',
        surfaceId: 'chatgpt-web',
        locationId: 'us-nyc',
        attemptNumber: 1,
        maxAttempts: 3,
        priority: 'normal',
        evidenceLevel: 'metadata',
        qualityGates: { requireActualContent: false },
        tenantId: 'tenant-1',
        sessionIsolation: 'shared',
      });

      expect(anotherExecutor.getQueueLength()).toBe(1);
      anotherExecutor.clearQueue();
      expect(anotherExecutor.getQueueLength()).toBe(0);

      await anotherExecutor.stop();
    });
  });

  describe('event handling', () => {
    it('should emit events', async () => {
      const events: string[] = [];
      executor.on(event => {
        events.push(event.type);
      });

      const mockAdapter: SurfaceAdapter = {
        id: 'chatgpt-web',
        name: 'ChatGPT',
        category: 'web_chatbot',
        requiresAuth: true,
        supportsAnonymous: false,
        supportsGeoTargeting: false,
        executeQuery: vi.fn().mockResolvedValue({
          success: true,
          responseText: 'Test',
          responseTimeMs: 100,
        }),
      };

      executor.registerAdapter(mockAdapter);
      await executor.start();

      await executor.submitJob({
        jobId: 'job-1',
        studyId: 'study-1',
        queryText: 'Test',
        surfaceId: 'chatgpt-web',
        locationId: 'us-nyc',
        attemptNumber: 1,
        maxAttempts: 3,
        priority: 'normal',
        evidenceLevel: 'metadata',
        qualityGates: { requireActualContent: false },
        tenantId: 'tenant-1',
        sessionIsolation: 'shared',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(events).toContain('worker_started');
      expect(events).toContain('job_started');
      expect(events).toContain('job_completed');
    });

    it('should allow unsubscribing from events', async () => {
      let eventCount = 0;
      const unsub = executor.on(() => {
        eventCount++;
      });

      await executor.createWorker({ id: 'test-worker' });
      expect(eventCount).toBe(1);

      unsub();
      await executor.createWorker({ id: 'test-worker-2' });
      expect(eventCount).toBe(1); // Should not increment
    });
  });

  describe('statistics', () => {
    it('should track job execution stats', async () => {
      const mockAdapter: SurfaceAdapter = {
        id: 'chatgpt-web',
        name: 'ChatGPT',
        category: 'web_chatbot',
        requiresAuth: true,
        supportsAnonymous: false,
        supportsGeoTargeting: false,
        executeQuery: vi.fn().mockResolvedValue({
          success: true,
          responseText: 'Test response',
          responseTimeMs: 100,
        }),
      };

      executor.registerAdapter(mockAdapter);
      await executor.start();

      await executor.submitJob({
        jobId: 'job-1',
        studyId: 'study-1',
        queryText: 'Test',
        surfaceId: 'chatgpt-web',
        locationId: 'us-nyc',
        attemptNumber: 1,
        maxAttempts: 3,
        priority: 'normal',
        evidenceLevel: 'metadata',
        qualityGates: { requireActualContent: false },
        tenantId: 'tenant-1',
        sessionIsolation: 'shared',
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = executor.getStats();
      expect(stats.totalCompleted).toBe(1);
      expect(stats.successRate).toBe(1);
    });

    it('should track worker stats', async () => {
      await executor.start();

      const stats = executor.getStats();
      expect(stats.totalWorkers).toBeGreaterThan(0);
    });
  });

  describe('retry strategy', () => {
    it('should calculate retry delay', () => {
      const delay = executor.getRetryDelay(1);
      expect(delay).toBeGreaterThan(0);
    });

    it('should determine if job should retry', () => {
      // Should retry on retryable error
      expect(executor.shouldRetry(1, 3, { retryable: true })).toBe(true);

      // Should not retry on non-retryable error
      expect(executor.shouldRetry(1, 3, { retryable: false })).toBe(false);

      // Should not retry when max attempts reached
      expect(executor.shouldRetry(3, 3, { retryable: true })).toBe(false);
    });

    it('should allow custom retry strategy', () => {
      const customStrategy = {
        getDelay: vi.fn().mockReturnValue(5000),
        shouldRetry: vi.fn().mockReturnValue(true),
      };

      executor.setRetryStrategy(customStrategy);

      expect(executor.getRetryDelay(1)).toBe(5000);
      expect(customStrategy.getDelay).toHaveBeenCalledWith(1);
    });
  });
});

describe('ExponentialBackoffRetry', () => {
  let strategy: ExponentialBackoffRetry;

  beforeEach(() => {
    strategy = new ExponentialBackoffRetry(1000, 60000);
  });

  it('should calculate exponential delay', () => {
    const delay1 = strategy.getDelay(1);
    const delay2 = strategy.getDelay(2);
    const delay3 = strategy.getDelay(3);

    // With jitter, delays should be approximately 1s, 2s, 4s
    expect(delay1).toBeGreaterThan(800);
    expect(delay1).toBeLessThan(1200);
    expect(delay2).toBeGreaterThan(1600);
    expect(delay2).toBeLessThan(2400);
    expect(delay3).toBeGreaterThan(3200);
    expect(delay3).toBeLessThan(4800);
  });

  it('should cap delay at max', () => {
    const delay = strategy.getDelay(10); // Would be 512s without cap
    expect(delay).toBeLessThanOrEqual(60000);
  });

  it('should retry on retryable error', () => {
    expect(strategy.shouldRetry(1, 3, { retryable: true })).toBe(true);
  });

  it('should not retry on non-retryable error', () => {
    expect(strategy.shouldRetry(1, 3, { retryable: false })).toBe(false);
  });

  it('should not retry when max attempts reached', () => {
    expect(strategy.shouldRetry(3, 3, { retryable: true })).toBe(false);
    expect(strategy.shouldRetry(4, 3, { retryable: true })).toBe(false);
  });

  it('should retry when no error specified', () => {
    expect(strategy.shouldRetry(1, 3)).toBe(true);
  });
});

describe('DEFAULT_EXECUTOR_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_EXECUTOR_CONFIG.workerCount).toBe(4);
    expect(DEFAULT_EXECUTOR_CONFIG.maxConcurrentJobsPerWorker).toBe(2);
    expect(DEFAULT_EXECUTOR_CONFIG.jobTimeout).toBe(120000);
    expect(DEFAULT_EXECUTOR_CONFIG.baseRetryDelayMs).toBe(1000);
    expect(DEFAULT_EXECUTOR_CONFIG.maxRetryDelayMs).toBe(60000);
    expect(DEFAULT_EXECUTOR_CONFIG.enableAutoScale).toBe(false);
  });
});
