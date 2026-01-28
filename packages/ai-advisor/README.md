# @bentham/ai-advisor

AI advisory modules for query generation, response validation, scoring, and troubleshooting.

---

## Deprecation Notice (2026-01-24)

**Per Bentham Charter v2.0**, this package contains functionality that is **out of scope** for Bentham.

Bentham's scope is limited to:
- Prompt execution
- Response capture
- Cost tracking
- Evidence collection

### Module Status

| Module | Status | Destination |
|--------|--------|-------------|
| `ResponseScorer` | **DEPRECATED** | Migrate to tenant repos |
| `ResponseValidator` (quality scoring) | **DEPRECATED** | Migrate to tenant repos |
| `ResponseValidator` (mechanical checks) | Keep | isEmpty, isError, timeout |
| `QueryGenerator` | Evaluate | Keep if used for study setup |
| `Troubleshooter` | Keep | Operational diagnostics |

See `/docs/MIGRATION-TO-TENANT-REPOS.md` for migration guidance.

---

## Installation

```bash
pnpm add @bentham/ai-advisor
```

## Overview

This package provides four AI-powered modules:

- **Query Generator** - Generates optimized queries for different surfaces
- **Response Validator** - Validates responses against quality criteria
- **Response Scorer** - Scores responses across multiple dimensions
- **Troubleshooter** - Diagnoses errors and recommends solutions

## Quick Start

```typescript
import {
  createQueryGenerator,
  createResponseValidator,
  createResponseScorer,
  createTroubleshooter,
} from '@bentham/ai-advisor';

// Generate optimized queries
const generator = createQueryGenerator();
const query = generator.generate({
  manifest,
  surfaceId: 'openai-api',
  cellQuery: { id: 'q1', text: 'What is AI?' },
});

// Validate responses
const validator = createResponseValidator();
const validation = validator.validate({
  query: 'What is AI?',
  response: 'Artificial intelligence is...',
  criteria: { minLength: 100 },
  surfaceId: 'openai-api',
});

// Score responses
const scorer = createResponseScorer();
const score = scorer.score({
  query: 'What is AI?',
  response: 'Artificial intelligence is...',
  dimensions: ['relevance', 'accuracy', 'completeness'],
});

// Troubleshoot errors
const troubleshooter = createTroubleshooter();
const diagnosis = troubleshooter.analyze({
  error: { code: 'RATE_LIMITED', message: '...', timestamp: new Date(), retryCount: 2 },
  surfaceId: 'openai-api',
  query: 'What is AI?',
});
```

## API Reference

### Query Generator

Generates optimized queries based on context and surface capabilities.

### Strategies

| Strategy | Description |
|----------|-------------|
| `direct` | Use query text as-is |
| `reformulated` | Improve clarity, add politeness |
| `expanded` | Add context from manifest metadata |
| `simplified` | Reduce complexity for token limits |
| `persona_adapted` | Adapt for specific tech level |

### Usage

```typescript
import { createQueryGenerator } from '@bentham/ai-advisor';

const generator = createQueryGenerator({
  maxQueryTokens: 4000,
  enableVariation: true,
  personaSettings: {
    formal: true,
    techLevel: 'intermediate',
  },
});

// Generate single query
const result = generator.generate(context);
// { query, systemPrompt?, metadata: { strategy, estimatedTokens } }

// Generate variations for retries
const variations = generator.generateVariations(context, 3);
```

### Response Validator

Validates responses against configurable quality gates.

### Validation Criteria

```typescript
interface ValidationCriteria {
  minLength?: number;
  maxLength?: number;
  requiredKeywords?: string[];
  forbiddenPatterns?: string[];
  requireRelevance?: boolean;
  requireCoherence?: boolean;
}
```

### Quality Gates

| Gate Type | Description |
|-----------|-------------|
| `min_length` | Minimum response length |
| `max_length` | Maximum response length |
| `relevance_score` | Relevance to query |
| `coherence_score` | Internal consistency |
| `completeness_score` | Answer completeness |

### Usage

```typescript
import { createResponseValidator } from '@bentham/ai-advisor';

const validator = createResponseValidator({
  defaultMinLength: 50,
  defaultMaxLength: 10000,
  detectRefusals: true,
  detectErrors: true,
});

const result = validator.validate({
  query: 'What is AI?',
  response: '...',
  criteria: { minLength: 100, requiredKeywords: ['artificial', 'intelligence'] },
  qualityGates: [
    { name: 'length', type: 'min_length', threshold: 100, critical: true },
  ],
  surfaceId: 'openai-api',
});

// Result: { isValid, checks[], gateResults[], issues[] }
```

### Response Scorer

Scores responses across multiple dimensions.

### Scoring Dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| `relevance` | 0.30 | How relevant to the query |
| `accuracy` | 0.20 | Factual correctness |
| `completeness` | 0.20 | Thoroughness of answer |
| `clarity` | 0.15 | Readability and structure |
| `coherence` | 0.10 | Logical consistency |
| `helpfulness` | 0.05 | Practical usefulness |
| `safety` | - | Content safety check |
| `consistency` | - | Consistency with prior responses |

### Usage

```typescript
import { createResponseScorer } from '@bentham/ai-advisor';

const scorer = createResponseScorer({
  defaultDimensions: ['relevance', 'accuracy', 'completeness', 'clarity'],
});

const result = scorer.score({
  query: 'What is machine learning?',
  response: '...',
  dimensions: ['relevance', 'accuracy', 'completeness'],
  referenceAnswer: 'Optional reference for comparison',
});

// Result: {
//   overallScore: 0.85,
//   dimensionScores: [{ dimension, score, confidence, explanation }],
//   confidence: 0.9,
//   explanation: '...'
// }
```

### Troubleshooter

Diagnoses errors and recommends recovery actions.

### Diagnosis Categories

| Category | Description |
|----------|-------------|
| `rate_limiting` | Request rate exceeded |
| `authentication` | Auth failure |
| `network` | Connectivity issues |
| `content_policy` | Content filter triggered |
| `timeout` | Request timed out |
| `service_unavailable` | Surface down |
| `quota_exceeded` | Usage quota hit |
| `session_expired` | Web session invalid |
| `captcha_required` | CAPTCHA challenge |

### Recommendation Types

| Type | Description |
|------|-------------|
| `retry_with_delay` | Wait and retry |
| `retry_with_modification` | Modify query and retry |
| `switch_surface` | Try different surface |
| `refresh_credentials` | Re-authenticate |
| `rotate_proxy` | Change IP address |
| `reduce_query_complexity` | Simplify query |
| `wait_for_quota_reset` | Wait for quota |
| `manual_intervention` | Human needed |
| `disable_surface` | Temporarily disable |

### Usage

```typescript
import { createTroubleshooter } from '@bentham/ai-advisor';

const troubleshooter = createTroubleshooter({
  enableRootCauseAnalysis: true,
  trackSimilarIssues: true,
});

const result = troubleshooter.analyze({
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many requests',
    timestamp: new Date(),
    retryCount: 2,
    httpStatus: 429,
  },
  surfaceId: 'openai-api',
  query: 'What is AI?',
  surfaceHistory: {
    totalQueries: 100,
    failedQueries: 5,
    errorsByType: { RATE_LIMITED: 3 },
  },
});

// Result: {
//   diagnosis: { category, severity, summary, description, confidence },
//   recommendations: [{ type, priority, action, steps, expectedOutcome }],
//   rootCause?: { rootCause, contributingFactors, evidence, confidence },
// }
```

## Testing

```bash
pnpm test        # Run tests (33 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
