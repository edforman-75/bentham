# @bentham/core

Shared types, utilities, and constants used across all Bentham modules.

## Installation

```bash
pnpm add @bentham/core
```

## Overview

This is the foundational package that provides:

- **Type definitions** for studies, manifests, jobs, and results
- **Utility functions** for ID generation, hashing, and validation
- **Constants** for surfaces, locations, and error codes
- **Common interfaces** that all modules depend on

## Quick Start

```typescript
import {
  generateId,
  hashContent,
  SURFACES,
  LOCATIONS,
} from '@bentham/core';
import type { Manifest, Job, JobResult } from '@bentham/core';

// Generate a unique ID
const studyId = generateId('study');  // 'study_abc123...'

// Hash content for integrity
const hash = hashContent('response text');

// Access surface definitions
const openai = SURFACES['openai-api'];
console.log(openai.name);  // 'OpenAI API'

// Access location definitions
const usEast = LOCATIONS['us-east'];
console.log(usEast.displayName);  // 'US East'
```

## API Reference

### Types

```typescript
import type {
  // Study types
  Manifest,
  Query,
  SurfaceConfig,
  LocationConfig,
  CompletionCriteria,
  QualityGates,
  EvidenceLevel,

  // Job types
  Job,
  JobStatus,
  JobResult,

  // Surface types
  SurfaceId,
  SurfaceType,
  SurfaceCapabilities,

  // Location types
  LocationId,

  // Error types
  BenthamError,
  ErrorCode,
} from '@bentham/core';
```

### Utilities

```typescript
import {
  generateId,      // Generate unique IDs
  hashContent,     // SHA-256 content hashing
  validateSchema,  // Zod schema validation
  formatError,     // Error formatting
  isRetryableError,// Check if error is retryable
} from '@bentham/core';
```

### Constants

```typescript
import {
  SURFACES,        // Available AI surfaces
  LOCATIONS,       // Supported geographic locations
  ERROR_CODES,     // Standard error codes
  DEFAULT_TIMEOUTS,// Default timeout values
  MAX_RETRIES,     // Default retry limits
} from '@bentham/core';
```

## Manifest Structure

A manifest defines a study to be executed:

```typescript
const manifest: Manifest = {
  version: '1.0.0',
  name: 'AI Response Comparison Study',
  description: 'Compare responses across AI surfaces',

  queries: [
    { id: 'q1', text: 'What is machine learning?' },
    { id: 'q2', text: 'Explain neural networks' },
  ],

  surfaces: [
    { id: 'openai-api', priority: 1 },
    { id: 'anthropic-api', priority: 1 },
  ],

  locations: [
    { id: 'us-east', priority: 1 },
  ],

  completionCriteria: {
    requiredSurfaces: {
      surfaceIds: ['openai-api', 'anthropic-api'],
      coverageThreshold: 0.95,
    },
    maxRetriesPerCell: 3,
  },

  qualityGates: {
    requireActualContent: true,
    minResponseLength: 100,
  },

  evidenceLevel: 'full',
  legalHold: false,
  deadline: new Date('2024-12-31'),
};
```

## Testing

```bash
pnpm test        # Run tests
pnpm test:watch  # Watch mode
```

## Dependencies

This is a leaf module with no internal dependencies.
