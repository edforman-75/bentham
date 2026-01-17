# @bentham/database

Database schema, migrations, and repository layer for Bentham.

## Installation

```bash
pnpm add @bentham/database
```

## Overview

This package provides:

- **Prisma schema** for all Bentham entities
- **Repositories** for data access patterns
- **Migrations** for schema evolution
- **Connection management** with pooling

## Quick Start

```typescript
import {
  createDatabaseClient,
  StudyRepository,
  JobRepository,
} from '@bentham/database';

// Create client
const db = createDatabaseClient({
  connectionString: process.env.DATABASE_URL,
});

// Use repositories
const studyRepo = new StudyRepository(db);
const study = await studyRepo.findById(studyId);

const jobRepo = new JobRepository(db);
const jobs = await jobRepo.findByStudyId(studyId);
```

## Schema Overview

### Core Entities

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Tenant    │────<│    Study    │────<│     Job     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │     │  Checkpoint │     │   Result    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Evidence   │
                                        └─────────────┘
```

### Key Tables

| Table | Description |
|-------|-------------|
| `tenants` | Multi-tenant isolation |
| `users` | Tenant users |
| `studies` | Study definitions and state |
| `jobs` | Individual execution jobs |
| `results` | Job execution results |
| `evidence` | Evidence artifacts |
| `checkpoints` | Recovery checkpoints |
| `audit_logs` | Compliance logging |
| `cost_records` | Cost tracking |

## API Reference

### Repositories

#### StudyRepository

```typescript
const repo = new StudyRepository(db);

// CRUD
const study = await repo.create(studyData);
const study = await repo.findById(id);
const studies = await repo.findByTenantId(tenantId);
await repo.update(id, updates);
await repo.delete(id);

// State management
await repo.updateState(id, newState);
await repo.getState(id);

// Progress
await repo.updateProgress(id, progress);
await repo.getProgress(id);
```

#### JobRepository

```typescript
const repo = new JobRepository(db);

// Create jobs from manifest
const jobs = await repo.createFromManifest(studyId, manifest);

// Query jobs
const pending = await repo.findPendingJobs(studyId);
const byStatus = await repo.findByStatus(studyId, 'executing');

// Update status
await repo.updateStatus(jobId, 'completed', result);
await repo.incrementRetryCount(jobId);
```

#### ResultRepository

```typescript
const repo = new ResultRepository(db);

// Store result
await repo.create(result);

// Query results
const results = await repo.findByStudyId(studyId, { page, limit });
const bySurface = await repo.findBySurface(studyId, surfaceId);

// Aggregations
const stats = await repo.getStudyStats(studyId);
```

### Migrations

```bash
# Generate migration from schema changes
pnpm db:migrate:dev --name add_new_field

# Apply migrations
pnpm db:migrate:deploy

# Reset database (dev only)
pnpm db:reset
```

### Connection Management

```typescript
import { createDatabaseClient, DatabaseClient } from '@bentham/database';

const db = createDatabaseClient({
  connectionString: process.env.DATABASE_URL,
  poolSize: 10,
  timeout: 30000,
});

// Health check
const healthy = await db.healthCheck();

// Disconnect
await db.disconnect();
```

## Multi-Tenant Isolation

All tables include `tenant_id` for row-level isolation:

```typescript
// Repository methods automatically scope by tenant
const repo = new StudyRepository(db);

// This only returns studies for the specified tenant
const studies = await repo.findByTenantId(tenantId);

// Direct queries require tenant filter
const results = await db.study.findMany({
  where: { tenantId },
});
```

## Soft Deletes

Entities use soft deletes for audit trail:

```typescript
// Soft delete (sets deletedAt)
await repo.delete(id);

// Hard delete (permanent)
await repo.hardDelete(id);

// Query includes deleted
const all = await repo.findAll({ includeDeleted: true });
```

## Testing

```bash
pnpm test        # Run tests (16 tests)
pnpm test:watch  # Watch mode

# Run with test database
DATABASE_URL=postgresql://... pnpm test
```

## Dependencies

- `@bentham/core` - Core types and utilities
- `@prisma/client` - Database ORM
