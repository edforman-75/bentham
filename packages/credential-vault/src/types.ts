/**
 * Credential Vault Types
 *
 * Types for secure credential storage, retrieval, and rotation.
 */

import type { SurfaceId } from '@bentham/core';

// ============================================
// Credential Types
// ============================================

/**
 * Types of credentials supported
 */
export type CredentialType =
  | 'api_key'           // Simple API key (OpenAI, Anthropic, etc.)
  | 'oauth_token'       // OAuth access/refresh token pair
  | 'session_cookie'    // Web session cookies
  | 'username_password' // Login credentials
  | 'bearer_token'      // Bearer token for API auth
  | 'custom';           // Custom credential format

/**
 * Base credential interface
 */
export interface BaseCredential {
  /** Unique credential identifier */
  id: string;
  /** Credential type */
  type: CredentialType;
  /** Surface this credential is for */
  surfaceId: SurfaceId;
  /** Human-readable name/label */
  name?: string;
  /** When the credential was created */
  createdAt: Date;
  /** When the credential expires (if applicable) */
  expiresAt?: Date;
  /** Whether the credential is currently active */
  isActive: boolean;
  /** Tags for organizing credentials */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * API Key credential
 */
export interface ApiKeyCredential extends BaseCredential {
  type: 'api_key';
  /** The API key value */
  apiKey: string;
  /** Optional organization/project ID */
  organizationId?: string;
  /** Optional base URL override */
  baseUrl?: string;
}

/**
 * OAuth token credential
 */
export interface OAuthCredential extends BaseCredential {
  type: 'oauth_token';
  /** Access token */
  accessToken: string;
  /** Refresh token (if available) */
  refreshToken?: string;
  /** Token type (usually 'Bearer') */
  tokenType: string;
  /** Scopes granted */
  scopes?: string[];
}

/**
 * Session cookie credential (for web surfaces)
 */
export interface SessionCookieCredential extends BaseCredential {
  type: 'session_cookie';
  /** Cookie values */
  cookies: Cookie[];
  /** User agent to use with these cookies */
  userAgent?: string;
  /** Associated login credentials for refresh */
  loginCredentialId?: string;
}

/**
 * Cookie structure
 */
export interface Cookie {
  /** Cookie name */
  name: string;
  /** Cookie value */
  value: string;
  /** Domain the cookie applies to */
  domain: string;
  /** Path the cookie applies to */
  path?: string;
  /** Whether cookie is secure-only */
  secure?: boolean;
  /** Whether cookie is httpOnly */
  httpOnly?: boolean;
  /** SameSite policy */
  sameSite?: 'Strict' | 'Lax' | 'None';
  /** Expiration timestamp */
  expires?: number;
}

/**
 * Username/password credential (for login-based auth)
 */
export interface UsernamePasswordCredential extends BaseCredential {
  type: 'username_password';
  /** Username or email */
  username: string;
  /** Password (encrypted at rest) */
  password: string;
  /** Optional 2FA secret for TOTP */
  totpSecret?: string;
  /** Optional recovery codes */
  recoveryCodes?: string[];
}

/**
 * Bearer token credential
 */
export interface BearerTokenCredential extends BaseCredential {
  type: 'bearer_token';
  /** The bearer token */
  token: string;
  /** Token prefix (default: 'Bearer') */
  prefix?: string;
}

/**
 * Custom credential (flexible format)
 */
export interface CustomCredential extends BaseCredential {
  type: 'custom';
  /** Custom data - structure depends on surface requirements */
  data: Record<string, unknown>;
}

/**
 * Union of all credential types
 */
export type Credential =
  | ApiKeyCredential
  | OAuthCredential
  | SessionCookieCredential
  | UsernamePasswordCredential
  | BearerTokenCredential
  | CustomCredential;

// ============================================
// Credential Provider Types
// ============================================

/**
 * Credential provider interface
 */
export interface CredentialProvider {
  /** Provider name */
  readonly name: string;

  /** Get a credential by ID */
  get(id: string): Promise<Credential | null>;

  /** Get all credentials for a surface */
  getBySurface(surfaceId: SurfaceId): Promise<Credential[]>;

  /** Get active credentials for a surface */
  getActiveBySurface(surfaceId: SurfaceId): Promise<Credential[]>;

  /** Store a credential */
  store(credential: Credential): Promise<void>;

  /** Update a credential */
  update(id: string, updates: Partial<Credential>): Promise<void>;

  /** Delete a credential */
  delete(id: string): Promise<void>;

  /** Check if a credential exists */
  exists(id: string): Promise<boolean>;

  /** List all credential IDs */
  list(): Promise<string[]>;

  /** List credentials by type */
  listByType(type: CredentialType): Promise<Credential[]>;
}

/**
 * Credential provider configuration
 */
export interface CredentialProviderConfig {
  /** Provider-specific options */
  options?: Record<string, unknown>;
}

// ============================================
// Rotation Types
// ============================================

/**
 * Rotation strategy
 */
export type RotationStrategy =
  | 'round_robin'      // Cycle through credentials in order
  | 'random'           // Random selection
  | 'least_used'       // Use the credential with fewest recent uses
  | 'least_errors'     // Use the credential with fewest recent errors
  | 'weighted';        // Weighted random based on priority

/**
 * Credential pool configuration
 */
export interface CredentialPoolConfig {
  /** Surface to manage credentials for */
  surfaceId: SurfaceId;
  /** Rotation strategy */
  strategy: RotationStrategy;
  /** Minimum number of active credentials required */
  minActiveCredentials?: number;
  /** Cool-down period after an error (ms) */
  errorCooldownMs?: number;
  /** Maximum errors before disabling a credential */
  maxErrors?: number;
  /** Time window for error counting (ms) */
  errorWindowMs?: number;
}

/**
 * Credential usage tracking
 */
export interface CredentialUsage {
  /** Credential ID */
  credentialId: string;
  /** Total number of uses */
  totalUses: number;
  /** Number of successful uses */
  successfulUses: number;
  /** Number of failed uses */
  failedUses: number;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Last error timestamp */
  lastErrorAt?: Date;
  /** Recent error count (within window) */
  recentErrors: number;
  /** Whether credential is in cooldown */
  inCooldown: boolean;
  /** Cooldown expires at */
  cooldownExpiresAt?: Date;
}

/**
 * Credential pool state
 */
export interface CredentialPoolState {
  /** Surface ID */
  surfaceId: SurfaceId;
  /** Active credentials */
  credentials: Credential[];
  /** Usage tracking */
  usage: Map<string, CredentialUsage>;
  /** Current index (for round robin) */
  currentIndex: number;
  /** Pool health status */
  health: PoolHealth;
}

/**
 * Pool health status
 */
export interface PoolHealth {
  /** Number of active credentials */
  activeCredentials: number;
  /** Number of credentials in cooldown */
  inCooldown: number;
  /** Number of disabled credentials */
  disabled: number;
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'critical';
  /** Health message */
  message?: string;
}

// ============================================
// Encryption Types
// ============================================

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  /** Encryption algorithm */
  algorithm: 'aes-256-gcm' | 'aes-256-cbc';
  /** Key derivation function */
  kdf: 'pbkdf2' | 'scrypt' | 'argon2';
  /** Number of iterations for key derivation */
  iterations?: number;
  /** Salt length in bytes */
  saltLength?: number;
}

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  /** Encrypted ciphertext (base64) */
  ciphertext: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Salt used for key derivation (base64) */
  salt: string;
  /** Authentication tag for GCM (base64) */
  authTag?: string;
  /** Algorithm used */
  algorithm: string;
  /** KDF used */
  kdf: string;
  /** Version of encryption format */
  version: number;
}

// ============================================
// Event Types
// ============================================

/**
 * Credential events
 */
export type CredentialEvent =
  | { type: 'credential_added'; credential: Credential }
  | { type: 'credential_updated'; credentialId: string; updates: Partial<Credential> }
  | { type: 'credential_deleted'; credentialId: string }
  | { type: 'credential_used'; credentialId: string; success: boolean }
  | { type: 'credential_expired'; credential: Credential }
  | { type: 'credential_disabled'; credentialId: string; reason: string }
  | { type: 'credential_enabled'; credentialId: string }
  | { type: 'pool_health_changed'; surfaceId: SurfaceId; health: PoolHealth };

/**
 * Event listener
 */
export type CredentialEventListener = (event: CredentialEvent) => void;
