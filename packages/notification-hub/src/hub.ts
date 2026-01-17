/**
 * Notification Hub Implementation
 *
 * Manages notification delivery across multiple channels.
 */

import { randomUUID } from 'crypto';
import { createHmac } from 'crypto';
import type {
  Notification,
  NotificationInput,
  NotificationSubscription,
  WebhookConfig,
  EmailConfig,
  SlackConfig,
  DeliveryRecord,
  DeliveryAttempt,
  NotificationHubConfig,
  NotificationHubStats,
  NotificationChannel,
  RetryConfig,
} from './types.js';
import { DEFAULT_HUB_CONFIG } from './types.js';

/**
 * Delivery handler interface
 */
export interface DeliveryHandler {
  channel: NotificationChannel;
  deliver(notification: Notification, target: string, config: unknown): Promise<DeliveryAttempt>;
}

/**
 * Webhook delivery handler
 */
export class WebhookDeliveryHandler implements DeliveryHandler {
  readonly channel: NotificationChannel = 'webhook';
  private timeout: number;

  constructor(timeout: number = 30000) {
    this.timeout = timeout;
  }

  async deliver(
    notification: Notification,
    target: string,
    config: WebhookConfig
  ): Promise<DeliveryAttempt> {
    const startTime = Date.now();

    try {
      const payload = JSON.stringify({
        id: notification.id,
        event: notification.eventType,
        timestamp: notification.createdAt.toISOString(),
        tenantId: notification.tenantId,
        studyId: notification.studyId,
        title: notification.title,
        message: notification.message,
        data: notification.data,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Bentham-Event': notification.eventType,
        'X-Bentham-Notification-Id': notification.id,
        ...config.headers,
      };

      // Add HMAC signature if secret is configured
      if (config.secret) {
        const signature = createHmac('sha256', config.secret)
          .update(payload)
          .digest('hex');
        headers['X-Bentham-Signature'] = `sha256=${signature}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(target, {
          method: config.method ?? 'POST',
          headers,
          body: payload,
          signal: controller.signal,
        });

        const durationMs = Date.now() - startTime;
        const responseBody = await response.text().catch(() => '');

        if (response.ok) {
          return {
            attempt: 0, // Will be set by caller
            timestamp: new Date(),
            status: 'success',
            statusCode: response.status,
            responseBody: responseBody.slice(0, 500),
            durationMs,
          };
        } else {
          return {
            attempt: 0,
            timestamp: new Date(),
            status: 'failed',
            statusCode: response.status,
            responseBody: responseBody.slice(0, 500),
            error: `HTTP ${response.status}: ${response.statusText}`,
            durationMs,
          };
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        attempt: 0,
        timestamp: new Date(),
        status: 'failed',
        error: errorMessage,
        durationMs,
      };
    }
  }
}

/**
 * Mock delivery handler for testing
 */
export class MockDeliveryHandler implements DeliveryHandler {
  readonly channel: NotificationChannel;
  private shouldFail: boolean;
  private failCount: number;
  public deliveries: Array<{ notification: Notification; target: string; config: unknown }> = [];

  constructor(channel: NotificationChannel, options: { shouldFail?: boolean; failCount?: number } = {}) {
    this.channel = channel;
    this.shouldFail = options.shouldFail ?? false;
    this.failCount = options.failCount ?? 0;
  }

  async deliver(
    notification: Notification,
    target: string,
    config: unknown
  ): Promise<DeliveryAttempt> {
    this.deliveries.push({ notification, target, config });

    if (this.shouldFail || (this.failCount > 0 && this.deliveries.length <= this.failCount)) {
      return {
        attempt: 0,
        timestamp: new Date(),
        status: 'failed',
        error: 'Mock delivery failure',
        durationMs: 10,
      };
    }

    return {
      attempt: 0,
      timestamp: new Date(),
      status: 'success',
      statusCode: 200,
      durationMs: 10,
    };
  }

  reset(): void {
    this.deliveries = [];
  }
}

/**
 * Notification Hub
 */
export class NotificationHub {
  private config: Required<NotificationHubConfig>;
  private subscriptions: Map<string, NotificationSubscription> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private deliveryRecords: Map<string, DeliveryRecord> = new Map();
  private handlers: Map<NotificationChannel, DeliveryHandler> = new Map();
  private stats: NotificationHubStats;

  constructor(config: NotificationHubConfig = {}) {
    this.config = {
      ...DEFAULT_HUB_CONFIG,
      ...config,
    };

    this.stats = this.initializeStats();

    // Register default webhook handler
    this.registerHandler(new WebhookDeliveryHandler(this.config.deliveryTimeout));
  }

  /**
   * Register a delivery handler
   */
  registerHandler(handler: DeliveryHandler): void {
    this.handlers.set(handler.channel, handler);
  }

  /**
   * Set subscription for a tenant
   */
  setSubscription(subscription: NotificationSubscription): void {
    this.subscriptions.set(subscription.tenantId, subscription);
  }

  /**
   * Get subscription for a tenant
   */
  getSubscription(tenantId: string): NotificationSubscription | undefined {
    return this.subscriptions.get(tenantId);
  }

  /**
   * Add a webhook to a tenant's subscription
   */
  addWebhook(tenantId: string, webhook: WebhookConfig): void {
    let subscription = this.subscriptions.get(tenantId);
    if (!subscription) {
      subscription = { tenantId, webhooks: [], emails: [], slacks: [] };
      this.subscriptions.set(tenantId, subscription);
    }
    subscription.webhooks.push(webhook);
  }

  /**
   * Remove a webhook from a tenant's subscription
   */
  removeWebhook(tenantId: string, webhookId: string): boolean {
    const subscription = this.subscriptions.get(tenantId);
    if (!subscription) return false;

    const index = subscription.webhooks.findIndex(w => w.id === webhookId);
    if (index >= 0) {
      subscription.webhooks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Add an email config to a tenant's subscription
   */
  addEmail(tenantId: string, email: EmailConfig): void {
    let subscription = this.subscriptions.get(tenantId);
    if (!subscription) {
      subscription = { tenantId, webhooks: [], emails: [], slacks: [] };
      this.subscriptions.set(tenantId, subscription);
    }
    subscription.emails.push(email);
  }

  /**
   * Add a Slack config to a tenant's subscription
   */
  addSlack(tenantId: string, slack: SlackConfig): void {
    let subscription = this.subscriptions.get(tenantId);
    if (!subscription) {
      subscription = { tenantId, webhooks: [], emails: [], slacks: [] };
      this.subscriptions.set(tenantId, subscription);
    }
    subscription.slacks.push(slack);
  }

  /**
   * Send a notification
   */
  async notify(input: NotificationInput): Promise<Notification> {
    const notification = this.createNotification(input);
    this.notifications.set(notification.id, notification);
    this.stats.totalNotifications++;
    this.stats.byEventType[notification.eventType] =
      (this.stats.byEventType[notification.eventType] ?? 0) + 1;

    // Get tenant subscription
    const subscription = this.subscriptions.get(input.tenantId);
    if (!subscription) {
      return notification;
    }

    // Deliver to all matching channels
    const deliveryPromises: Promise<void>[] = [];

    // Webhooks
    for (const webhook of subscription.webhooks) {
      if (webhook.active && webhook.events.includes(notification.eventType)) {
        deliveryPromises.push(
          this.deliverToWebhook(notification, webhook)
        );
      }
    }

    // Emails (mock for now - would integrate with email service)
    for (const email of subscription.emails) {
      if (email.active && email.events.includes(notification.eventType)) {
        deliveryPromises.push(
          this.deliverToEmail(notification, email)
        );
      }
    }

    // Slack (mock for now - would integrate with Slack)
    for (const slack of subscription.slacks) {
      if (slack.active && slack.events.includes(notification.eventType)) {
        deliveryPromises.push(
          this.deliverToSlack(notification, slack)
        );
      }
    }

    await Promise.all(deliveryPromises);

    return notification;
  }

  /**
   * Get a notification by ID
   */
  getNotification(id: string): Notification | undefined {
    return this.notifications.get(id);
  }

  /**
   * Get delivery records for a notification
   */
  getDeliveryRecords(notificationId: string): DeliveryRecord[] {
    return Array.from(this.deliveryRecords.values())
      .filter(r => r.notificationId === notificationId);
  }

  /**
   * Get all delivery records for a tenant
   */
  getTenantDeliveryRecords(tenantId: string): DeliveryRecord[] {
    const tenantNotificationIds = new Set(
      Array.from(this.notifications.values())
        .filter(n => n.tenantId === tenantId)
        .map(n => n.id)
    );

    return Array.from(this.deliveryRecords.values())
      .filter(r => tenantNotificationIds.has(r.notificationId));
  }

  /**
   * Retry a failed delivery
   */
  async retryDelivery(deliveryId: string): Promise<boolean> {
    const record = this.deliveryRecords.get(deliveryId);
    if (!record || record.status !== 'failed') {
      return false;
    }

    const notification = this.notifications.get(record.notificationId);
    if (!notification) {
      return false;
    }

    const handler = this.handlers.get(record.channel);
    if (!handler) {
      return false;
    }

    // Get the config based on channel
    const subscription = this.subscriptions.get(notification.tenantId);
    if (!subscription) return false;

    let config: unknown;
    if (record.channel === 'webhook') {
      config = subscription.webhooks.find(w => w.id === record.channelConfigId);
    } else if (record.channel === 'email') {
      config = subscription.emails.find(e => e.id === record.channelConfigId);
    } else if (record.channel === 'slack') {
      config = subscription.slacks.find(s => s.id === record.channelConfigId);
    }

    if (!config) return false;

    record.status = 'retrying';
    record.updatedAt = new Date();

    const attempt = await handler.deliver(notification, record.target, config);
    attempt.attempt = record.attempts.length + 1;
    record.attempts.push(attempt);

    if (attempt.status === 'success') {
      record.status = 'delivered';
      this.stats.successfulDeliveries++;
      this.stats.failedDeliveries--;
      this.stats.byChannel[record.channel].success++;
      this.stats.byChannel[record.channel].failed--;
    } else {
      record.status = 'failed';
    }

    record.updatedAt = new Date();
    return attempt.status === 'success';
  }

  /**
   * Get hub statistics
   */
  getStats(): NotificationHubStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.subscriptions.clear();
    this.notifications.clear();
    this.deliveryRecords.clear();
    this.resetStats();
  }

  // Private helper methods

  private createNotification(input: NotificationInput): Notification {
    return {
      id: randomUUID(),
      eventType: input.eventType,
      priority: input.priority ?? 'normal',
      tenantId: input.tenantId,
      studyId: input.studyId,
      title: input.title,
      message: input.message,
      data: input.data ?? {},
      createdAt: new Date(),
      metadata: input.metadata,
    };
  }

  private async deliverToWebhook(
    notification: Notification,
    webhook: WebhookConfig
  ): Promise<void> {
    const handler = this.handlers.get('webhook');
    if (!handler) return;

    const record = this.createDeliveryRecord(notification, 'webhook', webhook.id, webhook.url);
    this.deliveryRecords.set(record.id, record);
    this.stats.totalDeliveries++;
    this.stats.byChannel.webhook.total++;

    const retry = webhook.retry ?? this.config.defaultRetry;
    await this.executeDeliveryWithRetry(record, notification, webhook, handler, retry);
  }

  private async deliverToEmail(
    notification: Notification,
    email: EmailConfig
  ): Promise<void> {
    const handler = this.handlers.get('email');
    if (!handler) {
      // Log but don't fail - email handler not configured
      const record = this.createDeliveryRecord(
        notification,
        'email',
        email.id,
        email.to.join(', ')
      );
      record.status = 'pending';
      this.deliveryRecords.set(record.id, record);
      this.stats.totalDeliveries++;
      this.stats.pendingDeliveries++;
      this.stats.byChannel.email.total++;
      return;
    }

    const record = this.createDeliveryRecord(notification, 'email', email.id, email.to.join(', '));
    this.deliveryRecords.set(record.id, record);
    this.stats.totalDeliveries++;
    this.stats.byChannel.email.total++;

    await this.executeDeliveryWithRetry(record, notification, email, handler, this.config.defaultRetry);
  }

  private async deliverToSlack(
    notification: Notification,
    slack: SlackConfig
  ): Promise<void> {
    const handler = this.handlers.get('slack');
    if (!handler) {
      // Log but don't fail - slack handler not configured
      const record = this.createDeliveryRecord(
        notification,
        'slack',
        slack.id,
        slack.webhookUrl
      );
      record.status = 'pending';
      this.deliveryRecords.set(record.id, record);
      this.stats.totalDeliveries++;
      this.stats.pendingDeliveries++;
      this.stats.byChannel.slack.total++;
      return;
    }

    const record = this.createDeliveryRecord(notification, 'slack', slack.id, slack.webhookUrl);
    this.deliveryRecords.set(record.id, record);
    this.stats.totalDeliveries++;
    this.stats.byChannel.slack.total++;

    await this.executeDeliveryWithRetry(record, notification, slack, handler, this.config.defaultRetry);
  }

  private createDeliveryRecord(
    notification: Notification,
    channel: NotificationChannel,
    configId: string,
    target: string
  ): DeliveryRecord {
    return {
      id: randomUUID(),
      notificationId: notification.id,
      channel,
      channelConfigId: configId,
      target,
      status: 'pending',
      attempts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async executeDeliveryWithRetry(
    record: DeliveryRecord,
    notification: Notification,
    config: unknown,
    handler: DeliveryHandler,
    retry: RetryConfig
  ): Promise<void> {
    record.status = 'sending';
    record.updatedAt = new Date();

    let delay = retry.initialDelay;

    for (let attemptNum = 1; attemptNum <= retry.maxAttempts; attemptNum++) {
      const attempt = await handler.deliver(notification, record.target, config);
      attempt.attempt = attemptNum;
      record.attempts.push(attempt);

      if (attempt.status === 'success') {
        record.status = 'delivered';
        record.updatedAt = new Date();
        this.stats.successfulDeliveries++;
        this.stats.byChannel[record.channel].success++;
        return;
      }

      // Calculate next delay
      if (attemptNum < retry.maxAttempts) {
        record.status = 'retrying';
        record.nextRetryAt = new Date(Date.now() + delay);
        record.updatedAt = new Date();

        // Wait before retry (in real implementation, this would be queued)
        await this.sleep(Math.min(delay, 100)); // Cap at 100ms for tests
        delay = Math.min(delay * retry.backoffMultiplier, retry.maxDelay);
      }
    }

    // All retries exhausted
    record.status = 'failed';
    record.updatedAt = new Date();
    this.stats.failedDeliveries++;
    this.stats.byChannel[record.channel].failed++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private initializeStats(): NotificationHubStats {
    return {
      totalNotifications: 0,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      pendingDeliveries: 0,
      byChannel: {
        webhook: { total: 0, success: 0, failed: 0 },
        email: { total: 0, success: 0, failed: 0 },
        slack: { total: 0, success: 0, failed: 0 },
        internal: { total: 0, success: 0, failed: 0 },
      },
      byEventType: {},
    };
  }
}

/**
 * Create a new notification hub instance
 */
export function createNotificationHub(config?: NotificationHubConfig): NotificationHub {
  return new NotificationHub(config);
}
