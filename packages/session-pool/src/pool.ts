/**
 * Session Pool Implementation
 *
 * Manages browser session pooling, lifecycle, and reuse.
 */

import { randomUUID } from 'crypto';
import type {
  Session,
  SessionConfig,
  SessionRequestOptions,
  SessionCheckout,
  SessionPoolConfig,
  SessionPoolStats,
  SessionLifecycleHooks,
  BrowserEngine,
  SessionExpiryForecast,
  SessionExpiryWarning,
} from './types.js';
import { DEFAULT_POOL_CONFIG, DEFAULT_SESSION_CONFIG } from './types.js';

/**
 * Session Pool class
 */
export class SessionPool {
  private config: Required<SessionPoolConfig>;
  private sessions: Map<string, Session> = new Map();
  private checkouts: Map<string, SessionCheckout> = new Map();
  private hooks: SessionLifecycleHooks = {};
  private stats: {
    totalCheckouts: number;
    totalPages: number;
  };
  private warmupTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;

  constructor(config: SessionPoolConfig = {}) {
    this.config = {
      ...DEFAULT_POOL_CONFIG,
      ...config,
    };

    this.stats = {
      totalCheckouts: 0,
      totalPages: 0,
    };

    if (this.config.autoWarmup) {
      this.startWarmup();
    }

    if (this.config.autoKeepAlive) {
      this.startKeepAlive();
    }
  }

  /**
   * Set lifecycle hooks
   */
  setHooks(hooks: SessionLifecycleHooks): void {
    this.hooks = hooks;
  }

  /**
   * Create a new session
   */
  async createSession(config: Partial<SessionConfig> = {}): Promise<Session> {
    const fullConfig: SessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      ...this.config.defaultConfig,
      ...config,
    };

    const session: Session = {
      id: randomUUID(),
      status: 'warming',
      config: fullConfig,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      pageCount: 0,
    };

    this.sessions.set(session.id, session);

    try {
      // Call onCreate hook (which would normally launch the browser)
      if (this.hooks.onCreate) {
        await this.hooks.onCreate(session);
      }

      session.status = 'idle';
      session.lastActivityAt = new Date();
    } catch (error) {
      session.status = 'error';
      session.error = error instanceof Error ? error.message : 'Unknown error';

      if (this.hooks.onError) {
        await this.hooks.onError(session, error instanceof Error ? error : new Error(String(error)));
      }
    }

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get idle sessions
   */
  getIdleSessions(): Session[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'idle');
  }

  /**
   * Checkout a session for use
   */
  async checkout(options: SessionRequestOptions = {}): Promise<SessionCheckout | undefined> {
    // Find a matching idle session
    let session = this.findIdleSession(options);

    // If no idle session, try to create one (if under max)
    if (!session && this.sessions.size < this.config.maxSessions) {
      session = await this.createSession(options.config);
    }

    if (!session || session.status !== 'idle') {
      return undefined;
    }

    // Mark session as active
    session.status = 'active';
    session.lastActivityAt = new Date();
    session.studyId = options.studyId;
    session.tenantId = options.tenantId;

    const checkout: SessionCheckout = {
      id: randomUUID(),
      session,
      expiresAt: new Date(Date.now() + this.config.checkoutTimeout),
    };

    this.checkouts.set(checkout.id, checkout);
    this.stats.totalCheckouts++;

    // Call onCheckout hook
    if (this.hooks.onCheckout) {
      await this.hooks.onCheckout(session);
    }

    return checkout;
  }

  /**
   * Get a checkout by ID
   */
  getCheckout(checkoutId: string): SessionCheckout | undefined {
    return this.checkouts.get(checkoutId);
  }

  /**
   * Check in (release) a session
   */
  async checkin(checkoutId: string, options: { recycle?: boolean; error?: string } = {}): Promise<boolean> {
    const checkout = this.checkouts.get(checkoutId);
    if (!checkout) return false;

    const session = this.sessions.get(checkout.session.id);
    if (!session) return false;

    // Call onCheckin hook
    if (this.hooks.onCheckin) {
      await this.hooks.onCheckin(session);
    }

    // Handle error
    if (options.error) {
      session.status = 'error';
      session.error = options.error;

      if (this.hooks.onError) {
        await this.hooks.onError(session, new Error(options.error));
      }
    }

    // Check if session should be recycled
    const shouldRecycle = options.recycle ||
      (session.config.maxPages && session.pageCount >= session.config.maxPages) ||
      (Date.now() - session.createdAt.getTime() > this.config.maxLifetime);

    if (shouldRecycle || session.status === 'error') {
      await this.destroySession(session.id);
    } else {
      session.status = 'idle';
      session.lastActivityAt = new Date();
      session.studyId = undefined;
      session.tenantId = undefined;
    }

    this.checkouts.delete(checkoutId);
    return true;
  }

  /**
   * Record a page opened in a session
   */
  recordPage(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pageCount++;
      session.lastActivityAt = new Date();
      this.stats.totalPages++;
    }
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'cooling';

    // Call onDestroy hook
    if (this.hooks.onDestroy) {
      await this.hooks.onDestroy(session);
    }

    session.status = 'destroyed';
    this.sessions.delete(sessionId);

    // Remove any checkouts for this session
    for (const [checkoutId, checkout] of this.checkouts) {
      if (checkout.session.id === sessionId) {
        this.checkouts.delete(checkoutId);
      }
    }

    return true;
  }

  /**
   * Destroy all sessions
   */
  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.destroySession(sessionId);
    }
  }

  /**
   * Warmup sessions to meet minimum
   */
  async warmup(): Promise<number> {
    const idleCount = this.getIdleSessions().length;
    const warmingCount = Array.from(this.sessions.values())
      .filter(s => s.status === 'warming').length;
    const needed = this.config.minIdleSessions - (idleCount + warmingCount);

    if (needed <= 0) return 0;

    const toCreate = Math.min(
      needed,
      this.config.maxSessions - this.sessions.size
    );

    let created = 0;
    for (let i = 0; i < toCreate; i++) {
      await this.createSession();
      created++;
    }

    return created;
  }

  /**
   * Start automatic warmup
   */
  startWarmup(): void {
    if (this.warmupTimer) return;

    // Initial warmup
    this.warmup().catch(console.error);

    // Periodic warmup
    this.warmupTimer = setInterval(() => {
      this.warmup().catch(console.error);
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop automatic warmup
   */
  stopWarmup(): void {
    if (this.warmupTimer) {
      clearInterval(this.warmupTimer);
      this.warmupTimer = null;
    }
  }

  /**
   * Cleanup idle sessions that have exceeded idle timeout
   */
  async cleanupIdle(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const session of this.sessions.values()) {
      if (session.status === 'idle') {
        const idleTime = now - session.lastActivityAt.getTime();
        if (idleTime > this.config.idleTimeout) {
          await this.destroySession(session.id);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Cleanup expired checkouts
   */
  async cleanupExpiredCheckouts(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [checkoutId, checkout] of this.checkouts) {
      if (checkout.expiresAt <= now) {
        await this.checkin(checkoutId, { error: 'Checkout expired' });
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Run health check on all sessions
   */
  async healthCheck(): Promise<void> {
    await this.cleanupIdle();
    await this.cleanupExpiredCheckouts();

    // Destroy sessions past max lifetime
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.status === 'idle') {
        const lifetime = now - session.createdAt.getTime();
        if (lifetime > this.config.maxLifetime) {
          await this.destroySession(session.id);
        }
      }
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => {
      this.healthCheck().catch(console.error);
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Keep idle sessions warm by calling the onKeepAlive hook.
   * This prevents browser sessions from going stale due to inactivity.
   */
  async keepAlive(): Promise<number> {
    if (!this.hooks.onKeepAlive) {
      return 0;
    }

    const idleSessions = this.getIdleSessions();
    let keptAlive = 0;

    for (const session of idleSessions) {
      try {
        await this.hooks.onKeepAlive(session);
        session.lastKeepAliveAt = new Date();
        keptAlive++;
      } catch (error) {
        // Keep-alive failed - session may be stale
        session.status = 'error';
        session.error = error instanceof Error ? error.message : 'Keep-alive failed';

        if (this.hooks.onError) {
          await this.hooks.onError(session, error instanceof Error ? error : new Error(String(error)));
        }
      }
    }

    return keptAlive;
  }

  /**
   * Start automatic keep-alive for idle sessions
   */
  startKeepAlive(): void {
    if (this.keepAliveTimer) return;

    this.keepAliveTimer = setInterval(() => {
      this.keepAlive().catch(console.error);
    }, this.config.keepAliveInterval);
  }

  /**
   * Stop automatic keep-alive
   */
  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): SessionPoolStats {
    const sessions = Array.from(this.sessions.values());

    const byEngine: Record<BrowserEngine, number> = {
      chromium: 0,
      firefox: 0,
      webkit: 0,
    };

    for (const session of sessions) {
      byEngine[session.config.engine]++;
    }

    return {
      totalSessions: sessions.length,
      idleSessions: sessions.filter(s => s.status === 'idle').length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      warmingSessions: sessions.filter(s => s.status === 'warming').length,
      errorSessions: sessions.filter(s => s.status === 'error').length,
      activeCheckouts: Array.from(this.checkouts.values())
        .filter(c => c.expiresAt > new Date()).length,
      totalCheckouts: this.stats.totalCheckouts,
      totalPages: this.stats.totalPages,
      byEngine,
    };
  }

  /**
   * Mark a session as authenticated with expected cookie expiry.
   * This is essential for predicting when sessions will need re-authentication.
   */
  setSessionAuth(
    sessionId: string,
    options: {
      platform: string;
      accountId?: string;
      cookieExpiresAt: Date;
    }
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.authenticatedAt = new Date();
    session.cookieExpiresAt = options.cookieExpiresAt;
    session.platform = options.platform;
    session.accountId = options.accountId;

    return true;
  }

  /**
   * Get forecast of session expirations for capacity planning.
   * Use this to ensure enough accounts/agents are ready before sessions expire.
   */
  getExpiryForecast(): SessionExpiryForecast {
    const now = Date.now();
    const sessions = Array.from(this.sessions.values());

    const forecast: SessionExpiryForecast = {
      next5min: 0,
      next15min: 0,
      next30min: 0,
      next1hour: 0,
      unknown: 0,
      totalAuthenticated: 0,
      byPlatform: {},
    };

    for (const session of sessions) {
      if (!session.authenticatedAt) continue;

      forecast.totalAuthenticated++;

      // Track by platform
      const platform = session.platform || 'unknown';
      if (!forecast.byPlatform[platform]) {
        forecast.byPlatform[platform] = { expiringSoon: 0, total: 0 };
      }
      forecast.byPlatform[platform].total++;

      if (!session.cookieExpiresAt) {
        forecast.unknown++;
        continue;
      }

      const msUntilExpiry = session.cookieExpiresAt.getTime() - now;
      const minUntilExpiry = msUntilExpiry / 60000;

      if (minUntilExpiry <= 5) {
        forecast.next5min++;
        forecast.byPlatform[platform].expiringSoon++;
      } else if (minUntilExpiry <= 15) {
        forecast.next15min++;
        forecast.byPlatform[platform].expiringSoon++;
      } else if (minUntilExpiry <= 30) {
        forecast.next30min++;
      } else if (minUntilExpiry <= 60) {
        forecast.next1hour++;
      }
    }

    return forecast;
  }

  /**
   * Get sessions that are expiring soon and need attention.
   * @param thresholdMinutes - Minutes threshold for "expiring soon" (default: 15)
   */
  getSessionsExpiringSoon(thresholdMinutes: number = 15): SessionExpiryWarning[] {
    const now = Date.now();
    const thresholdMs = thresholdMinutes * 60000;
    const warnings: SessionExpiryWarning[] = [];

    for (const session of this.sessions.values()) {
      if (!session.cookieExpiresAt) continue;

      const msUntilExpiry = session.cookieExpiresAt.getTime() - now;

      if (msUntilExpiry <= thresholdMs && msUntilExpiry > 0) {
        warnings.push({
          sessionId: session.id,
          platform: session.platform,
          accountId: session.accountId,
          expiresAt: session.cookieExpiresAt,
          minutesRemaining: Math.round(msUntilExpiry / 60000),
        });
      }
    }

    // Sort by soonest expiry first
    return warnings.sort((a, b) => a.minutesRemaining - b.minutesRemaining);
  }

  /**
   * Get authenticated sessions by platform
   */
  getSessionsByPlatform(platform: string): Session[] {
    return Array.from(this.sessions.values())
      .filter(s => s.platform === platform);
  }

  /**
   * Check if we have capacity for a platform, considering upcoming expirations
   * @param platform - Platform to check
   * @param requiredSessions - Number of sessions needed
   * @param withinMinutes - Time window to consider expirations
   */
  hasCapacity(platform: string, requiredSessions: number, withinMinutes: number = 30): boolean {
    const now = Date.now();
    const platformSessions = this.getSessionsByPlatform(platform);

    // Count sessions that will still be valid within the time window
    const validSessions = platformSessions.filter(s => {
      if (s.status === 'error' || s.status === 'destroyed') return false;
      if (!s.cookieExpiresAt) return true; // Assume valid if no expiry set
      return s.cookieExpiresAt.getTime() > now + (withinMinutes * 60000);
    });

    return validSessions.length >= requiredSessions;
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.stopWarmup();
    this.stopHealthChecks();
    this.stopKeepAlive();
    await this.destroyAll();
  }

  // Private helper methods

  private findIdleSession(options: SessionRequestOptions): Session | undefined {
    const idleSessions = this.getIdleSessions();

    // Filter by requirements
    let candidates = idleSessions;

    if (options.engine) {
      candidates = candidates.filter(s => s.config.engine === options.engine);
    }

    if (options.proxyUrl) {
      candidates = candidates.filter(s => s.config.proxyUrl === options.proxyUrl);
    }

    // Return first matching session (could implement smarter selection)
    return candidates[0];
  }
}

/**
 * Create a new session pool instance
 */
export function createSessionPool(config?: SessionPoolConfig): SessionPool {
  return new SessionPool(config);
}
