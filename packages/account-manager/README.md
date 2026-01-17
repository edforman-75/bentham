# @bentham/account-manager

Surface account management for authenticated AI interactions.

## Installation

```bash
pnpm add @bentham/account-manager
```

## Overview

The account manager handles:

- **Account registration** from human-provisioned pool
- **Account assignment** to studies
- **Health monitoring** (active, flagged, blocked)
- **Pool alerts** when inventory is low

**Important:** Accounts are provisioned by human operators, not automatically. Account creation for AI surfaces typically requires email/phone verification, payment methods, and CAPTCHA solving that cannot be reliably automated.

## Quick Start

```typescript
import { createAccountManager } from '@bentham/account-manager';

const manager = createAccountManager({
  database: dbClient,
  notificationHub: notificationClient,
});

// Register a new account (operator action)
await manager.registerAccount({
  surfaceId: 'chatgpt-web',
  credentials: { username, password },
  metadata: { email, tier: 'plus' },
});

// Acquire account for a study
const account = await manager.acquireAccount({
  surfaceId: 'chatgpt-web',
  studyId,
  isolationMode: 'shared',
});

// Release when done
await manager.releaseAccount(account.id);
```

## Account Lifecycle

```
provisioned → active → in_use → active
                ↓         ↓
           flagged → blocked → retired
```

### States

| State | Description |
|-------|-------------|
| `provisioned` | Registered, not yet validated |
| `active` | Available for use |
| `in_use` | Currently assigned to a study |
| `flagged` | Potential issues (rate limited) |
| `blocked` | Blocked by surface |
| `retired` | Permanently removed |

## API Reference

### Account Registration (Operator)

```typescript
// Register new account
await manager.registerAccount({
  surfaceId: 'chatgpt-web',
  credentials: {
    username: 'user@example.com',
    password: 'secure-password',
    totpSecret: 'ABCD1234...',  // Optional 2FA
  },
  metadata: {
    email: 'user@example.com',
    tier: 'plus',
    provisionedBy: 'operator-name',
  },
});

// Bulk import
await manager.importAccounts(accounts);

// Retire account
await manager.retireAccount(accountId, 'Account expired');
```

### Account Assignment

```typescript
// Acquire for study
const account = await manager.acquireAccount({
  surfaceId: 'chatgpt-web',
  studyId,
  isolationMode: 'shared',  // or 'dedicated_per_study'
});

// Release
await manager.releaseAccount(account.id);

// Check current assignments
const assignments = await manager.getAssignments(studyId);
```

### Session Isolation Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `shared` | Accounts shared across studies | Cost-effective |
| `dedicated_per_study` | Fresh accounts per study | Unbiased research |

```typescript
const account = await manager.acquireAccount({
  surfaceId: 'chatgpt-web',
  studyId,
  isolationMode: 'dedicated_per_study',
});
```

### Health Management

```typescript
// Get account health
const health = await manager.getAccountHealth(accountId);
// { status, lastUsed, successRate, recentErrors }

// Flag account (rate limited, etc.)
await manager.flagAccount(accountId, 'Rate limited');

// Mark blocked
await manager.markAccountBlocked(accountId, 'Suspended by surface');

// Unflag if recovered
await manager.unflagAccount(accountId);
```

### Pool Monitoring

```typescript
// Get pool status
const status = await manager.getPoolStatus('chatgpt-web');
// {
//   total: 20,
//   active: 15,
//   inUse: 8,
//   flagged: 3,
//   blocked: 2,
//   utilization: 0.53,
// }

// Check thresholds
await manager.checkPoolThresholds();
// Triggers alerts if pool below minimum

// Get usage stats
const usage = await manager.getAccountUsage(accountId, { days: 30 });
```

### Alerting

```typescript
// Configure thresholds
const manager = createAccountManager({
  poolThresholds: {
    'chatgpt-web': { minimum: 5, warnAt: 10 },
    'perplexity-web': { minimum: 3, warnAt: 5 },
  },
});

// Events
manager.on('pool:low', (event) => {
  // { surfaceId, current, minimum, urgency }
});

manager.on('account:blocked', (event) => {
  // { accountId, surfaceId, reason }
});
```

## Configuration

```typescript
interface AccountManagerConfig {
  database: DatabaseClient;
  notificationHub: NotificationClient;

  // Isolation
  defaultIsolationMode: 'shared' | 'dedicated_per_study';

  // Thresholds
  poolThresholds: Record<SurfaceId, {
    minimum: number;
    warnAt: number;
  }>;

  // Health
  healthCheckInterval?: number;
  maxConsecutiveFailures?: number;

  // Rotation
  rotateAfterUses?: number;
  rotateAfterDays?: number;
}
```

## Testing

```bash
pnpm test        # Run tests (45 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- `@bentham/database` - Account persistence
- `@bentham/notification-hub` - Pool alerts
