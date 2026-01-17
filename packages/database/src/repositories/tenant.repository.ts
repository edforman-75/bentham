/**
 * Tenant Repository
 *
 * Data access layer for tenant-related operations.
 */

import { prisma } from '../client.js';
import type { Tenant, User, ApiKey, TenantStatus, UserRole } from '@prisma/client';

// ============================================================================
// Tenant Operations
// ============================================================================

/**
 * Create a new tenant
 */
export async function createTenant(data: {
  name: string;
  slug: string;
  quota?: object;
  notifications?: object;
}): Promise<Tenant> {
  return prisma.tenant.create({
    data: {
      name: data.name,
      slug: data.slug,
      quota: data.quota ?? {},
      notifications: data.notifications ?? {},
    },
  });
}

/**
 * Find tenant by ID
 */
export async function findTenantById(id: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({
    where: { id },
  });
}

/**
 * Find tenant by slug
 */
export async function findTenantBySlug(slug: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({
    where: { slug },
  });
}

/**
 * Update tenant
 */
export async function updateTenant(
  id: string,
  data: {
    name?: string;
    status?: TenantStatus;
    quota?: object;
    notifications?: object;
  }
): Promise<Tenant> {
  return prisma.tenant.update({
    where: { id },
    data,
  });
}

/**
 * List all tenants
 */
export async function listTenants(options?: {
  status?: TenantStatus;
  limit?: number;
  offset?: number;
}): Promise<{ tenants: Tenant[]; total: number }> {
  const where = options?.status ? { status: options.status } : {};

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tenant.count({ where }),
  ]);

  return { tenants, total };
}

// ============================================================================
// User Operations
// ============================================================================

/**
 * Create a new user
 */
export async function createUser(data: {
  tenantId: string;
  email: string;
  name: string;
  role?: UserRole;
}): Promise<User> {
  return prisma.user.create({
    data: {
      tenantId: data.tenantId,
      email: data.email,
      name: data.name,
      role: data.role ?? 'VIEWER',
    },
  });
}

/**
 * Find user by ID
 */
export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

/**
 * Find user by email within a tenant
 */
export async function findUserByEmail(
  tenantId: string,
  email: string
): Promise<User | null> {
  return prisma.user.findUnique({
    where: {
      tenantId_email: { tenantId, email },
    },
  });
}

/**
 * Update user
 */
export async function updateUser(
  id: string,
  data: {
    name?: string;
    role?: UserRole;
    active?: boolean;
    lastLoginAt?: Date;
  }
): Promise<User> {
  return prisma.user.update({
    where: { id },
    data,
  });
}

/**
 * List users for a tenant
 */
export async function listTenantUsers(
  tenantId: string,
  options?: {
    role?: UserRole;
    active?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ users: User[]; total: number }> {
  const where = {
    tenantId,
    ...(options?.role && { role: options.role }),
    ...(options?.active !== undefined && { active: options.active }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
}

// ============================================================================
// API Key Operations
// ============================================================================

/**
 * Create a new API key
 */
export async function createApiKey(data: {
  tenantId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions?: string[];
  expiresAt?: Date;
}): Promise<ApiKey> {
  return prisma.apiKey.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      permissions: data.permissions ?? [],
      expiresAt: data.expiresAt,
    },
  });
}

/**
 * Find API key by hash
 */
export async function findApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  return prisma.apiKey.findUnique({
    where: { keyHash },
  });
}

/**
 * Find API keys by prefix (for lookup)
 */
export async function findApiKeysByPrefix(keyPrefix: string): Promise<ApiKey[]> {
  return prisma.apiKey.findMany({
    where: { keyPrefix },
  });
}

/**
 * Update API key last used timestamp
 */
export async function touchApiKey(id: string): Promise<void> {
  await prisma.apiKey.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}

/**
 * Revoke API key
 */
export async function revokeApiKey(id: string): Promise<ApiKey> {
  return prisma.apiKey.update({
    where: { id },
    data: { active: false },
  });
}

/**
 * List API keys for a tenant
 */
export async function listTenantApiKeys(
  tenantId: string,
  options?: {
    active?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ apiKeys: ApiKey[]; total: number }> {
  const where = {
    tenantId,
    ...(options?.active !== undefined && { active: options.active }),
  };

  const [apiKeys, total] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.apiKey.count({ where }),
  ]);

  return { apiKeys, total };
}
