/**
 * Repository exports unit tests
 *
 * These tests verify the repository functions are exported correctly.
 */

import { describe, it, expect } from 'vitest';

describe('Repository Exports', () => {
  describe('tenant repository', () => {
    it('should export tenant functions', async () => {
      const repo = await import('../../repositories/tenant.repository.js');

      expect(typeof repo.createTenant).toBe('function');
      expect(typeof repo.findTenantById).toBe('function');
      expect(typeof repo.findTenantBySlug).toBe('function');
      expect(typeof repo.updateTenant).toBe('function');
      expect(typeof repo.listTenants).toBe('function');
    });

    it('should export user functions', async () => {
      const repo = await import('../../repositories/tenant.repository.js');

      expect(typeof repo.createUser).toBe('function');
      expect(typeof repo.findUserById).toBe('function');
      expect(typeof repo.findUserByEmail).toBe('function');
      expect(typeof repo.updateUser).toBe('function');
      expect(typeof repo.listTenantUsers).toBe('function');
    });

    it('should export API key functions', async () => {
      const repo = await import('../../repositories/tenant.repository.js');

      expect(typeof repo.createApiKey).toBe('function');
      expect(typeof repo.findApiKeyByHash).toBe('function');
      expect(typeof repo.findApiKeysByPrefix).toBe('function');
      expect(typeof repo.touchApiKey).toBe('function');
      expect(typeof repo.revokeApiKey).toBe('function');
      expect(typeof repo.listTenantApiKeys).toBe('function');
    });
  });

  describe('study repository', () => {
    it('should export study functions', async () => {
      const repo = await import('../../repositories/study.repository.js');

      expect(typeof repo.createStudy).toBe('function');
      expect(typeof repo.findStudyById).toBe('function');
      expect(typeof repo.findStudyByIdForTenant).toBe('function');
      expect(typeof repo.updateStudyStatus).toBe('function');
      expect(typeof repo.updateStudyProgress).toBe('function');
      expect(typeof repo.incrementStudyProgress).toBe('function');
      expect(typeof repo.listStudiesForTenant).toBe('function');
      expect(typeof repo.findAtRiskStudies).toBe('function');
      expect(typeof repo.findStudiesByStatus).toBe('function');
    });

    it('should export job functions', async () => {
      const repo = await import('../../repositories/study.repository.js');

      expect(typeof repo.createJobs).toBe('function');
      expect(typeof repo.findJobById).toBe('function');
      expect(typeof repo.findJobByCoordinates).toBe('function');
      expect(typeof repo.updateJobStatus).toBe('function');
      expect(typeof repo.incrementJobAttempts).toBe('function');
      expect(typeof repo.findPendingJobs).toBe('function');
      expect(typeof repo.findJobsByStatus).toBe('function');
      expect(typeof repo.getJobStatusCounts).toBe('function');
      expect(typeof repo.getCompletedJobResults).toBe('function');
    });

    it('should export checkpoint functions', async () => {
      const repo = await import('../../repositories/study.repository.js');

      expect(typeof repo.createCheckpoint).toBe('function');
      expect(typeof repo.getLatestCheckpoint).toBe('function');
      expect(typeof repo.listCheckpoints).toBe('function');
    });
  });

  describe('index exports', () => {
    it('should re-export all repository functions from index', async () => {
      const index = await import('../../repositories/index.js');

      // Tenant functions
      expect(typeof index.createTenant).toBe('function');
      expect(typeof index.findTenantById).toBe('function');
      expect(typeof index.createUser).toBe('function');
      expect(typeof index.createApiKey).toBe('function');

      // Study functions
      expect(typeof index.createStudy).toBe('function');
      expect(typeof index.findStudyById).toBe('function');
      expect(typeof index.createJobs).toBe('function');
      expect(typeof index.createCheckpoint).toBe('function');
    });
  });
});
