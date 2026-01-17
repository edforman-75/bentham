# @bentham/executor

Job execution engine with retry logic and human behavior simulation.

## Installation

```bash
pnpm add @bentham/executor
```

## Overview

The executor is responsible for:

- **Job execution** - Running queries against AI surfaces
- **Retry logic** - Exponential backoff with jitter
- **Resource acquisition** - Sessions, proxies, credentials
- **Evidence collection** - Screenshots, HTML archives, HAR files
- **Human behavior simulation** - Realistic typing, mouse movement, timing

## Quick Start

```typescript
import { createExecutor } from '@bentham/executor';

const executor = createExecutor({
  surfaceAdapters: adapterRegistry,
  sessionPool: sessionPoolClient,
  proxyManager: proxyManagerClient,
  evidenceCollector: evidenceClient,
  credentialVault: vaultClient,
});

// Execute a single job
const result = await executor.executeJob(job);

// Start worker loop
await executor.startWorker({
  concurrency: 5,
  pollInterval: 1000,
});
```

## Job Execution Flow

1. **Pull job** from queue
2. **Resolve adapter** for target surface
3. **Acquire resources** (session, proxy, credential)
4. **Execute query** with human behavior simulation
5. **Collect evidence** (if required)
6. **Validate result** via validator
7. **Report completion** to orchestrator

## API Reference

### Job Execution

```typescript
// Execute single job
const result = await executor.executeJob(job);

// Execute with specific config
const result = await executor.executeJob(job, {
  timeout: 60000,
  maxRetries: 3,
  collectEvidence: true,
});
```

### Worker Management

```typescript
// Start worker
await executor.startWorker({
  concurrency: 5,
  pollInterval: 1000,
  queueName: 'bentham-jobs',
});

// Stop worker
await executor.stopWorker();

// Get worker status
const status = executor.getWorkerStatus();
```

### Retry Logic

```typescript
import { calculateBackoff, RetryStrategy } from '@bentham/executor';

// Default exponential backoff with jitter
const delay = calculateBackoff({
  attempt: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: 0.2,
});

// Custom retry strategy
const strategy: RetryStrategy = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.25,
  retryableErrors: ['RATE_LIMITED', 'TIMEOUT', 'NETWORK_ERROR'],
};
```

## Human Behavior Simulation

For web surfaces, the executor simulates realistic human behavior:

```typescript
interface HumanBehaviorConfig {
  typing: {
    minWPM: 40,
    maxWPM: 80,
    mistakeRate: 0.02,        // 2% typos (corrected)
    pauseProbability: 0.1,    // 10% mid-typing pause
  },
  mouse: {
    movementStyle: 'bezier',
    clickDelay: [50, 200],    // ms
  },
  timing: {
    readingDelay: [1000, 5000],
    navigationDelay: [500, 2000],
    scrollBehavior: 'gradual',
  },
}
```

This includes:
- **Typing**: Variable speed, occasional typos that get corrected
- **Mouse movement**: Natural bezier curves, realistic click timing
- **Timing**: Random delays for reading, navigation, scrolling
- **Focus patterns**: Tab switches, window focus changes

## Job Result Structure

```typescript
interface JobResult {
  jobId: string;
  studyId: string;
  surfaceId: SurfaceId;
  locationId: LocationId;
  queryId: string;

  success: boolean;
  response?: {
    text: string;
    responseTimeMs: number;
    tokenCount?: number;
  };

  error?: {
    code: string;
    message: string;
    isRetryable: boolean;
    retryCount: number;
  };

  evidence?: {
    screenshotPath?: string;
    htmlArchivePath?: string;
    harFilePath?: string;
    sha256Hash: string;
    capturedAt: Date;
  };

  metadata: {
    executedAt: Date;
    executionTimeMs: number;
    proxyUsed?: string;
    sessionId?: string;
    credentialId?: string;
  };
}
```

## Resource Management

The executor coordinates multiple resources:

```typescript
// Acquire all resources for a job
const resources = await executor.acquireResources(job);
// { session, proxy, credential }

// Release after completion
await executor.releaseResources(resources);
```

Resources are automatically released on:
- Job completion (success or failure)
- Timeout
- Worker shutdown

## Error Handling

```typescript
import { classifyError, isRetryable } from '@bentham/executor';

// Classify an error
const classification = classifyError(error);
// { code, category, isRetryable, suggestedAction }

// Check if should retry
if (isRetryable(error) && attempt < maxRetries) {
  await delay(calculateBackoff({ attempt }));
  return executeJob(job); // Retry
}
```

## Testing

```bash
pnpm test        # Run tests (34 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- `@bentham/surface-adapters` - Surface implementations
- `@bentham/session-pool` - Browser sessions
- `@bentham/proxy-manager` - Proxy management
- `@bentham/credential-vault` - Credential access
- `@bentham/evidence-collector` - Evidence capture
