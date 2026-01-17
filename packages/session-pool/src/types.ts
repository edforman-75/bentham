/**
 * Session Pool Types
 *
 * Types for browser session pooling and management.
 */

/**
 * Session status
 */
export type SessionStatus =
  | 'idle'       // Session ready to use
  | 'active'     // Session in use
  | 'warming'    // Session starting up
  | 'cooling'    // Session shutting down
  | 'error'      // Session in error state
  | 'destroyed'; // Session terminated

/**
 * Browser engine types
 */
export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Browser engine to use */
  engine: BrowserEngine;
  /** Whether to run headless */
  headless: boolean;
  /** Viewport width */
  viewportWidth?: number;
  /** Viewport height */
  viewportHeight?: number;
  /** User agent string */
  userAgent?: string;
  /** Proxy URL */
  proxyUrl?: string;
  /** Additional browser arguments */
  browserArgs?: string[];
  /** Session timeout in ms */
  timeout?: number;
  /** Maximum page count before recycling */
  maxPages?: number;
  /** Additional context options */
  contextOptions?: Record<string, unknown>;
}

/**
 * A browser session instance
 */
export interface Session {
  /** Unique session ID */
  id: string;
  /** Current status */
  status: SessionStatus;
  /** Configuration */
  config: SessionConfig;
  /** Browser instance handle (opaque) */
  browserHandle?: unknown;
  /** Browser context handle (opaque) */
  contextHandle?: unknown;
  /** Created timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Last keep-alive timestamp */
  lastKeepAliveAt?: Date;
  /** Page count in this session */
  pageCount: number;
  /** Error message if status is error */
  error?: string;
  /** Study ID currently using this session */
  studyId?: string;
  /** Tenant ID */
  tenantId?: string;
  /** When authentication/login occurred */
  authenticatedAt?: Date;
  /** When session cookies are expected to expire */
  cookieExpiresAt?: Date;
  /** Platform/site the session is authenticated to */
  platform?: string;
  /** Account ID used for this session */
  accountId?: string;
}

/**
 * Session request options
 */
export interface SessionRequestOptions {
  /** Required browser engine */
  engine?: BrowserEngine;
  /** Tenant ID */
  tenantId?: string;
  /** Study ID */
  studyId?: string;
  /** Proxy URL */
  proxyUrl?: string;
  /** Preferred session configuration */
  config?: Partial<SessionConfig>;
  /** Maximum wait time for session in ms */
  waitTimeout?: number;
}

/**
 * Session checkout result
 */
export interface SessionCheckout {
  /** Checkout ID */
  id: string;
  /** The session */
  session: Session;
  /** When this checkout expires */
  expiresAt: Date;
}

/**
 * Pool configuration
 */
export interface SessionPoolConfig {
  /** Minimum idle sessions to maintain */
  minIdleSessions?: number;
  /** Maximum total sessions */
  maxSessions?: number;
  /** Session idle timeout in ms */
  idleTimeout?: number;
  /** Session max lifetime in ms */
  maxLifetime?: number;
  /** Checkout timeout in ms */
  checkoutTimeout?: number;
  /** Health check interval in ms */
  healthCheckInterval?: number;
  /** Enable automatic warmup */
  autoWarmup?: boolean;
  /** Enable automatic keep-alive for idle sessions */
  autoKeepAlive?: boolean;
  /** Keep-alive interval in ms (how often to ping idle sessions) */
  keepAliveInterval?: number;
  /** Default session configuration */
  defaultConfig?: Partial<SessionConfig>;
}

/**
 * Pool statistics
 */
export interface SessionPoolStats {
  /** Total sessions */
  totalSessions: number;
  /** Idle sessions */
  idleSessions: number;
  /** Active sessions (checked out) */
  activeSessions: number;
  /** Warming sessions */
  warmingSessions: number;
  /** Error sessions */
  errorSessions: number;
  /** Active checkouts */
  activeCheckouts: number;
  /** Total checkouts ever */
  totalCheckouts: number;
  /** Total pages opened */
  totalPages: number;
  /** By engine */
  byEngine: Record<BrowserEngine, number>;
}

/**
 * Session expiry forecast for capacity planning
 */
export interface SessionExpiryForecast {
  /** Sessions expiring in next 5 minutes */
  next5min: number;
  /** Sessions expiring in next 15 minutes */
  next15min: number;
  /** Sessions expiring in next 30 minutes */
  next30min: number;
  /** Sessions expiring in next hour */
  next1hour: number;
  /** Sessions with unknown expiry */
  unknown: number;
  /** Total authenticated sessions */
  totalAuthenticated: number;
  /** Detailed breakdown by platform */
  byPlatform: Record<string, {
    expiringSoon: number;
    total: number;
  }>;
}

/**
 * Session requiring attention (expiring soon or needs re-auth)
 */
export interface SessionExpiryWarning {
  /** Session ID */
  sessionId: string;
  /** Platform */
  platform?: string;
  /** Account ID */
  accountId?: string;
  /** When cookies expire */
  expiresAt: Date;
  /** Minutes until expiry */
  minutesRemaining: number;
}

/**
 * Session lifecycle hooks
 */
export interface SessionLifecycleHooks {
  /** Called when creating a new session */
  onCreate?: (session: Session) => Promise<void>;
  /** Called when a session is checked out */
  onCheckout?: (session: Session) => Promise<void>;
  /** Called when a session is checked in */
  onCheckin?: (session: Session) => Promise<void>;
  /** Called when a session is destroyed */
  onDestroy?: (session: Session) => Promise<void>;
  /** Called on session error */
  onError?: (session: Session, error: Error) => Promise<void>;
  /**
   * Called periodically on idle sessions to keep them warm.
   * This hook should perform activity to prevent the session from going stale
   * (e.g., mouse movement, scroll, refresh cookies, touch DOM elements).
   */
  onKeepAlive?: (session: Session) => Promise<void>;
}

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG: Required<SessionPoolConfig> = {
  minIdleSessions: 2,
  maxSessions: 10,
  idleTimeout: 300000,      // 5 minutes
  maxLifetime: 1800000,     // 30 minutes
  checkoutTimeout: 60000,   // 1 minute
  healthCheckInterval: 60000, // 1 minute
  autoWarmup: true,
  autoKeepAlive: true,
  keepAliveInterval: 30000, // 30 seconds
  defaultConfig: {
    engine: 'chromium',
    headless: true,
    viewportWidth: 1920,
    viewportHeight: 1080,
  },
};

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  engine: 'chromium',
  headless: true,
  viewportWidth: 1920,
  viewportHeight: 1080,
  timeout: 30000,
  maxPages: 100,
};
