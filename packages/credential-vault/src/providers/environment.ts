/**
 * Environment Variable Credential Provider
 *
 * Reads credentials from environment variables.
 * Useful for development and CI/CD environments.
 *
 * Environment variable naming convention:
 * - BENTHAM_CRED_{SURFACE_ID}_{TYPE}_{KEY}
 *
 * Examples:
 * - BENTHAM_CRED_OPENAI_API_KEY=sk-xxx
 * - BENTHAM_CRED_ANTHROPIC_API_KEY=sk-ant-xxx
 * - BENTHAM_CRED_CHATGPT_SESSION_TOKEN=xxx
 */

import type { SurfaceId } from '@bentham/core';
import type {
  Credential,
  CredentialProvider,
  CredentialType,
  ApiKeyCredential,
  BearerTokenCredential,
  SessionCookieCredential,
  Cookie,
} from '../types.js';

/**
 * Environment provider configuration
 */
export interface EnvironmentProviderConfig {
  /** Prefix for environment variables (default: BENTHAM_CRED) */
  prefix?: string;
  /** Custom environment variable mappings */
  mappings?: EnvironmentMapping[];
  /** Whether to use process.env directly (default: true) */
  useProcessEnv?: boolean;
  /** Custom environment object (for testing) */
  env?: Record<string, string | undefined>;
}

/**
 * Custom environment variable mapping
 */
export interface EnvironmentMapping {
  /** Environment variable name */
  envVar: string;
  /** Surface ID this maps to */
  surfaceId: SurfaceId;
  /** Credential type */
  type: CredentialType;
  /** Field this maps to (e.g., 'apiKey', 'token') */
  field: string;
  /** Credential ID to use */
  credentialId?: string;
}

/**
 * Default environment variable mappings for common surfaces
 */
const DEFAULT_MAPPINGS: EnvironmentMapping[] = [
  { envVar: 'OPENAI_API_KEY', surfaceId: 'openai-api', type: 'api_key', field: 'apiKey' },
  { envVar: 'ANTHROPIC_API_KEY', surfaceId: 'anthropic-api', type: 'api_key', field: 'apiKey' },
  { envVar: 'GOOGLE_API_KEY', surfaceId: 'google-search', type: 'api_key', field: 'apiKey' },
  { envVar: 'GOOGLE_CSE_ID', surfaceId: 'google-search', type: 'api_key', field: 'organizationId' },
  { envVar: 'PERPLEXITY_API_KEY', surfaceId: 'perplexity-api', type: 'api_key', field: 'apiKey' },
];

/**
 * Environment variable credential provider
 */
export class EnvironmentCredentialProvider implements CredentialProvider {
  readonly name = 'environment';
  private config: Required<EnvironmentProviderConfig>;
  private mappings: EnvironmentMapping[];
  private cache: Map<string, Credential> = new Map();
  private initialized = false;

  constructor(config: EnvironmentProviderConfig = {}) {
    this.config = {
      prefix: config.prefix ?? 'BENTHAM_CRED',
      mappings: config.mappings ?? [],
      useProcessEnv: config.useProcessEnv ?? true,
      env: config.env ?? {},
    };
    this.mappings = [...DEFAULT_MAPPINGS, ...this.config.mappings];
  }

  /**
   * Initialize by reading environment variables
   */
  private initialize(): void {
    if (this.initialized) return;

    const env = this.config.useProcessEnv ? process.env : this.config.env;

    // Process known mappings
    const surfaceCredentials = new Map<SurfaceId, Partial<Credential>>();

    for (const mapping of this.mappings) {
      const value = env[mapping.envVar];
      if (!value) continue;

      const existing = surfaceCredentials.get(mapping.surfaceId) ?? {
        id: `env-${mapping.surfaceId}-${mapping.type}`,
        type: mapping.type,
        surfaceId: mapping.surfaceId,
        createdAt: new Date(),
        isActive: true,
      };

      // Set the field value
      (existing as Record<string, unknown>)[mapping.field] = value;
      surfaceCredentials.set(mapping.surfaceId, existing);
    }

    // Process prefixed environment variables
    const prefix = this.config.prefix + '_';
    for (const [key, value] of Object.entries(env)) {
      if (!key.startsWith(prefix) || !value) continue;

      const parts = key.slice(prefix.length).split('_');
      if (parts.length < 3) continue;

      // Parse: SURFACE_TYPE_FIELD
      const surfaceId = parts[0].toLowerCase().replace(/_/g, '-') as SurfaceId;
      const typeStr = parts[1].toLowerCase();
      const field = parts.slice(2).join('_').toLowerCase();

      const type = this.parseCredentialType(typeStr);
      if (!type) continue;

      const id = `env-${surfaceId}-${type}`;
      const existing = surfaceCredentials.get(surfaceId) ?? {
        id,
        type,
        surfaceId,
        createdAt: new Date(),
        isActive: true,
      };

      (existing as Record<string, unknown>)[this.normalizeField(field)] = value;
      surfaceCredentials.set(surfaceId, existing);
    }

    // Convert to full credentials and cache
    for (const [_surfaceId, partial] of surfaceCredentials) {
      const credential = this.buildCredential(partial);
      if (credential) {
        this.cache.set(credential.id, credential);
      }
    }

    this.initialized = true;
  }

  private parseCredentialType(typeStr: string): CredentialType | null {
    const mapping: Record<string, CredentialType> = {
      'apikey': 'api_key',
      'api_key': 'api_key',
      'api': 'api_key',
      'oauth': 'oauth_token',
      'oauth_token': 'oauth_token',
      'session': 'session_cookie',
      'session_cookie': 'session_cookie',
      'cookie': 'session_cookie',
      'userpass': 'username_password',
      'username_password': 'username_password',
      'login': 'username_password',
      'bearer': 'bearer_token',
      'bearer_token': 'bearer_token',
      'token': 'bearer_token',
    };
    return mapping[typeStr] ?? null;
  }

  private normalizeField(field: string): string {
    // Convert snake_case to camelCase
    return field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private buildCredential(partial: Partial<Credential>): Credential | null {
    if (!partial.id || !partial.type || !partial.surfaceId) return null;

    const base = {
      id: partial.id,
      surfaceId: partial.surfaceId,
      createdAt: partial.createdAt ?? new Date(),
      isActive: partial.isActive ?? true,
    };

    switch (partial.type) {
      case 'api_key': {
        const apiKey = (partial as Partial<ApiKeyCredential>).apiKey;
        if (!apiKey) return null;
        return {
          ...base,
          type: 'api_key',
          apiKey,
          organizationId: (partial as Partial<ApiKeyCredential>).organizationId,
          baseUrl: (partial as Partial<ApiKeyCredential>).baseUrl,
        } as ApiKeyCredential;
      }
      case 'bearer_token': {
        const token = (partial as Partial<BearerTokenCredential>).token;
        if (!token) return null;
        return {
          ...base,
          type: 'bearer_token',
          token,
          prefix: (partial as Partial<BearerTokenCredential>).prefix ?? 'Bearer',
        } as BearerTokenCredential;
      }
      case 'session_cookie': {
        // Parse cookies from JSON if string
        let cookies = (partial as Partial<SessionCookieCredential>).cookies;
        if (typeof cookies === 'string') {
          try {
            cookies = JSON.parse(cookies) as Cookie[];
          } catch {
            return null;
          }
        }
        if (!cookies || !Array.isArray(cookies)) return null;
        return {
          ...base,
          type: 'session_cookie',
          cookies,
          userAgent: (partial as Partial<SessionCookieCredential>).userAgent,
        } as SessionCookieCredential;
      }
      default:
        return null;
    }
  }

  async get(id: string): Promise<Credential | null> {
    this.initialize();
    return this.cache.get(id) ?? null;
  }

  async getBySurface(surfaceId: SurfaceId): Promise<Credential[]> {
    this.initialize();
    const results: Credential[] = [];
    for (const cred of this.cache.values()) {
      if (cred.surfaceId === surfaceId) {
        results.push(cred);
      }
    }
    return results;
  }

  async getActiveBySurface(surfaceId: SurfaceId): Promise<Credential[]> {
    const all = await this.getBySurface(surfaceId);
    const now = new Date();
    return all.filter(cred => {
      if (!cred.isActive) return false;
      if (cred.expiresAt && cred.expiresAt < now) return false;
      return true;
    });
  }

  async store(_credential: Credential): Promise<void> {
    throw new Error('EnvironmentCredentialProvider is read-only');
  }

  async update(_id: string, _updates: Partial<Credential>): Promise<void> {
    throw new Error('EnvironmentCredentialProvider is read-only');
  }

  async delete(_id: string): Promise<void> {
    throw new Error('EnvironmentCredentialProvider is read-only');
  }

  async exists(id: string): Promise<boolean> {
    this.initialize();
    return this.cache.has(id);
  }

  async list(): Promise<string[]> {
    this.initialize();
    return Array.from(this.cache.keys());
  }

  async listByType(type: CredentialType): Promise<Credential[]> {
    this.initialize();
    const results: Credential[] = [];
    for (const cred of this.cache.values()) {
      if (cred.type === type) {
        results.push(cred);
      }
    }
    return results;
  }

  /**
   * Reload credentials from environment
   */
  reload(): void {
    this.cache.clear();
    this.initialized = false;
    this.initialize();
  }
}

/**
 * Create an environment credential provider
 */
export function createEnvironmentProvider(config?: EnvironmentProviderConfig): EnvironmentCredentialProvider {
  return new EnvironmentCredentialProvider(config);
}
