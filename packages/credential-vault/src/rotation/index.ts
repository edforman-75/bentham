/**
 * Credential Rotation Module
 *
 * Manages credential pools and rotation strategies for load distribution
 * and failover handling.
 */

import type { SurfaceId } from '@bentham/core';
import type {
  Credential,
  CredentialProvider,
  CredentialPoolConfig,
  CredentialPoolState,
  CredentialUsage,
  PoolHealth,
  RotationStrategy,
  CredentialEvent,
  CredentialEventListener,
} from '../types.js';

/**
 * Default pool configuration
 */
const DEFAULT_POOL_CONFIG: Partial<CredentialPoolConfig> = {
  strategy: 'round_robin',
  minActiveCredentials: 1,
  errorCooldownMs: 60000, // 1 minute
  maxErrors: 5,
  errorWindowMs: 300000, // 5 minutes
};

/**
 * Credential Pool Manager
 *
 * Manages a pool of credentials for a specific surface with
 * automatic rotation and health tracking.
 */
export class CredentialPool {
  private config: Required<CredentialPoolConfig>;
  private provider: CredentialProvider;
  private state: CredentialPoolState;
  private listeners: Set<CredentialEventListener> = new Set();
  private cleanupIntervalId?: ReturnType<typeof setInterval>;

  constructor(provider: CredentialProvider, config: CredentialPoolConfig) {
    this.config = {
      ...DEFAULT_POOL_CONFIG,
      ...config,
    } as Required<CredentialPoolConfig>;

    this.provider = provider;
    this.state = {
      surfaceId: config.surfaceId,
      credentials: [],
      usage: new Map(),
      currentIndex: 0,
      health: {
        activeCredentials: 0,
        inCooldown: 0,
        disabled: 0,
        status: 'healthy',
      },
    };
  }

  /**
   * Initialize the pool by loading credentials from provider
   */
  async initialize(): Promise<void> {
    const credentials = await this.provider.getActiveBySurface(this.config.surfaceId);
    this.state.credentials = credentials;

    // Initialize usage tracking for each credential
    for (const cred of credentials) {
      if (!this.state.usage.has(cred.id)) {
        this.state.usage.set(cred.id, {
          credentialId: cred.id,
          totalUses: 0,
          successfulUses: 0,
          failedUses: 0,
          recentErrors: 0,
          inCooldown: false,
        });
      }
    }

    this.updateHealth();

    // Start cleanup interval to clear expired cooldowns
    this.cleanupIntervalId = setInterval(() => this.cleanupCooldowns(), 10000);
  }

  /**
   * Get the next credential from the pool
   */
  async getNext(): Promise<Credential | null> {
    const available = this.getAvailableCredentials();
    if (available.length === 0) {
      return null;
    }

    let selected: Credential;

    switch (this.config.strategy) {
      case 'round_robin':
        selected = this.selectRoundRobin(available);
        break;
      case 'random':
        selected = this.selectRandom(available);
        break;
      case 'least_used':
        selected = this.selectLeastUsed(available);
        break;
      case 'least_errors':
        selected = this.selectLeastErrors(available);
        break;
      case 'weighted':
        selected = this.selectWeighted(available);
        break;
      default:
        selected = this.selectRoundRobin(available);
    }

    // Track usage
    const usage = this.state.usage.get(selected.id);
    if (usage) {
      usage.totalUses++;
      usage.lastUsedAt = new Date();
    }

    return selected;
  }

  /**
   * Report successful use of a credential
   */
  reportSuccess(credentialId: string): void {
    const usage = this.state.usage.get(credentialId);
    if (usage) {
      usage.successfulUses++;
      this.emit({ type: 'credential_used', credentialId, success: true });
    }
  }

  /**
   * Report failed use of a credential
   */
  reportError(credentialId: string): void {
    const usage = this.state.usage.get(credentialId);
    if (!usage) return;

    usage.failedUses++;
    usage.recentErrors++;
    usage.lastErrorAt = new Date();

    this.emit({ type: 'credential_used', credentialId, success: false });

    // Check if credential should be put in cooldown
    if (usage.recentErrors >= this.config.maxErrors) {
      this.putInCooldown(credentialId, 'max_errors_exceeded');
    } else {
      // Short cooldown after any error
      this.putInCooldown(credentialId, 'error');
    }

    this.updateHealth();
  }

  /**
   * Put a credential in cooldown
   */
  private putInCooldown(credentialId: string, reason: string): void {
    const usage = this.state.usage.get(credentialId);
    if (!usage) return;

    usage.inCooldown = true;
    usage.cooldownExpiresAt = new Date(Date.now() + this.config.errorCooldownMs);

    this.emit({
      type: 'credential_disabled',
      credentialId,
      reason: `Cooldown: ${reason}`,
    });
  }

  /**
   * Clean up expired cooldowns
   */
  private cleanupCooldowns(): void {
    const now = new Date();
    let changed = false;

    for (const usage of this.state.usage.values()) {
      if (usage.inCooldown && usage.cooldownExpiresAt && usage.cooldownExpiresAt <= now) {
        usage.inCooldown = false;
        usage.cooldownExpiresAt = undefined;
        // Decay recent errors
        usage.recentErrors = Math.max(0, usage.recentErrors - 1);
        changed = true;

        this.emit({ type: 'credential_enabled', credentialId: usage.credentialId });
      }

      // Clear old errors outside the window
      if (usage.lastErrorAt) {
        const errorAge = now.getTime() - usage.lastErrorAt.getTime();
        if (errorAge > this.config.errorWindowMs) {
          usage.recentErrors = 0;
          changed = true;
        }
      }
    }

    if (changed) {
      this.updateHealth();
    }
  }

  /**
   * Get credentials that are available (not in cooldown)
   */
  private getAvailableCredentials(): Credential[] {
    return this.state.credentials.filter(cred => {
      const usage = this.state.usage.get(cred.id);
      if (!usage) return true;
      return !usage.inCooldown;
    });
  }

  /**
   * Round robin selection
   */
  private selectRoundRobin(available: Credential[]): Credential {
    const index = this.state.currentIndex % available.length;
    this.state.currentIndex = (this.state.currentIndex + 1) % available.length;
    return available[index];
  }

  /**
   * Random selection
   */
  private selectRandom(available: Credential[]): Credential {
    const index = Math.floor(Math.random() * available.length);
    return available[index];
  }

  /**
   * Select least used credential
   */
  private selectLeastUsed(available: Credential[]): Credential {
    let minUses = Infinity;
    let selected = available[0];

    for (const cred of available) {
      const usage = this.state.usage.get(cred.id);
      const uses = usage?.totalUses ?? 0;
      if (uses < minUses) {
        minUses = uses;
        selected = cred;
      }
    }

    return selected;
  }

  /**
   * Select credential with least errors
   */
  private selectLeastErrors(available: Credential[]): Credential {
    let minErrors = Infinity;
    let selected = available[0];

    for (const cred of available) {
      const usage = this.state.usage.get(cred.id);
      const errors = usage?.recentErrors ?? 0;
      if (errors < minErrors) {
        minErrors = errors;
        selected = cred;
      }
    }

    return selected;
  }

  /**
   * Weighted random selection (inverse of error rate)
   */
  private selectWeighted(available: Credential[]): Credential {
    const weights: number[] = available.map(cred => {
      const usage = this.state.usage.get(cred.id);
      if (!usage) return 1;
      // Higher weight for less errors
      return 1 / (1 + usage.recentErrors);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < available.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return available[i];
      }
    }

    return available[available.length - 1];
  }

  /**
   * Update pool health status
   */
  private updateHealth(): void {
    const total = this.state.credentials.length;
    let inCooldown = 0;
    let disabled = 0;

    for (const usage of this.state.usage.values()) {
      if (usage.inCooldown) {
        inCooldown++;
      }
      if (usage.recentErrors >= this.config.maxErrors) {
        disabled++;
      }
    }

    const active = total - inCooldown;

    let status: 'healthy' | 'degraded' | 'critical';
    let message: string | undefined;

    if (active >= this.config.minActiveCredentials && inCooldown === 0) {
      status = 'healthy';
    } else if (active >= this.config.minActiveCredentials) {
      status = 'degraded';
      message = `${inCooldown} credential(s) in cooldown`;
    } else if (active > 0) {
      status = 'degraded';
      message = `Only ${active} active credential(s), below minimum of ${this.config.minActiveCredentials}`;
    } else {
      status = 'critical';
      message = 'No active credentials available';
    }

    const oldStatus = this.state.health.status;
    this.state.health = {
      activeCredentials: active,
      inCooldown,
      disabled,
      status,
      message,
    };

    if (oldStatus !== status) {
      this.emit({
        type: 'pool_health_changed',
        surfaceId: this.config.surfaceId,
        health: this.state.health,
      });
    }
  }

  /**
   * Get current pool health
   */
  getHealth(): PoolHealth {
    return { ...this.state.health };
  }

  /**
   * Get usage statistics for a credential
   */
  getUsage(credentialId: string): CredentialUsage | undefined {
    return this.state.usage.get(credentialId);
  }

  /**
   * Get all usage statistics
   */
  getAllUsage(): CredentialUsage[] {
    return Array.from(this.state.usage.values());
  }

  /**
   * Add a credential to the pool
   */
  async addCredential(credential: Credential): Promise<void> {
    await this.provider.store(credential);
    this.state.credentials.push(credential);
    this.state.usage.set(credential.id, {
      credentialId: credential.id,
      totalUses: 0,
      successfulUses: 0,
      failedUses: 0,
      recentErrors: 0,
      inCooldown: false,
    });
    this.updateHealth();
    this.emit({ type: 'credential_added', credential });
  }

  /**
   * Remove a credential from the pool
   */
  async removeCredential(credentialId: string): Promise<void> {
    await this.provider.delete(credentialId);
    this.state.credentials = this.state.credentials.filter(c => c.id !== credentialId);
    this.state.usage.delete(credentialId);
    this.updateHealth();
    this.emit({ type: 'credential_deleted', credentialId });
  }

  /**
   * Refresh credentials from provider
   */
  async refresh(): Promise<void> {
    const credentials = await this.provider.getActiveBySurface(this.config.surfaceId);

    // Add new credentials
    for (const cred of credentials) {
      if (!this.state.usage.has(cred.id)) {
        this.state.usage.set(cred.id, {
          credentialId: cred.id,
          totalUses: 0,
          successfulUses: 0,
          failedUses: 0,
          recentErrors: 0,
          inCooldown: false,
        });
      }
    }

    // Remove old credentials
    const credIds = new Set(credentials.map(c => c.id));
    for (const id of this.state.usage.keys()) {
      if (!credIds.has(id)) {
        this.state.usage.delete(id);
      }
    }

    this.state.credentials = credentials;
    this.updateHealth();
  }

  /**
   * Add event listener
   */
  on(listener: CredentialEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove event listener
   */
  off(listener: CredentialEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Emit an event
   */
  private emit(event: CredentialEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Dispose of the pool
   */
  dispose(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }
    this.listeners.clear();
  }

  /**
   * Get pool configuration
   */
  getConfig(): CredentialPoolConfig {
    return { ...this.config };
  }

  /**
   * Get the number of credentials in the pool
   */
  size(): number {
    return this.state.credentials.length;
  }
}

/**
 * Create a credential pool
 */
export function createCredentialPool(
  provider: CredentialProvider,
  config: CredentialPoolConfig
): CredentialPool {
  return new CredentialPool(provider, config);
}

/**
 * Credential Pool Manager
 *
 * Manages multiple credential pools for different surfaces.
 */
export class CredentialPoolManager {
  private provider: CredentialProvider;
  private pools: Map<SurfaceId, CredentialPool> = new Map();
  private defaultStrategy: RotationStrategy;

  constructor(provider: CredentialProvider, defaultStrategy: RotationStrategy = 'round_robin') {
    this.provider = provider;
    this.defaultStrategy = defaultStrategy;
  }

  /**
   * Get or create a pool for a surface
   */
  async getPool(surfaceId: SurfaceId, config?: Partial<CredentialPoolConfig>): Promise<CredentialPool> {
    let pool = this.pools.get(surfaceId);

    if (!pool) {
      pool = new CredentialPool(this.provider, {
        surfaceId,
        strategy: config?.strategy ?? this.defaultStrategy,
        ...config,
      });
      await pool.initialize();
      this.pools.set(surfaceId, pool);
    }

    return pool;
  }

  /**
   * Get a credential for a surface (convenience method)
   */
  async getCredential(surfaceId: SurfaceId): Promise<Credential | null> {
    const pool = await this.getPool(surfaceId);
    return pool.getNext();
  }

  /**
   * Report success for a surface credential
   */
  async reportSuccess(surfaceId: SurfaceId, credentialId: string): Promise<void> {
    const pool = this.pools.get(surfaceId);
    if (pool) {
      pool.reportSuccess(credentialId);
    }
  }

  /**
   * Report error for a surface credential
   */
  async reportError(surfaceId: SurfaceId, credentialId: string): Promise<void> {
    const pool = this.pools.get(surfaceId);
    if (pool) {
      pool.reportError(credentialId);
    }
  }

  /**
   * Get health status for all pools
   */
  getHealthStatus(): Map<SurfaceId, PoolHealth> {
    const status = new Map<SurfaceId, PoolHealth>();
    for (const [surfaceId, pool] of this.pools) {
      status.set(surfaceId, pool.getHealth());
    }
    return status;
  }

  /**
   * Dispose all pools
   */
  dispose(): void {
    for (const pool of this.pools.values()) {
      pool.dispose();
    }
    this.pools.clear();
  }
}

/**
 * Create a credential pool manager
 */
export function createCredentialPoolManager(
  provider: CredentialProvider,
  defaultStrategy?: RotationStrategy
): CredentialPoolManager {
  return new CredentialPoolManager(provider, defaultStrategy);
}
