/**
 * @bentham/notification-hub
 *
 * Notification and webhook delivery for Bentham.
 */

// Types
export type {
  NotificationChannel,
  NotificationPriority,
  NotificationEventType,
  DeliveryStatus,
  WebhookConfig,
  EmailConfig,
  SlackConfig,
  RetryConfig,
  Notification,
  NotificationInput,
  DeliveryAttempt,
  DeliveryRecord,
  NotificationSubscription,
  NotificationHubConfig,
  NotificationHubStats,
} from './types.js';

export { DEFAULT_RETRY_CONFIG, DEFAULT_HUB_CONFIG } from './types.js';

// Hub
export {
  NotificationHub,
  WebhookDeliveryHandler,
  MockDeliveryHandler,
  createNotificationHub,
} from './hub.js';

export type { DeliveryHandler } from './hub.js';
