/**
 * Audit Logger Types
 *
 * Types for security and compliance audit logging.
 */

/**
 * Audit event severity levels
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Categories of auditable actions
 */
export type AuditCategory =
  | 'authentication'    // Login, logout, token refresh
  | 'authorization'     // Permission checks, access grants
  | 'data_access'       // Reading sensitive data
  | 'data_modification' // Creating, updating, deleting data
  | 'configuration'     // System or study configuration changes
  | 'execution'         // Study execution events
  | 'billing'           // Billing and cost-related events
  | 'security'          // Security-related events
  | 'system';           // System events

/**
 * Actor types for audit events
 */
export type ActorType = 'user' | 'service' | 'system' | 'api_key';

/**
 * Actor information - who performed the action
 */
export interface AuditActor {
  /** Type of actor */
  type: ActorType;
  /** Actor ID (user ID, service name, etc.) */
  id: string;
  /** Optional display name */
  name?: string;
  /** IP address if applicable */
  ipAddress?: string;
  /** User agent if applicable */
  userAgent?: string;
}

/**
 * Resource that was acted upon
 */
export interface AuditResource {
  /** Resource type (study, tenant, user, etc.) */
  type: string;
  /** Resource ID */
  id: string;
  /** Optional resource name for readability */
  name?: string;
  /** Additional resource attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Outcome of the audited action
 */
export interface AuditOutcome {
  /** Whether the action succeeded */
  success: boolean;
  /** Result code or status */
  resultCode?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Additional outcome details */
  details?: Record<string, unknown>;
}

/**
 * A single audit event
 */
export interface AuditEvent {
  /** Unique event ID */
  id: string;
  /** Timestamp of the event */
  timestamp: Date;
  /** Event severity */
  severity: AuditSeverity;
  /** Event category */
  category: AuditCategory;
  /** Action that was performed */
  action: string;
  /** Description of the event */
  description: string;
  /** Who performed the action */
  actor: AuditActor;
  /** What was acted upon (optional) */
  resource?: AuditResource;
  /** Outcome of the action */
  outcome: AuditOutcome;
  /** Tenant context */
  tenantId?: string;
  /** Study context */
  studyId?: string;
  /** Request/correlation ID for tracing */
  correlationId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating an audit event (without auto-generated fields)
 */
export interface AuditEventInput {
  /** Event severity (default: info) */
  severity?: AuditSeverity;
  /** Event category */
  category: AuditCategory;
  /** Action that was performed */
  action: string;
  /** Description of the event */
  description: string;
  /** Who performed the action */
  actor: AuditActor;
  /** What was acted upon (optional) */
  resource?: AuditResource;
  /** Outcome of the action */
  outcome: AuditOutcome;
  /** Tenant context */
  tenantId?: string;
  /** Study context */
  studyId?: string;
  /** Request/correlation ID for tracing */
  correlationId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Query options for retrieving audit events
 */
export interface AuditQueryOptions {
  /** Filter by tenant ID */
  tenantId?: string;
  /** Filter by study ID */
  studyId?: string;
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by category */
  category?: AuditCategory;
  /** Filter by severity (minimum) */
  minSeverity?: AuditSeverity;
  /** Filter by action */
  action?: string;
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by time range */
  timeRange?: {
    start: Date;
    end: Date;
  };
  /** Filter by success/failure */
  success?: boolean;
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Result of an audit query
 */
export interface AuditQueryResult {
  /** Matching events */
  events: AuditEvent[];
  /** Total count (for pagination) */
  total: number;
  /** Current offset */
  offset: number;
  /** Current limit */
  limit: number;
  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Audit log transport interface
 */
export interface AuditTransport {
  /** Transport name */
  name: string;
  /** Write an event to the transport */
  write(event: AuditEvent): Promise<void>;
  /** Flush any buffered events */
  flush(): Promise<void>;
  /** Close the transport */
  close(): Promise<void>;
}

/**
 * Audit logger configuration
 */
export interface AuditLoggerConfig {
  /** Default tenant ID (optional) */
  defaultTenantId?: string;
  /** Minimum severity to log (default: info) */
  minSeverity?: AuditSeverity;
  /** Whether to include metadata in logs (default: true) */
  includeMetadata?: boolean;
  /** Buffer size for batching (default: 1 - immediate) */
  bufferSize?: number;
  /** Flush interval in ms (default: 5000) */
  flushInterval?: number;
}

/**
 * Audit statistics
 */
export interface AuditStats {
  /** Total events logged */
  totalEvents: number;
  /** Events by severity */
  bySeverity: Record<AuditSeverity, number>;
  /** Events by category */
  byCategory: Record<AuditCategory, number>;
  /** Success/failure counts */
  outcomes: {
    success: number;
    failure: number;
  };
  /** Time range of logged events */
  timeRange?: {
    first: Date;
    last: Date;
  };
}

/**
 * Severity level ordering for comparisons
 */
export const SEVERITY_LEVELS: Record<AuditSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};
