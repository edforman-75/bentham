# @bentham/audit-logger

Compliance logging for all Bentham actions.

## Installation

```bash
pnpm add @bentham/audit-logger
```

## Overview

The audit logger provides:

- **Immutable logging** of all system actions
- **Compliance support** for legal and regulatory requirements
- **Query capabilities** for investigation
- **Long-term retention** with configurable policies
- **Export functionality** for audits

## Quick Start

```typescript
import { createAuditLogger } from '@bentham/audit-logger';

const logger = createAuditLogger({
  storage: s3Client,
  retentionDays: 365,
});

// Log an action
await logger.logAction({
  type: 'study_created',
  actor: { type: 'user', id: userId },
  resource: { type: 'study', id: studyId },
  tenantId,
  details: { manifestVersion: '1.0.0' },
});

// Query audit log
const entries = await logger.query({
  tenantId,
  startDate: new Date('2024-01-01'),
  actionTypes: ['study_created', 'study_completed'],
});
```

## Action Types

### Study Lifecycle

| Action | Description |
|--------|-------------|
| `study_created` | Study submitted |
| `study_started` | Execution began |
| `study_paused` | Execution paused |
| `study_resumed` | Execution resumed |
| `study_completed` | Study finished |
| `study_failed` | Study failed |
| `study_cancelled` | Study cancelled |

### Data Access

| Action | Description |
|--------|-------------|
| `results_viewed` | Results accessed |
| `results_exported` | Results exported |
| `evidence_accessed` | Evidence file accessed |
| `evidence_downloaded` | Evidence downloaded |

### Authentication

| Action | Description |
|--------|-------------|
| `user_login` | User logged in |
| `user_logout` | User logged out |
| `api_key_created` | API key generated |
| `api_key_revoked` | API key revoked |

### Configuration

| Action | Description |
|--------|-------------|
| `webhook_registered` | Webhook configured |
| `webhook_removed` | Webhook removed |
| `account_registered` | Surface account added |
| `account_retired` | Surface account removed |

### AI-Assisted

| Action | Description |
|--------|-------------|
| `ai_query_generated` | AI generated query |
| `ai_troubleshoot` | AI diagnosed error |
| `ai_resolution_applied` | AI suggestion applied |

## API Reference

### Logging Actions

```typescript
// Log an action
await logger.logAction({
  type: 'study_created',
  actor: {
    type: 'user',  // 'user' | 'system' | 'api_key'
    id: 'user-123',
    email: 'user@example.com',
  },
  resource: {
    type: 'study',
    id: 'study-456',
  },
  tenantId: 'tenant-789',
  details: {
    // Action-specific metadata
    manifestVersion: '1.0.0',
    queriesCount: 10,
  },
  outcome: 'success',  // 'success' | 'failure' | 'partial'
});
```

### Querying Logs

```typescript
// Query with filters
const entries = await logger.query({
  tenantId,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  actionTypes: ['study_created', 'study_completed'],
  actorId: userId,
  resourceType: 'study',
  outcome: 'success',
  limit: 100,
});

// Full-text search
const results = await logger.search({
  tenantId,
  query: 'manifest validation failed',
  limit: 50,
});
```

### Export

```typescript
// Export for audit
const exportPath = await logger.exportAuditLog({
  tenantId,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  format: 'json',  // or 'csv'
  includeDetails: true,
});

// Export to S3
await logger.exportToS3({
  tenantId,
  bucket: 'audit-exports',
  prefix: `${tenantId}/2024/`,
});
```

### Retention

```typescript
// Configure retention
await logger.setRetentionPolicy(tenantId, {
  defaultDays: 365,
  legalHoldOverride: true,
});

// Enable legal hold (prevents deletion)
await logger.enableLegalHold(tenantId, {
  reason: 'Pending investigation',
  expiresAt: null,  // Indefinite
});

// Clean up old logs
await logger.pruneExpiredLogs();
```

## Audit Entry Structure

```typescript
interface AuditEntry {
  id: string;
  timestamp: Date;
  tenantId: string;

  // Action
  type: ActionType;
  outcome: 'success' | 'failure' | 'partial';

  // Actor
  actor: {
    type: 'user' | 'system' | 'api_key';
    id: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
  };

  // Resource
  resource: {
    type: string;
    id: string;
    name?: string;
  };

  // Context
  details: Record<string, unknown>;
  correlationId?: string;  // Link related actions

  // Integrity
  sha256Hash: string;
  previousHash?: string;  // Chain integrity
}
```

## Configuration

```typescript
interface AuditLoggerConfig {
  // Storage
  storage: {
    type: 's3' | 'database';
    bucket?: string;
    connectionString?: string;
  };

  // Retention
  retentionDays: number;
  legalHoldEnabled: boolean;

  // Integrity
  enableChaining: boolean;  // Hash chain
  signEntries: boolean;

  // Performance
  batchSize?: number;
  flushInterval?: number;  // ms
}
```

## Testing

```bash
pnpm test        # Run tests (37 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- AWS S3 (or compatible) for storage
