/**
 * @bentham/evidence-collector
 *
 * Evidence capture, hashing, and preservation for legal compliance.
 */

// Types
export type {
  EvidenceCaptureRequest,
  CapturedEvidence,
  EvidenceMetadata,
  EvidenceHash,
  StoredEvidence,
  EvidenceStorage,
  EvidenceType,
  StorageOptions,
  TimestampAuthority,
  TimestampResult,
  EvidenceCollectorConfig,
  EvidenceCollectorStats,
  ChainOfCustodyEntry,
} from './types.js';

export { DEFAULT_COLLECTOR_CONFIG } from './types.js';

// Collector
export {
  EvidenceCollector,
  createEvidenceCollector,
  MemoryEvidenceStorage,
  MockTimestampAuthority,
} from './collector.js';
