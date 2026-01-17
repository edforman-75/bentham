/**
 * Evidence Collector Types
 *
 * Types for evidence capture, hashing, and preservation.
 */

import type { EvidenceLevel } from '@bentham/core';

/**
 * Evidence capture request
 */
export interface EvidenceCaptureRequest {
  /** Job ID */
  jobId: string;
  /** Study ID */
  studyId: string;
  /** Tenant ID */
  tenantId: string;
  /** Evidence level */
  evidenceLevel: EvidenceLevel;
  /** Whether legal hold is enabled */
  legalHold: boolean;
  /** Page/browser context to capture from (opaque handle) */
  pageContext?: unknown;
  /** Response text to include */
  responseText?: string;
  /** Response metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Captured evidence
 */
export interface CapturedEvidence {
  /** Job ID */
  jobId: string;
  /** Study ID */
  studyId: string;
  /** Capture timestamp */
  capturedAt: Date;
  /** Evidence level captured */
  level: EvidenceLevel;
  /** Screenshot data */
  screenshot?: {
    /** Raw image data */
    data: Buffer;
    /** MIME type */
    mimeType: string;
    /** Width */
    width: number;
    /** Height */
    height: number;
  };
  /** HTML archive */
  htmlArchive?: {
    /** HTML content */
    html: string;
    /** Page URL */
    url: string;
  };
  /** HAR file data */
  harFile?: {
    /** HAR JSON content */
    data: object;
  };
  /** Video capture (for streaming responses) */
  video?: {
    /** Video data */
    data: Buffer;
    /** Duration in ms */
    durationMs: number;
    /** MIME type */
    mimeType: string;
  };
  /** Response metadata */
  metadata: EvidenceMetadata;
  /** Hash information */
  hash: EvidenceHash;
  /** Timestamp token (RFC 3161) */
  timestampToken?: string;
}

/**
 * Evidence metadata
 */
export interface EvidenceMetadata {
  /** Response text */
  responseText?: string;
  /** Response time in ms */
  responseTimeMs?: number;
  /** Surface ID */
  surfaceId?: string;
  /** Location ID */
  locationId?: string;
  /** Query text */
  queryText?: string;
  /** Session ID */
  sessionId?: string;
  /** Account ID */
  accountId?: string;
  /** Proxy IP */
  proxyIp?: string;
  /** User agent */
  userAgent?: string;
  /** Page title */
  pageTitle?: string;
  /** Page URL */
  pageUrl?: string;
  /** Additional custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Evidence hash
 */
export interface EvidenceHash {
  /** SHA-256 hash of all evidence */
  sha256: string;
  /** Individual hashes */
  individual: {
    screenshot?: string;
    htmlArchive?: string;
    harFile?: string;
    video?: string;
    metadata: string;
  };
  /** Hash algorithm used */
  algorithm: 'sha256';
  /** Hash timestamp */
  hashedAt: Date;
}

/**
 * Stored evidence reference
 */
export interface StoredEvidence {
  /** Job ID */
  jobId: string;
  /** Study ID */
  studyId: string;
  /** Storage URLs */
  urls: {
    screenshot?: string;
    htmlArchive?: string;
    harFile?: string;
    video?: string;
    metadata: string;
    bundle?: string;
  };
  /** Hash information */
  hash: EvidenceHash;
  /** RFC 3161 timestamp token */
  timestampToken?: string;
  /** Storage timestamp */
  storedAt: Date;
  /** Storage location */
  storageLocation: string;
  /** Legal hold enabled */
  legalHold: boolean;
  /** Retention policy */
  retention?: {
    days?: number;
    forever?: boolean;
    expiresAt?: Date;
  };
}

/**
 * Evidence storage backend interface
 */
export interface EvidenceStorage {
  /** Store evidence */
  store(evidence: CapturedEvidence, options: StorageOptions): Promise<StoredEvidence>;
  /** Retrieve evidence */
  retrieve(jobId: string): Promise<StoredEvidence | undefined>;
  /** Delete evidence (if not under legal hold) */
  delete(jobId: string): Promise<boolean>;
  /** Check if evidence exists */
  exists(jobId: string): Promise<boolean>;
  /** Get storage URL for evidence */
  getUrl(jobId: string, type: EvidenceType): Promise<string | undefined>;
}

/**
 * Evidence type
 */
export type EvidenceType = 'screenshot' | 'htmlArchive' | 'harFile' | 'video' | 'metadata' | 'bundle';

/**
 * Storage options
 */
export interface StorageOptions {
  /** Tenant ID */
  tenantId: string;
  /** Enable legal hold (WORM) */
  legalHold: boolean;
  /** Retention days */
  retentionDays?: number;
  /** Preserve forever */
  preserveForever?: boolean;
  /** Storage class */
  storageClass?: 'standard' | 'infrequent' | 'archive';
}

/**
 * Timestamp authority interface (RFC 3161)
 */
export interface TimestampAuthority {
  /** Request a timestamp token for data */
  timestamp(data: Buffer): Promise<TimestampResult>;
  /** Verify a timestamp token */
  verify(data: Buffer, token: string): Promise<boolean>;
}

/**
 * Timestamp result
 */
export interface TimestampResult {
  /** Timestamp token */
  token: string;
  /** Timestamp time */
  time: Date;
  /** Authority identifier */
  authority: string;
  /** Serial number */
  serialNumber: string;
}

/**
 * Evidence collector configuration
 */
export interface EvidenceCollectorConfig {
  /** Default evidence level */
  defaultLevel?: EvidenceLevel;
  /** Screenshot quality (0-100) */
  screenshotQuality?: number;
  /** Screenshot format */
  screenshotFormat?: 'png' | 'jpeg';
  /** Include HAR file */
  includeHar?: boolean;
  /** Enable video capture for streaming */
  enableVideoCapture?: boolean;
  /** Video max duration in ms */
  videoMaxDurationMs?: number;
  /** Enable RFC 3161 timestamps */
  enableTimestamps?: boolean;
  /** Timestamp authority URL */
  timestampAuthorityUrl?: string;
}

/**
 * Default configuration
 */
export const DEFAULT_COLLECTOR_CONFIG: Required<EvidenceCollectorConfig> = {
  defaultLevel: 'metadata',
  screenshotQuality: 90,
  screenshotFormat: 'png',
  includeHar: true,
  enableVideoCapture: false,
  videoMaxDurationMs: 30000,
  enableTimestamps: true,
  timestampAuthorityUrl: '',
};

/**
 * Evidence collector statistics
 */
export interface EvidenceCollectorStats {
  /** Total captures */
  totalCaptures: number;
  /** Captures by level */
  byLevel: Record<EvidenceLevel, number>;
  /** Total storage used (bytes) */
  totalStorageBytes: number;
  /** Timestamps issued */
  timestampsIssued: number;
  /** Legal hold evidence count */
  legalHoldCount: number;
}

/**
 * Chain of custody log entry
 */
export interface ChainOfCustodyEntry {
  /** Entry ID */
  id: string;
  /** Evidence job ID */
  jobId: string;
  /** Action taken */
  action: 'captured' | 'stored' | 'accessed' | 'verified' | 'exported';
  /** Actor (system or user ID) */
  actor: string;
  /** Timestamp */
  timestamp: Date;
  /** Hash at time of action */
  hash: string;
  /** Additional details */
  details?: Record<string, unknown>;
}
