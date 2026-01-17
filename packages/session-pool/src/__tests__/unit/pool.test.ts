/**
 * Session Pool Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionPool, createSessionPool } from '../../pool.js';

describe('SessionPool', () => {
  let pool: SessionPool;

  beforeEach(() => {
    pool = new SessionPool({ autoWarmup: false });
  });

  afterEach(async () => {
    await pool.shutdown();
  });

  describe('constructor', () => {
    it('should create pool with default config', () => {
      const stats = pool.getStats();
      expect(stats.totalSessions).toBe(0);
    });

    it('should create pool with custom config', () => {
      const customPool = new SessionPool({
        minIdleSessions: 5,
        maxSessions: 20,
        autoWarmup: false,
      });
      expect(customPool).toBeInstanceOf(SessionPool);
      customPool.shutdown();
    });
  });

  describe('createSession', () => {
    it('should create a session', async () => {
      const session = await pool.createSession();

      expect(session.id).toBeDefined();
      expect(session.status).toBe('idle');
      expect(session.config.engine).toBe('chromium');
      expect(session.pageCount).toBe(0);
    });

    it('should create session with custom config', async () => {
      const session = await pool.createSession({
        engine: 'firefox',
        headless: false,
      });

      expect(session.config.engine).toBe('firefox');
      expect(session.config.headless).toBe(false);
    });

    it('should call onCreate hook', async () => {
      const onCreate = vi.fn();
      pool.setHooks({ onCreate });

      await pool.createSession();

      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during creation', async () => {
      const error = new Error('Browser launch failed');
      const onError = vi.fn();

      pool.setHooks({
        onCreate: async () => { throw error; },
        onError,
      });

      const session = await pool.createSession();

      expect(session.status).toBe('error');
      expect(session.error).toBe('Browser launch failed');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    it('should get session by ID', async () => {
      const session = await pool.createSession();
      const retrieved = pool.getSession(session.id);

      expect(retrieved).toEqual(session);
    });

    it('should return undefined for unknown ID', () => {
      const session = pool.getSession('unknown');
      expect(session).toBeUndefined();
    });
  });

  describe('getAllSessions', () => {
    it('should return all sessions', async () => {
      await pool.createSession();
      await pool.createSession();

      const sessions = pool.getAllSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('getIdleSessions', () => {
    it('should return only idle sessions', async () => {
      await pool.createSession();
      await pool.createSession();

      const idle = pool.getIdleSessions();
      expect(idle).toHaveLength(2);
    });
  });

  describe('checkout', () => {
    it('should checkout an idle session', async () => {
      await pool.createSession();

      const checkout = await pool.checkout();

      expect(checkout).toBeDefined();
      expect(checkout!.id).toBeDefined();
      expect(checkout!.session.status).toBe('active');
      expect(checkout!.expiresAt).toBeInstanceOf(Date);
    });

    it('should create session if none available', async () => {
      const checkout = await pool.checkout();

      expect(checkout).toBeDefined();
      expect(pool.getStats().totalSessions).toBe(1);
    });

    it('should return undefined if at max sessions', async () => {
      const smallPool = new SessionPool({
        maxSessions: 1,
        autoWarmup: false,
      });

      // Create and checkout the only session
      await smallPool.createSession();
      await smallPool.checkout();

      // Try to get another - should fail
      const checkout = await smallPool.checkout();
      expect(checkout).toBeUndefined();

      await smallPool.shutdown();
    });

    it('should match session by engine', async () => {
      await pool.createSession({ engine: 'chromium' });
      await pool.createSession({ engine: 'firefox' });

      const checkout = await pool.checkout({ engine: 'firefox' });

      expect(checkout!.session.config.engine).toBe('firefox');
    });

    it('should call onCheckout hook', async () => {
      const onCheckout = vi.fn();
      pool.setHooks({ onCheckout });

      await pool.createSession();
      await pool.checkout();

      expect(onCheckout).toHaveBeenCalledTimes(1);
    });

    it('should update stats on checkout', async () => {
      await pool.createSession();
      await pool.checkout();

      const stats = pool.getStats();
      expect(stats.totalCheckouts).toBe(1);
      expect(stats.activeSessions).toBe(1);
    });
  });

  describe('getCheckout', () => {
    it('should get checkout by ID', async () => {
      await pool.createSession();
      const checkout = await pool.checkout();

      const retrieved = pool.getCheckout(checkout!.id);
      expect(retrieved).toEqual(checkout);
    });
  });

  describe('checkin', () => {
    it('should checkin a session', async () => {
      await pool.createSession();
      const checkout = await pool.checkout();

      const result = await pool.checkin(checkout!.id);

      expect(result).toBe(true);
      expect(pool.getSession(checkout!.session.id)!.status).toBe('idle');
    });

    it('should call onCheckin hook', async () => {
      const onCheckin = vi.fn();
      pool.setHooks({ onCheckin });

      await pool.createSession();
      const checkout = await pool.checkout();
      await pool.checkin(checkout!.id);

      expect(onCheckin).toHaveBeenCalledTimes(1);
    });

    it('should return false for unknown checkout', async () => {
      const result = await pool.checkin('unknown');
      expect(result).toBe(false);
    });

    it('should destroy session if recycle requested', async () => {
      await pool.createSession();
      const checkout = await pool.checkout();
      const sessionId = checkout!.session.id;

      await pool.checkin(checkout!.id, { recycle: true });

      expect(pool.getSession(sessionId)).toBeUndefined();
    });

    it('should destroy session on error', async () => {
      await pool.createSession();
      const checkout = await pool.checkout();
      const sessionId = checkout!.session.id;

      await pool.checkin(checkout!.id, { error: 'Session crashed' });

      expect(pool.getSession(sessionId)).toBeUndefined();
    });

    it('should destroy session when maxPages reached', async () => {
      const session = await pool.createSession({ maxPages: 2 });
      const checkout = await pool.checkout();

      pool.recordPage(session.id);
      pool.recordPage(session.id);

      await pool.checkin(checkout!.id);

      expect(pool.getSession(session.id)).toBeUndefined();
    });
  });

  describe('recordPage', () => {
    it('should increment page count', async () => {
      const session = await pool.createSession();
      pool.recordPage(session.id);
      pool.recordPage(session.id);

      expect(pool.getSession(session.id)!.pageCount).toBe(2);
    });

    it('should update stats', async () => {
      const session = await pool.createSession();
      pool.recordPage(session.id);

      const stats = pool.getStats();
      expect(stats.totalPages).toBe(1);
    });
  });

  describe('destroySession', () => {
    it('should destroy a session', async () => {
      const session = await pool.createSession();

      const result = await pool.destroySession(session.id);

      expect(result).toBe(true);
      expect(pool.getSession(session.id)).toBeUndefined();
    });

    it('should call onDestroy hook', async () => {
      const onDestroy = vi.fn();
      pool.setHooks({ onDestroy });

      const session = await pool.createSession();
      await pool.destroySession(session.id);

      expect(onDestroy).toHaveBeenCalledTimes(1);
    });

    it('should return false for unknown session', async () => {
      const result = await pool.destroySession('unknown');
      expect(result).toBe(false);
    });

    it('should remove associated checkouts', async () => {
      await pool.createSession();
      const checkout = await pool.checkout();

      await pool.destroySession(checkout!.session.id);

      expect(pool.getCheckout(checkout!.id)).toBeUndefined();
    });
  });

  describe('warmup', () => {
    it('should create sessions to meet minimum', async () => {
      const warmPool = new SessionPool({
        minIdleSessions: 3,
        autoWarmup: false,
      });

      await warmPool.warmup();

      const stats = warmPool.getStats();
      expect(stats.idleSessions).toBe(3);

      await warmPool.shutdown();
    });

    it('should not exceed max sessions', async () => {
      const limitedPool = new SessionPool({
        minIdleSessions: 10,
        maxSessions: 3,
        autoWarmup: false,
      });

      await limitedPool.warmup();

      const stats = limitedPool.getStats();
      expect(stats.totalSessions).toBe(3);

      await limitedPool.shutdown();
    });

    it('should not create if already at minimum', async () => {
      await pool.createSession();
      await pool.createSession();

      const created = await pool.warmup();

      expect(created).toBe(0);
    });
  });

  describe('cleanupIdle', () => {
    it('should cleanup idle sessions past timeout', async () => {
      const quickPool = new SessionPool({
        idleTimeout: 100,
        autoWarmup: false,
      });

      const session = await quickPool.createSession();
      expect(quickPool.getSession(session.id)).toBeDefined();

      // Wait for idle timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      const cleaned = await quickPool.cleanupIdle();

      expect(cleaned).toBe(1);
      expect(quickPool.getSession(session.id)).toBeUndefined();

      await quickPool.shutdown();
    });
  });

  describe('cleanupExpiredCheckouts', () => {
    it('should cleanup expired checkouts', async () => {
      const quickPool = new SessionPool({
        checkoutTimeout: 100,
        autoWarmup: false,
      });

      await quickPool.createSession();
      const checkout = await quickPool.checkout();

      expect(quickPool.getCheckout(checkout!.id)).toBeDefined();

      // Wait for checkout to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const cleaned = await quickPool.cleanupExpiredCheckouts();

      expect(cleaned).toBe(1);
      expect(quickPool.getCheckout(checkout!.id)).toBeUndefined();

      await quickPool.shutdown();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await pool.createSession({ engine: 'chromium' });
      await pool.createSession({ engine: 'firefox' });
      await pool.checkout();

      const stats = pool.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.idleSessions).toBe(1);
      expect(stats.activeSessions).toBe(1);
      expect(stats.totalCheckouts).toBe(1);
      expect(stats.byEngine.chromium).toBe(1);
      expect(stats.byEngine.firefox).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('should destroy all sessions', async () => {
      await pool.createSession();
      await pool.createSession();

      await pool.shutdown();

      expect(pool.getAllSessions()).toHaveLength(0);
    });
  });
});

describe('createSessionPool', () => {
  it('should create a new pool instance', () => {
    const pool = createSessionPool({ autoWarmup: false });
    expect(pool).toBeInstanceOf(SessionPool);
    pool.shutdown();
  });

  it('should accept config', () => {
    const pool = createSessionPool({
      maxSessions: 5,
      autoWarmup: false,
    });
    expect(pool).toBeInstanceOf(SessionPool);
    pool.shutdown();
  });
});

describe('keepAlive', () => {
  let pool: SessionPool;

  beforeEach(() => {
    pool = new SessionPool({ autoWarmup: false, autoKeepAlive: false });
  });

  afterEach(async () => {
    await pool.shutdown();
  });

  it('should call onKeepAlive hook for idle sessions', async () => {
    const onKeepAlive = vi.fn();
    pool.setHooks({ onKeepAlive });

    await pool.createSession();
    await pool.createSession();

    const keptAlive = await pool.keepAlive();

    expect(keptAlive).toBe(2);
    expect(onKeepAlive).toHaveBeenCalledTimes(2);
  });

  it('should not call onKeepAlive for active sessions', async () => {
    const onKeepAlive = vi.fn();
    pool.setHooks({ onKeepAlive });

    await pool.createSession();
    await pool.checkout();

    const keptAlive = await pool.keepAlive();

    expect(keptAlive).toBe(0);
    expect(onKeepAlive).not.toHaveBeenCalled();
  });

  it('should update lastKeepAliveAt timestamp', async () => {
    const onKeepAlive = vi.fn();
    pool.setHooks({ onKeepAlive });

    const session = await pool.createSession();

    expect(session.lastKeepAliveAt).toBeUndefined();

    await pool.keepAlive();

    expect(pool.getSession(session.id)!.lastKeepAliveAt).toBeInstanceOf(Date);
  });

  it('should mark session as error if onKeepAlive throws', async () => {
    const onKeepAlive = vi.fn().mockRejectedValue(new Error('Keep-alive failed'));
    const onError = vi.fn();
    pool.setHooks({ onKeepAlive, onError });

    const session = await pool.createSession();
    await pool.keepAlive();

    expect(pool.getSession(session.id)!.status).toBe('error');
    expect(pool.getSession(session.id)!.error).toBe('Keep-alive failed');
    expect(onError).toHaveBeenCalled();
  });

  it('should return 0 if no onKeepAlive hook', async () => {
    await pool.createSession();

    const keptAlive = await pool.keepAlive();

    expect(keptAlive).toBe(0);
  });

  it('should start and stop automatic keep-alive', async () => {
    const keepAlivePool = new SessionPool({
      autoWarmup: false,
      autoKeepAlive: true,
      keepAliveInterval: 100,
    });

    const onKeepAlive = vi.fn();
    keepAlivePool.setHooks({ onKeepAlive });

    await keepAlivePool.createSession();

    // Wait for keep-alive to run
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(onKeepAlive).toHaveBeenCalled();

    keepAlivePool.stopKeepAlive();
    const callCount = onKeepAlive.mock.calls.length;

    // Wait and verify no more calls
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(onKeepAlive.mock.calls.length).toBe(callCount);

    await keepAlivePool.shutdown();
  });
});

describe('session authentication and expiry', () => {
  let pool: SessionPool;

  beforeEach(() => {
    pool = new SessionPool({ autoWarmup: false, autoKeepAlive: false });
  });

  afterEach(async () => {
    await pool.shutdown();
  });

  describe('setSessionAuth', () => {
    it('should set authentication metadata on session', async () => {
      const session = await pool.createSession();
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour

      const result = pool.setSessionAuth(session.id, {
        platform: 'linkedin',
        accountId: 'account-123',
        cookieExpiresAt: expiresAt,
      });

      expect(result).toBe(true);

      const updated = pool.getSession(session.id)!;
      expect(updated.authenticatedAt).toBeInstanceOf(Date);
      expect(updated.cookieExpiresAt).toEqual(expiresAt);
      expect(updated.platform).toBe('linkedin');
      expect(updated.accountId).toBe('account-123');
    });

    it('should return false for unknown session', () => {
      const result = pool.setSessionAuth('unknown', {
        platform: 'linkedin',
        cookieExpiresAt: new Date(),
      });

      expect(result).toBe(false);
    });
  });

  describe('getExpiryForecast', () => {
    it('should return empty forecast for no authenticated sessions', () => {
      const forecast = pool.getExpiryForecast();

      expect(forecast.totalAuthenticated).toBe(0);
      expect(forecast.next5min).toBe(0);
      expect(forecast.next15min).toBe(0);
    });

    it('should categorize sessions by expiry time', async () => {
      const now = Date.now();

      // Create sessions expiring at different times
      const s1 = await pool.createSession();
      pool.setSessionAuth(s1.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(now + 2 * 60000), // 2 minutes
      });

      const s2 = await pool.createSession();
      pool.setSessionAuth(s2.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(now + 10 * 60000), // 10 minutes
      });

      const s3 = await pool.createSession();
      pool.setSessionAuth(s3.id, {
        platform: 'twitter',
        cookieExpiresAt: new Date(now + 25 * 60000), // 25 minutes
      });

      const s4 = await pool.createSession();
      pool.setSessionAuth(s4.id, {
        platform: 'twitter',
        cookieExpiresAt: new Date(now + 45 * 60000), // 45 minutes
      });

      const forecast = pool.getExpiryForecast();

      expect(forecast.totalAuthenticated).toBe(4);
      expect(forecast.next5min).toBe(1);
      expect(forecast.next15min).toBe(1);
      expect(forecast.next30min).toBe(1);
      expect(forecast.next1hour).toBe(1);

      expect(forecast.byPlatform['linkedin'].total).toBe(2);
      expect(forecast.byPlatform['linkedin'].expiringSoon).toBe(2);
      expect(forecast.byPlatform['twitter'].total).toBe(2);
      expect(forecast.byPlatform['twitter'].expiringSoon).toBe(0);
    });

    it('should track unknown expiry sessions', async () => {
      const session = await pool.createSession();
      // Set authenticated but no expiry
      const s = pool.getSession(session.id)!;
      s.authenticatedAt = new Date();
      s.platform = 'linkedin';

      const forecast = pool.getExpiryForecast();

      expect(forecast.totalAuthenticated).toBe(1);
      expect(forecast.unknown).toBe(1);
    });
  });

  describe('getSessionsExpiringSoon', () => {
    it('should return sessions expiring within threshold', async () => {
      const now = Date.now();

      const s1 = await pool.createSession();
      pool.setSessionAuth(s1.id, {
        platform: 'linkedin',
        accountId: 'acc-1',
        cookieExpiresAt: new Date(now + 5 * 60000), // 5 minutes
      });

      const s2 = await pool.createSession();
      pool.setSessionAuth(s2.id, {
        platform: 'twitter',
        accountId: 'acc-2',
        cookieExpiresAt: new Date(now + 60 * 60000), // 60 minutes
      });

      const warnings = pool.getSessionsExpiringSoon(15);

      expect(warnings).toHaveLength(1);
      expect(warnings[0].sessionId).toBe(s1.id);
      expect(warnings[0].platform).toBe('linkedin');
      expect(warnings[0].accountId).toBe('acc-1');
      expect(warnings[0].minutesRemaining).toBeLessThanOrEqual(5);
    });

    it('should sort by soonest expiry first', async () => {
      const now = Date.now();

      const s1 = await pool.createSession();
      pool.setSessionAuth(s1.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(now + 10 * 60000),
      });

      const s2 = await pool.createSession();
      pool.setSessionAuth(s2.id, {
        platform: 'twitter',
        cookieExpiresAt: new Date(now + 3 * 60000),
      });

      const warnings = pool.getSessionsExpiringSoon(15);

      expect(warnings).toHaveLength(2);
      expect(warnings[0].sessionId).toBe(s2.id); // 3 min first
      expect(warnings[1].sessionId).toBe(s1.id); // 10 min second
    });

    it('should not include already expired sessions', async () => {
      const session = await pool.createSession();
      pool.setSessionAuth(session.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(Date.now() - 1000), // Already expired
      });

      const warnings = pool.getSessionsExpiringSoon(15);

      expect(warnings).toHaveLength(0);
    });
  });

  describe('getSessionsByPlatform', () => {
    it('should filter sessions by platform', async () => {
      const s1 = await pool.createSession();
      pool.setSessionAuth(s1.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(Date.now() + 3600000),
      });

      const s2 = await pool.createSession();
      pool.setSessionAuth(s2.id, {
        platform: 'twitter',
        cookieExpiresAt: new Date(Date.now() + 3600000),
      });

      const s3 = await pool.createSession();
      pool.setSessionAuth(s3.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(Date.now() + 3600000),
      });

      const linkedinSessions = pool.getSessionsByPlatform('linkedin');
      const twitterSessions = pool.getSessionsByPlatform('twitter');

      expect(linkedinSessions).toHaveLength(2);
      expect(twitterSessions).toHaveLength(1);
    });
  });

  describe('hasCapacity', () => {
    it('should return true when enough valid sessions exist', async () => {
      const now = Date.now();

      const s1 = await pool.createSession();
      pool.setSessionAuth(s1.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(now + 60 * 60000), // 60 min
      });

      const s2 = await pool.createSession();
      pool.setSessionAuth(s2.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(now + 60 * 60000), // 60 min
      });

      const hasCapacity = pool.hasCapacity('linkedin', 2, 30);

      expect(hasCapacity).toBe(true);
    });

    it('should return false when sessions expire within window', async () => {
      const now = Date.now();

      const s1 = await pool.createSession();
      pool.setSessionAuth(s1.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(now + 10 * 60000), // 10 min - expires within 30 min window
      });

      const s2 = await pool.createSession();
      pool.setSessionAuth(s2.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(now + 60 * 60000), // 60 min - valid
      });

      // Need 2 sessions valid for 30 minutes, but only 1 will be
      const hasCapacity = pool.hasCapacity('linkedin', 2, 30);

      expect(hasCapacity).toBe(false);
    });

    it('should ignore error and destroyed sessions', async () => {
      const now = Date.now();

      const s1 = await pool.createSession();
      pool.setSessionAuth(s1.id, {
        platform: 'linkedin',
        cookieExpiresAt: new Date(now + 60 * 60000),
      });
      pool.getSession(s1.id)!.status = 'error';

      const hasCapacity = pool.hasCapacity('linkedin', 1, 30);

      expect(hasCapacity).toBe(false);
    });

    it('should assume sessions without expiry are valid', async () => {
      const session = await pool.createSession();
      const s = pool.getSession(session.id)!;
      s.platform = 'linkedin';
      // No cookieExpiresAt set

      const hasCapacity = pool.hasCapacity('linkedin', 1, 30);

      expect(hasCapacity).toBe(true);
    });
  });
});
