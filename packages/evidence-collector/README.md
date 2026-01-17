# @bentham/evidence-collector

Evidence capture and preservation for audit and compliance.

## Installation

```bash
pnpm add @bentham/evidence-collector
```

## Overview

The evidence collector captures and preserves:

- **Screenshots** - Visual state of AI responses
- **HTML archives** - Complete page content
- **HAR files** - Network request/response logs
- **Video recordings** - Session recordings for streaming responses
- **Cryptographic hashes** - Tamper-evident verification
- **RFC 3161 timestamps** - Legal timestamping

## Quick Start

```typescript
import {
  createEvidenceCollector,
  captureScreenshot,
  captureHtmlArchive,
} from '@bentham/evidence-collector';

const collector = createEvidenceCollector({
  storage: s3Client,
  timestampAuthority: tsaUrl,
});

// Capture evidence for a job
const evidence = await collector.capture(page, {
  jobId,
  surfaceId: 'chatgpt-web',
  evidenceLevel: 'full',
});

// Individual captures
const screenshot = await captureScreenshot(page);
const html = await captureHtmlArchive(page);
const har = await captureHar(page);
```

## Evidence Levels

| Level | Captures |
|-------|----------|
| `full` | Screenshot, HTML, HAR, video (if streaming), all metadata |
| `metadata` | Response text, timestamps, context |
| `none` | Response text only |

```typescript
const evidence = await collector.capture(page, {
  evidenceLevel: 'full',  // or 'metadata' or 'none'
});
```

## API Reference

### Capture Methods

```typescript
// Screenshot capture
const screenshot = await captureScreenshot(page, {
  fullPage: true,
  format: 'png',
  quality: 90,
});

// HTML archive
const html = await captureHtmlArchive(page, {
  includeStyles: true,
  includeScripts: false,
  sanitize: true,
});

// HAR capture
const har = await captureHar(page, {
  includeResponseBodies: true,
});

// Video capture
const videoId = await startVideoCapture(page);
// ... interaction ...
const video = await stopVideoCapture(videoId);
```

### Hashing and Timestamping

```typescript
// Generate SHA-256 hash
const hash = hashEvidence(content);

// Get RFC 3161 timestamp
const timestamp = await getTimestamp(hash, {
  authority: 'https://freetsa.org/tsr',
});

// Verify timestamp
const valid = await verifyTimestamp(content, timestamp);
```

### Storage

```typescript
// Store evidence
const url = await storeEvidence(evidence, {
  bucket: 'bentham-evidence',
  prefix: `${studyId}/${jobId}/`,
  encryption: 'AES256',
});

// Get signed URL for access
const signedUrl = await getEvidenceUrl(evidenceId, {
  expiresIn: 3600,
});
```

### Legal Hold

```typescript
// Enable legal hold (prevents deletion)
await enableLegalHold(studyId, {
  reason: 'Pending litigation',
  expiresAt: null,  // Indefinite
});

// Check legal hold status
const status = await getLegalHoldStatus(studyId);

// Release legal hold
await releaseLegalHold(studyId, {
  reason: 'Case resolved',
});
```

## Evidence Structure

```typescript
interface Evidence {
  id: string;
  jobId: string;
  studyId: string;
  surfaceId: SurfaceId;

  // Captures
  screenshot?: {
    path: string;
    format: 'png' | 'jpeg';
    dimensions: { width: number; height: number };
  };
  htmlArchive?: {
    path: string;
    originalUrl: string;
    byteSize: number;
  };
  harFile?: {
    path: string;
    requestCount: number;
  };
  video?: {
    path: string;
    durationMs: number;
    format: 'webm' | 'mp4';
  };

  // Integrity
  sha256Hash: string;
  timestamp?: {
    authority: string;
    token: string;
    timestamp: Date;
  };

  // Metadata
  capturedAt: Date;
  evidenceLevel: EvidenceLevel;
  metadata: Record<string, unknown>;
}
```

## Storage Configuration

```typescript
const collector = createEvidenceCollector({
  storage: {
    type: 's3',
    bucket: 'bentham-evidence',
    region: 'us-east-1',
    encryption: 'AES256',
  },
  timestampAuthority: {
    url: 'https://freetsa.org/tsr',
    timeout: 10000,
  },
  retention: {
    defaultDays: 90,
    legalHoldOverride: true,
  },
});
```

## Testing

```bash
pnpm test        # Run tests (42 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- AWS S3 SDK (or compatible storage)
- RFC 3161 TSA client
