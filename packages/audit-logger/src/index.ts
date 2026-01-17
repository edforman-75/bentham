/**
 * @bentham/audit-logger
 *
 * Audit logging for Bentham security and compliance.
 */

// Types
export type {
  AuditSeverity,
  AuditCategory,
  ActorType,
  AuditActor,
  AuditResource,
  AuditOutcome,
  AuditEvent,
  AuditEventInput,
  AuditQueryOptions,
  AuditQueryResult,
  AuditTransport,
  AuditLoggerConfig,
  AuditStats,
} from './types.js';

export { SEVERITY_LEVELS } from './types.js';

// Logger
export {
  AuditLogger,
  MemoryTransport,
  ConsoleTransport,
  createAuditLogger,
  createTestAuditLogger,
} from './logger.js';
