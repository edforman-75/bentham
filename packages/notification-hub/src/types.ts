/**
 * Notification Hub Types
 *
 * Types for notification and webhook delivery.
 */

/**
 * Notification channel types
 */
export type NotificationChannel = 'webhook' | 'email' | 'slack' | 'internal';

/**
 * Notification priority levels
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Notification event types
 */
export type NotificationEventType =
  | 'study.created'
  | 'study.started'
  | 'study.completed'
  | 'study.failed'
  | 'study.paused'
  | 'study.resumed'
  | 'study.cancelled'
  | 'cell.completed'
  | 'cell.failed'
  | 'cell.retrying'
  | 'batch.completed'
  | 'cost.threshold'
  | 'error.critical'
  | 'error.recoverable'
  | 'system.alert';

/**
 * Delivery status
 */
export type DeliveryStatus = 'pending' | 'sending' | 'delivered' | 'failed' | 'retrying';

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Unique ID for this webhook */
  id: string;
  /** Webhook URL */
  url: string;
  /** HTTP method (default: POST) */
  method?: 'POST' | 'PUT' | 'PATCH';
  /** Secret for HMAC signature */
  secret?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Events to subscribe to */
  events: NotificationEventType[];
  /** Whether the webhook is active */
  active: boolean;
  /** Retry configuration */
  retry?: RetryConfig;
}

/**
 * Email configuration
 */
export interface EmailConfig {
  /** Unique ID */
  id: string;
  /** Recipient email addresses */
  to: string[];
  /** CC addresses */
  cc?: string[];
  /** Events to subscribe to */
  events: NotificationEventType[];
  /** Whether notifications are active */
  active: boolean;
}

/**
 * Slack configuration
 */
export interface SlackConfig {
  /** Unique ID */
  id: string;
  /** Webhook URL for Slack */
  webhookUrl: string;
  /** Channel name or ID */
  channel?: string;
  /** Events to subscribe to */
  events: NotificationEventType[];
  /** Whether notifications are active */
  active: boolean;
}

/**
 * Retry configuration for deliveries
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelay: number;
  /** Maximum delay in ms */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * A notification to be sent
 */
export interface Notification {
  /** Unique notification ID */
  id: string;
  /** Event type */
  eventType: NotificationEventType;
  /** Priority */
  priority: NotificationPriority;
  /** Tenant ID */
  tenantId: string;
  /** Study ID (if applicable) */
  studyId?: string;
  /** Notification title */
  title: string;
  /** Notification message */
  message: string;
  /** Structured data payload */
  data: Record<string, unknown>;
  /** Created timestamp */
  createdAt: Date;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a notification
 */
export interface NotificationInput {
  /** Event type */
  eventType: NotificationEventType;
  /** Priority (default: normal) */
  priority?: NotificationPriority;
  /** Tenant ID */
  tenantId: string;
  /** Study ID (if applicable) */
  studyId?: string;
  /** Notification title */
  title: string;
  /** Notification message */
  message: string;
  /** Structured data payload */
  data?: Record<string, unknown>;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delivery attempt record
 */
export interface DeliveryAttempt {
  /** Attempt number */
  attempt: number;
  /** Timestamp */
  timestamp: Date;
  /** Status */
  status: 'success' | 'failed';
  /** HTTP status code (for webhooks) */
  statusCode?: number;
  /** Response body (truncated) */
  responseBody?: string;
  /** Error message if failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Delivery record for a notification
 */
export interface DeliveryRecord {
  /** Unique delivery ID */
  id: string;
  /** Notification ID */
  notificationId: string;
  /** Channel type */
  channel: NotificationChannel;
  /** Channel config ID (webhook ID, email config ID, etc.) */
  channelConfigId: string;
  /** Target (URL for webhook, email for email, etc.) */
  target: string;
  /** Current status */
  status: DeliveryStatus;
  /** Delivery attempts */
  attempts: DeliveryAttempt[];
  /** Created timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
  /** Next retry time (if retrying) */
  nextRetryAt?: Date;
}

/**
 * Subscription for a tenant
 */
export interface NotificationSubscription {
  /** Tenant ID */
  tenantId: string;
  /** Webhooks */
  webhooks: WebhookConfig[];
  /** Email configs */
  emails: EmailConfig[];
  /** Slack configs */
  slacks: SlackConfig[];
}

/**
 * Notification hub configuration
 */
export interface NotificationHubConfig {
  /** Default retry configuration */
  defaultRetry?: RetryConfig;
  /** Maximum concurrent deliveries */
  maxConcurrent?: number;
  /** Delivery timeout in ms */
  deliveryTimeout?: number;
  /** Whether to log delivery attempts */
  logDeliveries?: boolean;
}

/**
 * Notification hub statistics
 */
export interface NotificationHubStats {
  /** Total notifications sent */
  totalNotifications: number;
  /** Total deliveries attempted */
  totalDeliveries: number;
  /** Successful deliveries */
  successfulDeliveries: number;
  /** Failed deliveries */
  failedDeliveries: number;
  /** Pending deliveries */
  pendingDeliveries: number;
  /** By channel */
  byChannel: Record<NotificationChannel, {
    total: number;
    success: number;
    failed: number;
  }>;
  /** By event type */
  byEventType: Record<string, number>;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelay: 1000,     // 1 second
  maxDelay: 300000,       // 5 minutes
  backoffMultiplier: 2,
};

/**
 * Default hub configuration
 */
export const DEFAULT_HUB_CONFIG: Required<NotificationHubConfig> = {
  defaultRetry: DEFAULT_RETRY_CONFIG,
  maxConcurrent: 10,
  deliveryTimeout: 30000, // 30 seconds
  logDeliveries: true,
};
