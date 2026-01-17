/**
 * Evidence Collector Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EvidenceCollector,
  createEvidenceCollector,
  MemoryEvidenceStorage,
  MockTimestampAuthority,
  type EvidenceCaptureRequest,
  type StorageOptions,
  DEFAULT_COLLECTOR_CONFIG,
} from '../../index.js';

describe('EvidenceCollector', () => {
  let collector: EvidenceCollector;

  beforeEach(() => {
    collector = createEvidenceCollector();
  });

  describe('constructor', () => {
    it('should create collector with default config', () => {
      const stats = collector.getStats();
      expect(stats.totalCaptures).toBe(0);
    });

    it('should create collector with custom config', () => {
      const customCollector = createEvidenceCollector({
        screenshotQuality: 80,
        screenshotFormat: 'jpeg',
        includeHar: false,
      });
      expect(customCollector).toBeInstanceOf(EvidenceCollector);
    });

    it('should accept custom storage backend', () => {
      const storage = new MemoryEvidenceStorage();
      const customCollector = createEvidenceCollector({}, storage);
      expect(customCollector).toBeInstanceOf(EvidenceCollector);
    });

    it('should accept timestamp authority', () => {
      const tsa = new MockTimestampAuthority();
      const customCollector = createEvidenceCollector({}, undefined, tsa);
      expect(customCollector).toBeInstanceOf(EvidenceCollector);
    });
  });

  describe('capture', () => {
    it('should capture evidence at none level', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'none',
        legalHold: false,
        responseText: 'Test response',
      };

      const evidence = await collector.capture(request);

      expect(evidence.jobId).toBe('job-1');
      expect(evidence.studyId).toBe('study-1');
      expect(evidence.level).toBe('none');
      expect(evidence.metadata.responseText).toBe('Test response');
      expect(evidence.screenshot).toBeUndefined();
      expect(evidence.htmlArchive).toBeUndefined();
      expect(evidence.hash).toBeDefined();
    });

    it('should capture evidence at metadata level', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
        responseText: 'Test response',
        metadata: {
          queryText: 'Test query',
          surfaceId: 'chatgpt',
        },
      };

      const evidence = await collector.capture(request);

      expect(evidence.level).toBe('metadata');
      expect(evidence.metadata.queryText).toBe('Test query');
      expect(evidence.metadata.surfaceId).toBe('chatgpt');
    });

    it('should capture evidence at full level', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
        responseText: 'Test response',
      };

      const evidence = await collector.capture(request);

      expect(evidence.level).toBe('full');
      // Mock implementations return data when no page context
      expect(evidence.screenshot).toBeDefined();
      expect(evidence.htmlArchive).toBeDefined();
    });

    it('should include HAR when enabled', async () => {
      const customCollector = createEvidenceCollector({
        includeHar: true,
      });

      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const evidence = await customCollector.capture(request);

      expect(evidence.harFile).toBeDefined();
    });

    it('should generate hash for evidence', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
        responseText: 'Test response',
      };

      const evidence = await collector.capture(request);

      expect(evidence.hash).toBeDefined();
      expect(evidence.hash.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(evidence.hash.algorithm).toBe('sha256');
      expect(evidence.hash.individual.metadata).toBeDefined();
    });

    it('should include timestamp when enabled', async () => {
      const tsa = new MockTimestampAuthority();
      const customCollector = createEvidenceCollector(
        { enableTimestamps: true },
        undefined,
        tsa
      );

      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const evidence = await customCollector.capture(request);

      expect(evidence.timestampToken).toBeDefined();
      expect(evidence.timestampToken).toContain('TST:');
    });

    it('should log chain of custody for capture', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      await collector.capture(request);

      const log = collector.getCustodyLog('job-1');
      expect(log).toHaveLength(1);
      expect(log[0].action).toBe('captured');
      expect(log[0].jobId).toBe('job-1');
    });
  });

  describe('store', () => {
    it('should store captured evidence', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const evidence = await collector.capture(request);

      const options: StorageOptions = {
        tenantId: 'tenant-1',
        legalHold: false,
        retentionDays: 90,
      };

      const stored = await collector.store(evidence, options);

      expect(stored.jobId).toBe('job-1');
      expect(stored.storageLocation).toBe('memory');
      expect(stored.urls.metadata).toBeDefined();
    });

    it('should store with legal hold', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: true,
      };

      const evidence = await collector.capture(request);

      const options: StorageOptions = {
        tenantId: 'tenant-1',
        legalHold: true,
      };

      const stored = await collector.store(evidence, options);

      expect(stored.legalHold).toBe(true);
    });

    it('should store with retention policy', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const evidence = await collector.capture(request);

      const options: StorageOptions = {
        tenantId: 'tenant-1',
        legalHold: false,
        retentionDays: 365,
      };

      const stored = await collector.store(evidence, options);

      expect(stored.retention?.days).toBe(365);
      expect(stored.retention?.expiresAt).toBeDefined();
    });

    it('should store forever when preserveForever is true', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const evidence = await collector.capture(request);

      const options: StorageOptions = {
        tenantId: 'tenant-1',
        legalHold: false,
        preserveForever: true,
      };

      const stored = await collector.store(evidence, options);

      expect(stored.retention?.forever).toBe(true);
    });

    it('should log chain of custody for storage', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const evidence = await collector.capture(request);
      await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

      const log = collector.getCustodyLog('job-1');
      expect(log).toHaveLength(2);
      expect(log[1].action).toBe('stored');
    });
  });

  describe('retrieve', () => {
    it('should retrieve stored evidence', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const evidence = await collector.capture(request);
      await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

      const retrieved = await collector.retrieve('job-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.jobId).toBe('job-1');
    });

    it('should return undefined for non-existent evidence', async () => {
      const retrieved = await collector.retrieve('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should log chain of custody for access', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const evidence = await collector.capture(request);
      await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });
      await collector.retrieve('job-1');

      const log = collector.getCustodyLog('job-1');
      expect(log).toHaveLength(3);
      expect(log[2].action).toBe('accessed');
    });
  });

  describe('verify', () => {
    it('should verify evidence integrity', async () => {
      const tsa = new MockTimestampAuthority();
      const customCollector = createEvidenceCollector(
        { enableTimestamps: true },
        undefined,
        tsa
      );

      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const evidence = await customCollector.capture(request);
      await customCollector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

      const result = await customCollector.verify('job-1');

      expect(result.valid).toBe(true);
      expect(result.details).toBe('Evidence verified successfully');
    });

    it('should fail verification for non-existent evidence', async () => {
      const result = await collector.verify('non-existent');

      expect(result.valid).toBe(false);
      expect(result.details).toBe('Evidence not found');
    });

    it('should log chain of custody for verification', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const evidence = await collector.capture(request);
      await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });
      await collector.verify('job-1');

      const log = collector.getCustodyLog('job-1');
      expect(log.some(e => e.action === 'verified')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete evidence not under legal hold', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const evidence = await collector.capture(request);
      await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

      const deleted = await collector.delete('job-1');

      expect(deleted).toBe(true);
      const retrieved = await collector.retrieve('job-1');
      expect(retrieved).toBeUndefined();
    });

    it('should not delete evidence under legal hold', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: true,
      };

      const evidence = await collector.capture(request);
      await collector.store(evidence, { tenantId: 'tenant-1', legalHold: true });

      const deleted = await collector.delete('job-1');

      expect(deleted).toBe(false);
      const retrieved = await collector.retrieve('job-1');
      expect(retrieved).toBeDefined();
    });

    it('should return false for non-existent evidence', async () => {
      const deleted = await collector.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('chain of custody', () => {
    it('should maintain complete chain of custody', async () => {
      const tsa = new MockTimestampAuthority();
      const customCollector = createEvidenceCollector(
        { enableTimestamps: true },
        undefined,
        tsa
      );

      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const evidence = await customCollector.capture(request);
      await customCollector.store(evidence, { tenantId: 'tenant-1', legalHold: false });
      await customCollector.retrieve('job-1');
      await customCollector.verify('job-1');

      const log = customCollector.getCustodyLog('job-1');

      expect(log).toHaveLength(4);
      expect(log[0].action).toBe('captured');
      expect(log[1].action).toBe('stored');
      expect(log[2].action).toBe('accessed');
      expect(log[3].action).toBe('verified');

      // Each entry should have hash
      log.forEach(entry => {
        expect(entry.hash).toBeDefined();
        expect(entry.timestamp).toBeInstanceOf(Date);
      });
    });

    it('should get all custody log entries', async () => {
      const request1: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const request2: EvidenceCaptureRequest = {
        jobId: 'job-2',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      await collector.capture(request1);
      await collector.capture(request2);

      const allLogs = collector.getAllCustodyLog();
      expect(allLogs).toHaveLength(2);
    });
  });

  describe('statistics', () => {
    it('should track capture statistics', async () => {
      const request1: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const request2: EvidenceCaptureRequest = {
        jobId: 'job-2',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const request3: EvidenceCaptureRequest = {
        jobId: 'job-3',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'none',
        legalHold: false,
      };

      await collector.capture(request1);
      await collector.capture(request2);
      await collector.capture(request3);

      const stats = collector.getStats();

      expect(stats.totalCaptures).toBe(3);
      expect(stats.byLevel.full).toBe(1);
      expect(stats.byLevel.metadata).toBe(1);
      expect(stats.byLevel.none).toBe(1);
    });

    it('should track storage bytes', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
        responseText: 'Test response text',
      };

      await collector.capture(request);

      const stats = collector.getStats();
      expect(stats.totalStorageBytes).toBeGreaterThan(0);
    });

    it('should track timestamp count', async () => {
      const tsa = new MockTimestampAuthority();
      const customCollector = createEvidenceCollector(
        { enableTimestamps: true },
        undefined,
        tsa
      );

      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      await customCollector.capture(request);

      const stats = customCollector.getStats();
      expect(stats.timestampsIssued).toBe(1);
    });

    it('should track legal hold count', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: true,
      };

      const evidence = await collector.capture(request);
      await collector.store(evidence, { tenantId: 'tenant-1', legalHold: true });

      const stats = collector.getStats();
      expect(stats.legalHoldCount).toBe(1);
    });

    it('should reset statistics', async () => {
      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      await collector.capture(request);
      collector.resetStats();

      const stats = collector.getStats();
      expect(stats.totalCaptures).toBe(0);
      expect(stats.totalStorageBytes).toBe(0);
    });
  });

  describe('setStorage', () => {
    it('should allow changing storage backend', async () => {
      const storage1 = new MemoryEvidenceStorage();
      const storage2 = new MemoryEvidenceStorage();

      const customCollector = createEvidenceCollector({}, storage1);

      const request: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'metadata',
        legalHold: false,
      };

      const evidence = await customCollector.capture(request);
      await customCollector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

      expect(storage1.size()).toBe(1);

      customCollector.setStorage(storage2);

      const evidence2 = await customCollector.capture({
        ...request,
        jobId: 'job-2',
      });
      await customCollector.store(evidence2, { tenantId: 'tenant-1', legalHold: false });

      expect(storage1.size()).toBe(1);
      expect(storage2.size()).toBe(1);
    });
  });

  describe('setTimestampAuthority', () => {
    it('should allow changing timestamp authority', async () => {
      const customCollector = createEvidenceCollector({ enableTimestamps: true });

      // First capture without TSA - no timestamp
      const request1: EvidenceCaptureRequest = {
        jobId: 'job-1',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const evidence1 = await customCollector.capture(request1);
      expect(evidence1.timestampToken).toBeUndefined();

      // Add TSA
      const tsa = new MockTimestampAuthority();
      customCollector.setTimestampAuthority(tsa);

      // Second capture with TSA - should have timestamp
      const request2: EvidenceCaptureRequest = {
        jobId: 'job-2',
        studyId: 'study-1',
        tenantId: 'tenant-1',
        evidenceLevel: 'full',
        legalHold: false,
      };

      const evidence2 = await customCollector.capture(request2);
      expect(evidence2.timestampToken).toBeDefined();
    });
  });
});

describe('MemoryEvidenceStorage', () => {
  let storage: MemoryEvidenceStorage;

  beforeEach(() => {
    storage = new MemoryEvidenceStorage();
  });

  it('should store and retrieve evidence', async () => {
    const collector = createEvidenceCollector({}, storage);

    const request: EvidenceCaptureRequest = {
      jobId: 'job-1',
      studyId: 'study-1',
      tenantId: 'tenant-1',
      evidenceLevel: 'full',
      legalHold: false,
    };

    const evidence = await collector.capture(request);
    await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

    const stored = await storage.retrieve('job-1');
    expect(stored).toBeDefined();
    expect(stored?.jobId).toBe('job-1');
  });

  it('should check existence', async () => {
    const collector = createEvidenceCollector({}, storage);

    expect(await storage.exists('job-1')).toBe(false);

    const evidence = await collector.capture({
      jobId: 'job-1',
      studyId: 'study-1',
      tenantId: 'tenant-1',
      evidenceLevel: 'metadata',
      legalHold: false,
    });
    await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

    expect(await storage.exists('job-1')).toBe(true);
  });

  it('should get URLs by type', async () => {
    const collector = createEvidenceCollector({}, storage);

    const evidence = await collector.capture({
      jobId: 'job-1',
      studyId: 'study-1',
      tenantId: 'tenant-1',
      evidenceLevel: 'full',
      legalHold: false,
    });
    await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

    const metadataUrl = await storage.getUrl('job-1', 'metadata');
    expect(metadataUrl).toContain('memory://job-1/metadata.json');

    const screenshotUrl = await storage.getUrl('job-1', 'screenshot');
    expect(screenshotUrl).toContain('memory://job-1/screenshot');
  });

  it('should clear storage', async () => {
    const collector = createEvidenceCollector({}, storage);

    const evidence = await collector.capture({
      jobId: 'job-1',
      studyId: 'study-1',
      tenantId: 'tenant-1',
      evidenceLevel: 'metadata',
      legalHold: false,
    });
    await collector.store(evidence, { tenantId: 'tenant-1', legalHold: false });

    expect(storage.size()).toBe(1);

    storage.clear();

    expect(storage.size()).toBe(0);
  });
});

describe('MockTimestampAuthority', () => {
  let tsa: MockTimestampAuthority;

  beforeEach(() => {
    tsa = new MockTimestampAuthority();
  });

  it('should generate timestamp token', async () => {
    const data = Buffer.from('test data');
    const result = await tsa.timestamp(data);

    expect(result.token).toContain('TST:');
    expect(result.time).toBeInstanceOf(Date);
    expect(result.authority).toBe('mock-tsa');
    expect(result.serialNumber).toBeDefined();
  });

  it('should verify valid timestamp', async () => {
    const data = Buffer.from('test data');
    const result = await tsa.timestamp(data);

    const valid = await tsa.verify(data, result.token);
    expect(valid).toBe(true);
  });

  it('should reject invalid timestamp', async () => {
    const data = Buffer.from('test data');
    const differentData = Buffer.from('different data');

    const result = await tsa.timestamp(data);
    const valid = await tsa.verify(differentData, result.token);

    expect(valid).toBe(false);
  });
});

describe('DEFAULT_COLLECTOR_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_COLLECTOR_CONFIG.defaultLevel).toBe('metadata');
    expect(DEFAULT_COLLECTOR_CONFIG.screenshotQuality).toBe(90);
    expect(DEFAULT_COLLECTOR_CONFIG.screenshotFormat).toBe('png');
    expect(DEFAULT_COLLECTOR_CONFIG.includeHar).toBe(true);
    expect(DEFAULT_COLLECTOR_CONFIG.enableVideoCapture).toBe(false);
    expect(DEFAULT_COLLECTOR_CONFIG.enableTimestamps).toBe(true);
  });
});
