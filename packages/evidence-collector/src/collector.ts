/**
 * Evidence Collector Implementation
 *
 * Captures, hashes, and stores evidence for legal preservation.
 */

import { createHash, randomUUID } from 'crypto';
import type { EvidenceLevel } from '@bentham/core';
import type {
  EvidenceCaptureRequest,
  CapturedEvidence,
  StoredEvidence,
  EvidenceHash,
  EvidenceMetadata,
  EvidenceStorage,
  StorageOptions,
  EvidenceType,
  TimestampAuthority,
  EvidenceCollectorConfig,
  EvidenceCollectorStats,
  ChainOfCustodyEntry,
} from './types.js';
import { DEFAULT_COLLECTOR_CONFIG } from './types.js';

/**
 * In-memory evidence storage (for testing/development)
 */
export class MemoryEvidenceStorage implements EvidenceStorage {
  private evidence: Map<string, StoredEvidence> = new Map();

  async store(evidence: CapturedEvidence, options: StorageOptions): Promise<StoredEvidence> {
    const stored: StoredEvidence = {
      jobId: evidence.jobId,
      studyId: evidence.studyId,
      urls: {
        metadata: `memory://${evidence.jobId}/metadata.json`,
      },
      hash: evidence.hash,
      timestampToken: evidence.timestampToken,
      storedAt: new Date(),
      storageLocation: 'memory',
      legalHold: options.legalHold,
      retention: {
        days: options.retentionDays,
        forever: options.preserveForever,
        expiresAt: options.retentionDays
          ? new Date(Date.now() + options.retentionDays * 24 * 60 * 60 * 1000)
          : undefined,
      },
    };

    if (evidence.screenshot) {
      stored.urls.screenshot = `memory://${evidence.jobId}/screenshot.${evidence.screenshot.mimeType.split('/')[1]}`;
    }
    if (evidence.htmlArchive) {
      stored.urls.htmlArchive = `memory://${evidence.jobId}/archive.html`;
    }
    if (evidence.harFile) {
      stored.urls.harFile = `memory://${evidence.jobId}/network.har`;
    }
    if (evidence.video) {
      stored.urls.video = `memory://${evidence.jobId}/video.${evidence.video.mimeType.split('/')[1]}`;
    }

    this.evidence.set(evidence.jobId, stored);
    return stored;
  }

  async retrieve(jobId: string): Promise<StoredEvidence | undefined> {
    return this.evidence.get(jobId);
  }

  async delete(jobId: string): Promise<boolean> {
    const stored = this.evidence.get(jobId);
    if (!stored) return false;
    if (stored.legalHold) return false; // Cannot delete under legal hold

    this.evidence.delete(jobId);
    return true;
  }

  async exists(jobId: string): Promise<boolean> {
    return this.evidence.has(jobId);
  }

  async getUrl(jobId: string, type: EvidenceType): Promise<string | undefined> {
    const stored = this.evidence.get(jobId);
    if (!stored) return undefined;
    return stored.urls[type];
  }

  // For testing
  clear(): void {
    this.evidence.clear();
  }

  size(): number {
    return this.evidence.size;
  }
}

/**
 * Mock timestamp authority (for testing)
 */
export class MockTimestampAuthority implements TimestampAuthority {
  async timestamp(data: Buffer): Promise<{ token: string; time: Date; authority: string; serialNumber: string }> {
    const hash = createHash('sha256').update(data).digest('hex');
    const time = new Date();

    return {
      token: `TST:${hash}:${time.toISOString()}`,
      time,
      authority: 'mock-tsa',
      serialNumber: randomUUID(),
    };
  }

  async verify(data: Buffer, token: string): Promise<boolean> {
    const hash = createHash('sha256').update(data).digest('hex');
    return token.includes(hash);
  }
}

/**
 * Evidence Collector class
 */
export class EvidenceCollector {
  private config: Required<EvidenceCollectorConfig>;
  private storage: EvidenceStorage;
  private timestampAuthority?: TimestampAuthority;
  private custodyLog: ChainOfCustodyEntry[] = [];
  private stats: {
    captures: number;
    byLevel: Record<EvidenceLevel, number>;
    storageBytes: number;
    timestamps: number;
    legalHold: number;
  };

  constructor(
    config: EvidenceCollectorConfig = {},
    storage?: EvidenceStorage,
    timestampAuthority?: TimestampAuthority
  ) {
    this.config = {
      ...DEFAULT_COLLECTOR_CONFIG,
      ...config,
    };

    this.storage = storage ?? new MemoryEvidenceStorage();
    this.timestampAuthority = timestampAuthority;

    this.stats = {
      captures: 0,
      byLevel: { full: 0, metadata: 0, none: 0 },
      storageBytes: 0,
      timestamps: 0,
      legalHold: 0,
    };
  }

  /**
   * Set storage backend
   */
  setStorage(storage: EvidenceStorage): void {
    this.storage = storage;
  }

  /**
   * Set timestamp authority
   */
  setTimestampAuthority(authority: TimestampAuthority): void {
    this.timestampAuthority = authority;
  }

  /**
   * Capture evidence from a request
   */
  async capture(request: EvidenceCaptureRequest): Promise<CapturedEvidence> {
    const level = request.evidenceLevel;
    const capturedAt = new Date();

    this.stats.captures++;
    this.stats.byLevel[level]++;

    // Build metadata
    const metadata: EvidenceMetadata = {
      responseText: request.responseText,
      ...request.metadata,
    };

    // For 'none' level, just return metadata
    if (level === 'none') {
      const hash = this.hashEvidence({ metadata });

      const evidence: CapturedEvidence = {
        jobId: request.jobId,
        studyId: request.studyId,
        capturedAt,
        level,
        metadata,
        hash,
      };

      this.logCustody(request.jobId, 'captured', 'system', hash.sha256);

      return evidence;
    }

    // Capture based on level
    let screenshot: CapturedEvidence['screenshot'];
    let htmlArchive: CapturedEvidence['htmlArchive'];
    let harFile: CapturedEvidence['harFile'];
    let video: CapturedEvidence['video'];

    if (level === 'full') {
      // Capture screenshot
      screenshot = await this.captureScreenshot(request.pageContext);

      // Capture HTML
      htmlArchive = await this.captureHtml(request.pageContext);

      // Capture HAR
      if (this.config.includeHar) {
        harFile = await this.captureHar(request.pageContext);
      }

      // Capture video (if enabled and streaming)
      if (this.config.enableVideoCapture) {
        video = await this.captureVideo(request.pageContext);
      }
    }

    // Calculate hash
    const hash = this.hashEvidence({
      metadata,
      screenshot: screenshot?.data,
      html: htmlArchive?.html,
      har: harFile?.data,
      video: video?.data,
    });

    // Get timestamp if enabled
    let timestampToken: string | undefined;
    if (this.config.enableTimestamps && this.timestampAuthority) {
      const hashBuffer = Buffer.from(hash.sha256, 'hex');
      const result = await this.timestampAuthority.timestamp(hashBuffer);
      timestampToken = result.token;
      this.stats.timestamps++;
    }

    const evidence: CapturedEvidence = {
      jobId: request.jobId,
      studyId: request.studyId,
      capturedAt,
      level,
      screenshot,
      htmlArchive,
      harFile,
      video,
      metadata,
      hash,
      timestampToken,
    };

    this.logCustody(request.jobId, 'captured', 'system', hash.sha256);

    return evidence;
  }

  /**
   * Capture screenshot (mock implementation)
   */
  private async captureScreenshot(pageContext?: unknown): Promise<CapturedEvidence['screenshot']> {
    // In real implementation, would use Playwright/Puppeteer page.screenshot()
    if (!pageContext) {
      // Return mock screenshot for testing
      const mockData = Buffer.from('mock-screenshot-data');
      return {
        data: mockData,
        mimeType: this.config.screenshotFormat === 'png' ? 'image/png' : 'image/jpeg',
        width: 1920,
        height: 1080,
      };
    }

    // Would call: await page.screenshot({ type: this.config.screenshotFormat, quality: this.config.screenshotQuality })
    return undefined;
  }

  /**
   * Capture HTML (mock implementation)
   */
  private async captureHtml(pageContext?: unknown): Promise<CapturedEvidence['htmlArchive']> {
    if (!pageContext) {
      return {
        html: '<html><body>Mock HTML content</body></html>',
        url: 'https://example.com/mock',
      };
    }

    // Would call: await page.content() and page.url()
    return undefined;
  }

  /**
   * Capture HAR (mock implementation)
   */
  private async captureHar(pageContext?: unknown): Promise<CapturedEvidence['harFile']> {
    if (!pageContext) {
      return {
        data: {
          log: {
            version: '1.2',
            creator: { name: 'Bentham', version: '1.0' },
            entries: [],
          },
        },
      };
    }

    // Would use browser devtools protocol to capture network
    return undefined;
  }

  /**
   * Capture video (mock implementation)
   */
  private async captureVideo(_pageContext?: unknown): Promise<CapturedEvidence['video']> {
    // Video capture is complex and would use screen recording
    return undefined;
  }

  /**
   * Hash evidence for integrity verification
   */
  private hashEvidence(data: {
    metadata: EvidenceMetadata;
    screenshot?: Buffer;
    html?: string;
    har?: object;
    video?: Buffer;
  }): EvidenceHash {
    const hashedAt = new Date();
    const individual: EvidenceHash['individual'] = {
      metadata: '',
    };

    // Hash metadata
    const metadataJson = JSON.stringify(data.metadata);
    individual.metadata = createHash('sha256').update(metadataJson).digest('hex');

    // Hash individual pieces
    if (data.screenshot) {
      individual.screenshot = createHash('sha256').update(data.screenshot).digest('hex');
      this.stats.storageBytes += data.screenshot.length;
    }

    if (data.html) {
      individual.htmlArchive = createHash('sha256').update(data.html).digest('hex');
      this.stats.storageBytes += Buffer.byteLength(data.html);
    }

    if (data.har) {
      const harJson = JSON.stringify(data.har);
      individual.harFile = createHash('sha256').update(harJson).digest('hex');
      this.stats.storageBytes += Buffer.byteLength(harJson);
    }

    if (data.video) {
      individual.video = createHash('sha256').update(data.video).digest('hex');
      this.stats.storageBytes += data.video.length;
    }

    // Combined hash
    const combinedData = Object.values(individual).filter(Boolean).join(':');
    const sha256 = createHash('sha256').update(combinedData).digest('hex');

    return {
      sha256,
      individual,
      algorithm: 'sha256',
      hashedAt,
    };
  }

  /**
   * Store captured evidence
   */
  async store(evidence: CapturedEvidence, options: StorageOptions): Promise<StoredEvidence> {
    if (options.legalHold) {
      this.stats.legalHold++;
    }

    const stored = await this.storage.store(evidence, options);

    this.logCustody(evidence.jobId, 'stored', 'system', evidence.hash.sha256, {
      location: stored.storageLocation,
      legalHold: options.legalHold,
    });

    return stored;
  }

  /**
   * Retrieve stored evidence
   */
  async retrieve(jobId: string): Promise<StoredEvidence | undefined> {
    const stored = await this.storage.retrieve(jobId);

    if (stored) {
      this.logCustody(jobId, 'accessed', 'system', stored.hash.sha256);
    }

    return stored;
  }

  /**
   * Verify evidence integrity
   */
  async verify(jobId: string): Promise<{ valid: boolean; details: string }> {
    const stored = await this.storage.retrieve(jobId);

    if (!stored) {
      return { valid: false, details: 'Evidence not found' };
    }

    // Verify timestamp if present
    if (stored.timestampToken && this.timestampAuthority) {
      const hashBuffer = Buffer.from(stored.hash.sha256, 'hex');
      const valid = await this.timestampAuthority.verify(hashBuffer, stored.timestampToken);

      if (!valid) {
        return { valid: false, details: 'Timestamp verification failed' };
      }
    }

    this.logCustody(jobId, 'verified', 'system', stored.hash.sha256);

    return { valid: true, details: 'Evidence verified successfully' };
  }

  /**
   * Delete evidence (if allowed)
   */
  async delete(jobId: string): Promise<boolean> {
    const stored = await this.storage.retrieve(jobId);

    if (!stored) return false;
    if (stored.legalHold) {
      return false; // Cannot delete under legal hold
    }

    return this.storage.delete(jobId);
  }

  /**
   * Log chain of custody entry
   */
  private logCustody(
    jobId: string,
    action: ChainOfCustodyEntry['action'],
    actor: string,
    hash: string,
    details?: Record<string, unknown>
  ): void {
    this.custodyLog.push({
      id: randomUUID(),
      jobId,
      action,
      actor,
      timestamp: new Date(),
      hash,
      details,
    });
  }

  /**
   * Get chain of custody log for a job
   */
  getCustodyLog(jobId: string): ChainOfCustodyEntry[] {
    return this.custodyLog.filter(entry => entry.jobId === jobId);
  }

  /**
   * Get all custody log entries
   */
  getAllCustodyLog(): ChainOfCustodyEntry[] {
    return [...this.custodyLog];
  }

  /**
   * Get statistics
   */
  getStats(): EvidenceCollectorStats {
    return {
      totalCaptures: this.stats.captures,
      byLevel: { ...this.stats.byLevel },
      totalStorageBytes: this.stats.storageBytes,
      timestampsIssued: this.stats.timestamps,
      legalHoldCount: this.stats.legalHold,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      captures: 0,
      byLevel: { full: 0, metadata: 0, none: 0 },
      storageBytes: 0,
      timestamps: 0,
      legalHold: 0,
    };
  }
}

/**
 * Create a new evidence collector instance
 */
export function createEvidenceCollector(
  config?: EvidenceCollectorConfig,
  storage?: EvidenceStorage,
  timestampAuthority?: TimestampAuthority
): EvidenceCollector {
  return new EvidenceCollector(config, storage, timestampAuthority);
}
