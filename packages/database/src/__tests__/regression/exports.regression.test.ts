/**
 * Database Module Exports Regression Tests
 *
 * These tests verify the module exports are stable and consistent.
 * DO NOT modify or delete these tests without explicit justification.
 */

import { describe, it, expect } from 'vitest';

describe('Regression: Database Module Exports', () => {
  it('exports prisma client functions', async () => {
    const { prisma, connect, disconnect, healthCheck } = await import('../../index.js');

    expect(prisma).toBeDefined();
    expect(typeof connect).toBe('function');
    expect(typeof disconnect).toBe('function');
    expect(typeof healthCheck).toBe('function');
  });

  it('exports tenant repository functions', async () => {
    const {
      createTenant,
      findTenantById,
      findTenantBySlug,
      updateTenant,
      listTenants,
      createUser,
      findUserById,
      findUserByEmail,
      updateUser,
      listTenantUsers,
      createApiKey,
      findApiKeyByHash,
      findApiKeysByPrefix,
      touchApiKey,
      revokeApiKey,
      listTenantApiKeys,
    } = await import('../../index.js');

    expect(typeof createTenant).toBe('function');
    expect(typeof findTenantById).toBe('function');
    expect(typeof findTenantBySlug).toBe('function');
    expect(typeof updateTenant).toBe('function');
    expect(typeof listTenants).toBe('function');
    expect(typeof createUser).toBe('function');
    expect(typeof findUserById).toBe('function');
    expect(typeof findUserByEmail).toBe('function');
    expect(typeof updateUser).toBe('function');
    expect(typeof listTenantUsers).toBe('function');
    expect(typeof createApiKey).toBe('function');
    expect(typeof findApiKeyByHash).toBe('function');
    expect(typeof findApiKeysByPrefix).toBe('function');
    expect(typeof touchApiKey).toBe('function');
    expect(typeof revokeApiKey).toBe('function');
    expect(typeof listTenantApiKeys).toBe('function');
  });

  it('exports study repository functions', async () => {
    const {
      createStudy,
      findStudyById,
      findStudyByIdForTenant,
      updateStudyStatus,
      updateStudyProgress,
      incrementStudyProgress,
      listStudiesForTenant,
      findAtRiskStudies,
      findStudiesByStatus,
      createJobs,
      findJobById,
      findJobByCoordinates,
      updateJobStatus,
      incrementJobAttempts,
      findPendingJobs,
      findJobsByStatus,
      getJobStatusCounts,
      getCompletedJobResults,
      createCheckpoint,
      getLatestCheckpoint,
      listCheckpoints,
    } = await import('../../index.js');

    expect(typeof createStudy).toBe('function');
    expect(typeof findStudyById).toBe('function');
    expect(typeof findStudyByIdForTenant).toBe('function');
    expect(typeof updateStudyStatus).toBe('function');
    expect(typeof updateStudyProgress).toBe('function');
    expect(typeof incrementStudyProgress).toBe('function');
    expect(typeof listStudiesForTenant).toBe('function');
    expect(typeof findAtRiskStudies).toBe('function');
    expect(typeof findStudiesByStatus).toBe('function');
    expect(typeof createJobs).toBe('function');
    expect(typeof findJobById).toBe('function');
    expect(typeof findJobByCoordinates).toBe('function');
    expect(typeof updateJobStatus).toBe('function');
    expect(typeof incrementJobAttempts).toBe('function');
    expect(typeof findPendingJobs).toBe('function');
    expect(typeof findJobsByStatus).toBe('function');
    expect(typeof getJobStatusCounts).toBe('function');
    expect(typeof getCompletedJobResults).toBe('function');
    expect(typeof createCheckpoint).toBe('function');
    expect(typeof getLatestCheckpoint).toBe('function');
    expect(typeof listCheckpoints).toBe('function');
  });
});

describe('Regression: Export Count Stability', () => {
  it('tenant repository has expected function count', async () => {
    const repo = await import('../../repositories/tenant.repository.js');
    const exportedFunctions = Object.keys(repo).filter(
      k => typeof repo[k as keyof typeof repo] === 'function'
    );
    // 5 tenant + 5 user + 6 API key = 16 functions
    expect(exportedFunctions.length).toBe(16);
  });

  it('study repository has expected function count', async () => {
    const repo = await import('../../repositories/study.repository.js');
    const exportedFunctions = Object.keys(repo).filter(
      k => typeof repo[k as keyof typeof repo] === 'function'
    );
    // 9 study + 9 job + 3 checkpoint = 21 functions
    expect(exportedFunctions.length).toBe(21);
  });
});
