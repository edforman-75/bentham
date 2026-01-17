/**
 * In-Memory Credential Provider
 *
 * Stores credentials in memory. Useful for testing and development.
 * Note: Credentials are lost when the process ends.
 */

import type { SurfaceId } from '@bentham/core';
import type {
  Credential,
  CredentialProvider,
  CredentialType,
} from '../types.js';

/**
 * In-memory credential provider configuration
 */
export interface MemoryProviderConfig {
  /** Initial credentials to load */
  initialCredentials?: Credential[];
}

/**
 * In-memory credential provider
 */
export class MemoryCredentialProvider implements CredentialProvider {
  readonly name = 'memory';
  private credentials: Map<string, Credential> = new Map();

  constructor(config: MemoryProviderConfig = {}) {
    if (config.initialCredentials) {
      for (const cred of config.initialCredentials) {
        this.credentials.set(cred.id, cred);
      }
    }
  }

  async get(id: string): Promise<Credential | null> {
    return this.credentials.get(id) ?? null;
  }

  async getBySurface(surfaceId: SurfaceId): Promise<Credential[]> {
    const results: Credential[] = [];
    for (const cred of this.credentials.values()) {
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

  async store(credential: Credential): Promise<void> {
    this.credentials.set(credential.id, credential);
  }

  async update(id: string, updates: Partial<Credential>): Promise<void> {
    const existing = this.credentials.get(id);
    if (!existing) {
      throw new Error(`Credential not found: ${id}`);
    }
    this.credentials.set(id, { ...existing, ...updates } as Credential);
  }

  async delete(id: string): Promise<void> {
    this.credentials.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.credentials.has(id);
  }

  async list(): Promise<string[]> {
    return Array.from(this.credentials.keys());
  }

  async listByType(type: CredentialType): Promise<Credential[]> {
    const results: Credential[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.type === type) {
        results.push(cred);
      }
    }
    return results;
  }

  /**
   * Clear all credentials (useful for testing)
   */
  clear(): void {
    this.credentials.clear();
  }

  /**
   * Get total credential count
   */
  count(): number {
    return this.credentials.size;
  }
}

/**
 * Create an in-memory credential provider
 */
export function createMemoryProvider(config?: MemoryProviderConfig): MemoryCredentialProvider {
  return new MemoryCredentialProvider(config);
}
