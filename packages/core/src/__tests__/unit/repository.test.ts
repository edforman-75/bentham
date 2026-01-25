/**
 * Tests for Study Repository System
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createRepositoryStructure,
  createTenantStructure,
  StudyRepository,
  createExecutionMetadata,
  generateRunId,
  generateStudyId,
  type StudyResultSummary,
  type IPVerificationRecord,
  type StudyCompletionInfo,
} from '../../study/repository.js';

const TEST_REPO_DIR = '/tmp/bentham-repository-test';

describe('Study Repository System', () => {
  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_REPO_DIR)) {
      fs.rmSync(TEST_REPO_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(TEST_REPO_DIR)) {
      fs.rmSync(TEST_REPO_DIR, { recursive: true });
    }
  });

  describe('createRepositoryStructure', () => {
    it('should create all required directories', () => {
      const structure = createRepositoryStructure(TEST_REPO_DIR);

      expect(fs.existsSync(structure.root)).toBe(true);
      expect(fs.existsSync(structure.manifests)).toBe(true);
      expect(fs.existsSync(structure.results)).toBe(true);
      expect(fs.existsSync(structure.checkpoints)).toBe(true);
      expect(fs.existsSync(structure.reports)).toBe(true);
      expect(fs.existsSync(structure.index)).toBe(true);
    });

    it('should return correct paths', () => {
      const structure = createRepositoryStructure(TEST_REPO_DIR);

      expect(structure.root).toBe(TEST_REPO_DIR);
      expect(structure.manifests).toBe(path.join(TEST_REPO_DIR, 'manifests'));
      expect(structure.results).toBe(path.join(TEST_REPO_DIR, 'results'));
    });
  });

  describe('createTenantStructure', () => {
    it('should create tenant-specific directories', () => {
      const repoStructure = createRepositoryStructure(TEST_REPO_DIR);
      const tenantDirs = createTenantStructure(repoStructure, 'glu');

      expect(fs.existsSync(tenantDirs.manifests)).toBe(true);
      expect(fs.existsSync(tenantDirs.results)).toBe(true);
      expect(fs.existsSync(tenantDirs.checkpoints)).toBe(true);
      expect(fs.existsSync(tenantDirs.reports)).toBe(true);
    });

    it('should include tenant id in paths', () => {
      const repoStructure = createRepositoryStructure(TEST_REPO_DIR);
      const tenantDirs = createTenantStructure(repoStructure, 'kyanos');

      expect(tenantDirs.manifests).toContain('kyanos');
      expect(tenantDirs.results).toContain('kyanos');
    });
  });

  describe('generateRunId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateRunId();
      const id2 = generateRunId();

      expect(id1).not.toBe(id2);
    });

    it('should start with run_ prefix', () => {
      const id = generateRunId();
      expect(id).toMatch(/^run_[a-z0-9]+_[a-z0-9]+$/);
    });
  });

  describe('generateStudyId', () => {
    it('should create slug from name', () => {
      const id = generateStudyId('HUFT India Visibility Study');
      expect(id).toMatch(/^huft-india-visibility-study-[a-z0-9]+$/);
    });

    it('should handle special characters', () => {
      const id = generateStudyId('Test & Study (2026)');
      expect(id).not.toContain('&');
      expect(id).not.toContain('(');
      expect(id).not.toContain(')');
    });
  });

  describe('StudyRepository', () => {
    it('should create repository with index file', () => {
      const repo = new StudyRepository(TEST_REPO_DIR);
      const indexPath = path.join(TEST_REPO_DIR, 'index', 'studies.json');

      expect(fs.existsSync(indexPath)).toBe(true);
    });

    it('should register and retrieve study runs', () => {
      const repo = new StudyRepository(TEST_REPO_DIR);

      const summary: StudyResultSummary = {
        runId: 'run_test123',
        studyId: 'huft-india',
        tenantId: 'glu',
        manifestPath: '/manifests/glu/huft-india/manifest.yaml',
        startedAt: new Date().toISOString(),
        status: 'completed',
        ip: '65.20.88.138',
        location: 'in-mum',
        ipVerified: true,
        totalQueries: 20,
        successfulQueries: 19,
        failedQueries: 1,
        successRate: 95,
        surfaces: ['chatgpt-web', 'openai-api'],
        locations: ['in-mum'],
        resultFiles: ['/results/run_test123/results.json'],
      };

      repo.registerStudyRun(summary);

      const retrieved = repo.getStudiesByTenant('glu');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].runId).toBe('run_test123');
    });

    it('should update study status', () => {
      const repo = new StudyRepository(TEST_REPO_DIR);

      const summary: StudyResultSummary = {
        runId: 'run_update',
        studyId: 'test-study',
        tenantId: 'glu',
        manifestPath: '/manifests/glu/test/manifest.yaml',
        startedAt: new Date().toISOString(),
        status: 'running',
        ip: '1.2.3.4',
        location: 'us-national',
        ipVerified: false,
        totalQueries: 10,
        successfulQueries: 0,
        failedQueries: 0,
        successRate: 0,
        surfaces: ['openai-api'],
        locations: ['us-national'],
        resultFiles: [],
      };

      repo.registerStudyRun(summary);
      repo.updateStudyStatus('run_update', {
        status: 'completed',
        successfulQueries: 10,
        successRate: 100,
      });

      const studies = repo.getStudiesByStatus('completed');
      expect(studies).toHaveLength(1);
      expect(studies[0].successRate).toBe(100);
    });

    it('should get recent studies', () => {
      const repo = new StudyRepository(TEST_REPO_DIR);

      // Add multiple studies
      for (let i = 0; i < 5; i++) {
        const summary: StudyResultSummary = {
          runId: `run_${i}`,
          studyId: `study-${i}`,
          tenantId: 'glu',
          manifestPath: `/manifests/glu/study-${i}/manifest.yaml`,
          startedAt: new Date(Date.now() - i * 86400000).toISOString(), // Each day older
          status: 'completed',
          ip: '1.2.3.4',
          location: 'us-national',
          ipVerified: true,
          totalQueries: 10,
          successfulQueries: 10,
          failedQueries: 0,
          successRate: 100,
          surfaces: ['openai-api'],
          locations: ['us-national'],
          resultFiles: [],
        };
        repo.registerStudyRun(summary);
      }

      const recent = repo.getRecentStudies(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].runId).toBe('run_0'); // Most recent
    });
  });

  describe('createExecutionMetadata', () => {
    it('should create complete metadata object', () => {
      const ipVerification: IPVerificationRecord = {
        ip: '65.20.88.138',
        country: 'IN',
        city: 'Mumbai',
        region: 'Maharashtra',
        org: 'Test ISP',
        timezone: 'Asia/Kolkata',
        verifiedAt: new Date().toISOString(),
        lookupDurationMs: 150,
        expectedLocation: 'in-mum',
        verified: true,
      };

      const completion: StudyCompletionInfo = {
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 3600000,
        totalCells: 120,
        completedCells: 115,
        failedCells: 5,
        successRate: 95.8,
      };

      const metadata = createExecutionMetadata(
        'run_abc123',
        'huft-india',
        '/manifests/glu/huft-india/manifest.yaml',
        'glu',
        {
          name: 'HUFT India Study Run 1',
          createdBy: 'research-team',
          createdAt: new Date().toISOString(),
          clientRef: 'HUFT-Q1-2026',
        },
        ipVerification,
        completion
      );

      expect(metadata.runId).toBe('run_abc123');
      expect(metadata.studyId).toBe('huft-india');
      expect(metadata.tenantId).toBe('glu');
      expect(metadata.ipVerification.verified).toBe(true);
      expect(metadata.completion.successRate).toBe(95.8);
      expect(metadata.environment.nodeVersion).toBeDefined();
    });

    it('should include optional fields when provided', () => {
      const ipVerification: IPVerificationRecord = {
        ip: '1.2.3.4',
        country: 'US',
        city: 'New York',
        region: 'NY',
        org: 'Test',
        timezone: 'America/New_York',
        verifiedAt: new Date().toISOString(),
        lookupDurationMs: 100,
        expectedLocation: 'us-national',
        verified: true,
      };

      const completion: StudyCompletionInfo = {
        status: 'completed',
        startedAt: new Date().toISOString(),
        totalCells: 10,
        completedCells: 10,
        failedCells: 0,
        successRate: 100,
      };

      const metadata = createExecutionMetadata(
        'run_test',
        'test',
        '/test',
        'glu',
        { name: 'Test', createdBy: 'test', createdAt: new Date().toISOString() },
        ipVerification,
        completion,
        {
          costs: {
            totalUsd: 5.50,
            byProvider: { openai: 5.00, google: 0.50 },
            byOperation: { query: 5.50 },
          },
          warnings: [
            { code: 'SLOW_RESPONSE', message: 'Response took 5s', severity: 'low', timestamp: new Date().toISOString() }
          ],
          recovery: {
            sessionRecoveries: 1,
            proxyRotations: 2,
            retriedQueries: 3,
          },
        }
      );

      expect(metadata.costs?.totalUsd).toBe(5.50);
      expect(metadata.warnings).toHaveLength(1);
      expect(metadata.recovery?.sessionRecoveries).toBe(1);
    });
  });
});
