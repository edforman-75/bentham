/**
 * Audit Logger Implementation
 *
 * Provides secure audit logging for compliance and security tracking.
 */

import { randomUUID } from 'crypto';
import type {
  AuditEvent,
  AuditEventInput,
  AuditQueryOptions,
  AuditQueryResult,
  AuditTransport,
  AuditLoggerConfig,
  AuditStats,
  AuditSeverity,
  AuditCategory,
} from './types.js';
import { SEVERITY_LEVELS } from './types.js';

/**
 * In-memory transport for development/testing
 */
export class MemoryTransport implements AuditTransport {
  readonly name = 'memory';
  private events: AuditEvent[] = [];

  async write(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async flush(): Promise<void> {
    // No-op for memory transport
  }

  async close(): Promise<void> {
    // No-op for memory transport
  }

  getEvents(): AuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

/**
 * Console transport for development
 */
export class ConsoleTransport implements AuditTransport {
  readonly name = 'console';

  async write(event: AuditEvent): Promise<void> {
    const prefix = this.getSeverityPrefix(event.severity);
    console.log(
      `${prefix} [AUDIT] ${event.timestamp.toISOString()} | ${event.category}:${event.action} | ` +
      `${event.actor.type}:${event.actor.id} | ${event.outcome.success ? 'SUCCESS' : 'FAILURE'} | ` +
      `${event.description}`
    );
  }

  async flush(): Promise<void> {
    // No-op for console transport
  }

  async close(): Promise<void> {
    // No-op for console transport
  }

  private getSeverityPrefix(severity: AuditSeverity): string {
    switch (severity) {
      case 'critical': return '\x1b[31m[CRITICAL]\x1b[0m';
      case 'error': return '\x1b[31m[ERROR]\x1b[0m';
      case 'warning': return '\x1b[33m[WARNING]\x1b[0m';
      case 'info': return '\x1b[34m[INFO]\x1b[0m';
    }
  }
}

/**
 * Audit Logger class
 */
export class AuditLogger {
  private transports: AuditTransport[] = [];
  private config: Required<AuditLoggerConfig>;
  private buffer: AuditEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private stats: AuditStats;

  constructor(config: AuditLoggerConfig = {}) {
    this.config = {
      defaultTenantId: config.defaultTenantId ?? '',
      minSeverity: config.minSeverity ?? 'info',
      includeMetadata: config.includeMetadata ?? true,
      bufferSize: config.bufferSize ?? 1,
      flushInterval: config.flushInterval ?? 5000,
    };

    this.stats = this.initializeStats();

    // Start flush timer if buffering is enabled
    if (this.config.bufferSize > 1 && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(console.error);
      }, this.config.flushInterval);
    }
  }

  /**
   * Add a transport to the logger
   */
  addTransport(transport: AuditTransport): void {
    this.transports.push(transport);
  }

  /**
   * Remove a transport by name
   */
  removeTransport(name: string): boolean {
    const index = this.transports.findIndex(t => t.name === name);
    if (index >= 0) {
      this.transports.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Log an audit event
   */
  async log(input: AuditEventInput): Promise<AuditEvent> {
    const severity = input.severity ?? 'info';

    // Check minimum severity
    if (SEVERITY_LEVELS[severity] < SEVERITY_LEVELS[this.config.minSeverity]) {
      // Create the event but don't log it
      return this.createEvent(input);
    }

    const event = this.createEvent(input);

    // Update stats
    this.updateStats(event);

    // Buffer or write immediately
    if (this.config.bufferSize > 1) {
      this.buffer.push(event);
      if (this.buffer.length >= this.config.bufferSize) {
        await this.flush();
      }
    } else {
      await this.writeToTransports(event);
    }

    return event;
  }

  /**
   * Log an info-level event
   */
  async info(
    category: AuditCategory,
    action: string,
    description: string,
    options: Partial<Omit<AuditEventInput, 'category' | 'action' | 'description' | 'severity'>> & {
      actor: AuditEventInput['actor'];
      outcome: AuditEventInput['outcome'];
    }
  ): Promise<AuditEvent> {
    return this.log({
      severity: 'info',
      category,
      action,
      description,
      ...options,
    });
  }

  /**
   * Log a warning-level event
   */
  async warning(
    category: AuditCategory,
    action: string,
    description: string,
    options: Partial<Omit<AuditEventInput, 'category' | 'action' | 'description' | 'severity'>> & {
      actor: AuditEventInput['actor'];
      outcome: AuditEventInput['outcome'];
    }
  ): Promise<AuditEvent> {
    return this.log({
      severity: 'warning',
      category,
      action,
      description,
      ...options,
    });
  }

  /**
   * Log an error-level event
   */
  async error(
    category: AuditCategory,
    action: string,
    description: string,
    options: Partial<Omit<AuditEventInput, 'category' | 'action' | 'description' | 'severity'>> & {
      actor: AuditEventInput['actor'];
      outcome: AuditEventInput['outcome'];
    }
  ): Promise<AuditEvent> {
    return this.log({
      severity: 'error',
      category,
      action,
      description,
      ...options,
    });
  }

  /**
   * Log a critical-level event
   */
  async critical(
    category: AuditCategory,
    action: string,
    description: string,
    options: Partial<Omit<AuditEventInput, 'category' | 'action' | 'description' | 'severity'>> & {
      actor: AuditEventInput['actor'];
      outcome: AuditEventInput['outcome'];
    }
  ): Promise<AuditEvent> {
    return this.log({
      severity: 'critical',
      category,
      action,
      description,
      ...options,
    });
  }

  /**
   * Flush buffered events to transports
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const eventsToWrite = [...this.buffer];
    this.buffer = [];

    for (const event of eventsToWrite) {
      await this.writeToTransports(event);
    }

    for (const transport of this.transports) {
      await transport.flush();
    }
  }

  /**
   * Close the logger and all transports
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();

    for (const transport of this.transports) {
      await transport.close();
    }
  }

  /**
   * Query events from memory transport (if available)
   */
  query(options: AuditQueryOptions = {}): AuditQueryResult {
    const memoryTransport = this.transports.find(
      t => t instanceof MemoryTransport
    ) as MemoryTransport | undefined;

    if (!memoryTransport) {
      return {
        events: [],
        total: 0,
        offset: options.offset ?? 0,
        limit: options.limit ?? 100,
        hasMore: false,
      };
    }

    let events = memoryTransport.getEvents();

    // Apply filters
    if (options.tenantId) {
      events = events.filter(e => e.tenantId === options.tenantId);
    }

    if (options.studyId) {
      events = events.filter(e => e.studyId === options.studyId);
    }

    if (options.actorId) {
      events = events.filter(e => e.actor.id === options.actorId);
    }

    if (options.category) {
      events = events.filter(e => e.category === options.category);
    }

    if (options.minSeverity) {
      const minLevel = SEVERITY_LEVELS[options.minSeverity];
      events = events.filter(e => SEVERITY_LEVELS[e.severity] >= minLevel);
    }

    if (options.action) {
      events = events.filter(e => e.action === options.action);
    }

    if (options.resourceType) {
      events = events.filter(e => e.resource?.type === options.resourceType);
    }

    if (options.timeRange) {
      events = events.filter(e =>
        e.timestamp >= options.timeRange!.start &&
        e.timestamp <= options.timeRange!.end
      );
    }

    if (options.success !== undefined) {
      events = events.filter(e => e.outcome.success === options.success);
    }

    // Sort
    const sortOrder = options.sortOrder ?? 'desc';
    events.sort((a, b) => {
      const diff = a.timestamp.getTime() - b.timestamp.getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });

    const total = events.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;

    // Paginate
    events = events.slice(offset, offset + limit);

    return {
      events,
      total,
      offset,
      limit,
      hasMore: offset + events.length < total,
    };
  }

  /**
   * Get audit statistics
   */
  getStats(): AuditStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }

  // Private helper methods

  private createEvent(input: AuditEventInput): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      timestamp: new Date(),
      severity: input.severity ?? 'info',
      category: input.category,
      action: input.action,
      description: input.description,
      actor: input.actor,
      outcome: input.outcome,
    };

    if (input.resource) {
      event.resource = input.resource;
    }

    if (input.tenantId || this.config.defaultTenantId) {
      event.tenantId = input.tenantId ?? this.config.defaultTenantId;
    }

    if (input.studyId) {
      event.studyId = input.studyId;
    }

    if (input.correlationId) {
      event.correlationId = input.correlationId;
    }

    if (this.config.includeMetadata && input.metadata) {
      event.metadata = input.metadata;
    }

    return event;
  }

  private async writeToTransports(event: AuditEvent): Promise<void> {
    const writePromises = this.transports.map(transport =>
      transport.write(event).catch(err => {
        console.error(`Audit transport ${transport.name} failed:`, err);
      })
    );

    await Promise.all(writePromises);
  }

  private updateStats(event: AuditEvent): void {
    this.stats.totalEvents++;
    this.stats.bySeverity[event.severity]++;
    this.stats.byCategory[event.category]++;

    if (event.outcome.success) {
      this.stats.outcomes.success++;
    } else {
      this.stats.outcomes.failure++;
    }

    if (!this.stats.timeRange) {
      this.stats.timeRange = {
        first: event.timestamp,
        last: event.timestamp,
      };
    } else {
      if (event.timestamp < this.stats.timeRange.first) {
        this.stats.timeRange.first = event.timestamp;
      }
      if (event.timestamp > this.stats.timeRange.last) {
        this.stats.timeRange.last = event.timestamp;
      }
    }
  }

  private initializeStats(): AuditStats {
    return {
      totalEvents: 0,
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      },
      byCategory: {
        authentication: 0,
        authorization: 0,
        data_access: 0,
        data_modification: 0,
        configuration: 0,
        execution: 0,
        billing: 0,
        security: 0,
        system: 0,
      },
      outcomes: {
        success: 0,
        failure: 0,
      },
    };
  }
}

/**
 * Create a new audit logger instance
 */
export function createAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  return new AuditLogger(config);
}

/**
 * Create a pre-configured audit logger with memory transport (for testing)
 */
export function createTestAuditLogger(): { logger: AuditLogger; transport: MemoryTransport } {
  const logger = new AuditLogger();
  const transport = new MemoryTransport();
  logger.addTransport(transport);
  return { logger, transport };
}
