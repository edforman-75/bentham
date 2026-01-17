/**
 * Pool Manager
 *
 * Manages multiple SurfacePools across different surface types.
 * Provides centralized health monitoring and adapter management.
 */

import type { SurfaceAdapter, SurfaceQueryRequest, SurfaceQueryResponse } from '../types.js';
import {
  SurfacePool,
  createSurfacePool,
  type SurfacePoolConfig,
  type PoolHealthStatus,
  type AdapterHealth,
} from './surface-pool.js';

/**
 * Adapter registration info
 */
export interface AdapterRegistration {
  /** Surface type ID (e.g., 'openai-api') */
  surfaceId: string;
  /** Unique adapter instance ID */
  adapterId: string;
  /** The adapter instance */
  adapter: SurfaceAdapter;
  /** Priority (higher = preferred) */
  priority?: number;
  /** Tags for filtering */
  tags?: string[];
}

/**
 * System-wide health status
 */
export interface SystemHealthStatus {
  /** Overall system health score (0-100) */
  overallScore: number;
  /** Health status by surface */
  surfaces: Record<string, PoolHealthStatus>;
  /** Total healthy adapters across all surfaces */
  totalHealthyAdapters: number;
  /** Total degraded adapters across all surfaces */
  totalDegradedAdapters: number;
  /** Total unhealthy adapters across all surfaces */
  totalUnhealthyAdapters: number;
  /** Surfaces that cannot serve requests */
  unavailableSurfaces: string[];
  /** Timestamp of status */
  timestamp: Date;
}

/**
 * Pool manager configuration
 */
export interface PoolManagerConfig {
  /** Default pool configuration */
  defaultPoolConfig: Partial<SurfacePoolConfig>;
  /** Health check interval (ms) */
  healthCheckIntervalMs: number;
  /** Enable automatic health checks */
  autoHealthCheck: boolean;
}

/**
 * Default pool manager configuration
 */
export const DEFAULT_POOL_MANAGER_CONFIG: PoolManagerConfig = {
  defaultPoolConfig: {},
  healthCheckIntervalMs: 60000, // 1 minute
  autoHealthCheck: false,
};

/**
 * Health change event
 */
export interface HealthChangeEvent {
  type: 'surface_healthy' | 'surface_degraded' | 'surface_unavailable' | 'adapter_healthy' | 'adapter_unhealthy';
  surfaceId: string;
  adapterId?: string;
  previousScore: number;
  currentScore: number;
  timestamp: Date;
}

/**
 * Health change listener
 */
export type HealthChangeListener = (event: HealthChangeEvent) => void;

/**
 * Pool Manager - manages all surface pools
 */
export class PoolManager {
  private pools: Map<string, SurfacePool> = new Map();
  private adapterTags: Map<string, Set<string>> = new Map(); // adapterId -> tags
  private config: PoolManagerConfig;
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private previousHealthStatus?: SystemHealthStatus;
  private healthListeners: HealthChangeListener[] = [];

  constructor(config: Partial<PoolManagerConfig> = {}) {
    this.config = { ...DEFAULT_POOL_MANAGER_CONFIG, ...config };

    if (this.config.autoHealthCheck) {
      this.startHealthChecks();
    }
  }

  /**
   * Register an adapter with the manager
   */
  registerAdapter(registration: AdapterRegistration): void {
    const { surfaceId, adapterId, adapter, priority = 0, tags = [] } = registration;

    // Get or create pool for this surface
    let pool = this.pools.get(surfaceId);
    if (!pool) {
      pool = createSurfacePool(surfaceId, this.config.defaultPoolConfig);
      this.pools.set(surfaceId, pool);
    }

    // Add adapter to pool
    pool.addAdapter(adapterId, adapter, priority);

    // Store tags
    this.adapterTags.set(adapterId, new Set(tags));
  }

  /**
   * Unregister an adapter
   */
  async unregisterAdapter(surfaceId: string, adapterId: string): Promise<void> {
    const pool = this.pools.get(surfaceId);
    if (pool) {
      await pool.removeAdapter(adapterId);

      // Remove empty pools
      const status = pool.getHealthStatus();
      if (status.totalCount === 0) {
        this.pools.delete(surfaceId);
      }
    }

    this.adapterTags.delete(adapterId);
  }

  /**
   * Enable/disable an adapter
   */
  setAdapterEnabled(surfaceId: string, adapterId: string, enabled: boolean): void {
    const pool = this.pools.get(surfaceId);
    if (pool) {
      pool.setAdapterEnabled(adapterId, enabled);
    }
  }

  /**
   * Query a specific surface
   */
  async query(
    surfaceId: string,
    request: SurfaceQueryRequest
  ): Promise<SurfaceQueryResponse & { adapterId: string }> {
    const pool = this.pools.get(surfaceId);

    if (!pool) {
      return {
        success: false,
        timing: { totalMs: 0, responseMs: 0 },
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `No adapters registered for surface ${surfaceId}`,
          retryable: false,
        },
        adapterId: '',
      };
    }

    return pool.query(request);
  }

  /**
   * Query with automatic fallback to alternative surfaces
   */
  async queryWithFallback(
    surfaceIds: string[],
    request: SurfaceQueryRequest
  ): Promise<SurfaceQueryResponse & { surfaceId: string; adapterId: string }> {
    for (const surfaceId of surfaceIds) {
      const pool = this.pools.get(surfaceId);
      if (!pool) continue;

      const status = pool.getHealthStatus();
      if (!status.canServe) continue;

      const result = await pool.query(request);
      if (result.success) {
        return { ...result, surfaceId };
      }

      // If error is not retryable, don't try other surfaces
      if (result.error && !result.error.retryable) {
        return { ...result, surfaceId };
      }
    }

    // All surfaces failed
    return {
      success: false,
      timing: { totalMs: 0, responseMs: 0 },
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: `All surfaces unavailable: ${surfaceIds.join(', ')}`,
        retryable: true,
      },
      surfaceId: '',
      adapterId: '',
    };
  }

  /**
   * Get system-wide health status
   */
  getSystemHealth(): SystemHealthStatus {
    const surfaces: Record<string, PoolHealthStatus> = {};
    let totalHealthy = 0;
    let totalDegraded = 0;
    let totalUnhealthy = 0;
    const unavailable: string[] = [];
    const scores: number[] = [];

    for (const [surfaceId, pool] of this.pools) {
      const status = pool.getHealthStatus();
      surfaces[surfaceId] = status;
      scores.push(status.overallScore);
      totalHealthy += status.healthyCount;
      totalDegraded += status.degradedCount;
      totalUnhealthy += status.unhealthyCount;

      if (!status.canServe) {
        unavailable.push(surfaceId);
      }
    }

    const overallScore =
      scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : 0;

    return {
      overallScore,
      surfaces,
      totalHealthyAdapters: totalHealthy,
      totalDegradedAdapters: totalDegraded,
      totalUnhealthyAdapters: totalUnhealthy,
      unavailableSurfaces: unavailable,
      timestamp: new Date(),
    };
  }

  /**
   * Get health status for a specific surface
   */
  getSurfaceHealth(surfaceId: string): PoolHealthStatus | null {
    const pool = this.pools.get(surfaceId);
    return pool ? pool.getHealthStatus() : null;
  }

  /**
   * Get health for a specific adapter
   */
  getAdapterHealth(surfaceId: string, adapterId: string): AdapterHealth | null {
    const pool = this.pools.get(surfaceId);
    return pool ? pool.getAdapterHealth(adapterId) : null;
  }

  /**
   * Get all registered surface IDs
   */
  getSurfaceIds(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Get adapters by tag
   */
  getAdaptersByTag(tag: string): Array<{ surfaceId: string; adapterId: string }> {
    const results: Array<{ surfaceId: string; adapterId: string }> = [];

    for (const [surfaceId, pool] of this.pools) {
      const status = pool.getHealthStatus();
      for (const adapter of status.adapters) {
        const tags = this.adapterTags.get(adapter.id);
        if (tags?.has(tag)) {
          results.push({ surfaceId, adapterId: adapter.id });
        }
      }
    }

    return results;
  }

  /**
   * Add a health change listener
   */
  onHealthChange(listener: HealthChangeListener): void {
    this.healthListeners.push(listener);
  }

  /**
   * Remove a health change listener
   */
  offHealthChange(listener: HealthChangeListener): void {
    const index = this.healthListeners.indexOf(listener);
    if (index >= 0) {
      this.healthListeners.splice(index, 1);
    }
  }

  /**
   * Start automatic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(() => {
      this.checkHealthChanges();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop automatic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Close all pools and cleanup
   */
  async close(): Promise<void> {
    this.stopHealthChecks();

    const closePromises = Array.from(this.pools.values()).map(p => p.close());
    await Promise.all(closePromises);

    this.pools.clear();
    this.adapterTags.clear();
    this.healthListeners = [];
  }

  /**
   * Check for health changes and emit events
   */
  private checkHealthChanges(): void {
    const currentStatus = this.getSystemHealth();

    if (this.previousHealthStatus) {
      // Check for surface-level changes
      for (const [surfaceId, currentSurface] of Object.entries(currentStatus.surfaces)) {
        const previousSurface = this.previousHealthStatus.surfaces[surfaceId];

        if (previousSurface) {
          // Check if surface availability changed
          if (previousSurface.canServe && !currentSurface.canServe) {
            this.emitHealthChange({
              type: 'surface_unavailable',
              surfaceId,
              previousScore: previousSurface.overallScore,
              currentScore: currentSurface.overallScore,
              timestamp: new Date(),
            });
          } else if (!previousSurface.canServe && currentSurface.canServe) {
            this.emitHealthChange({
              type: 'surface_healthy',
              surfaceId,
              previousScore: previousSurface.overallScore,
              currentScore: currentSurface.overallScore,
              timestamp: new Date(),
            });
          } else if (
            previousSurface.overallScore >= 80 &&
            currentSurface.overallScore < 80
          ) {
            this.emitHealthChange({
              type: 'surface_degraded',
              surfaceId,
              previousScore: previousSurface.overallScore,
              currentScore: currentSurface.overallScore,
              timestamp: new Date(),
            });
          }

          // Check adapter-level changes
          for (const currentAdapter of currentSurface.adapters) {
            const previousAdapter = previousSurface.adapters.find(
              a => a.id === currentAdapter.id
            );

            if (previousAdapter) {
              if (previousAdapter.score >= 50 && currentAdapter.score < 50) {
                this.emitHealthChange({
                  type: 'adapter_unhealthy',
                  surfaceId,
                  adapterId: currentAdapter.id,
                  previousScore: previousAdapter.score,
                  currentScore: currentAdapter.score,
                  timestamp: new Date(),
                });
              } else if (previousAdapter.score < 50 && currentAdapter.score >= 80) {
                this.emitHealthChange({
                  type: 'adapter_healthy',
                  surfaceId,
                  adapterId: currentAdapter.id,
                  previousScore: previousAdapter.score,
                  currentScore: currentAdapter.score,
                  timestamp: new Date(),
                });
              }
            }
          }
        }
      }
    }

    this.previousHealthStatus = currentStatus;
  }

  /**
   * Emit a health change event
   */
  private emitHealthChange(event: HealthChangeEvent): void {
    for (const listener of this.healthListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in health change listener:', error);
      }
    }
  }
}

/**
 * Create a pool manager
 */
export function createPoolManager(
  config?: Partial<PoolManagerConfig>
): PoolManager {
  return new PoolManager(config);
}
