/**
 * Tenant and user types for Bentham
 */

/**
 * User roles in the system
 */
export type Role = 'admin' | 'operator' | 'viewer' | 'api_only';

/**
 * Tenant status
 */
export type TenantStatus = 'active' | 'suspended' | 'pending';

/**
 * User in the system
 */
export interface User {
  /** Unique user identifier */
  id: string;
  /** Tenant this user belongs to */
  tenantId: string;
  /** User email */
  email: string;
  /** User display name */
  name: string;
  /** User role */
  role: Role;
  /** Whether user is active */
  active: boolean;
  /** When user was created */
  createdAt: Date;
  /** When user last logged in */
  lastLoginAt?: Date;
}

/**
 * Tenant quota limits
 */
export interface TenantQuota {
  /** Maximum concurrent studies */
  maxConcurrentStudies: number;
  /** Maximum cells per study */
  maxCellsPerStudy: number;
  /** Maximum monthly budget in USD */
  maxMonthlyBudget: number;
  /** Maximum storage in GB */
  maxStorageGB: number;
  /** Allowed surfaces */
  allowedSurfaces: string[];
  /** Allowed locations */
  allowedLocations: string[];
}

/**
 * Tenant notification preferences
 */
export interface TenantNotificationPrefs {
  /** Email addresses for notifications */
  emailAddresses: string[];
  /** Slack webhook URL */
  slackWebhookUrl?: string;
  /** Webhook URL for study events */
  webhookUrl?: string;
  /** Whether to notify on study start */
  notifyOnStart: boolean;
  /** Whether to notify on study complete */
  notifyOnComplete: boolean;
  /** Whether to notify on study failure */
  notifyOnFailure: boolean;
  /** Whether to notify when at risk */
  notifyOnAtRisk: boolean;
}

/**
 * Tenant in the system
 */
export interface Tenant {
  /** Unique tenant identifier */
  id: string;
  /** Tenant name */
  name: string;
  /** Tenant slug (URL-safe identifier) */
  slug: string;
  /** Tenant status */
  status: TenantStatus;
  /** Quota limits */
  quota: TenantQuota;
  /** Notification preferences */
  notifications: TenantNotificationPrefs;
  /** When tenant was created */
  createdAt: Date;
  /** When tenant was last updated */
  updatedAt: Date;
}

/**
 * API key for tenant authentication
 */
export interface ApiKey {
  /** Unique key identifier */
  id: string;
  /** Tenant this key belongs to */
  tenantId: string;
  /** Key name/description */
  name: string;
  /** The actual key (hashed in storage) */
  keyHash: string;
  /** Key prefix for identification */
  keyPrefix: string;
  /** Permissions granted */
  permissions: ApiKeyPermission[];
  /** Whether key is active */
  active: boolean;
  /** When key was created */
  createdAt: Date;
  /** When key expires (optional) */
  expiresAt?: Date;
  /** When key was last used */
  lastUsedAt?: Date;
}

/**
 * API key permissions
 */
export type ApiKeyPermission =
  | 'studies:read'
  | 'studies:create'
  | 'studies:cancel'
  | 'results:read'
  | 'results:download'
  | 'billing:read';

/**
 * Create default quota for new tenants
 */
export function createDefaultQuota(): TenantQuota {
  return {
    maxConcurrentStudies: 5,
    maxCellsPerStudy: 10000,
    maxMonthlyBudget: 5000,
    maxStorageGB: 100,
    allowedSurfaces: ['openai-api', 'anthropic-api', 'chatgpt-web', 'gemini-web', 'perplexity-web'],
    allowedLocations: ['us-national', 'us-nyc', 'us-la', 'uk-lon'],
  };
}

/**
 * Create default notification preferences
 */
export function createDefaultNotificationPrefs(): TenantNotificationPrefs {
  return {
    emailAddresses: [],
    notifyOnStart: false,
    notifyOnComplete: true,
    notifyOnFailure: true,
    notifyOnAtRisk: true,
  };
}
