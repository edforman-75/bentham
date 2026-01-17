# @bentham/notification-hub

Alerts and webhook dispatch for Bentham events.

## Installation

```bash
pnpm add @bentham/notification-hub
```

## Overview

The notification hub handles:

- **Alert delivery** via multiple channels (Slack, email, SMS)
- **Webhook dispatch** for tenant integrations
- **Event routing** based on severity and type
- **Delivery tracking** and retry logic

## Quick Start

```typescript
import { createNotificationHub } from '@bentham/notification-hub';

const hub = createNotificationHub({
  channels: {
    slack: { webhookUrl: process.env.SLACK_WEBHOOK },
    email: { apiKey: process.env.SENDGRID_KEY },
  },
});

// Send an alert
await hub.sendAlert({
  type: 'study_complete',
  severity: 'info',
  title: 'Study Complete',
  message: 'Study xyz has completed successfully',
  studyId,
  tenantId,
});

// Dispatch webhook
await hub.dispatchWebhook(tenantId, {
  event: 'study.complete',
  data: { studyId, status: 'complete' },
});
```

## Alert Channels

| Channel | Provider | Use Case |
|---------|----------|----------|
| `slack` | Slack Webhooks | Team notifications |
| `email` | SendGrid | Formal notifications |
| `sms` | Twilio | Urgent alerts |
| `webhook` | Custom | Tenant integrations |

## API Reference

### Sending Alerts

```typescript
// Send alert to configured channels
await hub.sendAlert({
  type: 'account_pool_low',
  severity: 'warning',
  title: 'Account Pool Low',
  message: 'ChatGPT Web account pool is below threshold',
  metadata: {
    surfaceId: 'chatgpt-web',
    current: 3,
    minimum: 5,
  },
});

// Send to specific channel
await hub.sendAlert({
  type: 'study_failed',
  severity: 'error',
  channels: ['slack', 'email'],
  // ...
});
```

### Alert Severities

| Severity | Description | Default Channels |
|----------|-------------|------------------|
| `info` | Informational | Slack |
| `warning` | Potential issues | Slack, Email |
| `error` | Failures | Slack, Email |
| `critical` | Urgent action needed | Slack, Email, SMS |

### Webhook Dispatch

```typescript
// Register tenant webhook
await hub.registerWebhook(tenantId, {
  url: 'https://tenant.example.com/webhook',
  events: ['study.complete', 'study.failed', 'study.at_risk'],
  secret: 'webhook-secret',
});

// Dispatch webhook
await hub.dispatchWebhook(tenantId, {
  event: 'study.complete',
  studyId,
  timestamp: new Date().toISOString(),
  data: {
    status: 'complete',
    completedCells: 95,
    totalCells: 100,
    resultsUrl: 'https://api.bentham.io/v1/studies/xyz/results',
  },
});
```

### Webhook Payload

```typescript
interface WebhookPayload {
  event: WebhookEvent;
  studyId: string;
  tenantId: string;
  timestamp: string;
  data: {
    status: string;
    completedCells: number;
    failedCells: number;
    totalCells: number;
    completionRate: number;
    resultsUrl: string;
    exportUrl: string;
  };
}

// Events
type WebhookEvent =
  | 'study.complete'
  | 'study.failed'
  | 'study.at_risk'
  | 'study.paused'
  | 'study.resumed';
```

### Webhook Security

```typescript
// Webhooks are signed with HMAC-SHA256
const signature = hub.signPayload(payload, secret);

// Tenant verification:
const isValid = hub.verifySignature(payload, signature, secret);
```

### Notification History

```typescript
// Get notification history
const history = await hub.getNotificationHistory({
  tenantId,
  startDate: new Date('2024-01-01'),
  limit: 100,
});

// Get webhook delivery status
const deliveries = await hub.getWebhookDeliveries(tenantId, {
  status: 'failed',
  retry: true,
});
```

### Channel Configuration

```typescript
// Slack
hub.configureChannel('slack', {
  webhookUrl: 'https://hooks.slack.com/...',
  channel: '#bentham-alerts',
  username: 'Bentham Bot',
});

// Email (SendGrid)
hub.configureChannel('email', {
  apiKey: process.env.SENDGRID_KEY,
  fromEmail: 'alerts@bentham.io',
  fromName: 'Bentham Alerts',
});

// SMS (Twilio)
hub.configureChannel('sms', {
  accountSid: process.env.TWILIO_SID,
  authToken: process.env.TWILIO_TOKEN,
  fromNumber: '+1234567890',
});
```

## Configuration

```typescript
interface NotificationHubConfig {
  // Channels
  channels: {
    slack?: SlackConfig;
    email?: EmailConfig;
    sms?: SMSConfig;
  };

  // Routing
  routing: {
    info: ['slack'];
    warning: ['slack', 'email'];
    error: ['slack', 'email'];
    critical: ['slack', 'email', 'sms'];
  };

  // Webhooks
  webhookRetries?: number;
  webhookTimeout?: number;

  // Rate limiting
  rateLimits?: {
    perTenant?: number;  // Max per hour
    perChannel?: Record<string, number>;
  };
}
```

## Testing

```bash
pnpm test        # Run tests (36 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- External: Slack SDK, SendGrid, Twilio
