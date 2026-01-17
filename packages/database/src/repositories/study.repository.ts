/**
 * Study Repository
 *
 * Data access layer for study and job operations.
 */

import { prisma } from '../client.js';
import type { Study, Job, Checkpoint, StudyStatus, JobStatus } from '@prisma/client';

// ============================================================================
// Study Operations
// ============================================================================

/**
 * Create a new study
 */
export async function createStudy(data: {
  tenantId: string;
  manifest: object;
  totalCells: number;
  deadline: Date;
  estimatedCost?: object;
}): Promise<Study> {
  return prisma.study.create({
    data: {
      tenantId: data.tenantId,
      manifest: data.manifest,
      totalCells: data.totalCells,
      deadline: data.deadline,
      estimatedCost: data.estimatedCost ?? {},
      actualCost: {},
    },
  });
}

/**
 * Find study by ID
 */
export async function findStudyById(id: string): Promise<Study | null> {
  return prisma.study.findUnique({
    where: { id },
  });
}

/**
 * Find study by ID with tenant verification
 */
export async function findStudyByIdForTenant(
  id: string,
  tenantId: string
): Promise<Study | null> {
  return prisma.study.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Update study status
 */
export async function updateStudyStatus(
  id: string,
  status: StudyStatus,
  additionalData?: {
    startedAt?: Date;
    completedAt?: Date;
    resultSummary?: object;
    actualCost?: object;
  }
): Promise<Study> {
  return prisma.study.update({
    where: { id },
    data: {
      status,
      ...additionalData,
    },
  });
}

/**
 * Update study progress
 */
export async function updateStudyProgress(
  id: string,
  data: {
    completedCells?: number;
    failedCells?: number;
    actualCost?: object;
  }
): Promise<Study> {
  return prisma.study.update({
    where: { id },
    data,
  });
}

/**
 * Increment study progress counters
 */
export async function incrementStudyProgress(
  id: string,
  counts: {
    completed?: number;
    failed?: number;
  }
): Promise<Study> {
  return prisma.study.update({
    where: { id },
    data: {
      completedCells: counts.completed
        ? { increment: counts.completed }
        : undefined,
      failedCells: counts.failed ? { increment: counts.failed } : undefined,
    },
  });
}

/**
 * List studies for a tenant
 */
export async function listStudiesForTenant(
  tenantId: string,
  options?: {
    status?: StudyStatus | StudyStatus[];
    limit?: number;
    offset?: number;
    orderBy?: 'createdAt' | 'deadline';
    orderDir?: 'asc' | 'desc';
  }
): Promise<{ studies: Study[]; total: number }> {
  const statusFilter = options?.status
    ? Array.isArray(options.status)
      ? { in: options.status }
      : options.status
    : undefined;

  const where = {
    tenantId,
    ...(statusFilter && { status: statusFilter }),
  };

  const [studies, total] = await Promise.all([
    prisma.study.findMany({
      where,
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      orderBy: {
        [options?.orderBy ?? 'createdAt']: options?.orderDir ?? 'desc',
      },
    }),
    prisma.study.count({ where }),
  ]);

  return { studies, total };
}

/**
 * Find studies at risk (deadline approaching, not complete)
 */
export async function findAtRiskStudies(
  thresholdMinutes: number = 60
): Promise<Study[]> {
  const threshold = new Date(Date.now() + thresholdMinutes * 60 * 1000);

  return prisma.study.findMany({
    where: {
      status: { in: ['EXECUTING', 'VALIDATING_RESULTS'] },
      deadline: { lte: threshold },
    },
    orderBy: { deadline: 'asc' },
  });
}

/**
 * Find studies by status (for workers)
 */
export async function findStudiesByStatus(
  status: StudyStatus | StudyStatus[]
): Promise<Study[]> {
  const statusFilter = Array.isArray(status) ? { in: status } : status;

  return prisma.study.findMany({
    where: { status: statusFilter },
    orderBy: { createdAt: 'asc' },
  });
}

// ============================================================================
// Job Operations
// ============================================================================

/**
 * Create jobs for a study
 */
export async function createJobs(
  jobs: Array<{
    studyId: string;
    queryIndex: number;
    surfaceId: string;
    locationId: string;
    dependsOn?: string[];
  }>
): Promise<number> {
  const result = await prisma.job.createMany({
    data: jobs.map((job) => ({
      studyId: job.studyId,
      queryIndex: job.queryIndex,
      surfaceId: job.surfaceId,
      locationId: job.locationId,
      dependsOn: job.dependsOn ?? [],
    })),
  });

  return result.count;
}

/**
 * Find job by ID
 */
export async function findJobById(id: string): Promise<Job | null> {
  return prisma.job.findUnique({
    where: { id },
  });
}

/**
 * Find job by coordinates
 */
export async function findJobByCoordinates(
  studyId: string,
  queryIndex: number,
  surfaceId: string,
  locationId: string
): Promise<Job | null> {
  return prisma.job.findUnique({
    where: {
      studyId_queryIndex_surfaceId_locationId: {
        studyId,
        queryIndex,
        surfaceId,
        locationId,
      },
    },
  });
}

/**
 * Update job status
 */
export async function updateJobStatus(
  id: string,
  status: JobStatus,
  additionalData?: {
    attempts?: number;
    lastAttemptAt?: Date;
    result?: object;
  }
): Promise<Job> {
  return prisma.job.update({
    where: { id },
    data: {
      status,
      ...additionalData,
    },
  });
}

/**
 * Increment job attempts
 */
export async function incrementJobAttempts(id: string): Promise<Job> {
  return prisma.job.update({
    where: { id },
    data: {
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
}

/**
 * Find pending jobs for a study
 */
export async function findPendingJobs(
  studyId: string,
  options?: {
    limit?: number;
    surfaceId?: string;
    locationId?: string;
  }
): Promise<Job[]> {
  return prisma.job.findMany({
    where: {
      studyId,
      status: 'PENDING',
      ...(options?.surfaceId && { surfaceId: options.surfaceId }),
      ...(options?.locationId && { locationId: options.locationId }),
    },
    take: options?.limit ?? 100,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Find jobs by status for a study
 */
export async function findJobsByStatus(
  studyId: string,
  status: JobStatus | JobStatus[]
): Promise<Job[]> {
  const statusFilter = Array.isArray(status) ? { in: status } : status;

  return prisma.job.findMany({
    where: {
      studyId,
      status: statusFilter,
    },
  });
}

/**
 * Get job counts by status for a study
 */
export async function getJobStatusCounts(
  studyId: string
): Promise<Record<JobStatus, number>> {
  const counts = await prisma.job.groupBy({
    by: ['status'],
    where: { studyId },
    _count: { status: true },
  });

  const result: Record<JobStatus, number> = {
    PENDING: 0,
    EXECUTING: 0,
    VALIDATING: 0,
    COMPLETE: 0,
    FAILED: 0,
  };

  for (const item of counts) {
    result[item.status] = item._count.status;
  }

  return result;
}

/**
 * Get completed job results for a study
 */
export async function getCompletedJobResults(
  studyId: string,
  options?: {
    surfaceId?: string;
    locationId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ jobs: Job[]; total: number }> {
  const where = {
    studyId,
    status: 'COMPLETE' as JobStatus,
    ...(options?.surfaceId && { surfaceId: options.surfaceId }),
    ...(options?.locationId && { locationId: options.locationId }),
  };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      orderBy: [{ queryIndex: 'asc' }, { surfaceId: 'asc' }, { locationId: 'asc' }],
    }),
    prisma.job.count({ where }),
  ]);

  return { jobs, total };
}

// ============================================================================
// Checkpoint Operations
// ============================================================================

/**
 * Create a checkpoint
 */
export async function createCheckpoint(data: {
  studyId: string;
  completedJobs: string[];
  failedJobs: string[];
  inProgressJobs: string[];
  stateData?: object;
}): Promise<Checkpoint> {
  return prisma.checkpoint.create({
    data: {
      studyId: data.studyId,
      completedJobs: data.completedJobs,
      failedJobs: data.failedJobs,
      inProgressJobs: data.inProgressJobs,
      stateData: data.stateData,
    },
  });
}

/**
 * Get latest checkpoint for a study
 */
export async function getLatestCheckpoint(
  studyId: string
): Promise<Checkpoint | null> {
  return prisma.checkpoint.findFirst({
    where: { studyId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * List checkpoints for a study
 */
export async function listCheckpoints(
  studyId: string,
  options?: {
    limit?: number;
  }
): Promise<Checkpoint[]> {
  return prisma.checkpoint.findMany({
    where: { studyId },
    take: options?.limit ?? 10,
    orderBy: { createdAt: 'desc' },
  });
}
