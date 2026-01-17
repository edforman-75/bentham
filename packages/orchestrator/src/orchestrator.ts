/**
 * Orchestrator Implementation
 *
 * Manages study lifecycle, job graphs, and execution coordination.
 */

import { randomUUID } from 'crypto';
import type { Manifest, SurfaceId, LocationId } from '@bentham/core';
import type {
  Study,
  StudyStatus,
  Job,
  JobPriority,
  JobGraph,
  StudyProgress,
  StudyCheckpoint,
  DeadlineStatus,
  StudyTransition,
  CreateStudyOptions,
  OrchestratorConfig,
  OrchestratorHooks,
  OrchestratorStats,
  OrchestratorEvent,
  OrchestratorEventHandler,
} from './types.js';
import { DEFAULT_ORCHESTRATOR_CONFIG } from './types.js';

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<StudyStatus, StudyStatus[]> = {
  manifest_received: ['validating', 'failed'],
  validating: ['queued', 'failed'],
  queued: ['executing', 'failed'],
  executing: ['validating_results', 'paused', 'human_intervention_required', 'failed'],
  validating_results: ['complete', 'executing', 'failed'],
  paused: ['executing', 'failed'],
  human_intervention_required: ['executing', 'paused', 'failed'],
  complete: [],
  failed: [],
};

/**
 * Orchestrator class
 */
export class Orchestrator {
  private config: Required<OrchestratorConfig>;
  private studies: Map<string, Study> = new Map();
  private hooks: OrchestratorHooks = {};
  private eventHandlers: Set<OrchestratorEventHandler> = new Set();
  private checkpointTimer: NodeJS.Timeout | null = null;

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      ...DEFAULT_ORCHESTRATOR_CONFIG,
      ...config,
    };
  }

  /**
   * Set orchestrator hooks
   */
  setHooks(hooks: OrchestratorHooks): void {
    this.hooks = hooks;
  }

  /**
   * Subscribe to orchestrator events
   */
  on(handler: OrchestratorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event
   */
  private async emit(event: OrchestratorEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    }
  }

  /**
   * Create a new study from a manifest
   */
  async createStudy(options: CreateStudyOptions): Promise<Study> {
    const { tenantId, manifest, estimatedCost } = options;

    // Generate job graph from manifest
    const jobGraph = this.buildJobGraph(manifest);

    // Calculate initial progress
    const progress = this.calculateProgress(jobGraph, manifest);

    // Calculate deadline status
    const deadlineStatus = this.calculateDeadlineStatus(manifest.deadline, progress);

    const study: Study = {
      id: randomUUID(),
      tenantId,
      manifest,
      status: 'manifest_received',
      progress,
      jobGraph,
      deadlineStatus,
      costs: {
        estimated: estimatedCost ?? this.estimateCost(manifest),
        actual: 0,
      },
      createdAt: new Date(),
    };

    this.studies.set(study.id, study);

    await this.emit({
      type: 'study_created',
      studyId: study.id,
      timestamp: new Date(),
      details: { tenantId, manifest: manifest.name },
    });

    return study;
  }

  /**
   * Build job graph from manifest
   */
  private buildJobGraph(manifest: Manifest): JobGraph {
    const jobs = new Map<string, Job>();
    const readyQueue: string[] = [];

    const requiredSurfaces = new Set(manifest.completionCriteria.requiredSurfaces.surfaceIds);

    // Create a job for each cell in the matrix
    manifest.queries.forEach((query, queryIndex) => {
      manifest.surfaces.forEach((surface) => {
        manifest.locations.forEach((location) => {
          const job: Job = {
            id: randomUUID(),
            studyId: '', // Will be set when study is created
            status: 'pending',
            priority: requiredSurfaces.has(surface.id) ? 'high' : 'normal',
            queryIndex,
            queryText: query.text,
            surfaceId: surface.id as SurfaceId,
            locationId: location.id as LocationId,
            attempts: 0,
            maxAttempts: manifest.completionCriteria.maxRetriesPerCell,
            dependsOn: [],
            createdAt: new Date(),
            isRequired: requiredSurfaces.has(surface.id),
          };

          jobs.set(job.id, job);
          readyQueue.push(job.id);
        });
      });
    });

    return {
      jobs,
      readyQueue,
      executing: new Set(),
      completed: new Set(),
      failed: new Set(),
    };
  }

  /**
   * Get a study by ID
   */
  getStudy(studyId: string): Study | undefined {
    return this.studies.get(studyId);
  }

  /**
   * Get all studies
   */
  getAllStudies(): Study[] {
    return Array.from(this.studies.values());
  }

  /**
   * Get studies by tenant
   */
  getStudiesByTenant(tenantId: string): Study[] {
    return Array.from(this.studies.values())
      .filter(s => s.tenantId === tenantId);
  }

  /**
   * Get studies by status
   */
  getStudiesByStatus(status: StudyStatus): Study[] {
    return Array.from(this.studies.values())
      .filter(s => s.status === status);
  }

  /**
   * Transition study state
   */
  async transitionStudy(
    studyId: string,
    toStatus: StudyStatus,
    options: { reason?: string; actor?: string } = {}
  ): Promise<boolean> {
    const study = this.studies.get(studyId);
    if (!study) return false;

    const fromStatus = study.status;

    // Validate transition
    if (!VALID_TRANSITIONS[fromStatus].includes(toStatus)) {
      return false;
    }

    const transition: StudyTransition = {
      from: fromStatus,
      to: toStatus,
      timestamp: new Date(),
      reason: options.reason,
      actor: options.actor ?? 'system',
    };

    study.status = toStatus;

    // Update timestamps
    if (toStatus === 'executing' && !study.startedAt) {
      study.startedAt = new Date();
    }
    if (toStatus === 'complete' || toStatus === 'failed') {
      study.completedAt = new Date();
    }
    if (toStatus === 'paused') {
      study.pauseReason = options.reason;
    }
    if (toStatus === 'failed') {
      study.error = options.reason;
    }

    // Call hook
    if (this.hooks.onStudyTransition) {
      await this.hooks.onStudyTransition(study, transition);
    }

    // Emit event
    const eventType = this.getTransitionEventType(toStatus);
    if (eventType) {
      await this.emit({
        type: eventType,
        studyId,
        timestamp: new Date(),
        details: { from: fromStatus, to: toStatus, reason: options.reason },
      });
    }

    return true;
  }

  /**
   * Get event type for status transition
   */
  private getTransitionEventType(status: StudyStatus): 'study_started' | 'study_paused' | 'study_completed' | 'study_failed' | null {
    switch (status) {
      case 'executing':
        return 'study_started';
      case 'paused':
        return 'study_paused';
      case 'complete':
        return 'study_completed';
      case 'failed':
        return 'study_failed';
      default:
        return null;
    }
  }

  /**
   * Start a study (transition to executing)
   */
  async startStudy(studyId: string): Promise<boolean> {
    const study = this.studies.get(studyId);
    if (!study) return false;

    // Must be in queued state
    if (study.status !== 'queued') {
      // Try to transition through validating first if needed
      if (study.status === 'manifest_received') {
        await this.transitionStudy(studyId, 'validating', { reason: 'Auto-validation' });
        await this.transitionStudy(studyId, 'queued', { reason: 'Validation passed' });
      }
    }

    return this.transitionStudy(studyId, 'executing', { reason: 'Study started' });
  }

  /**
   * Pause a study
   */
  async pauseStudy(studyId: string, reason: string): Promise<boolean> {
    return this.transitionStudy(studyId, 'paused', { reason });
  }

  /**
   * Resume a paused study
   */
  async resumeStudy(studyId: string): Promise<boolean> {
    const study = this.studies.get(studyId);
    if (!study || study.status !== 'paused') return false;

    const success = await this.transitionStudy(studyId, 'executing', { reason: 'Study resumed' });

    if (success) {
      await this.emit({
        type: 'study_started',
        studyId,
        timestamp: new Date(),
        details: { resumed: true },
      });
    }

    return success;
  }

  /**
   * Get next jobs to execute
   */
  getNextJobs(studyId: string, limit: number = 10): Job[] {
    const study = this.studies.get(studyId);
    if (!study || study.status !== 'executing') return [];

    const { jobGraph } = study;
    const jobs: Job[] = [];

    // Get jobs from ready queue up to limit and concurrency limit
    const maxJobs = Math.min(
      limit,
      this.config.maxConcurrentJobsPerStudy - jobGraph.executing.size
    );

    for (const jobId of jobGraph.readyQueue) {
      if (jobs.length >= maxJobs) break;

      const job = jobGraph.jobs.get(jobId);
      if (!job) continue;

      // Skip if not ready (has pending dependencies)
      if (job.dependsOn.some(depId => !jobGraph.completed.has(depId))) {
        continue;
      }

      // Skip if in backoff
      if (job.nextAttemptAt && job.nextAttemptAt > new Date()) {
        continue;
      }

      jobs.push(job);
    }

    // Sort by priority
    jobs.sort((a, b) => {
      const priorityOrder: Record<JobPriority, number> = {
        critical: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return jobs.slice(0, maxJobs);
  }

  /**
   * Mark a job as started
   */
  startJob(studyId: string, jobId: string): boolean {
    const study = this.studies.get(studyId);
    if (!study) return false;

    const job = study.jobGraph.jobs.get(jobId);
    if (!job) return false;

    job.status = 'executing';
    job.startedAt = new Date();
    job.attempts++;
    job.lastAttemptAt = new Date();

    // Move from ready queue to executing
    const readyIndex = study.jobGraph.readyQueue.indexOf(jobId);
    if (readyIndex !== -1) {
      study.jobGraph.readyQueue.splice(readyIndex, 1);
    }
    study.jobGraph.executing.add(jobId);

    // Update progress
    this.updateProgress(study);

    return true;
  }

  /**
   * Mark a job as completed
   */
  async completeJob(studyId: string, jobId: string): Promise<boolean> {
    const study = this.studies.get(studyId);
    if (!study) return false;

    const job = study.jobGraph.jobs.get(jobId);
    if (!job) return false;

    job.status = 'complete';
    job.completedAt = new Date();

    // Move from executing to completed
    study.jobGraph.executing.delete(jobId);
    study.jobGraph.completed.add(jobId);

    // Update progress
    this.updateProgress(study);

    await this.emit({
      type: 'job_completed',
      studyId,
      jobId,
      timestamp: new Date(),
      details: { attempts: job.attempts },
    });

    // Check if study is complete
    await this.checkStudyCompletion(study);

    return true;
  }

  /**
   * Mark a job as failed
   */
  async failJob(studyId: string, jobId: string, error: string): Promise<boolean> {
    const study = this.studies.get(studyId);
    if (!study) return false;

    const job = study.jobGraph.jobs.get(jobId);
    if (!job) return false;

    // Check if we should retry
    if (job.attempts < job.maxAttempts) {
      // Schedule retry with exponential backoff
      job.status = 'pending';
      job.error = error;
      const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 60000);
      job.nextAttemptAt = new Date(Date.now() + backoffMs);

      // Move back to ready queue
      study.jobGraph.executing.delete(jobId);
      study.jobGraph.readyQueue.push(jobId);

      return true;
    }

    // Max retries exhausted
    job.status = 'failed';
    job.error = error;
    job.completedAt = new Date();

    // Move from executing to failed
    study.jobGraph.executing.delete(jobId);
    study.jobGraph.failed.add(jobId);

    // Update progress
    this.updateProgress(study);

    await this.emit({
      type: 'job_failed',
      studyId,
      jobId,
      timestamp: new Date(),
      details: { error, attempts: job.attempts },
    });

    // Check if study should fail or continue
    await this.checkStudyCompletion(study);

    return true;
  }

  /**
   * Update study progress
   */
  private updateProgress(study: Study): void {
    study.progress = this.calculateProgress(study.jobGraph, study.manifest);
    study.deadlineStatus = this.calculateDeadlineStatus(
      study.manifest.deadline,
      study.progress,
      study.startedAt
    );

    // Check if at risk
    if (study.deadlineStatus.atRisk && this.config.enableAutoEscalation) {
      this.handleAtRisk(study);
    }

    // Call progress hook
    if (this.hooks.onProgressUpdate) {
      this.hooks.onProgressUpdate(study).catch(console.error);
    }
  }

  /**
   * Calculate progress from job graph
   */
  private calculateProgress(jobGraph: JobGraph, manifest: Manifest): StudyProgress {
    const requiredSurfaces = new Set(manifest.completionCriteria.requiredSurfaces.surfaceIds);

    const bySurface: StudyProgress['bySurface'] = {};
    const byLocation: StudyProgress['byLocation'] = {};

    // Initialize surface stats
    for (const surface of manifest.surfaces) {
      bySurface[surface.id] = {
        total: 0,
        completed: 0,
        failed: 0,
        isRequired: requiredSurfaces.has(surface.id),
      };
    }

    // Initialize location stats
    for (const location of manifest.locations) {
      byLocation[location.id] = {
        total: 0,
        completed: 0,
        failed: 0,
      };
    }

    // Count jobs
    for (const job of jobGraph.jobs.values()) {
      // By surface
      if (bySurface[job.surfaceId]) {
        bySurface[job.surfaceId].total++;
        if (job.status === 'complete') bySurface[job.surfaceId].completed++;
        if (job.status === 'failed') bySurface[job.surfaceId].failed++;
      }

      // By location
      if (byLocation[job.locationId]) {
        byLocation[job.locationId].total++;
        if (job.status === 'complete') byLocation[job.locationId].completed++;
        if (job.status === 'failed') byLocation[job.locationId].failed++;
      }
    }

    const totalCells = jobGraph.jobs.size;
    const completedCells = jobGraph.completed.size;
    const failedCells = jobGraph.failed.size;
    const executingCells = jobGraph.executing.size;
    const pendingCells = totalCells - completedCells - failedCells - executingCells;

    return {
      totalCells,
      completedCells,
      failedCells,
      executingCells,
      pendingCells,
      completionPercentage: totalCells > 0 ? (completedCells / totalCells) * 100 : 0,
      bySurface,
      byLocation,
      cellsPerHour: 0, // Will be calculated based on actual execution
    };
  }

  /**
   * Calculate deadline status
   */
  private calculateDeadlineStatus(
    deadline: Date,
    progress: StudyProgress,
    startedAt?: Date
  ): DeadlineStatus {
    const now = Date.now();
    const deadlineTime = deadline.getTime();
    const timeRemainingMs = deadlineTime - now;

    // Calculate required rate
    const remainingCells = progress.totalCells - progress.completedCells - progress.failedCells;
    const hoursRemaining = timeRemainingMs / 3600000;
    const requiredRate = hoursRemaining > 0 ? remainingCells / hoursRemaining : Infinity;

    // Calculate current rate
    let currentRate = 0;
    if (startedAt) {
      const elapsedHours = (now - startedAt.getTime()) / 3600000;
      if (elapsedHours > 0) {
        currentRate = progress.completedCells / elapsedHours;
      }
    }

    // Determine if at risk
    const atRisk = currentRate > 0 && currentRate < requiredRate * 0.8; // 20% buffer

    return {
      deadline,
      timeRemainingMs,
      atRisk,
      requiredRate,
      currentRate,
    };
  }

  /**
   * Handle at-risk study
   */
  private async handleAtRisk(study: Study): Promise<void> {
    await this.emit({
      type: 'study_at_risk',
      studyId: study.id,
      timestamp: new Date(),
      details: {
        timeRemainingMs: study.deadlineStatus.timeRemainingMs,
        requiredRate: study.deadlineStatus.requiredRate,
        currentRate: study.deadlineStatus.currentRate,
      },
    });

    if (this.hooks.onDeadlineAtRisk) {
      await this.hooks.onDeadlineAtRisk(study, study.deadlineStatus);
    }
  }

  /**
   * Check if study should complete or fail
   */
  private async checkStudyCompletion(study: Study): Promise<void> {
    const { manifest, progress, jobGraph } = study;
    const requiredSurfaces = manifest.completionCriteria.requiredSurfaces;

    // Check if all jobs are done
    const allDone = jobGraph.readyQueue.length === 0 && jobGraph.executing.size === 0;

    if (!allDone) return;

    // Check required surface thresholds
    let meetsRequirements = true;
    for (const surfaceId of requiredSurfaces.surfaceIds) {
      const surfaceProgress = progress.bySurface[surfaceId];
      if (!surfaceProgress) continue;

      const completionRate = surfaceProgress.total > 0
        ? surfaceProgress.completed / surfaceProgress.total
        : 0;

      if (completionRate < requiredSurfaces.coverageThreshold) {
        meetsRequirements = false;
        break;
      }
    }

    if (meetsRequirements) {
      await this.transitionStudy(study.id, 'validating_results', { reason: 'All jobs complete' });
      // In a real implementation, validator would be called here
      // For now, auto-complete after validation
      await this.transitionStudy(study.id, 'complete', { reason: 'Validation passed' });
    } else {
      await this.transitionStudy(study.id, 'failed', {
        reason: 'Required surface thresholds not met',
      });
    }
  }

  /**
   * Create a checkpoint
   */
  async createCheckpoint(studyId: string): Promise<StudyCheckpoint | undefined> {
    const study = this.studies.get(studyId);
    if (!study) return undefined;

    const checkpoint: StudyCheckpoint = {
      id: randomUUID(),
      studyId,
      status: study.status,
      completedJobs: Array.from(study.jobGraph.completed),
      failedJobs: Array.from(study.jobGraph.failed),
      inProgressJobs: Array.from(study.jobGraph.executing),
      progress: { ...study.progress },
      createdAt: new Date(),
      sequenceNumber: study.latestCheckpoint
        ? study.latestCheckpoint.sequenceNumber + 1
        : 1,
    };

    study.latestCheckpoint = checkpoint;

    await this.emit({
      type: 'checkpoint_created',
      studyId,
      timestamp: new Date(),
      details: { checkpointId: checkpoint.id, sequenceNumber: checkpoint.sequenceNumber },
    });

    if (this.hooks.onCheckpoint) {
      await this.hooks.onCheckpoint(checkpoint);
    }

    return checkpoint;
  }

  /**
   * Restore from checkpoint
   */
  restoreFromCheckpoint(study: Study, checkpoint: StudyCheckpoint): void {
    const { jobGraph } = study;

    // Clear all tracking sets first
    jobGraph.completed.clear();
    jobGraph.failed.clear();
    jobGraph.executing.clear();
    jobGraph.readyQueue = [];

    // Reset all jobs to pending
    for (const job of jobGraph.jobs.values()) {
      job.status = 'pending';
    }

    // Mark completed jobs
    for (const jobId of checkpoint.completedJobs) {
      const job = jobGraph.jobs.get(jobId);
      if (job) {
        job.status = 'complete';
        jobGraph.completed.add(jobId);
      }
    }

    // Mark failed jobs
    for (const jobId of checkpoint.failedJobs) {
      const job = jobGraph.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        jobGraph.failed.add(jobId);
      }
    }

    // Rebuild ready queue with pending jobs
    for (const job of jobGraph.jobs.values()) {
      if (job.status === 'pending') {
        jobGraph.readyQueue.push(job.id);
      }
    }

    // Restore study status
    study.status = checkpoint.status;
    study.progress = checkpoint.progress;
    study.latestCheckpoint = checkpoint;
  }

  /**
   * Estimate cost for a manifest
   */
  private estimateCost(manifest: Manifest): number {
    const cellCount = manifest.queries.length *
      manifest.surfaces.length *
      manifest.locations.length;

    // Rough estimate: $0.05 per cell
    return cellCount * 0.05;
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): OrchestratorStats {
    const studies = Array.from(this.studies.values());

    const byStatus: Record<StudyStatus, number> = {
      manifest_received: 0,
      validating: 0,
      queued: 0,
      executing: 0,
      validating_results: 0,
      paused: 0,
      human_intervention_required: 0,
      complete: 0,
      failed: 0,
    };

    let pendingJobs = 0;
    let executingJobs = 0;
    let studiesAtRisk = 0;

    for (const study of studies) {
      byStatus[study.status]++;

      if (study.status === 'executing') {
        pendingJobs += study.jobGraph.readyQueue.length;
        executingJobs += study.jobGraph.executing.size;

        if (study.deadlineStatus.atRisk) {
          studiesAtRisk++;
        }
      }
    }

    const activeStudies = byStatus.executing +
      byStatus.queued +
      byStatus.validating +
      byStatus.validating_results;

    return {
      totalStudies: studies.length,
      byStatus,
      activeStudies,
      pendingJobs,
      executingJobs,
      studiesAtRisk,
    };
  }

  /**
   * Start automatic checkpointing
   */
  startCheckpointing(): void {
    if (this.checkpointTimer) return;

    this.checkpointTimer = setInterval(async () => {
      for (const study of this.studies.values()) {
        if (study.status === 'executing') {
          await this.createCheckpoint(study.id);
        }
      }
    }, this.config.checkpointInterval);
  }

  /**
   * Stop automatic checkpointing
   */
  stopCheckpointing(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }
  }

  /**
   * Shutdown the orchestrator
   */
  async shutdown(): Promise<void> {
    this.stopCheckpointing();

    // Create final checkpoints for executing studies
    for (const study of this.studies.values()) {
      if (study.status === 'executing') {
        await this.createCheckpoint(study.id);
      }
    }
  }
}

/**
 * Create a new orchestrator instance
 */
export function createOrchestrator(config?: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}
