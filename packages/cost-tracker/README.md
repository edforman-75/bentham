# @bentham/cost-tracker

Cost tracking and attribution for Bentham operations.

## Installation

```bash
pnpm add @bentham/cost-tracker
```

## Overview

The cost tracker provides:

- **Cost recording** for all billable operations
- **Attribution** to studies, tenants, and resources
- **Estimation** for study planning
- **Reporting** and billing exports
- **Budget alerts** and limits

## Quick Start

```typescript
import { createCostTracker } from '@bentham/cost-tracker';

const tracker = createCostTracker({
  database: dbClient,
});

// Record a cost
await tracker.recordCost({
  category: 'proxy',
  amount: 0.05,
  currency: 'USD',
  studyId,
  metadata: { provider: 'brightdata', location: 'us-east' },
});

// Get costs by study
const costs = await tracker.getCostByStudy(studyId);

// Generate billing report
const report = await tracker.generateBillingReport(tenantId, { month: '2024-01' });
```

## Cost Categories

| Category | Description | Unit |
|----------|-------------|------|
| `proxy` | Proxy bandwidth | Per GB |
| `api_tokens` | API token usage | Per 1K tokens |
| `compute` | CPU/memory | Per hour |
| `storage` | Evidence storage | Per GB-month |
| `accounts` | Account usage | Per use |
| `captcha` | CAPTCHA solving | Per solve |
| `third_party` | Other services | Variable |

## API Reference

### Recording Costs

```typescript
// Record single cost
await tracker.recordCost({
  category: 'api_tokens',
  amount: 0.002,
  currency: 'USD',
  studyId,
  jobId,
  surfaceId: 'openai-api',
  metadata: {
    model: 'gpt-4',
    inputTokens: 500,
    outputTokens: 200,
  },
});

// Batch record
await tracker.recordCosts([cost1, cost2, cost3]);
```

### Querying Costs

```typescript
// By study
const studyCosts = await tracker.getCostByStudy(studyId);
// {
//   total: 12.50,
//   byCategory: { proxy: 5.00, api_tokens: 7.50 },
//   bySurface: { 'openai-api': 10.00, 'chatgpt-web': 2.50 },
// }

// By tenant
const tenantCosts = await tracker.getCostByTenant(tenantId, {
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
});

// By category
const proxyCosts = await tracker.getCostByCategory('proxy', {
  studyId,
  groupBy: 'provider',
});
```

### Cost Estimation

```typescript
// Estimate study cost
const estimate = await tracker.estimateCost(manifest);
// {
//   min: 50.00,
//   max: 150.00,
//   expected: 85.00,
//   breakdown: {
//     proxy: { min: 20, max: 60 },
//     api_tokens: { min: 25, max: 70 },
//     compute: { min: 5, max: 20 },
//   },
// }

// Estimate remaining cost
const remaining = await tracker.estimateRemainingCost(studyId);
```

### Billing Reports

```typescript
// Generate monthly report
const report = await tracker.generateBillingReport(tenantId, {
  period: '2024-01',
  format: 'detailed',
});
// {
//   tenantId,
//   period: { start, end },
//   totalAmount: 500.00,
//   studies: [...],
//   byCategory: {...},
//   lineItems: [...],
// }

// Export to CSV
const csv = await tracker.exportBillingCSV(tenantId, { month: '2024-01' });
```

### Budget Management

```typescript
// Set budget limit
await tracker.setBudgetLimit(tenantId, {
  monthly: 1000.00,
  perStudy: 100.00,
  alertAt: 0.8,  // Alert at 80%
});

// Check budget status
const status = await tracker.getBudgetStatus(tenantId);
// {
//   monthlyLimit: 1000.00,
//   monthlyUsed: 450.00,
//   monthlyRemaining: 550.00,
//   utilizationRate: 0.45,
// }

// Events
tracker.on('budget:warning', (event) => {
  // { tenantId, type, current, limit, utilizationRate }
});

tracker.on('budget:exceeded', (event) => {
  // Handle over-budget
});
```

## Cost Record Structure

```typescript
interface CostRecord {
  id: string;
  category: CostCategory;
  amount: number;
  currency: string;

  // Attribution
  tenantId: string;
  studyId?: string;
  jobId?: string;
  surfaceId?: SurfaceId;

  // Context
  metadata: Record<string, unknown>;
  timestamp: Date;

  // Billing
  billed: boolean;
  billedAt?: Date;
  invoiceId?: string;
}
```

## Configuration

```typescript
interface CostTrackerConfig {
  database: DatabaseClient;

  // Pricing
  pricing: {
    proxy: Record<ProviderId, number>;  // Per GB
    apiTokens: Record<SurfaceId, { input: number; output: number }>;
    compute: number;  // Per hour
    storage: number;  // Per GB-month
    captcha: number;  // Per solve
  };

  // Budget
  defaultBudgets?: {
    monthly?: number;
    perStudy?: number;
  };

  // Alerts
  alertThreshold?: number;
}
```

## Testing

```bash
pnpm test        # Run tests (33 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- `@bentham/database` - Cost persistence
