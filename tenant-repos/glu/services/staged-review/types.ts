/**
 * Staged Content Review Types
 *
 * Type definitions for the Staged Review Service.
 * Re-exported from index.ts for convenience.
 */

// Re-export all types from main module
export type {
  ReviewStatus,
  UserRole,
  User,
  ReviewComment,
  ApprovalRecord,
  ContentVersionRecord,
  ReviewItem,
  QueueFilter,
  QueueStats,
  WorkflowConfig,
  ServiceConfig,
} from './index';

// Import content types from highlight-changes
export type { DiffReport, ContentVersion, ChangeHighlight } from '../../scripts/highlight-changes';

// ============================================================================
// Additional API Types
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

/**
 * Webhook event payload
 */
export interface WebhookEvent {
  event:
    | 'item:created'
    | 'item:updated'
    | 'item:status_changed'
    | 'item:comment_added'
    | 'item:approval_submitted'
    | 'item:published'
    | 'item:archived'
    | 'item:deleted';
  timestamp: string;
  item: ReviewItemSummary;
  actor?: UserSummary;
  previousStatus?: string;
  details?: Record<string, any>;
}

/**
 * Minimal item representation for lists/webhooks
 */
export interface ReviewItemSummary {
  id: string;
  url: string;
  title: string;
  status: string;
  priority: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Minimal user representation
 */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

/**
 * Queue dashboard view
 */
export interface QueueDashboard {
  stats: import('./index').QueueStats;
  recentActivity: ActivityLogEntry[];
  overdueItems: ReviewItemSummary[];
  urgentItems: ReviewItemSummary[];
  myItems: {
    authored: number;
    toReview: number;
    toApprove: number;
  };
}

/**
 * Activity log entry
 */
export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: string;
  itemId: string;
  itemTitle: string;
  userId: string;
  userName: string;
  details?: string;
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  emailOnAssignment: boolean;
  emailOnComment: boolean;
  emailOnApproval: boolean;
  emailOnStatusChange: boolean;
  dailyDigest: boolean;
}

/**
 * Search parameters for advanced filtering
 */
export interface SearchParams {
  query?: string;
  filters?: import('./index').QueueFilter;
  sort?: {
    field: 'createdAt' | 'updatedAt' | 'priority' | 'title';
    order: 'asc' | 'desc';
  };
  pagination?: {
    page: number;
    pageSize: number;
  };
}

/**
 * Batch operation result
 */
export interface BatchOperationResult {
  success: string[];
  failed: Array<{
    id: string;
    error: string;
  }>;
}
