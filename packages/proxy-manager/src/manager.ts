/**
 * Proxy Manager Implementation
 *
 * Manages proxy configurations, rotation, health checking, and sessions.
 */

import { randomUUID } from 'crypto';
import type {
  ProxyConfig,
  ProxyHealth,
  ProxySession,
  ProxyPoolConfig,
  ProxyRequestOptions,
  ProxyUsageRecord,
  ProxyManagerConfig,
  ProxyManagerStats,
  ProxyType,
  RotationStrategy,
} from './types.js';
import { DEFAULT_MANAGER_CONFIG } from './types.js';

/**
 * Proxy Manager class
 */
export class ProxyManager {
  private config: Required<ProxyManagerConfig>;
  private proxies: Map<string, ProxyConfig> = new Map();
  private health: Map<string, ProxyHealth> = new Map();
  private pools: Map<string, ProxyPoolConfig> = new Map();
  private sessions: Map<string, ProxySession> = new Map();
  private usage: Map<string, ProxyUsageRecord> = new Map();
  private roundRobinIndex: Map<string, number> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: ProxyManagerConfig = {}) {
    this.config = {
      ...DEFAULT_MANAGER_CONFIG,
      ...config,
    };
  }

  /**
   * Add a proxy configuration
   */
  addProxy(proxy: ProxyConfig): void {
    this.proxies.set(proxy.id, proxy);

    // Initialize health record
    this.health.set(proxy.id, {
      proxyId: proxy.id,
      status: 'unknown',
      successRate: 1,
      totalRequests: 0,
      failedRequests: 0,
      lastChecked: new Date(),
    });

    // Initialize usage record
    const now = new Date();
    this.usage.set(proxy.id, {
      proxyId: proxy.id,
      requestCount: 0,
      bytesTransferred: 0,
      estimatedCost: 0,
      periodStart: now,
      periodEnd: now,
    });
  }

  /**
   * Remove a proxy
   */
  removeProxy(proxyId: string): boolean {
    if (!this.proxies.has(proxyId)) return false;

    this.proxies.delete(proxyId);
    this.health.delete(proxyId);
    this.usage.delete(proxyId);

    // Remove from all pools
    for (const pool of this.pools.values()) {
      const index = pool.proxyIds.indexOf(proxyId);
      if (index >= 0) {
        pool.proxyIds.splice(index, 1);
      }
    }

    return true;
  }

  /**
   * Get a proxy by ID
   */
  getProxy(proxyId: string): ProxyConfig | undefined {
    return this.proxies.get(proxyId);
  }

  /**
   * Get all proxies
   */
  getAllProxies(): ProxyConfig[] {
    return Array.from(this.proxies.values());
  }

  /**
   * Update a proxy configuration
   */
  updateProxy(proxyId: string, updates: Partial<ProxyConfig>): boolean {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return false;

    this.proxies.set(proxyId, { ...proxy, ...updates, id: proxyId });
    return true;
  }

  /**
   * Enable a proxy
   */
  enableProxy(proxyId: string): boolean {
    return this.updateProxy(proxyId, { enabled: true });
  }

  /**
   * Disable a proxy
   */
  disableProxy(proxyId: string): boolean {
    return this.updateProxy(proxyId, { enabled: false });
  }

  /**
   * Create a proxy pool
   */
  createPool(pool: ProxyPoolConfig): void {
    this.pools.set(pool.id, pool);
    this.roundRobinIndex.set(pool.id, 0);
  }

  /**
   * Get a pool by ID
   */
  getPool(poolId: string): ProxyPoolConfig | undefined {
    return this.pools.get(poolId);
  }

  /**
   * Remove a pool
   */
  removePool(poolId: string): boolean {
    if (!this.pools.has(poolId)) return false;
    this.pools.delete(poolId);
    this.roundRobinIndex.delete(poolId);
    return true;
  }

  /**
   * Add a proxy to a pool
   */
  addToPool(poolId: string, proxyId: string): boolean {
    const pool = this.pools.get(poolId);
    if (!pool || !this.proxies.has(proxyId)) return false;

    if (!pool.proxyIds.includes(proxyId)) {
      pool.proxyIds.push(proxyId);
    }
    return true;
  }

  /**
   * Remove a proxy from a pool
   */
  removeFromPool(poolId: string, proxyId: string): boolean {
    const pool = this.pools.get(poolId);
    if (!pool) return false;

    const index = pool.proxyIds.indexOf(proxyId);
    if (index >= 0) {
      pool.proxyIds.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get a proxy for a request
   */
  getProxyForRequest(options: ProxyRequestOptions = {}): ProxyConfig | undefined {
    // Check for sticky session
    if (options.sessionId) {
      const session = this.sessions.get(options.sessionId);
      if (session && session.expiresAt > new Date()) {
        const proxy = this.proxies.get(session.proxyId);
        if (proxy && proxy.enabled && this.isHealthy(proxy.id)) {
          session.requestCount++;
          return proxy;
        }
      }
    }

    // Get candidates from pool or all proxies
    let candidates: ProxyConfig[];
    let strategy: RotationStrategy = 'round-robin';
    let poolId: string | undefined;

    if (options.poolId) {
      const pool = this.pools.get(options.poolId);
      if (!pool) return undefined;

      candidates = pool.proxyIds
        .map(id => this.proxies.get(id))
        .filter((p): p is ProxyConfig => p !== undefined);
      strategy = pool.rotationStrategy;
      poolId = pool.id;
    } else {
      candidates = Array.from(this.proxies.values());
    }

    // Filter candidates
    candidates = candidates.filter(p => {
      if (!p.enabled) return false;
      if (!this.isHealthy(p.id)) return false;
      if (options.exclude?.includes(p.id)) return false;
      if (options.location && !p.locations.includes(options.location)) return false;
      if (options.type && p.type !== options.type) return false;
      return true;
    });

    if (candidates.length === 0) return undefined;

    // Select based on strategy
    let selected: ProxyConfig;
    switch (strategy) {
      case 'round-robin':
        selected = this.selectRoundRobin(candidates, poolId ?? 'default');
        break;
      case 'random':
        selected = this.selectRandom(candidates);
        break;
      case 'least-used':
        selected = this.selectLeastUsed(candidates);
        break;
      case 'sticky':
        if (options.target) {
          selected = this.selectSticky(candidates, options.target) ?? this.selectRandom(candidates);
        } else {
          selected = this.selectRandom(candidates);
        }
        break;
      default:
        selected = this.selectRoundRobin(candidates, poolId ?? 'default');
    }

    // Create sticky session if requested
    if (options.target && strategy === 'sticky') {
      this.createSession(selected.id, options.target);
    }

    return selected;
  }

  /**
   * Create a sticky session
   */
  createSession(proxyId: string, target: string, durationSeconds?: number): ProxySession {
    const duration = durationSeconds ?? this.config.defaultStickyDuration;
    const now = new Date();

    const session: ProxySession = {
      id: randomUUID(),
      proxyId,
      target,
      createdAt: now,
      expiresAt: new Date(now.getTime() + duration * 1000),
      requestCount: 0,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ProxySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * End a session
   */
  endSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Record a successful request
   */
  recordSuccess(proxyId: string, bytesTransferred: number = 0): void {
    const health = this.health.get(proxyId);
    const usage = this.usage.get(proxyId);
    const proxy = this.proxies.get(proxyId);

    if (health) {
      health.totalRequests++;
      health.successRate = (health.totalRequests - health.failedRequests) / health.totalRequests;
      health.lastSuccess = new Date();
      health.lastChecked = new Date();

      // Update status if recovering
      if (health.status === 'unhealthy' || health.status === 'degraded') {
        const recentSuccesses = this.countRecentSuccesses(proxyId);
        if (recentSuccesses >= this.config.recoveryThreshold) {
          health.status = 'healthy';
        }
      } else {
        health.status = 'healthy';
      }
    }

    if (usage && proxy) {
      usage.requestCount++;
      usage.bytesTransferred += bytesTransferred;
      usage.estimatedCost += (bytesTransferred / (1024 * 1024 * 1024)) * proxy.costPerGb;
      usage.periodEnd = new Date();
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(proxyId: string, error?: string): void {
    const health = this.health.get(proxyId);

    if (health) {
      health.totalRequests++;
      health.failedRequests++;
      health.successRate = (health.totalRequests - health.failedRequests) / health.totalRequests;
      health.lastFailure = new Date();
      health.lastChecked = new Date();
      if (error) health.lastError = error;

      // Update status
      const recentFailures = this.countRecentFailures(proxyId);
      if (recentFailures >= this.config.unhealthyThreshold) {
        health.status = 'unhealthy';
      } else if (health.successRate < 0.9) {
        health.status = 'degraded';
      }
    }
  }

  /**
   * Get health information for a proxy
   */
  getHealth(proxyId: string): ProxyHealth | undefined {
    return this.health.get(proxyId);
  }

  /**
   * Get all health records
   */
  getAllHealth(): ProxyHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Check if a proxy is healthy
   */
  isHealthy(proxyId: string): boolean {
    const health = this.health.get(proxyId);
    if (!health) return false;
    return health.status === 'healthy' || health.status === 'unknown';
  }

  /**
   * Get usage record for a proxy
   */
  getUsage(proxyId: string): ProxyUsageRecord | undefined {
    return this.usage.get(proxyId);
  }

  /**
   * Get all usage records
   */
  getAllUsage(): ProxyUsageRecord[] {
    return Array.from(this.usage.values());
  }

  /**
   * Reset usage records
   */
  resetUsage(): void {
    const now = new Date();
    for (const id of this.usage.keys()) {
      this.usage.set(id, {
        proxyId: id,
        requestCount: 0,
        bytesTransferred: 0,
        estimatedCost: 0,
        periodStart: now,
        periodEnd: now,
      });
    }
  }

  /**
   * Get manager statistics
   */
  getStats(): ProxyManagerStats {
    const proxies = Array.from(this.proxies.values());
    const healthRecords = Array.from(this.health.values());
    const usageRecords = Array.from(this.usage.values());

    const byType: Record<ProxyType, number> = {
      residential: 0,
      datacenter: 0,
      mobile: 0,
      isp: 0,
    };

    const byLocation: Record<string, number> = {};

    for (const proxy of proxies) {
      byType[proxy.type]++;
      for (const loc of proxy.locations) {
        byLocation[loc] = (byLocation[loc] ?? 0) + 1;
      }
    }

    return {
      totalProxies: proxies.length,
      enabledProxies: proxies.filter(p => p.enabled).length,
      healthyProxies: healthRecords.filter(h => h.status === 'healthy').length,
      totalPools: this.pools.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.expiresAt > new Date()).length,
      totalRequests: usageRecords.reduce((sum, u) => sum + u.requestCount, 0),
      totalBytes: usageRecords.reduce((sum, u) => sum + u.bytesTransferred, 0),
      byType,
      byLocation,
    };
  }

  /**
   * Start automatic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop automatic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health checks on all proxies
   */
  async performHealthChecks(): Promise<void> {
    // In a real implementation, this would make actual requests through each proxy
    // For now, we just update the lastChecked timestamp
    const now = new Date();
    for (const health of this.health.values()) {
      health.lastChecked = now;
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.stopHealthChecks();
    this.proxies.clear();
    this.health.clear();
    this.pools.clear();
    this.sessions.clear();
    this.usage.clear();
    this.roundRobinIndex.clear();
  }

  /**
   * Build a proxy URL string
   */
  buildProxyUrl(proxy: ProxyConfig): string {
    const auth = proxy.username && proxy.password
      ? `${proxy.username}:${proxy.password}@`
      : '';
    return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
  }

  // Private helper methods

  private selectRoundRobin(candidates: ProxyConfig[], poolKey: string): ProxyConfig {
    let index = this.roundRobinIndex.get(poolKey) ?? 0;
    index = index % candidates.length;
    this.roundRobinIndex.set(poolKey, index + 1);
    return candidates[index];
  }

  private selectRandom(candidates: ProxyConfig[]): ProxyConfig {
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }

  private selectLeastUsed(candidates: ProxyConfig[]): ProxyConfig {
    let minUsage = Infinity;
    let selected = candidates[0];

    for (const proxy of candidates) {
      const usage = this.usage.get(proxy.id);
      const count = usage?.requestCount ?? 0;
      if (count < minUsage) {
        minUsage = count;
        selected = proxy;
      }
    }

    return selected;
  }

  private selectSticky(candidates: ProxyConfig[], target: string): ProxyConfig | undefined {
    // Find existing session for this target
    for (const session of this.sessions.values()) {
      if (session.target === target && session.expiresAt > new Date()) {
        const proxy = candidates.find(p => p.id === session.proxyId);
        if (proxy) {
          session.requestCount++;
          return proxy;
        }
      }
    }
    return undefined;
  }

  private countRecentSuccesses(_proxyId: string): number {
    // Simplified - in real implementation, would track recent request outcomes
    return 2;
  }

  private countRecentFailures(_proxyId: string): number {
    // Simplified - in real implementation, would track recent request outcomes
    const health = this.health.get(_proxyId);
    if (!health) return 0;
    return health.successRate < 0.7 ? 3 : 0;
  }
}

/**
 * Create a new proxy manager instance
 */
export function createProxyManager(config?: ProxyManagerConfig): ProxyManager {
  return new ProxyManager(config);
}
