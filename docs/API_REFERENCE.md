# Bentham API Reference

## Overview

The Bentham API provides a RESTful interface for managing AI surface studies. All endpoints require authentication via API key and return JSON responses.

## Base URL

```
Production:  https://api.bentham.io/v1
Staging:     https://api-staging.bentham.io/v1
Development: http://localhost:3000/v1
```

## Authentication

All API requests (except health checks) require a valid API key passed in the `Authorization` header:

```bash
curl -H "Authorization: Bearer btm_your_api_key_here" \
  https://api.bentham.io/v1/studies
```

API keys:

- Start with `btm_` prefix
- Are tenant-scoped (each key belongs to one tenant)
- Have configurable permissions and rate limits
- Should never be shared or committed to code

## Rate Limiting

Default rate limits:

| Tier | Requests/minute | Burst limit |
|------|----------------|-------------|
| Free | 60 | 10 |
| Standard | 300 | 50 |
| Enterprise | 1000 | 200 |

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 299
X-RateLimit-Reset: 1642531200
```

---

## Endpoints

### Health Check

Check API and service health status.

```
GET /health
```

**Authentication:** Not required

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-17T02:30:00.000Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "orchestrator": "healthy"
  }
}
```

**Status Codes:**

- `200 OK` - All services healthy
- `503 Service Unavailable` - One or more services degraded

---

### Single Query (Real-Time)

Execute a single query against any surface and get an immediate response. This is the simplest way to test Bentham.

```
POST /v1/query
```

**Authentication:** Required for production; optional for local development

**Request Body:**

```json
{
  "surface": "openai-api",
  "query": "What are the best dog food brands?",
  "location": "india-west"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| surface | string | Yes | Target surface ID (see Surface Types below) |
| query | string | Yes | The query text to send |
| location | string | No | Geographic location ID for proxy routing |

**Surface Types:**

| Surface ID | Type | Requires Browser? | Description |
|------------|------|-------------------|-------------|
| `openai-api` | API | No | OpenAI Chat Completions API |
| `anthropic-api` | API | No | Anthropic Claude API |
| `google-api` | API | No | Google Gemini API |
| `perplexity-api` | API | No | Perplexity API |
| `chatgpt-web` | Web | Yes | ChatGPT web interface (chatgpt.com) |
| `claude-web` | Web | Yes | Claude web interface (claude.ai) |
| `perplexity-web` | Web | Yes | Perplexity web interface |
| `google-search` | Web | Yes | Google Search with AI Overviews |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "surface": "openai-api",
    "query": "What are the best dog food brands?",
    "response": "Based on nutritional quality and reviews, some of the best dog food brands include...",
    "timestamp": "2026-01-17T02:30:00.000Z",
    "responseTimeMs": 1250,
    "location": "india-west",
    "evidence": {
      "screenshot": null,
      "html": null
    }
  },
  "requestId": "req_xyz789"
}
```

**Example - API Surface (no browser):**

```bash
curl -X POST http://localhost:3000/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "surface": "openai-api",
    "query": "What are the best dog food brands in India?"
  }'
```

**Example - Web Surface (requires Chrome with CDP):**

```bash
curl -X POST http://localhost:3000/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "surface": "chatgpt-web",
    "query": "What are the best dog food brands in India?"
  }'
```

> **Note:** Web surface queries require Chrome running with `--remote-debugging-port=9222` and an active login session to the target chatbot. See [Operator Quickstart](../OPERATOR_QUICKSTART.md) for setup instructions.

**Error Response (400 Bad Request):**

```json
{
  "success": false,
  "error": {
    "code": "SURFACE_UNAVAILABLE",
    "message": "Cannot connect to chatgpt-web surface. Ensure Chrome is running with CDP enabled and you are logged into ChatGPT.",
    "requestId": "req_xyz789"
  }
}
```

---

### Create Study

Submit a new study manifest for execution.

```
POST /v1/studies
```

**Request Body:**

```json
{
  "manifest": {
    "version": "1.0",
    "name": "Q1 Brand Perception Study",
    "queries": [
      { "text": "What is the best cloud provider?" },
      { "text": "Compare AWS vs Azure vs GCP" }
    ],
    "surfaces": [
      { "id": "openai-api", "required": true },
      { "id": "anthropic-api", "required": true },
      { "id": "google-search", "required": false }
    ],
    "locations": [
      {
        "id": "us-nyc",
        "name": "New York City",
        "proxyType": "residential",
        "requireSticky": false
      },
      {
        "id": "uk-london",
        "name": "London",
        "proxyType": "residential",
        "requireSticky": true
      }
    ],
    "completionCriteria": {
      "requiredSurfaces": {
        "surfaceIds": ["openai-api", "anthropic-api"],
        "coverageThreshold": 0.95
      },
      "maxRetriesPerCell": 3
    },
    "qualityGates": {
      "requireActualContent": true,
      "minResponseLength": 100
    },
    "evidenceLevel": "full",
    "legalHold": false,
    "deadline": "2026-01-20T00:00:00.000Z",
    "sessionIsolation": "per_study"
  },
  "priority": "normal",
  "callbackUrl": "https://your-domain.com/webhook/bentham"
}
```

**Manifest Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | string | Yes | Manifest schema version ("1.0") |
| name | string | No | Human-readable study name |
| queries | Query[] | Yes | List of queries to execute |
| surfaces | Surface[] | Yes | Target AI surfaces |
| locations | Location[] | Yes | Geographic locations for execution |
| completionCriteria | object | Yes | When to consider the study complete |
| qualityGates | object | Yes | Quality requirements for responses |
| evidenceLevel | string | Yes | Evidence capture level: "metadata", "screenshots", "full" |
| legalHold | boolean | Yes | Enable legal hold (prevents evidence deletion) |
| deadline | string | Yes | ISO 8601 deadline (must be in the future) |
| sessionIsolation | string | Yes | "shared" or "per_study" |

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123xyz",
    "status": "validating",
    "createdAt": "2026-01-17T02:30:00.000Z",
    "estimatedCompletionTime": "2026-01-17T04:30:00.000Z"
  },
  "requestId": "req_xyz789"
}
```

**Error Response (400 Bad Request):**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {
      "fieldErrors": {
        "manifest.deadline": ["Deadline must be in the future"]
      }
    },
    "requestId": "req_xyz789"
  }
}
```

---

### Get Study Status

Retrieve the current status and progress of a study.

```
GET /v1/studies/:id
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Study ID |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123xyz",
    "status": "executing",
    "progress": {
      "totalJobs": 100,
      "completedJobs": 45,
      "failedJobs": 2,
      "pendingJobs": 53,
      "completionPercentage": 45
    },
    "surfaces": [
      {
        "surfaceId": "openai-api",
        "completed": 20,
        "failed": 1,
        "pending": 29
      },
      {
        "surfaceId": "anthropic-api",
        "completed": 25,
        "failed": 1,
        "pending": 24
      }
    ],
    "createdAt": "2026-01-17T02:30:00.000Z",
    "startedAt": "2026-01-17T02:31:00.000Z"
  },
  "requestId": "req_xyz789"
}
```

**Study Status Values:**

| Status | Description |
|--------|-------------|
| validating | Manifest is being validated |
| queued | Study is queued for execution |
| executing | Study is actively running |
| paused | Study execution is paused |
| complete | All jobs completed successfully |
| failed | Study failed to complete |
| cancelled | Study was cancelled by user |

---

### Get Study Results

Retrieve results from a completed or in-progress study.

```
GET /v1/studies/:id/results
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number (1-indexed) |
| pageSize | integer | 50 | Results per page (max 100) |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123xyz",
    "status": "complete",
    "results": [
      {
        "jobId": "job_123",
        "queryText": "What is the best cloud provider?",
        "surfaceId": "openai-api",
        "locationId": "us-nyc",
        "response": "Based on various factors, the best cloud provider depends on your specific needs...",
        "executedAt": "2026-01-17T03:00:00.000Z",
        "latencyMs": 1250,
        "evidenceUrls": {
          "screenshot": "https://evidence.bentham.io/study_abc123/job_123/screenshot.png",
          "html": "https://evidence.bentham.io/study_abc123/job_123/page.html"
        }
      }
    ],
    "summary": {
      "totalQueries": 100,
      "successfulQueries": 98,
      "failedQueries": 2,
      "averageResponseTime": 1250
    },
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "totalPages": 2,
      "totalResults": 98
    },
    "completedAt": "2026-01-17T04:00:00.000Z"
  },
  "requestId": "req_xyz789"
}
```

---

### Cancel Study

Cancel an in-progress or queued study.

```
DELETE /v1/studies/:id
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123xyz",
    "status": "cancelled"
  },
  "requestId": "req_xyz789"
}
```

---

### Pause Study

Pause a running study. Can be resumed later.

```
POST /v1/studies/:id/pause
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123xyz",
    "status": "paused"
  },
  "requestId": "req_xyz789"
}
```

---

### Resume Study

Resume a paused study.

```
POST /v1/studies/:id/resume
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123xyz",
    "status": "running"
  },
  "requestId": "req_xyz789"
}
```

---

### Get Study Costs

Retrieve cost breakdown for a study.

```
GET /v1/costs/:studyId
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123xyz",
    "costs": {
      "total": 12.50,
      "currency": "USD",
      "breakdown": {
        "apiCalls": 8.00,
        "proxyUsage": 3.50,
        "storage": 0.50,
        "compute": 0.50
      }
    },
    "estimatedFinalCost": 25.00
  },
  "requestId": "req_xyz789"
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Request validation failed |
| INVALID_MANIFEST | 400 | Manifest structure or content is invalid |
| AUTHENTICATION_REQUIRED | 401 | No API key provided |
| INVALID_API_KEY | 401 | API key is invalid or expired |
| FORBIDDEN | 403 | Insufficient permissions |
| STUDY_NOT_FOUND | 404 | Study does not exist or belongs to another tenant |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Internal server error |

---

## Webhooks

When you provide a `callbackUrl` in your study request, Bentham will send webhook notifications for study events.

**Webhook Payload:**

```json
{
  "event": "study.completed",
  "studyId": "study_abc123xyz",
  "timestamp": "2026-01-17T04:00:00.000Z",
  "data": {
    "status": "complete",
    "summary": {
      "totalQueries": 100,
      "successfulQueries": 98,
      "failedQueries": 2
    }
  }
}
```

**Event Types:**

| Event | Description |
|-------|-------------|
| study.started | Study execution has begun |
| study.progress | Periodic progress update (every 25%) |
| study.completed | Study completed successfully |
| study.failed | Study failed to complete |
| study.cancelled | Study was cancelled |

**Webhook Headers:**

```
X-Bentham-Signature: sha256=abc123...
X-Bentham-Event: study.completed
X-Bentham-Delivery: dlv_xyz789
```

---

## SDKs

Official SDKs are available for:

- **Python**: `pip install bentham-sdk`
- **Node.js**: `npm install @bentham/sdk`
- **Go**: `go get github.com/bentham/sdk-go`

---

## Support

For API support:

- Email: api-support@bentham.io
- Documentation: https://docs.bentham.io
- Status page: https://status.bentham.io
