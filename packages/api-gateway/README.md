# @bentham/api-gateway

REST API gateway for Bentham.

## Overview

The API gateway provides the HTTP interface for tenant systems to interact with Bentham. It handles:

- Study lifecycle management (create, status, results, cancel, pause, resume)
- Authentication via API keys
- Rate limiting
- Request validation
- Error handling
- Health checks
- Cost reporting

## Endpoints

### Studies

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/studies | Submit a study manifest |
| GET | /v1/studies/:id | Get study status |
| GET | /v1/studies/:id/results | Get study results |
| DELETE | /v1/studies/:id | Cancel a study |
| POST | /v1/studies/:id/pause | Pause a study |
| POST | /v1/studies/:id/resume | Resume a study |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Simple health check |
| GET | /v1/health | Detailed health check |

### Costs

| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/costs/:studyId | Get study costs |

## Authentication

All endpoints except health checks require an API key. Pass the key in one of these ways:

```bash
# Authorization header
curl -H "Authorization: Bearer btm_your_api_key" ...

# X-API-Key header
curl -H "X-API-Key: btm_your_api_key" ...
```

## Usage

### Creating a Study

```bash
curl -X POST http://localhost:3000/v1/studies \
  -H "Authorization: Bearer btm_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "version": "1.0",
      "name": "My Study",
      "queries": [{"text": "What is AI?"}],
      "surfaces": [{"id": "openai-api", "required": true}],
      "locations": [{"id": "us-nyc", "name": "New York", "country": "US", "proxyType": "residential", "requireSticky": false}],
      "qualityGates": {"minResponseLength": 10, "requireActualContent": true},
      "completionCriteria": {"requiredSurfaces": {"surfaceIds": ["openai-api"], "coverageThreshold": 0.8}, "maxRetriesPerCell": 3},
      "evidenceLevel": "metadata",
      "legalHold": false,
      "sessionIsolation": "shared"
    }
  }'
```

### Checking Study Status

```bash
curl http://localhost:3000/v1/studies/study_abc123 \
  -H "Authorization: Bearer btm_your_api_key"
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| HOST | 0.0.0.0 | Server host |
| LOG_LEVEL | info | Logging level |
| NODE_ENV | development | Environment |

## Development

```bash
# Start development server
pnpm dev

# Run tests
pnpm test

# Build
pnpm build
```

## Security Features

- **API Key Authentication**: SHA-256 hashed keys with O(1) lookup
- **Tenant Isolation**: All requests scoped to authenticated tenant
- **Rate Limiting**: Per-key rate limits with configurable windows
- **Input Validation**: Zod schemas for request validation
- **Security Headers**: Helmet middleware for HTTP security headers
- **CORS**: Configurable cross-origin resource sharing
- **Error Sanitization**: No sensitive data in error responses (no tenant IDs, no study IDs in error messages)

## Test Coverage

- 25 unit tests covering gateway functionality
- 28 E2E security tests (SQL injection, XSS, path traversal, IDOR, etc.)
- 13 multi-tenant isolation tests
- 10 performance benchmarks

## Related Documentation

- [API Reference](../../docs/API_REFERENCE.md) - Full API documentation
- [Tenant Onboarding](../../docs/TENANT_ONBOARDING.md) - How to onboard tenants
- [Operations Runbook](../../docs/OPERATIONS_RUNBOOK.md) - Operational procedures
