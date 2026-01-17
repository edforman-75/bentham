# Bentham API - User Acceptance Testing Guide

## Staging Environment

**Base URL:** https://bentham.vercel.app

**Status:** Operational

## Authentication

All `/v1/*` endpoints require an API key passed via the `X-API-Key` header.

### Test API Keys

| Tenant | API Key | Notes |
|--------|---------|-------|
| Staging | `btm_staging_test_key` | Default test key |
| Kyanos | `btm_kyanos_3cd39ed686bfd199bebb5d887d7a50b7` | Dedicated Kyanos key |
| GLU | `btm_glu_1af2a1d06605f423f86836da63cb745f` | Dedicated GLU key |

## API Endpoints

### Public Endpoints (No Auth Required)

#### Health Check
```bash
curl https://bentham.vercel.app/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-17T19:43:37.963Z",
  "version": "0.0.1"
}
```

#### API Info
```bash
curl https://bentham.vercel.app/
```

### Protected Endpoints (Auth Required)

#### Create Study
```bash
curl -X POST https://bentham.vercel.app/v1/studies \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Test Study",
    "queries": ["What is AI?", "How does ML work?"],
    "surfaces": ["openai-api", "anthropic-api"]
  }'
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123",
    "status": "validating",
    "createdAt": "2026-01-17T19:43:59.354Z",
    "estimatedCompletionTime": "2026-01-17T20:43:59.354Z"
  }
}
```

#### Get Study Status
```bash
curl https://bentham.vercel.app/v1/studies/STUDY_ID \
  -H "X-API-Key: YOUR_API_KEY"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "studyId": "study_abc123",
    "status": "executing",
    "progress": {
      "totalJobs": 100,
      "completedJobs": 45,
      "failedJobs": 2,
      "pendingJobs": 53,
      "completionPercentage": 45
    },
    "createdAt": "2026-01-17T19:13:47.537Z",
    "startedAt": "2026-01-17T19:18:47.537Z"
  }
}
```

#### Get Study Results
```bash
curl https://bentham.vercel.app/v1/studies/STUDY_ID/results \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Get Study Costs
```bash
curl https://bentham.vercel.app/v1/studies/STUDY_ID/costs \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Cancel Study
```bash
curl -X DELETE https://bentham.vercel.app/v1/studies/STUDY_ID \
  -H "X-API-Key: YOUR_API_KEY"
```

### Operator Dashboard Endpoints

#### Get System Health
```bash
curl https://bentham.vercel.app/v1/operator/health \
  -H "X-API-Key: YOUR_API_KEY"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "overallScore": 85,
    "surfaces": {
      "openai-api": { "overallScore": 75, "canServe": true },
      "anthropic-api": { "overallScore": 95, "canServe": true }
    },
    "totalHealthyAdapters": 3,
    "unavailableSurfaces": ["perplexity-api"]
  }
}
```

#### Get Active Incidents
```bash
curl https://bentham.vercel.app/v1/operator/incidents \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Get Surface Status
```bash
curl https://bentham.vercel.app/v1/operator/surfaces/openai-api/status \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Acknowledge Incident
```bash
curl -X POST https://bentham.vercel.app/v1/operator/incidents/INC-ABC123/acknowledge \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Resolve Incident
```bash
curl -X POST https://bentham.vercel.app/v1/operator/incidents/INC-ABC123/resolve \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"resolutionNotes": "Added credits to API account"}'
```

## UAT Test Scenarios

### Scenario 1: Basic Connectivity
- [ ] Health endpoint returns 200 OK
- [ ] Root endpoint returns API info
- [ ] CORS headers present in response

### Scenario 2: Authentication
- [ ] Request without API key returns 401 Unauthorized
- [ ] Request with invalid API key returns 401 Invalid API Key
- [ ] Request with valid API key returns expected data

### Scenario 3: Study Lifecycle
- [ ] Create study returns 201 with study ID
- [ ] Get study status returns progress information
- [ ] Get study results returns results summary
- [ ] Get study costs returns cost breakdown
- [ ] Delete study returns 204 No Content

### Scenario 4: Error Handling
- [ ] Invalid study ID returns appropriate error
- [ ] Malformed JSON returns 400 Bad Request
- [ ] Missing required fields returns validation error

### Scenario 5: Operator Dashboard
- [ ] System health endpoint returns overall health score
- [ ] Incidents endpoint returns list of active incidents
- [ ] Surface status endpoint returns adapter details
- [ ] Acknowledge incident updates status
- [ ] Resolve incident includes resolution notes

## Reporting Issues

Please report any issues with the following information:

1. **Endpoint:** Which API endpoint was called
2. **Request:** Full curl command or request details
3. **Expected:** What you expected to happen
4. **Actual:** What actually happened
5. **Response:** Full response body and status code

Submit issues to: [GitHub Issues](https://github.com/your-org/bentham/issues) or contact the development team directly.

## Notes

- This is a **staging environment** with mock data
- Study creation does not actually execute queries against AI surfaces
- All responses use simulated data for testing purposes
- Rate limiting is set to 100 requests per minute per API key
