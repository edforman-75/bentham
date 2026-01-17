/**
 * Audit Logger Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AuditLogger,
  MemoryTransport,
  ConsoleTransport,
  createAuditLogger,
  createTestAuditLogger,
} from '../../logger.js';
import type { AuditEventInput, AuditEvent } from '../../types.js';

describe('AuditLogger', () => {
  let logger: AuditLogger;
  let transport: MemoryTransport;

  beforeEach(() => {
    logger = new AuditLogger();
    transport = new MemoryTransport();
    logger.addTransport(transport);
  });

  afterEach(async () => {
    await logger.close();
  });

  describe('constructor', () => {
    it('should create logger with default config', () => {
      const newLogger = new AuditLogger();
      const stats = newLogger.getStats();
      expect(stats.totalEvents).toBe(0);
    });

    it('should create logger with custom config', () => {
      const newLogger = new AuditLogger({
        defaultTenantId: 'tenant-1',
        minSeverity: 'warning',
      });
      expect(newLogger).toBeInstanceOf(AuditLogger);
    });
  });

  describe('addTransport/removeTransport', () => {
    it('should add a transport', async () => {
      const newLogger = new AuditLogger();
      const newTransport = new MemoryTransport();
      newLogger.addTransport(newTransport);

      await newLogger.log({
        category: 'authentication',
        action: 'login',
        description: 'User logged in',
        actor: { type: 'user', id: 'user-1' },
        outcome: { success: true },
      });

      expect(newTransport.getEvents()).toHaveLength(1);
    });

    it('should remove a transport by name', () => {
      const removed = logger.removeTransport('memory');
      expect(removed).toBe(true);

      const removedAgain = logger.removeTransport('memory');
      expect(removedAgain).toBe(false);
    });
  });

  describe('log', () => {
    it('should log an event with all fields', async () => {
      const input: AuditEventInput = {
        severity: 'info',
        category: 'authentication',
        action: 'login',
        description: 'User logged in successfully',
        actor: {
          type: 'user',
          id: 'user-123',
          name: 'John Doe',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
        resource: {
          type: 'session',
          id: 'session-456',
        },
        outcome: {
          success: true,
          resultCode: 'AUTH_SUCCESS',
        },
        tenantId: 'tenant-1',
        studyId: 'study-1',
        correlationId: 'req-789',
        metadata: { browser: 'Chrome' },
      };

      const event = await logger.log(input);

      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.severity).toBe('info');
      expect(event.category).toBe('authentication');
      expect(event.action).toBe('login');
      expect(event.actor.id).toBe('user-123');
      expect(event.outcome.success).toBe(true);
      expect(event.tenantId).toBe('tenant-1');
      expect(event.studyId).toBe('study-1');
      expect(event.correlationId).toBe('req-789');
      expect(event.metadata).toEqual({ browser: 'Chrome' });
    });

    it('should default severity to info', async () => {
      const event = await logger.log({
        category: 'authentication',
        action: 'login',
        description: 'User logged in',
        actor: { type: 'user', id: 'user-1' },
        outcome: { success: true },
      });

      expect(event.severity).toBe('info');
    });

    it('should use default tenant ID if not provided', async () => {
      const loggerWithDefault = new AuditLogger({ defaultTenantId: 'default-tenant' });
      const newTransport = new MemoryTransport();
      loggerWithDefault.addTransport(newTransport);

      const event = await loggerWithDefault.log({
        category: 'authentication',
        action: 'login',
        description: 'User logged in',
        actor: { type: 'user', id: 'user-1' },
        outcome: { success: true },
      });

      expect(event.tenantId).toBe('default-tenant');
    });

    it('should respect minimum severity', async () => {
      const loggerWithMinSeverity = new AuditLogger({ minSeverity: 'warning' });
      const newTransport = new MemoryTransport();
      loggerWithMinSeverity.addTransport(newTransport);

      // Info should not be logged
      await loggerWithMinSeverity.log({
        severity: 'info',
        category: 'system',
        action: 'heartbeat',
        description: 'System heartbeat',
        actor: { type: 'system', id: 'system' },
        outcome: { success: true },
      });

      // Warning should be logged
      await loggerWithMinSeverity.log({
        severity: 'warning',
        category: 'security',
        action: 'suspicious_activity',
        description: 'Suspicious activity detected',
        actor: { type: 'system', id: 'system' },
        outcome: { success: true },
      });

      expect(newTransport.getEvents()).toHaveLength(1);
      expect(newTransport.getEvents()[0].severity).toBe('warning');
    });
  });

  describe('convenience methods', () => {
    it('should log info events', async () => {
      const event = await logger.info(
        'authentication',
        'login',
        'User logged in',
        {
          actor: { type: 'user', id: 'user-1' },
          outcome: { success: true },
        }
      );

      expect(event.severity).toBe('info');
    });

    it('should log warning events', async () => {
      const event = await logger.warning(
        'security',
        'rate_limit',
        'Rate limit exceeded',
        {
          actor: { type: 'user', id: 'user-1' },
          outcome: { success: false },
        }
      );

      expect(event.severity).toBe('warning');
    });

    it('should log error events', async () => {
      const event = await logger.error(
        'system',
        'database_error',
        'Database connection failed',
        {
          actor: { type: 'system', id: 'db-service' },
          outcome: { success: false, errorMessage: 'Connection timeout' },
        }
      );

      expect(event.severity).toBe('error');
    });

    it('should log critical events', async () => {
      const event = await logger.critical(
        'security',
        'breach_detected',
        'Security breach detected',
        {
          actor: { type: 'system', id: 'security-monitor' },
          outcome: { success: false },
        }
      );

      expect(event.severity).toBe('critical');
    });
  });

  describe('buffering', () => {
    it('should buffer events when configured', async () => {
      const bufferedLogger = new AuditLogger({ bufferSize: 3 });
      const bufferedTransport = new MemoryTransport();
      bufferedLogger.addTransport(bufferedTransport);

      // Log 2 events (below buffer size)
      await bufferedLogger.log({
        category: 'system',
        action: 'event1',
        description: 'Event 1',
        actor: { type: 'system', id: 'system' },
        outcome: { success: true },
      });

      await bufferedLogger.log({
        category: 'system',
        action: 'event2',
        description: 'Event 2',
        actor: { type: 'system', id: 'system' },
        outcome: { success: true },
      });

      // Events should not be written yet
      expect(bufferedTransport.getEvents()).toHaveLength(0);

      // Log a third event (triggers flush)
      await bufferedLogger.log({
        category: 'system',
        action: 'event3',
        description: 'Event 3',
        actor: { type: 'system', id: 'system' },
        outcome: { success: true },
      });

      // All events should be written
      expect(bufferedTransport.getEvents()).toHaveLength(3);

      await bufferedLogger.close();
    });
  });

  describe('flush', () => {
    it('should flush buffered events', async () => {
      const bufferedLogger = new AuditLogger({ bufferSize: 10 });
      const bufferedTransport = new MemoryTransport();
      bufferedLogger.addTransport(bufferedTransport);

      await bufferedLogger.log({
        category: 'system',
        action: 'event1',
        description: 'Event 1',
        actor: { type: 'system', id: 'system' },
        outcome: { success: true },
      });

      expect(bufferedTransport.getEvents()).toHaveLength(0);

      await bufferedLogger.flush();

      expect(bufferedTransport.getEvents()).toHaveLength(1);

      await bufferedLogger.close();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Add some test events
      await logger.log({
        category: 'authentication',
        action: 'login',
        description: 'Login 1',
        actor: { type: 'user', id: 'user-1' },
        outcome: { success: true },
        tenantId: 'tenant-1',
        studyId: 'study-1',
      });

      await logger.log({
        severity: 'warning',
        category: 'security',
        action: 'failed_login',
        description: 'Failed login',
        actor: { type: 'user', id: 'user-2' },
        outcome: { success: false },
        tenantId: 'tenant-1',
      });

      await logger.log({
        category: 'data_access',
        action: 'read',
        description: 'Data read',
        actor: { type: 'user', id: 'user-1' },
        outcome: { success: true },
        tenantId: 'tenant-2',
        resource: { type: 'study', id: 'study-2' },
      });
    });

    it('should query all events', () => {
      const result = logger.query();
      expect(result.events).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by tenant ID', () => {
      const result = logger.query({ tenantId: 'tenant-1' });
      expect(result.events).toHaveLength(2);
    });

    it('should filter by study ID', () => {
      const result = logger.query({ studyId: 'study-1' });
      expect(result.events).toHaveLength(1);
    });

    it('should filter by actor ID', () => {
      const result = logger.query({ actorId: 'user-1' });
      expect(result.events).toHaveLength(2);
    });

    it('should filter by category', () => {
      const result = logger.query({ category: 'authentication' });
      expect(result.events).toHaveLength(1);
    });

    it('should filter by minimum severity', () => {
      const result = logger.query({ minSeverity: 'warning' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].severity).toBe('warning');
    });

    it('should filter by action', () => {
      const result = logger.query({ action: 'failed_login' });
      expect(result.events).toHaveLength(1);
    });

    it('should filter by resource type', () => {
      const result = logger.query({ resourceType: 'study' });
      expect(result.events).toHaveLength(1);
    });

    it('should filter by success', () => {
      const result = logger.query({ success: false });
      expect(result.events).toHaveLength(1);
    });

    it('should paginate results', () => {
      const result = logger.query({ limit: 2, offset: 0 });
      expect(result.events).toHaveLength(2);
      expect(result.hasMore).toBe(true);

      const result2 = logger.query({ limit: 2, offset: 2 });
      expect(result2.events).toHaveLength(1);
      expect(result2.hasMore).toBe(false);
    });

    it('should sort by timestamp', () => {
      const ascResult = logger.query({ sortOrder: 'asc' });
      const descResult = logger.query({ sortOrder: 'desc' });

      expect(ascResult.events[0].timestamp.getTime())
        .toBeLessThanOrEqual(ascResult.events[2].timestamp.getTime());

      expect(descResult.events[0].timestamp.getTime())
        .toBeGreaterThanOrEqual(descResult.events[2].timestamp.getTime());
    });

    it('should return empty result without memory transport', () => {
      const loggerNoMemory = new AuditLogger();
      loggerNoMemory.addTransport(new ConsoleTransport());

      const result = loggerNoMemory.query();
      expect(result.events).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should track event statistics', async () => {
      await logger.log({
        severity: 'info',
        category: 'authentication',
        action: 'login',
        description: 'Success',
        actor: { type: 'user', id: 'user-1' },
        outcome: { success: true },
      });

      await logger.log({
        severity: 'error',
        category: 'security',
        action: 'breach',
        description: 'Failure',
        actor: { type: 'system', id: 'system' },
        outcome: { success: false },
      });

      const stats = logger.getStats();

      expect(stats.totalEvents).toBe(2);
      expect(stats.bySeverity.info).toBe(1);
      expect(stats.bySeverity.error).toBe(1);
      expect(stats.byCategory.authentication).toBe(1);
      expect(stats.byCategory.security).toBe(1);
      expect(stats.outcomes.success).toBe(1);
      expect(stats.outcomes.failure).toBe(1);
      expect(stats.timeRange).toBeDefined();
    });

    it('should return a copy of stats', () => {
      const stats = logger.getStats();
      stats.totalEvents = 999;

      const freshStats = logger.getStats();
      expect(freshStats.totalEvents).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics', async () => {
      await logger.log({
        category: 'authentication',
        action: 'login',
        description: 'Login',
        actor: { type: 'user', id: 'user-1' },
        outcome: { success: true },
      });

      expect(logger.getStats().totalEvents).toBe(1);

      logger.resetStats();

      expect(logger.getStats().totalEvents).toBe(0);
    });
  });
});

describe('MemoryTransport', () => {
  let transport: MemoryTransport;

  beforeEach(() => {
    transport = new MemoryTransport();
  });

  it('should store events', async () => {
    const event: AuditEvent = {
      id: 'event-1',
      timestamp: new Date(),
      severity: 'info',
      category: 'system',
      action: 'test',
      description: 'Test event',
      actor: { type: 'system', id: 'system' },
      outcome: { success: true },
    };

    await transport.write(event);

    const events = transport.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('event-1');
  });

  it('should return a copy of events', async () => {
    const event: AuditEvent = {
      id: 'event-1',
      timestamp: new Date(),
      severity: 'info',
      category: 'system',
      action: 'test',
      description: 'Test event',
      actor: { type: 'system', id: 'system' },
      outcome: { success: true },
    };

    await transport.write(event);

    const events = transport.getEvents();
    events.push({ ...event, id: 'fake' });

    expect(transport.getEvents()).toHaveLength(1);
  });

  it('should clear events', async () => {
    const event: AuditEvent = {
      id: 'event-1',
      timestamp: new Date(),
      severity: 'info',
      category: 'system',
      action: 'test',
      description: 'Test event',
      actor: { type: 'system', id: 'system' },
      outcome: { success: true },
    };

    await transport.write(event);
    expect(transport.getEvents()).toHaveLength(1);

    transport.clear();
    expect(transport.getEvents()).toHaveLength(0);
  });
});

describe('ConsoleTransport', () => {
  let transport: ConsoleTransport;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleSpy: any;

  beforeEach(() => {
    transport = new ConsoleTransport();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should write to console', async () => {
    const event: AuditEvent = {
      id: 'event-1',
      timestamp: new Date(),
      severity: 'info',
      category: 'authentication',
      action: 'login',
      description: 'User logged in',
      actor: { type: 'user', id: 'user-1' },
      outcome: { success: true },
    };

    await transport.write(event);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logMessage = consoleSpy.mock.calls[0][0];
    expect(logMessage).toContain('[AUDIT]');
    expect(logMessage).toContain('authentication:login');
    expect(logMessage).toContain('SUCCESS');
  });

  it('should format severity colors', async () => {
    const severities: Array<AuditEvent['severity']> = ['info', 'warning', 'error', 'critical'];

    for (const severity of severities) {
      const event: AuditEvent = {
        id: `event-${severity}`,
        timestamp: new Date(),
        severity,
        category: 'system',
        action: 'test',
        description: 'Test',
        actor: { type: 'system', id: 'system' },
        outcome: { success: true },
      };

      await transport.write(event);
    }

    expect(consoleSpy).toHaveBeenCalledTimes(4);
  });
});

describe('createAuditLogger', () => {
  it('should create a new logger instance', () => {
    const logger = createAuditLogger();
    expect(logger).toBeInstanceOf(AuditLogger);
  });

  it('should accept config', () => {
    const logger = createAuditLogger({ minSeverity: 'error' });
    expect(logger).toBeInstanceOf(AuditLogger);
  });
});

describe('createTestAuditLogger', () => {
  it('should create logger with memory transport', async () => {
    const { logger, transport } = createTestAuditLogger();

    await logger.log({
      category: 'authentication',
      action: 'login',
      description: 'Test',
      actor: { type: 'user', id: 'user-1' },
      outcome: { success: true },
    });

    expect(transport.getEvents()).toHaveLength(1);

    await logger.close();
  });
});
