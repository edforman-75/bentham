/**
 * Notification Hub Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  NotificationHub,
  MockDeliveryHandler,
  createNotificationHub,
} from '../../hub.js';
import type {
  WebhookConfig,
  EmailConfig,
  SlackConfig,
  NotificationInput,
} from '../../types.js';

describe('NotificationHub', () => {
  let hub: NotificationHub;
  let mockWebhookHandler: MockDeliveryHandler;

  beforeEach(() => {
    hub = new NotificationHub();
    mockWebhookHandler = new MockDeliveryHandler('webhook');
    hub.registerHandler(mockWebhookHandler);
  });

  describe('constructor', () => {
    it('should create hub with default config', () => {
      const newHub = new NotificationHub();
      const stats = newHub.getStats();
      expect(stats.totalNotifications).toBe(0);
    });

    it('should create hub with custom config', () => {
      const newHub = new NotificationHub({
        maxConcurrent: 5,
        deliveryTimeout: 60000,
      });
      expect(newHub).toBeInstanceOf(NotificationHub);
    });
  });

  describe('subscriptions', () => {
    it('should set and get subscription', () => {
      const subscription = {
        tenantId: 'tenant-1',
        webhooks: [],
        emails: [],
        slacks: [],
      };

      hub.setSubscription(subscription);

      const retrieved = hub.getSubscription('tenant-1');
      expect(retrieved).toEqual(subscription);
    });

    it('should return undefined for unknown tenant', () => {
      const subscription = hub.getSubscription('unknown');
      expect(subscription).toBeUndefined();
    });

    it('should add webhook to new tenant', () => {
      const webhook: WebhookConfig = {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      };

      hub.addWebhook('tenant-1', webhook);

      const subscription = hub.getSubscription('tenant-1');
      expect(subscription?.webhooks).toHaveLength(1);
      expect(subscription?.webhooks[0].id).toBe('webhook-1');
    });

    it('should add webhook to existing tenant', () => {
      hub.setSubscription({
        tenantId: 'tenant-1',
        webhooks: [{
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          events: ['study.completed'],
          active: true,
        }],
        emails: [],
        slacks: [],
      });

      hub.addWebhook('tenant-1', {
        id: 'webhook-2',
        url: 'https://example.com/webhook2',
        events: ['study.failed'],
        active: true,
      });

      const subscription = hub.getSubscription('tenant-1');
      expect(subscription?.webhooks).toHaveLength(2);
    });

    it('should remove webhook', () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      });

      const removed = hub.removeWebhook('tenant-1', 'webhook-1');
      expect(removed).toBe(true);

      const subscription = hub.getSubscription('tenant-1');
      expect(subscription?.webhooks).toHaveLength(0);
    });

    it('should return false when removing non-existent webhook', () => {
      const removed = hub.removeWebhook('tenant-1', 'webhook-1');
      expect(removed).toBe(false);
    });

    it('should add email config', () => {
      const email: EmailConfig = {
        id: 'email-1',
        to: ['user@example.com'],
        events: ['study.completed'],
        active: true,
      };

      hub.addEmail('tenant-1', email);

      const subscription = hub.getSubscription('tenant-1');
      expect(subscription?.emails).toHaveLength(1);
    });

    it('should add Slack config', () => {
      const slack: SlackConfig = {
        id: 'slack-1',
        webhookUrl: 'https://hooks.slack.com/services/xxx',
        events: ['study.completed'],
        active: true,
      };

      hub.addSlack('tenant-1', slack);

      const subscription = hub.getSubscription('tenant-1');
      expect(subscription?.slacks).toHaveLength(1);
    });
  });

  describe('notify', () => {
    it('should create notification without subscriptions', async () => {
      const input: NotificationInput = {
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Your study has finished',
      };

      const notification = await hub.notify(input);

      expect(notification.id).toBeDefined();
      expect(notification.eventType).toBe('study.completed');
      expect(notification.tenantId).toBe('tenant-1');
      expect(notification.priority).toBe('normal');
      expect(notification.createdAt).toBeInstanceOf(Date);
    });

    it('should deliver to matching webhook', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      expect(mockWebhookHandler.deliveries).toHaveLength(1);
      expect(mockWebhookHandler.deliveries[0].target).toBe('https://example.com/webhook');
    });

    it('should not deliver to inactive webhook', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: false,
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      expect(mockWebhookHandler.deliveries).toHaveLength(0);
    });

    it('should not deliver to webhook not subscribed to event', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.failed'],
        active: true,
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      expect(mockWebhookHandler.deliveries).toHaveLength(0);
    });

    it('should deliver to multiple matching webhooks', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook1',
        events: ['study.completed'],
        active: true,
      });

      hub.addWebhook('tenant-1', {
        id: 'webhook-2',
        url: 'https://example.com/webhook2',
        events: ['study.completed', 'study.failed'],
        active: true,
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      expect(mockWebhookHandler.deliveries).toHaveLength(2);
    });

    it('should include study ID in notification', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      });

      const notification = await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        studyId: 'study-123',
        title: 'Study Complete',
        message: 'Done',
      });

      expect(notification.studyId).toBe('study-123');
    });

    it('should include custom data', async () => {
      const notification = await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
        data: { cellCount: 100, duration: 3600 },
      });

      expect(notification.data).toEqual({ cellCount: 100, duration: 3600 });
    });

    it('should update statistics', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      const stats = hub.getStats();
      expect(stats.totalNotifications).toBe(1);
      expect(stats.totalDeliveries).toBe(1);
      expect(stats.successfulDeliveries).toBe(1);
      expect(stats.byEventType['study.completed']).toBe(1);
    });
  });

  describe('delivery records', () => {
    it('should create delivery record', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      });

      const notification = await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      const records = hub.getDeliveryRecords(notification.id);
      expect(records).toHaveLength(1);
      expect(records[0].notificationId).toBe(notification.id);
      expect(records[0].channel).toBe('webhook');
      expect(records[0].status).toBe('delivered');
    });

    it('should record failed delivery', async () => {
      const failingHandler = new MockDeliveryHandler('webhook', { shouldFail: true });
      hub.registerHandler(failingHandler);

      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
        retry: { maxAttempts: 1, initialDelay: 10, maxDelay: 100, backoffMultiplier: 2 },
      });

      const notification = await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      const records = hub.getDeliveryRecords(notification.id);
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe('failed');
      expect(records[0].attempts).toHaveLength(1);
    });

    it('should get tenant delivery records', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study 1',
        message: 'Done',
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study 2',
        message: 'Done',
      });

      const records = hub.getTenantDeliveryRecords('tenant-1');
      expect(records).toHaveLength(2);
    });
  });

  describe('retry delivery', () => {
    it('should retry failed delivery', async () => {
      // Handler that fails once then succeeds
      const failingHandler = new MockDeliveryHandler('webhook', { shouldFail: true });
      hub.registerHandler(failingHandler);

      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
        retry: { maxAttempts: 1, initialDelay: 10, maxDelay: 100, backoffMultiplier: 2 },
      });

      const notification = await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      const records = hub.getDeliveryRecords(notification.id);
      expect(records[0].status).toBe('failed');

      // Register a successful handler for retry
      const successHandler = new MockDeliveryHandler('webhook');
      hub.registerHandler(successHandler);

      const success = await hub.retryDelivery(records[0].id);
      expect(success).toBe(true);

      const updatedRecords = hub.getDeliveryRecords(notification.id);
      expect(updatedRecords[0].status).toBe('delivered');
    });

    it('should return false for non-existent delivery', async () => {
      const success = await hub.retryDelivery('non-existent');
      expect(success).toBe(false);
    });

    it('should return false for already delivered', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      });

      const notification = await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      const records = hub.getDeliveryRecords(notification.id);
      const success = await hub.retryDelivery(records[0].id);
      expect(success).toBe(false);
    });
  });

  describe('getNotification', () => {
    it('should return notification by ID', async () => {
      const notification = await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Study Complete',
        message: 'Done',
      });

      const retrieved = hub.getNotification(notification.id);
      expect(retrieved).toEqual(notification);
    });

    it('should return undefined for unknown ID', () => {
      const notification = hub.getNotification('unknown');
      expect(notification).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return hub statistics', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed', 'study.failed'],
        active: true,
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Complete',
        message: 'Done',
      });

      await hub.notify({
        eventType: 'study.failed',
        tenantId: 'tenant-1',
        title: 'Failed',
        message: 'Error',
      });

      const stats = hub.getStats();
      expect(stats.totalNotifications).toBe(2);
      expect(stats.totalDeliveries).toBe(2);
      expect(stats.successfulDeliveries).toBe(2);
      expect(stats.byChannel.webhook.total).toBe(2);
      expect(stats.byEventType['study.completed']).toBe(1);
      expect(stats.byEventType['study.failed']).toBe(1);
    });

    it('should return a copy of stats', () => {
      const stats = hub.getStats();
      stats.totalNotifications = 999;

      const freshStats = hub.getStats();
      expect(freshStats.totalNotifications).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics', async () => {
      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Complete',
        message: 'Done',
      });

      hub.resetStats();

      const stats = hub.getStats();
      expect(stats.totalNotifications).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      hub.addWebhook('tenant-1', {
        id: 'webhook-1',
        url: 'https://example.com/webhook',
        events: ['study.completed'],
        active: true,
      });

      await hub.notify({
        eventType: 'study.completed',
        tenantId: 'tenant-1',
        title: 'Complete',
        message: 'Done',
      });

      hub.clear();

      expect(hub.getSubscription('tenant-1')).toBeUndefined();
      expect(hub.getStats().totalNotifications).toBe(0);
    });
  });
});

describe('MockDeliveryHandler', () => {
  it('should record deliveries', async () => {
    const handler = new MockDeliveryHandler('webhook');
    const notification = {
      id: 'notif-1',
      eventType: 'study.completed' as const,
      priority: 'normal' as const,
      tenantId: 'tenant-1',
      title: 'Test',
      message: 'Test message',
      data: {},
      createdAt: new Date(),
    };

    await handler.deliver(notification, 'https://example.com', {});

    expect(handler.deliveries).toHaveLength(1);
    expect(handler.deliveries[0].notification).toEqual(notification);
  });

  it('should fail when configured to fail', async () => {
    const handler = new MockDeliveryHandler('webhook', { shouldFail: true });
    const notification = {
      id: 'notif-1',
      eventType: 'study.completed' as const,
      priority: 'normal' as const,
      tenantId: 'tenant-1',
      title: 'Test',
      message: 'Test message',
      data: {},
      createdAt: new Date(),
    };

    const attempt = await handler.deliver(notification, 'https://example.com', {});

    expect(attempt.status).toBe('failed');
  });

  it('should fail N times then succeed', async () => {
    const handler = new MockDeliveryHandler('webhook', { failCount: 2 });
    const notification = {
      id: 'notif-1',
      eventType: 'study.completed' as const,
      priority: 'normal' as const,
      tenantId: 'tenant-1',
      title: 'Test',
      message: 'Test message',
      data: {},
      createdAt: new Date(),
    };

    const attempt1 = await handler.deliver(notification, 'https://example.com', {});
    expect(attempt1.status).toBe('failed');

    const attempt2 = await handler.deliver(notification, 'https://example.com', {});
    expect(attempt2.status).toBe('failed');

    const attempt3 = await handler.deliver(notification, 'https://example.com', {});
    expect(attempt3.status).toBe('success');
  });

  it('should reset deliveries', async () => {
    const handler = new MockDeliveryHandler('webhook');
    const notification = {
      id: 'notif-1',
      eventType: 'study.completed' as const,
      priority: 'normal' as const,
      tenantId: 'tenant-1',
      title: 'Test',
      message: 'Test message',
      data: {},
      createdAt: new Date(),
    };

    await handler.deliver(notification, 'https://example.com', {});
    expect(handler.deliveries).toHaveLength(1);

    handler.reset();
    expect(handler.deliveries).toHaveLength(0);
  });
});

describe('createNotificationHub', () => {
  it('should create a new hub instance', () => {
    const hub = createNotificationHub();
    expect(hub).toBeInstanceOf(NotificationHub);
  });

  it('should accept config', () => {
    const hub = createNotificationHub({ maxConcurrent: 5 });
    expect(hub).toBeInstanceOf(NotificationHub);
  });
});
