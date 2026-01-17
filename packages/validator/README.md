# @bentham/validator

Independent validation authority for manifests, job results, and study completion.

## Installation

```bash
pnpm add @bentham/validator
```

## Overview

The validator is the independent authority that determines:

- **Manifest validity** - Schema and semantic validation
- **Job result quality** - Quality gate evaluation
- **Study completion** - Whether completion criteria are met

Key principle: The validator is the single source of truth for quality decisions.

## Quick Start

```typescript
import {
  createValidator,
  validateManifest,
  validateJobResult,
  checkStudyCompletion,
} from '@bentham/validator';

// Validate a manifest
const manifestResult = validateManifest(manifest);
if (!manifestResult.valid) {
  console.error(manifestResult.errors);
}

// Validate a job result
const jobResult = validateJobResult(result, qualityGates);
if (!jobResult.passed) {
  console.log(jobResult.failedGates);
}

// Check study completion
const completion = await checkStudyCompletion(studyId, completionCriteria);
if (completion.isComplete) {
  console.log('Study finished!');
}
```

## Manifest Validation

### Schema Validation

```typescript
import { validateManifest } from '@bentham/validator';

const result = validateManifest(manifest);
// {
//   valid: boolean,
//   errors?: ValidationError[],
//   warnings?: ValidationWarning[],
//   studyInfo?: { totalCells, estimatedCost },
// }
```

### Validation Rules

- Required fields present (name, queries, surfaces, locations)
- Valid surface IDs
- Valid location IDs
- Completion criteria is achievable
- Deadline is in the future
- Query texts are non-empty

## Job Result Validation

### Quality Gates

```typescript
import { evaluateQualityGates } from '@bentham/validator';

const gates: QualityGate[] = [
  { name: 'min_length', type: 'min_length', threshold: 100, critical: true },
  { name: 'no_error', type: 'no_error_response', threshold: 1, critical: true },
  { name: 'has_content', type: 'actual_content', threshold: 1, critical: true },
];

const result = evaluateQualityGates(jobResult, gates);
// {
//   passed: boolean,
//   gateResults: GateResult[],
//   criticalFailures: string[],
// }
```

### Built-in Quality Gates

| Gate Type | Description |
|-----------|-------------|
| `min_length` | Minimum response length |
| `max_length` | Maximum response length |
| `no_error_response` | Not an error message |
| `no_refusal` | Not a refusal to answer |
| `actual_content` | Contains substantive content |
| `evidence_captured` | Evidence was collected |

## Study Completion

### Completion Criteria

```typescript
interface CompletionCriteria {
  requiredSurfaces: {
    surfaceIds: SurfaceId[];
    coverageThreshold: number;  // 0-1
  };
  maxRetriesPerCell: number;
  perSurfaceMinimum?: number;
  perLocationMinimum?: number;
}
```

### Checking Completion

```typescript
import { checkStudyCompletion } from '@bentham/validator';

const result = await checkStudyCompletion(studyId, criteria, database);
// {
//   isComplete: boolean,
//   completionRate: number,
//   unmetCriteria: string[],
//   summary: {
//     totalCells: number,
//     completedCells: number,
//     failedCells: number,
//     pendingCells: number,
//   },
// }
```

### Completion Rules

1. **Coverage threshold** - Required percentage of cells completed
2. **Per-surface minimum** - Each surface must have minimum completions
3. **Per-location minimum** - Each location must have minimum completions
4. **No pending jobs** - All jobs either completed or max retries exceeded
5. **Quality gates passed** - Completed cells passed quality checks

## Validation Helpers

```typescript
import {
  isValidSurfaceId,
  isValidLocationId,
  isValidQuery,
  validateDeadline,
} from '@bentham/validator';

// Check individual fields
isValidSurfaceId('openai-api');  // true
isValidLocationId('us-east');    // true
isValidQuery({ id: 'q1', text: '' });  // false - empty text
validateDeadline(new Date('2020-01-01'));  // false - in past
```

## API Reference

### Manifest Validation

```typescript
function validateManifest(manifest: unknown): ManifestValidationResult;
function validateManifestSchema(manifest: unknown): SchemaValidationResult;
function validateManifestSemantics(manifest: Manifest): SemanticValidationResult;
```

### Job Validation

```typescript
function validateJobResult(result: JobResult, gates: QualityGate[]): JobValidationResult;
function evaluateQualityGates(result: JobResult, gates: QualityGate[]): GateEvaluationResult;
```

### Study Completion

```typescript
function checkStudyCompletion(
  studyId: string,
  criteria: CompletionCriteria,
  database: DatabaseClient
): Promise<CompletionResult>;
```

## Testing

```bash
pnpm test        # Run tests (28 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- `@bentham/database` - Data access (read-only)
