/**
 * API Gateway Types
 */

import type { Manifest, StudyStatus, JobResult } from '@bentham/core';

/**
 * API error response
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

/**
 * API success response wrapper
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Study submission request
 */
export interface CreateStudyRequest {
  manifest: Manifest;
  priority?: 'low' | 'normal' | 'high';
  callbackUrl?: string;
}

/**
 * Study submission response
 */
export interface CreateStudyResponse {
  studyId: string;
  status: StudyStatus;
  estimatedCompletionTime?: Date;
  createdAt: Date;
}

/**
 * Study status response
 */
export interface StudyStatusResponse {
  studyId: string;
  status: StudyStatus;
  progress: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    pendingJobs: number;
    completionPercentage: number;
  };
  surfaces: Array<{
    surfaceId: string;
    completed: number;
    failed: number;
    pending: number;
  }>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedCompletionTime?: Date;
}

/**
 * Study results response
 */
export interface StudyResultsResponse {
  studyId: string;
  status: StudyStatus;
  results: Array<{
    jobId: string;
    queryText: string;
    surfaceId: string;
    locationId: string;
    result: JobResult | null;
    attempts: number;
  }>;
  summary: {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageResponseTime: number;
  };
  completedAt?: Date;
}

/**
 * Study cost response
 */
export interface StudyCostResponse {
  studyId: string;
  costs: {
    total: number;
    currency: string;
    breakdown: {
      apiCalls: number;
      proxyUsage: number;
      storage: number;
      compute: number;
    };
  };
  estimatedFinalCost?: number;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
    orchestrator: 'ok' | 'error';
  };
}

/**
 * Authenticated request context
 */
export interface RequestContext {
  tenantId: string;
  apiKeyId: string;
  requestId: string;
  timestamp: Date;
}

/**
 * API key record
 */
export interface ApiKey {
  id: string;
  tenantId: string;
  keyHash: string;
  name: string;
  permissions: string[];
  rateLimit: number;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Gateway configuration
 */
export interface GatewayConfig {
  port: number;
  host: string;
  trustProxy: boolean;
  cors: {
    enabled: boolean;
    origins: string[];
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    windowMs: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    pretty: boolean;
  };
}

/**
 * Default gateway configuration
 */
export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  port: 3000,
  host: '0.0.0.0',
  trustProxy: true,
  cors: {
    enabled: true,
    origins: ['*'],
  },
  rateLimit: {
    enabled: true,
    max: 100,
    windowMs: 60000, // 1 minute
  },
  logging: {
    level: 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
};
