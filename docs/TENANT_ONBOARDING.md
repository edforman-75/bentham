# Tenant Onboarding Guide

This guide covers how to onboard a new tenant to the Bentham platform.

## Overview

Each tenant in Bentham:

- Has isolated data (studies, results, evidence)
- Gets unique API keys with configurable rate limits
- Can have multiple users with role-based access
- Has separate cost tracking and billing
- Cannot access other tenants' resources

## Onboarding Checklist

- [ ] Create tenant record in database
- [ ] Generate initial API key
- [ ] Configure rate limits and permissions
- [ ] Set up webhook endpoints (optional)
- [ ] Configure Slack/email notifications (optional)
- [ ] Provide API documentation and examples
- [ ] Verify first successful study execution

---

## Step 1: Create Tenant Record

Create a new tenant in the database:

```sql
INSERT INTO tenants (
  id,
  name,
  organization,
  plan,
  status,
  created_at
) VALUES (
  'tenant-kyanos',
  'Kyanos Research',
  'Kyanos, Inc.',
  'enterprise',
  'active',
  NOW()
);
```

Or via the admin CLI:

```bash
pnpm admin:tenant create \
  --id tenant-kyanos \
  --name "Kyanos Research" \
  --organization "Kyanos, Inc." \
  --plan enterprise
```

## Step 2: Generate API Key

Generate a secure API key for the tenant:

```bash
pnpm admin:apikey create \
  --tenant-id tenant-kyanos \
  --name "Production API Key" \
  --permissions "*" \
  --rate-limit 1000
```

This will output:

```
API Key created successfully!

API Key: btm_abc123xyz789...
Key ID: key-abc123
Tenant: tenant-kyanos
Permissions: * (full access)
Rate Limit: 1000 requests/minute

IMPORTANT: Store this key securely. It cannot be retrieved later.
```

## Step 3: Configure Rate Limits

Set appropriate rate limits based on the tenant's plan:

| Plan | Requests/min | Concurrent Studies | Max Queries/Study |
|------|-------------|-------------------|-------------------|
| Free | 60 | 1 | 50 |
| Standard | 300 | 5 | 500 |
| Enterprise | 1000 | Unlimited | Unlimited |

```bash
pnpm admin:tenant set-limits \
  --tenant-id tenant-kyanos \
  --rate-limit 1000 \
  --concurrent-studies unlimited \
  --max-queries unlimited
```

## Step 4: Configure Notifications (Optional)

Set up Slack notifications for study events:

```bash
pnpm admin:tenant configure-notifications \
  --tenant-id tenant-kyanos \
  --slack-webhook "https://hooks.slack.com/services/T.../B.../xxx" \
  --events study.completed,study.failed
```

Available notification channels:

- **Slack**: Real-time study updates
- **Email**: Daily digests and critical alerts
- **Webhook**: Custom integrations

## Step 5: Configure Webhook Endpoints (Optional)

Register webhook endpoints for the tenant:

```bash
pnpm admin:webhook create \
  --tenant-id tenant-kyanos \
  --url "https://api.kyanos.io/webhooks/bentham" \
  --events study.completed,study.failed,study.progress \
  --secret "whsec_..."
```

---

## Tenant Configuration Options

### Plan Features

| Feature | Free | Standard | Enterprise |
|---------|------|----------|------------|
| API Surfaces | 2 | 5 | All |
| Web Surfaces | 0 | 3 | All |
| Locations | 1 | 5 | All |
| Evidence Storage | 7 days | 30 days | Unlimited |
| Legal Hold | No | No | Yes |
| Dedicated Support | No | Email | 24/7 |

### Permissions

API keys can be scoped to specific permissions:

| Permission | Description |
|------------|-------------|
| `*` | Full access (all permissions) |
| `studies:create` | Create new studies |
| `studies:read` | View study status and results |
| `studies:delete` | Cancel studies |
| `studies:pause` | Pause/resume studies |
| `costs:read` | View cost data |
| `admin:keys` | Manage API keys |

Example: Create a read-only API key:

```bash
pnpm admin:apikey create \
  --tenant-id tenant-kyanos \
  --name "Dashboard API Key" \
  --permissions "studies:read,costs:read" \
  --rate-limit 100
```

---

## Integration Examples

### Python

```python
from bentham import BenthamClient

client = BenthamClient(api_key="btm_your_api_key")

# Create a study
study = client.studies.create(
    manifest={
        "version": "1.0",
        "name": "Brand Perception Study",
        "queries": [
            {"text": "What is the best cloud provider?"},
            {"text": "Compare AWS vs Azure"},
        ],
        "surfaces": [
            {"id": "openai-api", "required": True},
            {"id": "anthropic-api", "required": True},
        ],
        "locations": [
            {"id": "us-nyc", "proxyType": "residential", "requireSticky": False},
        ],
        "completionCriteria": {
            "requiredSurfaces": {"surfaceIds": ["openai-api"], "coverageThreshold": 0.95},
            "maxRetriesPerCell": 3,
        },
        "qualityGates": {"requireActualContent": True},
        "evidenceLevel": "metadata",
        "legalHold": False,
        "deadline": "2026-01-20T00:00:00Z",
        "sessionIsolation": "shared",
    },
    callback_url="https://your-domain.com/webhooks/bentham",
)

print(f"Study created: {study.id}")

# Check status
status = client.studies.get(study.id)
print(f"Status: {status.status}, Progress: {status.progress.completionPercentage}%")

# Get results when complete
results = client.studies.get_results(study.id)
for result in results.data:
    print(f"{result.surfaceId}: {result.response[:100]}...")
```

### Node.js

```typescript
import { BenthamClient } from '@bentham/sdk';

const client = new BenthamClient({ apiKey: 'btm_your_api_key' });

// Create a study
const study = await client.studies.create({
  manifest: {
    version: '1.0',
    name: 'Brand Perception Study',
    queries: [
      { text: 'What is the best cloud provider?' },
    ],
    surfaces: [
      { id: 'openai-api', required: true },
    ],
    locations: [
      { id: 'us-nyc', proxyType: 'residential', requireSticky: false },
    ],
    completionCriteria: {
      requiredSurfaces: { surfaceIds: ['openai-api'], coverageThreshold: 0.95 },
      maxRetriesPerCell: 3,
    },
    qualityGates: { requireActualContent: true },
    evidenceLevel: 'metadata',
    legalHold: false,
    deadline: new Date(Date.now() + 86400000).toISOString(),
    sessionIsolation: 'shared',
  },
});

console.log(`Study created: ${study.id}`);
```

### cURL

```bash
curl -X POST https://api.bentham.io/v1/studies \
  -H "Authorization: Bearer btm_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "version": "1.0",
      "name": "Quick Test",
      "queries": [{"text": "What is AI?"}],
      "surfaces": [{"id": "openai-api", "required": true}],
      "locations": [{"id": "us-nyc", "proxyType": "residential", "requireSticky": false}],
      "completionCriteria": {
        "requiredSurfaces": {"surfaceIds": ["openai-api"], "coverageThreshold": 0.95},
        "maxRetriesPerCell": 3
      },
      "qualityGates": {"requireActualContent": true},
      "evidenceLevel": "metadata",
      "legalHold": false,
      "deadline": "2026-01-20T00:00:00Z",
      "sessionIsolation": "shared"
    }
  }'
```

---

## Verification

After onboarding, verify the tenant setup:

1. **Test API access:**
   ```bash
   curl -H "Authorization: Bearer btm_..." https://api.bentham.io/v1/health
   ```

2. **Create a test study:**
   - Use a small manifest (1 query, 1 surface, 1 location)
   - Verify study completes successfully
   - Check results are accessible

3. **Verify tenant isolation:**
   - Confirm tenant cannot access other tenants' studies
   - Confirm API key only works for its tenant

4. **Verify notifications:**
   - Check Slack/email notifications are delivered
   - Check webhooks are called with correct payloads

---

## Troubleshooting

### API Key Issues

**Problem:** "Invalid API key" error

**Solutions:**
- Verify the key starts with `btm_`
- Check the key hasn't been revoked
- Ensure using Bearer token format: `Authorization: Bearer btm_...`

### Rate Limiting

**Problem:** Getting 429 Too Many Requests

**Solutions:**
- Check current rate limit with `X-RateLimit-Remaining` header
- Implement exponential backoff
- Request rate limit increase if needed

### Study Failures

**Problem:** Studies failing to complete

**Solutions:**
- Check study status for specific error details
- Review quality gates (may be too strict)
- Ensure deadline is far enough in the future
- Contact support if surface adapters are failing

---

## Support Contacts

- **Technical Support:** support@bentham.io
- **API Issues:** api-support@bentham.io
- **Enterprise Support:** (contact your account manager)
- **Security Issues:** security@bentham.io
