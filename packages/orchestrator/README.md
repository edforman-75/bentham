# @bentham/orchestrator

Study lifecycle management, checkpointing, and deadline monitoring.

## Installation

```bash
pnpm add @bentham/orchestrator
```

## Overview

The orchestrator manages the complete study lifecycle:

- **Study creation** from validated manifests
- **State machine** transitions (queued → executing → complete)
- **Checkpointing** for crash recovery
- **Deadline monitoring** and escalation
- **Progress tracking** across all cells

## Quick Start

```typescript
import {
  StudyOrchestrator,
  createStudyOrchestrator,
} from '@bentham/orchestrator';

const orchestrator = createStudyOrchestrator({
  database: dbClient,
  executor: executorClient,
  validator: validatorClient,
  notificationHub: notificationClient,
});

// Create a study from manifest
const study = await orchestrator.createStudy(manifest, tenantId);

// Get study status
const status = await orchestrator.getStudyStatus(study.id);

// Monitor progress
const progress = await orchestrator.getProgress(study.id);
```

## Study State Machine

```
manifest_received → validating → queued → executing → validating_results → complete
                                    ↓           ↓
                                  paused ← human_intervention_required
                                    ↓
                                  failed
```

### States

| State | Description |
|-------|-------------|
| `manifest_received` | Manifest submitted, awaiting validation |
| `validating` | Manifest being validated |
| `queued` | Valid manifest, jobs being created |
| `executing` | Jobs actively running |
| `paused` | Execution paused (manual or automatic) |
| `human_intervention_required` | Needs manual resolution |
| `validating_results` | Checking completion criteria |
| `complete` | Study finished successfully |
| `failed` | Study failed (unrecoverable) |

## API Reference

### Study Lifecycle

```typescript
// Create study
const study = await orchestrator.createStudy(manifest, tenantId);

// Get status
const status = await orchestrator.getStudyStatus(studyId);

// Cancel study
await orchestrator.cancelStudy(studyId, reason);

// Pause/resume
await orchestrator.pauseStudy(studyId);
await orchestrator.resumeStudy(studyId);
```

### Progress Tracking

```typescript
// Get overall progress
const progress = await orchestrator.getProgress(studyId);
// {
//   totalCells: 100,
//   completedCells: 75,
//   failedCells: 5,
//   pendingCells: 20,
//   completionRate: 0.75,
//   bySurface: Map<SurfaceId, CellCounts>,
//   byLocation: Map<LocationId, CellCounts>,
// }

// Update progress (called by executor)
await orchestrator.updateProgress(studyId, jobResult);
```

### Checkpointing

```typescript
// Save checkpoint (automatic, but can be manual)
await orchestrator.saveCheckpoint(studyId);

// Load checkpoint (for recovery)
const checkpoint = await orchestrator.loadCheckpoint(studyId);
```

### Deadline Monitoring

```typescript
// Check all studies for deadline risks
const atRisk = await orchestrator.checkDeadlines();

// Escalate at-risk studies
await orchestrator.escalateAtRiskStudies(atRisk);
```

### Event Handlers

```typescript
// Handle job completion
orchestrator.onJobComplete(async (result) => {
  await orchestrator.updateProgress(result.studyId, result);
  await orchestrator.checkStudyCompletion(result.studyId);
});

// Handle job failure
orchestrator.onJobFailed(async (error) => {
  await orchestrator.handleJobFailure(error);
});
```

## Checkpointing

The orchestrator automatically saves checkpoints to enable crash recovery:

```typescript
interface Checkpoint {
  studyId: string;
  state: StudyState;
  progress: StudyProgress;
  completedJobs: string[];
  pendingJobs: string[];
  failedJobs: string[];
  timestamp: Date;
}
```

Recovery process:
1. On startup, check for incomplete studies
2. Load latest checkpoint for each
3. Resume from checkpoint state
4. Re-queue any pending jobs

## Completion Checking

The orchestrator delegates completion decisions to the Validator:

```typescript
// Check if study meets completion criteria
const isComplete = await orchestrator.checkStudyCompletion(studyId);

// Completion is based on:
// - Coverage threshold met
// - Per-surface minimums met
// - No active jobs remaining
// - Quality gates passed
```

## Testing

```bash
pnpm test        # Run tests (43 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- `@bentham/database` - Data persistence
- `@bentham/validator` - Completion validation (client)
- `@bentham/notification-hub` - Alerts (client)
