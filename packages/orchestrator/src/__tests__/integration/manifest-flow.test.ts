/**
 * Integration Test: Manifest Flow Through Phase 2 Modules
 *
 * This test demonstrates how a validated study manifest flows through:
 * 1. Orchestrator - Creates study and job graph from manifest
 * 2. Executor - Executes jobs against surface adapters
 * 3. Validator - Validates job results and study completion
 * 4. Evidence Collector - Captures and stores evidence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Manifest } from '@bentham/core';
import {
  Orchestrator,
  createOrchestrator,
  type CreateStudyOptions,
} from '../../index.js';
import {
  Executor,
  createExecutor,
  type SurfaceAdapter,
  type QueryResult,
  type JobExecutionRequest,
  type JobExecutionResult,
} from '@bentham/executor';
import {
  Validator,
  createValidator,
  type JobForValidation,
  type StudyForValidation,
} from '@bentham/validator';
import {
  EvidenceCollector,
  createEvidenceCollector,
  MockTimestampAuthority,
  type EvidenceCaptureRequest,
} from '@bentham/evidence-collector';

describe('Integration: Manifest Flow', () => {
  let orchestrator: Orchestrator;
  let executor: Executor;
  let validator: Validator;
  let evidenceCollector: EvidenceCollector;

  // Mock surface adapters
  let mockChatGPTAdapter: SurfaceAdapter;
  let mockClaudeAdapter: SurfaceAdapter;

  beforeEach(async () => {
    // Initialize all Phase 2 components
    orchestrator = createOrchestrator({
      maxConcurrentStudies: 5,
      checkpointInterval: 10000,
    });

    executor = createExecutor({
      workerCount: 2,
      maxConcurrentJobsPerWorker: 4,
    });

    validator = createValidator({
      strictMode: false,
    });

    const tsa = new MockTimestampAuthority();
    evidenceCollector = createEvidenceCollector(
      { enableTimestamps: true },
      undefined,
      tsa
    );

    // Create mock adapters
    mockChatGPTAdapter = {
      id: 'chatgpt-web',
      name: 'ChatGPT Web',
      category: 'web_chatbot',
      requiresAuth: true,
      supportsAnonymous: false,
      supportsGeoTargeting: false,
      executeQuery: vi.fn().mockImplementation(async (query: string) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          success: true,
          responseText: `ChatGPT response to: ${query}. This is a detailed response with sufficient content.`,
          responseTimeMs: 150,
        } as QueryResult;
      }),
    };

    mockClaudeAdapter = {
      id: 'anthropic-api',
      name: 'Anthropic Claude API',
      category: 'api',
      requiresAuth: true,
      supportsAnonymous: false,
      supportsGeoTargeting: false,
      executeQuery: vi.fn().mockImplementation(async (query: string) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          success: true,
          responseText: `Claude response to: ${query}. This is a comprehensive answer with detailed information.`,
          responseTimeMs: 120,
        } as QueryResult;
      }),
    };

    executor.registerAdapter(mockChatGPTAdapter);
    executor.registerAdapter(mockClaudeAdapter);
    await executor.start();
  });

  afterEach(async () => {
    await executor.stop();
  });

  /**
   * Create a valid study manifest
   */
  function createTestManifest(): Manifest {
    return {
      version: '1.0',
      name: 'Integration Test Study',
      description: 'Testing manifest flow through Phase 2 modules',
      surfaces: [
        { id: 'chatgpt-web', required: true },
        { id: 'anthropic-api', required: true },
      ],
      locations: [
        {
          id: 'us-nyc',
          name: 'New York, US',
          country: 'US',
          region: 'NY',
          proxyType: 'residential',
          requireSticky: false,
        },
      ],
      queries: [
        {
          text: 'What is the capital of France?',
          category: 'factual',
        },
        {
          text: 'Explain quantum computing',
          category: 'educational',
        },
      ],
      qualityGates: {
        minResponseLength: 20,
        requireActualContent: true,
      },
      completionCriteria: {
        requiredSurfaces: {
          surfaceIds: ['chatgpt-web', 'anthropic-api'],
          coverageThreshold: 0.8,
        },
        maxRetriesPerCell: 3,
      },
      evidenceLevel: 'metadata',
      legalHold: false,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      sessionIsolation: 'shared',
    };
  }

  /**
   * Create study options from manifest
   */
  function createStudyOptions(manifest: Manifest): CreateStudyOptions {
    return {
      tenantId: 'tenant-1',
      manifest,
    };
  }

  it('should create a study from a validated manifest', async () => {
    const manifest = createTestManifest();

    // Step 1: Orchestrator creates study from manifest
    const study = await orchestrator.createStudy(createStudyOptions(manifest));

    expect(study).toBeDefined();
    expect(study.id).toBeDefined(); // Auto-generated UUID
    expect(study.status).toBe('manifest_received');
    expect(study.manifest).toEqual(manifest);

    // Verify job graph was created
    const currentStudy = orchestrator.getStudy(study.id);
    expect(currentStudy?.jobGraph).toBeDefined();
    // Should have: 2 surfaces × 1 location × 2 queries = 4 jobs
    expect(currentStudy!.jobGraph.jobs.size).toBe(4);
  });

  it('should execute jobs through the full pipeline', async () => {
    const manifest = createTestManifest();
    const study = await orchestrator.createStudy(createStudyOptions(manifest));

    // Track job results
    const jobResults: Map<string, JobExecutionResult> = new Map();
    const validationResults: Map<string, ReturnType<typeof validator.validateJob>> = new Map();
    const evidenceResults: Map<string, Awaited<ReturnType<typeof evidenceCollector.capture>>> = new Map();

    // Start study
    await orchestrator.startStudy(study.id);

    // Get jobs and execute them
    let nextJobs = orchestrator.getNextJobs(study.id, 1);
    let processedJobs = 0;

    while (nextJobs.length > 0) {
      const job = nextJobs[0];

      // Mark job as started
      orchestrator.startJob(study.id, job.id);

      // Step 2: Execute job through executor
      const executionRequest: JobExecutionRequest = {
        jobId: job.id,
        studyId: job.studyId,
        queryText: job.queryText,
        surfaceId: job.surfaceId,
        locationId: job.locationId,
        attemptNumber: job.attempts,
        maxAttempts: 3,
        priority: job.priority,
        evidenceLevel: manifest.evidenceLevel,
        qualityGates: manifest.qualityGates,
        tenantId: 'tenant-1',
        sessionIsolation: manifest.sessionIsolation,
      };

      await executor.submitJob(executionRequest);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate getting the result (in real system, would be event-driven)
      const mockResult: JobExecutionResult = {
        jobId: job.id,
        studyId: job.studyId,
        success: true,
        result: {
          success: true,
          response: {
            text: `Response to: ${job.queryText}. This is a detailed response with enough content.`,
            responseTimeMs: 100,
          },
          validation: {
            passedQualityGates: true,
            isActualContent: true,
            responseLength: 70,
          },
          context: {
            sessionId: 'session-1',
            userAgent: 'Bentham/1.0',
          },
        },
        metrics: {
          executionTimeMs: 150,
          sessionWaitTimeMs: 10,
          proxyWaitTimeMs: 5,
          responseTimeMs: 100,
        },
        attemptNumber: 1,
        workerId: 'worker-1',
      };
      jobResults.set(job.id, mockResult);

      // Step 3: Validate job result
      const jobForValidation: JobForValidation = {
        id: job.id,
        studyId: job.studyId,
        surfaceId: job.surfaceId,
        result: mockResult.result,
        qualityGates: manifest.qualityGates!,
        evidenceLevel: manifest.evidenceLevel,
      };

      const validationResult = validator.validateJob(jobForValidation);
      validationResults.set(job.id, validationResult);

      // Step 4: Capture evidence
      const captureRequest: EvidenceCaptureRequest = {
        jobId: job.id,
        studyId: job.studyId,
        tenantId: 'tenant-1',
        evidenceLevel: manifest.evidenceLevel,
        legalHold: manifest.legalHold,
        responseText: mockResult.result?.response?.text,
        metadata: {
          queryText: job.queryText,
          surfaceId: job.surfaceId,
          locationId: job.locationId,
          responseTimeMs: mockResult.metrics.responseTimeMs,
        },
      };

      const evidence = await evidenceCollector.capture(captureRequest);
      evidenceResults.set(job.id, evidence);

      // Store evidence
      await evidenceCollector.store(evidence, {
        tenantId: 'tenant-1',
        legalHold: false,
        retentionDays: 90,
      });

      // Mark job as complete in orchestrator
      if (validationResult.status === 'passed') {
        await orchestrator.completeJob(study.id, job.id);
      } else {
        const errorMsg = validationResult.checks.find(c => !c.passed)?.message ?? 'Validation failed';
        await orchestrator.failJob(study.id, job.id, errorMsg);
      }

      processedJobs++;
      nextJobs = orchestrator.getNextJobs(study.id, 1);
    }

    // Verify all jobs processed
    expect(processedJobs).toBe(4);

    // Verify job results
    expect(jobResults.size).toBe(4);
    for (const result of jobResults.values()) {
      expect(result.success).toBe(true);
    }

    // Verify validation results
    expect(validationResults.size).toBe(4);
    for (const result of validationResults.values()) {
      expect(result.status).toBe('passed');
      expect(result.qualityGatesPassed).toBe(true);
    }

    // Verify evidence captured
    expect(evidenceResults.size).toBe(4);
    for (const evidence of evidenceResults.values()) {
      expect(evidence.hash).toBeDefined();
      expect(evidence.hash.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(evidence.timestampToken).toBeDefined();
    }
  });

  it('should validate study completion criteria', async () => {
    const manifest = createTestManifest();
    const study = await orchestrator.createStudy(createStudyOptions(manifest));

    await orchestrator.startStudy(study.id);

    // Process all jobs successfully
    let jobs = orchestrator.getNextJobs(study.id, 1);
    while (jobs.length > 0) {
      const job = jobs[0];
      orchestrator.startJob(study.id, job.id);
      await orchestrator.completeJob(study.id, job.id);
      jobs = orchestrator.getNextJobs(study.id, 1);
    }

    // Get progress from current study state
    const currentStudy = orchestrator.getStudy(study.id);
    const progress = currentStudy?.progress;

    // Build study validation data
    const studyForValidation: StudyForValidation = {
      studyId: study.id,
      completionCriteria: manifest.completionCriteria!,
      jobsBySurface: {
        chatgpt: {
          total: 2,
          completed: progress?.bySurface?.chatgpt?.completed ?? 0,
          failed: 0,
        },
        claude: {
          total: 2,
          completed: progress?.bySurface?.claude?.completed ?? 0,
          failed: 0,
        },
      },
    };

    const studyValidation = validator.validateStudy(studyForValidation);

    expect(studyValidation.canComplete).toBe(true);
    expect(studyValidation.completionCriteriaMet).toBe(true);
    expect(studyValidation.status).toBe('passed');
  });

  it('should handle job failures and retries gracefully', async () => {
    const manifest = createTestManifest();
    const study = await orchestrator.createStudy(createStudyOptions(manifest));

    await orchestrator.startStudy(study.id);

    // Get first job
    const jobs = orchestrator.getNextJobs(study.id, 1);
    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs[0];

    // Mark job as started
    orchestrator.startJob(study.id, job.id);

    // Simulate failure (first attempt will trigger retry since attempts < maxAttempts)
    await orchestrator.failJob(study.id, job.id, 'Rate limited by surface');

    // The job should be requeued for retry (since attempts < maxAttempts)
    // Check progress - job should not be in failed yet (it's retrying)
    const currentStudy = orchestrator.getStudy(study.id);
    const progress = currentStudy?.progress;

    // Job was requeued, so it's still pending not failed
    expect(progress?.failedCells).toBe(0);

    // In a real system, the orchestrator would requeue retryable failures
    // This demonstrates the flow handles failures correctly
  });

  it('should maintain chain of custody for evidence', async () => {
    const manifest = createTestManifest();
    const study = await orchestrator.createStudy(createStudyOptions(manifest));

    await orchestrator.startStudy(study.id);

    const jobs = orchestrator.getNextJobs(study.id, 1);
    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs[0];

    // Capture evidence
    const evidence = await evidenceCollector.capture({
      jobId: job.id,
      studyId: job.studyId,
      tenantId: 'tenant-1',
      evidenceLevel: 'full',
      legalHold: false,
      responseText: 'Test response for evidence',
      metadata: {
        queryText: job.queryText,
        surfaceId: job.surfaceId,
      },
    });

    // Store evidence
    await evidenceCollector.store(evidence, {
      tenantId: 'tenant-1',
      legalHold: true, // Legal hold for important evidence
    });

    // Retrieve evidence
    await evidenceCollector.retrieve(job.id);

    // Verify evidence
    const verifyResult = await evidenceCollector.verify(job.id);
    expect(verifyResult.valid).toBe(true);

    // Check chain of custody log
    const custodyLog = evidenceCollector.getCustodyLog(job.id);

    expect(custodyLog.length).toBeGreaterThanOrEqual(3);
    expect(custodyLog.map(e => e.action)).toContain('captured');
    expect(custodyLog.map(e => e.action)).toContain('stored');
    expect(custodyLog.map(e => e.action)).toContain('accessed');
    expect(custodyLog.map(e => e.action)).toContain('verified');

    // Verify all entries have hash
    for (const entry of custodyLog) {
      expect(entry.hash).toBeDefined();
      expect(entry.timestamp).toBeInstanceOf(Date);
    }
  });

  it('should track statistics across all modules', async () => {
    const manifest = createTestManifest();
    const study = await orchestrator.createStudy(createStudyOptions(manifest));

    await orchestrator.startStudy(study.id);

    // Process all jobs
    let jobs = orchestrator.getNextJobs(study.id, 1);
    let jobCount = 0;
    while (jobs.length > 0) {
      const job = jobs[0];
      orchestrator.startJob(study.id, job.id);

      const result = {
        success: true,
        response: {
          text: 'Valid response for statistics tracking test',
          responseTimeMs: 100,
        },
        validation: {
          passedQualityGates: true,
          isActualContent: true,
          responseLength: 45,
        },
        context: {
          sessionId: 'session-1',
          userAgent: 'Bentham/1.0',
        },
      };

      // Validate
      validator.validateJob({
        id: job.id,
        studyId: job.studyId,
        surfaceId: job.surfaceId,
        result,
        qualityGates: manifest.qualityGates!,
        evidenceLevel: manifest.evidenceLevel,
      });

      // Capture evidence
      await evidenceCollector.capture({
        jobId: job.id,
        studyId: job.studyId,
        tenantId: 'tenant-1',
        evidenceLevel: manifest.evidenceLevel,
        legalHold: manifest.legalHold,
        responseText: result.response?.text,
      });

      await orchestrator.completeJob(study.id, job.id);
      jobCount++;
      jobs = orchestrator.getNextJobs(study.id, 1);
    }

    // Check orchestrator stats
    const orchestratorStats = orchestrator.getStats();
    expect(orchestratorStats.totalStudies).toBeGreaterThanOrEqual(1);
    // All jobs completed, so no pending or executing
    expect(orchestratorStats.pendingJobs).toBe(0);
    expect(orchestratorStats.executingJobs).toBe(0);

    // Check executor stats
    const executorStats = executor.getStats();
    expect(executorStats.totalWorkers).toBeGreaterThan(0);

    // Check validator stats
    const validatorStats = validator.getStats();
    expect(validatorStats.totalValidations).toBe(jobCount);
    expect(validatorStats.validationsPassed).toBe(jobCount);
    expect(validatorStats.passRate).toBe(1);

    // Check evidence collector stats
    const evidenceStats = evidenceCollector.getStats();
    expect(evidenceStats.totalCaptures).toBe(jobCount);
    expect(evidenceStats.byLevel.metadata).toBe(jobCount);
  });
});
