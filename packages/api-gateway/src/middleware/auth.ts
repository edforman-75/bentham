/**
 * Authentication Middleware
 *
 * Validates API keys and establishes tenant context.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { RequestContext, ApiKey } from '../types.js';
import { createHash } from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    requestContext: RequestContext;
  }
}

/**
 * API Key store interface
 */
export interface ApiKeyStore {
  getByHash(keyHash: string): Promise<ApiKey | null>;
  updateLastUsed(keyId: string): Promise<void>;
}

/**
 * In-memory API key store for development/testing
 */
export class InMemoryApiKeyStore implements ApiKeyStore {
  private keys: Map<string, ApiKey> = new Map();

  addKey(key: ApiKey): void {
    this.keys.set(key.keyHash, key);
  }

  async getByHash(keyHash: string): Promise<ApiKey | null> {
    return this.keys.get(keyHash) ?? null;
  }

  async updateLastUsed(keyId: string): Promise<void> {
    for (const key of this.keys.values()) {
      if (key.id === keyId) {
        key.lastUsedAt = new Date();
        break;
      }
    }
  }
}

/**
 * Hash an API key for secure storage/lookup
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'btm_' + Buffer.from(bytes).toString('base64url');
}

/**
 * Extract API key from request
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check X-API-Key header
  const apiKeyHeader = request.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Authentication plugin options
 */
export interface AuthPluginOptions {
  keyStore: ApiKeyStore;
  excludePaths?: string[];
}

/**
 * Internal auth plugin implementation
 */
async function authPluginImpl(
  fastify: FastifyInstance,
  options: AuthPluginOptions
): Promise<void> {
  const { keyStore, excludePaths = ['/v1/health', '/health'] } = options;

  fastify.decorateRequest('requestContext', null);

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = generateRequestId();

    // Skip auth for excluded paths (exact match or startsWith for paths ending without /)
    if (excludePaths.some(path => request.url === path || request.url.startsWith(path + '/'))) {
      request.requestContext = {
        tenantId: 'anonymous',
        apiKeyId: 'none',
        requestId,
        timestamp: new Date(),
      };
      return;
    }

    const apiKey = extractApiKey(request);

    if (!apiKey) {
      reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key required',
          requestId,
        },
      });
      return;
    }

    const keyHash = hashApiKey(apiKey);
    const keyRecord = await keyStore.getByHash(keyHash);

    if (!keyRecord) {
      reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key',
          requestId,
        },
      });
      return;
    }

    // Check expiration
    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      reply.status(401).send({
        success: false,
        error: {
          code: 'API_KEY_EXPIRED',
          message: 'API key has expired',
          requestId,
        },
      });
      return;
    }

    // Update last used timestamp (fire and forget)
    keyStore.updateLastUsed(keyRecord.id).catch(() => {
      // Ignore errors
    });

    // Set request context
    request.requestContext = {
      tenantId: keyRecord.tenantId,
      apiKeyId: keyRecord.id,
      requestId,
      timestamp: new Date(),
    };
  });
}

/**
 * Register authentication middleware (wrapped with fastify-plugin to skip encapsulation)
 */
export const authPlugin = fp(authPluginImpl, {
  name: 'auth-plugin',
  fastify: '4.x',
});
