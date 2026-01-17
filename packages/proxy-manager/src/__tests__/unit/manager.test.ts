/**
 * Proxy Manager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProxyManager, createProxyManager } from '../../manager.js';
import type { ProxyConfig, ProxyPoolConfig } from '../../types.js';

describe('ProxyManager', () => {
  let manager: ProxyManager;

  const createTestProxy = (overrides: Partial<ProxyConfig> = {}): ProxyConfig => ({
    id: `proxy-${Math.random().toString(36).slice(2)}`,
    name: 'Test Proxy',
    type: 'residential',
    protocol: 'http',
    host: 'proxy.example.com',
    port: 8080,
    locations: ['us-nyc', 'us-la'],
    costPerGb: 15.00,
    enabled: true,
    ...overrides,
  });

  beforeEach(() => {
    manager = new ProxyManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      const stats = manager.getStats();
      expect(stats.totalProxies).toBe(0);
    });

    it('should create manager with custom config', () => {
      const customManager = new ProxyManager({
        healthCheckInterval: 30000,
        unhealthyThreshold: 5,
      });
      expect(customManager).toBeInstanceOf(ProxyManager);
    });
  });

  describe('proxy management', () => {
    it('should add a proxy', () => {
      const proxy = createTestProxy({ id: 'proxy-1' });
      manager.addProxy(proxy);

      const retrieved = manager.getProxy('proxy-1');
      expect(retrieved).toEqual(proxy);
    });

    it('should initialize health and usage records when adding proxy', () => {
      const proxy = createTestProxy({ id: 'proxy-1' });
      manager.addProxy(proxy);

      const health = manager.getHealth('proxy-1');
      expect(health).toBeDefined();
      expect(health!.status).toBe('unknown');

      const usage = manager.getUsage('proxy-1');
      expect(usage).toBeDefined();
      expect(usage!.requestCount).toBe(0);
    });

    it('should remove a proxy', () => {
      const proxy = createTestProxy({ id: 'proxy-1' });
      manager.addProxy(proxy);

      const removed = manager.removeProxy('proxy-1');
      expect(removed).toBe(true);
      expect(manager.getProxy('proxy-1')).toBeUndefined();
    });

    it('should return false when removing non-existent proxy', () => {
      const removed = manager.removeProxy('non-existent');
      expect(removed).toBe(false);
    });

    it('should get all proxies', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1' }));
      manager.addProxy(createTestProxy({ id: 'proxy-2' }));

      const proxies = manager.getAllProxies();
      expect(proxies).toHaveLength(2);
    });

    it('should update a proxy', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1', name: 'Original' }));

      const updated = manager.updateProxy('proxy-1', { name: 'Updated' });
      expect(updated).toBe(true);

      const proxy = manager.getProxy('proxy-1');
      expect(proxy!.name).toBe('Updated');
    });

    it('should return false when updating non-existent proxy', () => {
      const updated = manager.updateProxy('non-existent', { name: 'Test' });
      expect(updated).toBe(false);
    });

    it('should enable a proxy', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1', enabled: false }));

      manager.enableProxy('proxy-1');

      const proxy = manager.getProxy('proxy-1');
      expect(proxy!.enabled).toBe(true);
    });

    it('should disable a proxy', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1', enabled: true }));

      manager.disableProxy('proxy-1');

      const proxy = manager.getProxy('proxy-1');
      expect(proxy!.enabled).toBe(false);
    });
  });

  describe('pool management', () => {
    it('should create a pool', () => {
      const pool: ProxyPoolConfig = {
        id: 'pool-1',
        name: 'Test Pool',
        proxyIds: [],
        rotationStrategy: 'round-robin',
        locations: ['us-nyc'],
      };

      manager.createPool(pool);

      const retrieved = manager.getPool('pool-1');
      expect(retrieved).toEqual(pool);
    });

    it('should remove a pool', () => {
      manager.createPool({
        id: 'pool-1',
        name: 'Test Pool',
        proxyIds: [],
        rotationStrategy: 'round-robin',
        locations: [],
      });

      const removed = manager.removePool('pool-1');
      expect(removed).toBe(true);
      expect(manager.getPool('pool-1')).toBeUndefined();
    });

    it('should add proxy to pool', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1' }));
      manager.createPool({
        id: 'pool-1',
        name: 'Test Pool',
        proxyIds: [],
        rotationStrategy: 'round-robin',
        locations: [],
      });

      const added = manager.addToPool('pool-1', 'proxy-1');
      expect(added).toBe(true);

      const pool = manager.getPool('pool-1');
      expect(pool!.proxyIds).toContain('proxy-1');
    });

    it('should not add duplicate proxy to pool', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1' }));
      manager.createPool({
        id: 'pool-1',
        name: 'Test Pool',
        proxyIds: ['proxy-1'],
        rotationStrategy: 'round-robin',
        locations: [],
      });

      manager.addToPool('pool-1', 'proxy-1');

      const pool = manager.getPool('pool-1');
      expect(pool!.proxyIds.filter(id => id === 'proxy-1')).toHaveLength(1);
    });

    it('should remove proxy from pool', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1' }));
      manager.createPool({
        id: 'pool-1',
        name: 'Test Pool',
        proxyIds: ['proxy-1'],
        rotationStrategy: 'round-robin',
        locations: [],
      });

      const removed = manager.removeFromPool('pool-1', 'proxy-1');
      expect(removed).toBe(true);

      const pool = manager.getPool('pool-1');
      expect(pool!.proxyIds).not.toContain('proxy-1');
    });

    it('should remove proxy from pools when proxy is deleted', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1' }));
      manager.createPool({
        id: 'pool-1',
        name: 'Test Pool',
        proxyIds: ['proxy-1'],
        rotationStrategy: 'round-robin',
        locations: [],
      });

      manager.removeProxy('proxy-1');

      const pool = manager.getPool('pool-1');
      expect(pool!.proxyIds).not.toContain('proxy-1');
    });
  });

  describe('proxy selection', () => {
    beforeEach(() => {
      manager.addProxy(createTestProxy({ id: 'proxy-1', locations: ['us-nyc'] }));
      manager.addProxy(createTestProxy({ id: 'proxy-2', locations: ['us-la'] }));
      manager.addProxy(createTestProxy({ id: 'proxy-3', locations: ['us-nyc', 'us-la'] }));
    });

    it('should get any available proxy without options', () => {
      const proxy = manager.getProxyForRequest();
      expect(proxy).toBeDefined();
    });

    it('should filter by location', () => {
      const proxy = manager.getProxyForRequest({ location: 'us-la' });
      expect(proxy).toBeDefined();
      expect(proxy!.locations).toContain('us-la');
    });

    it('should return undefined when no proxy matches', () => {
      // Use a valid but non-matching location
      const proxy = manager.getProxyForRequest({ location: 'uk-lon' });
      expect(proxy).toBeUndefined();
    });

    it('should filter by proxy type', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-dc', type: 'datacenter' }));

      const proxy = manager.getProxyForRequest({ type: 'datacenter' });
      expect(proxy).toBeDefined();
      expect(proxy!.type).toBe('datacenter');
    });

    it('should exclude specified proxies', () => {
      const proxy = manager.getProxyForRequest({ exclude: ['proxy-1', 'proxy-2'] });
      expect(proxy).toBeDefined();
      expect(proxy!.id).toBe('proxy-3');
    });

    it('should not return disabled proxies', () => {
      manager.disableProxy('proxy-1');
      manager.disableProxy('proxy-2');
      manager.disableProxy('proxy-3');

      const proxy = manager.getProxyForRequest();
      expect(proxy).toBeUndefined();
    });

    it('should use round-robin selection', () => {
      const results = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const proxy = manager.getProxyForRequest();
        if (proxy) results.add(proxy.id);
      }

      // Should have used all 3 proxies
      expect(results.size).toBe(3);
    });

    it('should select from pool when specified', () => {
      manager.createPool({
        id: 'pool-1',
        name: 'NYC Pool',
        proxyIds: ['proxy-1'],
        rotationStrategy: 'round-robin',
        locations: ['us-nyc'],
      });

      const proxy = manager.getProxyForRequest({ poolId: 'pool-1' });
      expect(proxy).toBeDefined();
      expect(proxy!.id).toBe('proxy-1');
    });

    it('should use random selection', () => {
      manager.createPool({
        id: 'pool-1',
        name: 'Test Pool',
        proxyIds: ['proxy-1', 'proxy-2', 'proxy-3'],
        rotationStrategy: 'random',
        locations: [],
      });

      const proxy = manager.getProxyForRequest({ poolId: 'pool-1' });
      expect(proxy).toBeDefined();
    });

    it('should use least-used selection', () => {
      manager.createPool({
        id: 'pool-1',
        name: 'Test Pool',
        proxyIds: ['proxy-1', 'proxy-2'],
        rotationStrategy: 'least-used',
        locations: [],
      });

      // Use proxy-1 multiple times
      for (let i = 0; i < 5; i++) {
        manager.recordSuccess('proxy-1');
      }

      const proxy = manager.getProxyForRequest({ poolId: 'pool-1' });
      expect(proxy!.id).toBe('proxy-2'); // proxy-2 has less usage
    });
  });

  describe('sticky sessions', () => {
    beforeEach(() => {
      manager.addProxy(createTestProxy({ id: 'proxy-1' }));
      manager.addProxy(createTestProxy({ id: 'proxy-2' }));
    });

    it('should create a session', () => {
      const session = manager.createSession('proxy-1', 'example.com');

      expect(session.id).toBeDefined();
      expect(session.proxyId).toBe('proxy-1');
      expect(session.target).toBe('example.com');
      expect(session.requestCount).toBe(0);
    });

    it('should get a session by ID', () => {
      const created = manager.createSession('proxy-1', 'example.com');
      const retrieved = manager.getSession(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should end a session', () => {
      const session = manager.createSession('proxy-1', 'example.com');
      const ended = manager.endSession(session.id);

      expect(ended).toBe(true);
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    it('should use session when making request', () => {
      const session = manager.createSession('proxy-1', 'example.com');

      const proxy = manager.getProxyForRequest({ sessionId: session.id });
      expect(proxy!.id).toBe('proxy-1');

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession!.requestCount).toBe(1);
    });

    it('should clean up expired sessions', async () => {
      // Create session with very short duration
      const session = manager.createSession('proxy-1', 'example.com', 0);

      // Wait a tiny bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const cleaned = manager.cleanupExpiredSessions();
      expect(cleaned).toBe(1);
      expect(manager.getSession(session.id)).toBeUndefined();
    });
  });

  describe('health tracking', () => {
    beforeEach(() => {
      manager.addProxy(createTestProxy({ id: 'proxy-1' }));
    });

    it('should record successful request', () => {
      manager.recordSuccess('proxy-1', 1000);

      const health = manager.getHealth('proxy-1');
      expect(health!.totalRequests).toBe(1);
      expect(health!.successRate).toBe(1);
      expect(health!.lastSuccess).toBeDefined();
    });

    it('should record failed request', () => {
      manager.recordFailure('proxy-1', 'Connection timeout');

      const health = manager.getHealth('proxy-1');
      expect(health!.totalRequests).toBe(1);
      expect(health!.failedRequests).toBe(1);
      expect(health!.successRate).toBe(0);
      expect(health!.lastError).toBe('Connection timeout');
    });

    it('should update success rate correctly', () => {
      manager.recordSuccess('proxy-1');
      manager.recordSuccess('proxy-1');
      manager.recordFailure('proxy-1');
      manager.recordSuccess('proxy-1');

      const health = manager.getHealth('proxy-1');
      expect(health!.totalRequests).toBe(4);
      expect(health!.successRate).toBe(0.75);
    });

    it('should mark proxy as healthy after successes', () => {
      const health = manager.getHealth('proxy-1');
      health!.status = 'degraded';

      manager.recordSuccess('proxy-1');
      manager.recordSuccess('proxy-1');

      expect(manager.getHealth('proxy-1')!.status).toBe('healthy');
    });

    it('should check if proxy is healthy', () => {
      expect(manager.isHealthy('proxy-1')).toBe(true);

      const health = manager.getHealth('proxy-1');
      health!.status = 'unhealthy';

      expect(manager.isHealthy('proxy-1')).toBe(false);
    });

    it('should get all health records', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-2' }));

      const healthRecords = manager.getAllHealth();
      expect(healthRecords).toHaveLength(2);
    });
  });

  describe('usage tracking', () => {
    beforeEach(() => {
      manager.addProxy(createTestProxy({ id: 'proxy-1', costPerGb: 10.00 }));
    });

    it('should track bytes transferred', () => {
      manager.recordSuccess('proxy-1', 1024 * 1024); // 1 MB

      const usage = manager.getUsage('proxy-1');
      expect(usage!.bytesTransferred).toBe(1024 * 1024);
    });

    it('should calculate estimated cost', () => {
      manager.recordSuccess('proxy-1', 1024 * 1024 * 1024); // 1 GB

      const usage = manager.getUsage('proxy-1');
      expect(usage!.estimatedCost).toBeCloseTo(10.00, 2);
    });

    it('should get all usage records', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-2' }));

      const usageRecords = manager.getAllUsage();
      expect(usageRecords).toHaveLength(2);
    });

    it('should reset usage records', () => {
      manager.recordSuccess('proxy-1', 1000);
      expect(manager.getUsage('proxy-1')!.requestCount).toBe(1);

      manager.resetUsage();
      expect(manager.getUsage('proxy-1')!.requestCount).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should return correct statistics', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1', type: 'residential', enabled: true }));
      manager.addProxy(createTestProxy({ id: 'proxy-2', type: 'datacenter', enabled: false }));
      manager.createPool({
        id: 'pool-1',
        name: 'Test',
        proxyIds: [],
        rotationStrategy: 'round-robin',
        locations: [],
      });

      // Record some activity
      manager.recordSuccess('proxy-1', 100);
      manager.recordSuccess('proxy-1', 200);

      const stats = manager.getStats();
      expect(stats.totalProxies).toBe(2);
      expect(stats.enabledProxies).toBe(1);
      expect(stats.totalPools).toBe(1);
      expect(stats.totalRequests).toBe(2);
      expect(stats.totalBytes).toBe(300);
      expect(stats.byType.residential).toBe(1);
      expect(stats.byType.datacenter).toBe(1);
    });
  });

  describe('buildProxyUrl', () => {
    it('should build URL without auth', () => {
      const proxy = createTestProxy({
        protocol: 'http',
        host: 'proxy.example.com',
        port: 8080,
      });

      const url = manager.buildProxyUrl(proxy);
      expect(url).toBe('http://proxy.example.com:8080');
    });

    it('should build URL with auth', () => {
      const proxy = createTestProxy({
        protocol: 'http',
        host: 'proxy.example.com',
        port: 8080,
        username: 'user',
        password: 'pass',
      });

      const url = manager.buildProxyUrl(proxy);
      expect(url).toBe('http://user:pass@proxy.example.com:8080');
    });

    it('should handle socks5 protocol', () => {
      const proxy = createTestProxy({
        protocol: 'socks5',
        host: 'proxy.example.com',
        port: 1080,
      });

      const url = manager.buildProxyUrl(proxy);
      expect(url).toBe('socks5://proxy.example.com:1080');
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      manager.addProxy(createTestProxy({ id: 'proxy-1' }));
      manager.createPool({
        id: 'pool-1',
        name: 'Test',
        proxyIds: [],
        rotationStrategy: 'round-robin',
        locations: [],
      });
      manager.createSession('proxy-1', 'example.com');

      manager.clear();

      expect(manager.getAllProxies()).toHaveLength(0);
      expect(manager.getPool('pool-1')).toBeUndefined();
      expect(manager.getStats().activeSessions).toBe(0);
    });
  });
});

describe('createProxyManager', () => {
  it('should create a new manager instance', () => {
    const manager = createProxyManager();
    expect(manager).toBeInstanceOf(ProxyManager);
  });

  it('should accept config', () => {
    const manager = createProxyManager({ healthCheckInterval: 30000 });
    expect(manager).toBeInstanceOf(ProxyManager);
  });
});
