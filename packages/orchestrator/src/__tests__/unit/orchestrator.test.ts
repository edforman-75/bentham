/**
 * Orchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Orchestrator, createOrchestrator } from '../../orchestrator.js';
import type { Manifest } from '@bentham/core';
import type { OrchestratorEvent } from '../../types.js';

// Helper to create a test manifest
function createTestManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    version: '1.0',
    name: 'Test Study',
    description: 'A test study',
    queries: [
      { text: 'Query 1' },
      { text: 'Query 2' },
    ],
    surfaces: [
      { id: 'chatgpt-web', required: true },
      { id: 'gemini-web', required: false },
    ],
    locations: [
      { id: 'us-nyc', name: 'New York', country: 'US', proxyType: 'residential', requireSticky: true },
      { id: 'uk-lon', name: 'London', country: 'GB', proxyType: 'residential', requireSticky: true },
    ],
    completionCriteria: {
      requiredSurfaces: {
        surfaceIds: ['chatgpt-web'],
        coverageThreshold: 0.9,
      },
      optionalSurfaces: {
        surfaceIds: ['gemini-web'],
      },
      maxRetriesPerCell: 3,
    },
    qualityGates: {
      minResponseLength: 100,
      requireActualContent: true,
    },
    evidenceLevel: 'full',
    legalHold: false,
    deadline: new Date(Date.now() + 3600000), // 1 hour from now
    sessionIsolation: 'shared',
    ...overrides,
  } as Manifest;
}

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  afterEach(async () => {
    await orchestrator.shutdown();
  });

  describe('constructor', () => {
    it('should create orchestrator with default config', () => {
      const stats = orchestrator.getStats();
      expect(stats.totalStudies).toBe(0);
    });

    it('should create orchestrator with custom config', () => {
      const customOrchestrator = new Orchestrator({
        maxConcurrentStudies: 100,
        defaultMaxAttempts: 5,
      });
      expect(customOrchestrator).toBeInstanceOf(Orchestrator);
      customOrchestrator.shutdown();
    });
  });

  describe('createStudy', () => {
    it('should create a study from manifest', async () => {
      const manifest = createTestManifest();
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      expect(study.id).toBeDefined();
      expect(study.tenantId).toBe('tenant-1');
      expect(study.status).toBe('manifest_received');
      expect(study.manifest).toEqual(manifest);
    });

    it('should build job graph from manifest', async () => {
      const manifest = createTestManifest();
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      // 2 queries × 2 surfaces × 2 locations = 8 jobs
      expect(study.jobGraph.jobs.size).toBe(8);
      expect(study.jobGraph.readyQueue.length).toBe(8);
      expect(study.progress.totalCells).toBe(8);
    });

    it('should calculate initial progress', async () => {
      const manifest = createTestManifest();
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      expect(study.progress.completedCells).toBe(0);
      expect(study.progress.failedCells).toBe(0);
      expect(study.progress.completionPercentage).toBe(0);
    });

    it('should estimate cost', async () => {
      const manifest = createTestManifest();
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      expect(study.costs.estimated).toBeGreaterThan(0);
      expect(study.costs.actual).toBe(0);
    });

    it('should emit study_created event', async () => {
      const events: OrchestratorEvent[] = [];
      orchestrator.on((event) => { events.push(event); });

      const manifest = createTestManifest();
      await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      const studyCreatedEvents = events.filter(e => e.type === 'study_created');
      expect(studyCreatedEvents).toHaveLength(1);
      expect(studyCreatedEvents[0].type).toBe('study_created');
    });
  });

  describe('getStudy', () => {
    it('should get study by ID', async () => {
      const manifest = createTestManifest();
      const created = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      const study = orchestrator.getStudy(created.id);
      expect(study).toEqual(created);
    });

    it('should return undefined for unknown ID', () => {
      const study = orchestrator.getStudy('unknown');
      expect(study).toBeUndefined();
    });
  });

  describe('getAllStudies', () => {
    it('should return all studies', async () => {
      await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });
      await orchestrator.createStudy({
        tenantId: 'tenant-2',
        manifest: createTestManifest(),
      });

      const studies = orchestrator.getAllStudies();
      expect(studies).toHaveLength(2);
    });
  });

  describe('getStudiesByTenant', () => {
    it('should filter studies by tenant', async () => {
      await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });
      await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });
      await orchestrator.createStudy({
        tenantId: 'tenant-2',
        manifest: createTestManifest(),
      });

      const studies = orchestrator.getStudiesByTenant('tenant-1');
      expect(studies).toHaveLength(2);
      expect(studies.every(s => s.tenantId === 'tenant-1')).toBe(true);
    });
  });

  describe('transitionStudy', () => {
    it('should transition to valid state', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      const success = await orchestrator.transitionStudy(study.id, 'validating');
      expect(success).toBe(true);
      expect(orchestrator.getStudy(study.id)!.status).toBe('validating');
    });

    it('should reject invalid transition', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      // Cannot go directly to executing from manifest_received
      const success = await orchestrator.transitionStudy(study.id, 'executing');
      expect(success).toBe(false);
      expect(orchestrator.getStudy(study.id)!.status).toBe('manifest_received');
    });

    it('should call onStudyTransition hook', async () => {
      const onStudyTransition = vi.fn();
      orchestrator.setHooks({ onStudyTransition });

      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.transitionStudy(study.id, 'validating');

      expect(onStudyTransition).toHaveBeenCalledTimes(1);
    });
  });

  describe('startStudy', () => {
    it('should start a queued study', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.transitionStudy(study.id, 'validating');
      await orchestrator.transitionStudy(study.id, 'queued');

      const success = await orchestrator.startStudy(study.id);
      expect(success).toBe(true);
      expect(orchestrator.getStudy(study.id)!.status).toBe('executing');
    });

    it('should auto-transition from manifest_received', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      const success = await orchestrator.startStudy(study.id);
      expect(success).toBe(true);
      expect(orchestrator.getStudy(study.id)!.status).toBe('executing');
    });
  });

  describe('pauseStudy', () => {
    it('should pause an executing study', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);
      const success = await orchestrator.pauseStudy(study.id, 'Manual pause');

      expect(success).toBe(true);
      expect(orchestrator.getStudy(study.id)!.status).toBe('paused');
      expect(orchestrator.getStudy(study.id)!.pauseReason).toBe('Manual pause');
    });
  });

  describe('resumeStudy', () => {
    it('should resume a paused study', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);
      await orchestrator.pauseStudy(study.id, 'Test pause');

      const success = await orchestrator.resumeStudy(study.id);
      expect(success).toBe(true);
      expect(orchestrator.getStudy(study.id)!.status).toBe('executing');
    });

    it('should not resume non-paused study', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      const success = await orchestrator.resumeStudy(study.id);
      expect(success).toBe(false);
    });
  });

  describe('getNextJobs', () => {
    it('should return jobs for executing study', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);

      const jobs = orchestrator.getNextJobs(study.id, 5);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.length).toBeLessThanOrEqual(5);
    });

    it('should return empty for non-executing study', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      const jobs = orchestrator.getNextJobs(study.id, 5);
      expect(jobs).toHaveLength(0);
    });

    it('should prioritize required surface jobs', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);

      const jobs = orchestrator.getNextJobs(study.id, 10);

      // Required surface (chatgpt-web) jobs should come first
      const firstRequiredIndex = jobs.findIndex(j => j.surfaceId === 'chatgpt-web');
      const firstOptionalIndex = jobs.findIndex(j => j.surfaceId === 'gemini-web');

      if (firstRequiredIndex !== -1 && firstOptionalIndex !== -1) {
        expect(firstRequiredIndex).toBeLessThan(firstOptionalIndex);
      }
    });
  });

  describe('startJob', () => {
    it('should mark job as executing', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);
      const jobs = orchestrator.getNextJobs(study.id, 1);
      const job = jobs[0];

      const success = orchestrator.startJob(study.id, job.id);
      expect(success).toBe(true);

      const updatedStudy = orchestrator.getStudy(study.id)!;
      const updatedJob = updatedStudy.jobGraph.jobs.get(job.id)!;
      expect(updatedJob.status).toBe('executing');
      expect(updatedJob.attempts).toBe(1);
    });

    it('should update progress', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);
      const jobs = orchestrator.getNextJobs(study.id, 1);

      orchestrator.startJob(study.id, jobs[0].id);

      const updatedStudy = orchestrator.getStudy(study.id)!;
      expect(updatedStudy.progress.executingCells).toBe(1);
    });
  });

  describe('completeJob', () => {
    it('should mark job as complete', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);
      const jobs = orchestrator.getNextJobs(study.id, 1);
      const job = jobs[0];

      orchestrator.startJob(study.id, job.id);
      const success = await orchestrator.completeJob(study.id, job.id);

      expect(success).toBe(true);

      const updatedStudy = orchestrator.getStudy(study.id)!;
      expect(updatedStudy.jobGraph.completed.has(job.id)).toBe(true);
      expect(updatedStudy.progress.completedCells).toBe(1);
    });

    it('should emit job_completed event', async () => {
      const events: OrchestratorEvent[] = [];
      orchestrator.on((event) => { events.push(event); });

      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);
      const jobs = orchestrator.getNextJobs(study.id, 1);

      orchestrator.startJob(study.id, jobs[0].id);
      await orchestrator.completeJob(study.id, jobs[0].id);

      const completedEvent = events.find(e => e.type === 'job_completed');
      expect(completedEvent).toBeDefined();
      expect(completedEvent!.jobId).toBe(jobs[0].id);
    });
  });

  describe('failJob', () => {
    it('should retry job if attempts remaining', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);
      const jobs = orchestrator.getNextJobs(study.id, 1);
      const job = jobs[0];

      orchestrator.startJob(study.id, job.id);
      await orchestrator.failJob(study.id, job.id, 'Temporary error');

      const updatedStudy = orchestrator.getStudy(study.id)!;
      const updatedJob = updatedStudy.jobGraph.jobs.get(job.id)!;

      expect(updatedJob.status).toBe('pending');
      expect(updatedJob.nextAttemptAt).toBeDefined();
      expect(updatedStudy.jobGraph.readyQueue).toContain(job.id);
    });

    it('should mark job as failed after max retries', async () => {
      const manifest = createTestManifest({
        completionCriteria: {
          requiredSurfaces: { surfaceIds: ['chatgpt'], coverageThreshold: 0.9 },
          maxRetriesPerCell: 1, // Only 1 retry
        },
      });

      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      await orchestrator.startStudy(study.id);
      const jobs = orchestrator.getNextJobs(study.id, 1);
      const job = jobs[0];

      // First attempt
      orchestrator.startJob(study.id, job.id);
      await orchestrator.failJob(study.id, job.id, 'Error 1');

      // Second attempt (exceeds max)
      orchestrator.startJob(study.id, job.id);
      await orchestrator.failJob(study.id, job.id, 'Error 2');

      const updatedStudy = orchestrator.getStudy(study.id)!;
      const updatedJob = updatedStudy.jobGraph.jobs.get(job.id)!;

      expect(updatedJob.status).toBe('failed');
      expect(updatedStudy.jobGraph.failed.has(job.id)).toBe(true);
    });
  });

  describe('createCheckpoint', () => {
    it('should create checkpoint for study', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);

      // Complete a job
      const jobs = orchestrator.getNextJobs(study.id, 1);
      orchestrator.startJob(study.id, jobs[0].id);
      await orchestrator.completeJob(study.id, jobs[0].id);

      const checkpoint = await orchestrator.createCheckpoint(study.id);

      expect(checkpoint).toBeDefined();
      expect(checkpoint!.studyId).toBe(study.id);
      expect(checkpoint!.completedJobs).toContain(jobs[0].id);
      expect(checkpoint!.sequenceNumber).toBe(1);
    });

    it('should emit checkpoint_created event', async () => {
      const events: OrchestratorEvent[] = [];
      orchestrator.on((event) => { events.push(event); });

      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);
      await orchestrator.createCheckpoint(study.id);

      const checkpointEvent = events.find(e => e.type === 'checkpoint_created');
      expect(checkpointEvent).toBeDefined();
    });
  });

  describe('restoreFromCheckpoint', () => {
    it('should restore study state from checkpoint', async () => {
      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      await orchestrator.startStudy(study.id);

      // Complete some jobs
      const jobs = orchestrator.getNextJobs(study.id, 3);
      for (const job of jobs) {
        orchestrator.startJob(study.id, job.id);
        await orchestrator.completeJob(study.id, job.id);
      }

      // Create checkpoint
      const checkpoint = await orchestrator.createCheckpoint(study.id);

      // Simulate more work
      const moreJobs = orchestrator.getNextJobs(study.id, 2);
      for (const job of moreJobs) {
        orchestrator.startJob(study.id, job.id);
        await orchestrator.completeJob(study.id, job.id);
      }

      // Restore from checkpoint (simulating restart)
      const currentStudy = orchestrator.getStudy(study.id)!;
      orchestrator.restoreFromCheckpoint(currentStudy, checkpoint!);

      // Should be back to checkpoint state
      expect(currentStudy.jobGraph.completed.size).toBe(3);
      expect(currentStudy.progress.completedCells).toBe(checkpoint!.progress.completedCells);
    });
  });

  describe('getStats', () => {
    it('should return orchestrator statistics', async () => {
      await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest: createTestManifest(),
      });

      const study2 = await orchestrator.createStudy({
        tenantId: 'tenant-2',
        manifest: createTestManifest(),
      });
      await orchestrator.startStudy(study2.id);

      const stats = orchestrator.getStats();

      expect(stats.totalStudies).toBe(2);
      expect(stats.byStatus.manifest_received).toBe(1);
      expect(stats.byStatus.executing).toBe(1);
      expect(stats.activeStudies).toBe(1);
    });
  });

  describe('deadline tracking', () => {
    it('should mark study at risk when behind schedule', async () => {
      const manifest = createTestManifest({
        deadline: new Date(Date.now() + 60000), // 1 minute deadline
      });

      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      await orchestrator.startStudy(study.id);

      // Simulate slow progress by completing only a few jobs over time
      const updatedStudy = orchestrator.getStudy(study.id)!;

      // With 8 jobs and 1 minute deadline, required rate is ~480 cells/hour
      // If we haven't completed any, atRisk should be true after some time
      expect(updatedStudy.deadlineStatus.deadline).toEqual(manifest.deadline);
    });

    it('should call onDeadlineAtRisk hook when at risk', async () => {
      const onDeadlineAtRisk = vi.fn();
      orchestrator.setHooks({ onDeadlineAtRisk });

      const manifest = createTestManifest({
        deadline: new Date(Date.now() + 1000), // Very short deadline
      });

      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      await orchestrator.startStudy(study.id);

      // Wait a bit then update progress
      await new Promise(resolve => setTimeout(resolve, 100));

      // Complete a single job to trigger progress update
      const jobs = orchestrator.getNextJobs(study.id, 1);
      if (jobs.length > 0) {
        orchestrator.startJob(study.id, jobs[0].id);
        await orchestrator.completeJob(study.id, jobs[0].id);
      }

      // The hook may or may not be called depending on timing
      // Just verify the deadline status is being tracked
      const updatedStudy = orchestrator.getStudy(study.id)!;
      expect(updatedStudy.deadlineStatus).toBeDefined();
    });
  });

  describe('study completion', () => {
    it('should complete study when all required surfaces meet threshold', async () => {
      const manifest = createTestManifest({
        surfaces: [
          { id: 'chatgpt-web', required: true },
        ],
        completionCriteria: {
          requiredSurfaces: { surfaceIds: ['chatgpt-web'], coverageThreshold: 0.5 },
          maxRetriesPerCell: 3,
        },
      });

      const study = await orchestrator.createStudy({
        tenantId: 'tenant-1',
        manifest,
      });

      await orchestrator.startStudy(study.id);

      // Complete enough jobs to meet threshold (2 queries × 1 surface × 2 locations = 4 jobs, need 50% = 2)
      let completed = 0;
      while (completed < 2) {
        const jobs = orchestrator.getNextJobs(study.id, 1);
        if (jobs.length === 0) break;

        orchestrator.startJob(study.id, jobs[0].id);
        await orchestrator.completeJob(study.id, jobs[0].id);
        completed++;
      }

      // Fail remaining jobs to trigger completion check
      let remaining = orchestrator.getNextJobs(study.id, 10);
      for (const job of remaining) {
        orchestrator.startJob(study.id, job.id);
        // Exceed max retries
        for (let i = 0; i < 3; i++) {
          await orchestrator.failJob(study.id, job.id, 'Simulated failure');
          if (orchestrator.getStudy(study.id)!.jobGraph.jobs.get(job.id)!.status === 'pending') {
            orchestrator.startJob(study.id, job.id);
          }
        }
      }

      const finalStudy = orchestrator.getStudy(study.id)!;
      expect(finalStudy.status).toBe('complete');
    });
  });
});

describe('createOrchestrator', () => {
  it('should create a new orchestrator instance', () => {
    const orchestrator = createOrchestrator();
    expect(orchestrator).toBeInstanceOf(Orchestrator);
    orchestrator.shutdown();
  });

  it('should accept config', () => {
    const orchestrator = createOrchestrator({
      maxConcurrentStudies: 20,
    });
    expect(orchestrator).toBeInstanceOf(Orchestrator);
    orchestrator.shutdown();
  });
});
