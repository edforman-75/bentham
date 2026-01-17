# Bentham Operations Runbook

This runbook provides operational procedures for managing the Bentham platform.

## Table of Contents

1. [System Overview](#system-overview)
2. [Monitoring & Alerting](#monitoring--alerting)
3. [Common Procedures](#common-procedures)
4. [Incident Response](#incident-response)
5. [Maintenance Procedures](#maintenance-procedures)
6. [Disaster Recovery](#disaster-recovery)

---

## System Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer                             │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │ API Gateway │ │ API Gateway │ │ API Gateway │
        │   (Node 1)  │ │   (Node 2)  │ │   (Node 3)  │
        └─────────────┘ └─────────────┘ └─────────────┘
                │               │               │
                └───────────────┼───────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │ Orchestrator│ │  Executor   │ │    Redis    │
        └─────────────┘ └─────────────┘ └─────────────┘
                │               │               │
                └───────────────┼───────────────┘
                                ▼
                        ┌─────────────┐
                        │  PostgreSQL │
                        └─────────────┘
```

### Service Locations

| Service | Production | Staging |
|---------|------------|---------|
| API Gateway | api.bentham.io | api-staging.bentham.io |
| Database (Primary) | db-primary.bentham.io:5432 | db-staging.bentham.io:5432 |
| Database (Replica) | db-replica.bentham.io:5432 | - |
| Redis | redis.bentham.io:6379 | redis-staging.bentham.io:6379 |
| Evidence Storage | evidence.bentham.io (S3) | evidence-staging.bentham.io |

### Key Ports

| Service | Port | Protocol |
|---------|------|----------|
| API Gateway | 3000 | HTTPS |
| PostgreSQL | 5432 | TCP |
| Redis | 6379 | TCP |

---

## Monitoring & Alerting

### Health Endpoints

**API Gateway Health:**
```bash
curl https://api.bentham.io/health
curl https://api.bentham.io/v1/health  # Detailed health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "orchestrator": "healthy"
  }
}
```

### Key Metrics

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| API Response Time (p95) | >500ms | >2000ms | Scale API nodes |
| Error Rate | >1% | >5% | Check logs, investigate |
| Database Connections | >80% | >95% | Increase pool size |
| Redis Memory | >80% | >95% | Evict old data |
| Queue Depth | >1000 | >5000 | Scale executors |
| Study Failure Rate | >5% | >20% | Check surface adapters |

### Alert Channels

| Severity | Channel | Response Time |
|----------|---------|---------------|
| Critical | PagerDuty + Slack #alerts | 15 min |
| Warning | Slack #alerts | 1 hour |
| Info | Slack #ops | Next business day |

---

## Common Procedures

### Viewing Logs

**API Gateway Logs:**
```bash
# Production
kubectl logs -f deployment/api-gateway -n bentham-prod

# Filter by level
kubectl logs deployment/api-gateway -n bentham-prod | grep '"level":50'  # Errors only
```

**Structured Log Fields:**

| Field | Description |
|-------|-------------|
| level | 30=info, 40=warn, 50=error |
| requestId | Unique request identifier |
| tenantId | Tenant context |
| studyId | Study being processed |
| msg | Log message |

### Checking Study Status

**Via API:**
```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" \
  https://api.bentham.io/v1/studies/study_abc123
```

**Via Database:**
```sql
SELECT
  id,
  tenant_id,
  status,
  progress->>'completionPercentage' as progress,
  created_at,
  updated_at
FROM studies
WHERE id = 'study_abc123';
```

### Manually Retrying Failed Jobs

```sql
-- Find failed jobs for a study
SELECT id, error_message, attempt_count
FROM jobs
WHERE study_id = 'study_abc123'
  AND status = 'failed';

-- Mark jobs for retry
UPDATE jobs
SET status = 'pending',
    attempt_count = 0,
    error_message = NULL
WHERE study_id = 'study_abc123'
  AND status = 'failed';
```

### Viewing API Key Status

```sql
SELECT
  id,
  tenant_id,
  name,
  permissions,
  rate_limit,
  last_used_at,
  created_at
FROM api_keys
WHERE tenant_id = 'tenant-kyanos';
```

### Revoking an API Key

```bash
pnpm admin:apikey revoke --key-id key-abc123
```

Or via SQL:

```sql
UPDATE api_keys
SET revoked = true,
    revoked_at = NOW()
WHERE id = 'key-abc123';
```

---

## Incident Response

### Severity Levels

| Level | Description | Example |
|-------|-------------|---------|
| SEV1 | Complete outage | API returning 5xx for all requests |
| SEV2 | Major degradation | Study execution failing >50% |
| SEV3 | Minor degradation | Single surface adapter failing |
| SEV4 | Low impact | Slow response times, cosmetic issues |

### SEV1: Complete API Outage

**Symptoms:**
- Health check failing
- All API requests returning 5xx
- No new studies being created

**Immediate Actions:**

1. **Acknowledge the alert** and notify stakeholders
2. **Check API Gateway status:**
   ```bash
   kubectl get pods -n bentham-prod -l app=api-gateway
   kubectl describe pod <pod-name> -n bentham-prod
   ```
3. **Check database connectivity:**
   ```bash
   psql -h db-primary.bentham.io -U bentham -c "SELECT 1"
   ```
4. **Check Redis:**
   ```bash
   redis-cli -h redis.bentham.io ping
   ```
5. **Restart API Gateway if needed:**
   ```bash
   kubectl rollout restart deployment/api-gateway -n bentham-prod
   ```
6. **Failover to replica if database is down:**
   ```bash
   # Promote replica to primary (irreversible)
   ./scripts/db-failover.sh
   ```

### SEV2: High Study Failure Rate

**Symptoms:**
- Studies completing with >50% failure rate
- Specific surfaces consistently failing

**Investigation:**

1. **Check failure patterns:**
   ```sql
   SELECT
     surface_id,
     COUNT(*) as failures,
     COUNT(DISTINCT study_id) as affected_studies
   FROM jobs
   WHERE status = 'failed'
     AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY surface_id
   ORDER BY failures DESC;
   ```

2. **Check error messages:**
   ```sql
   SELECT error_message, COUNT(*)
   FROM jobs
   WHERE status = 'failed'
     AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY error_message
   ORDER BY COUNT(*) DESC
   LIMIT 10;
   ```

3. **Check surface adapter logs:**
   ```bash
   kubectl logs deployment/executor -n bentham-prod | grep "surface_id"
   ```

**Common Causes:**

| Error Pattern | Likely Cause | Fix |
|---------------|--------------|-----|
| "Rate limited" | Too many requests | Reduce concurrency |
| "Invalid session" | Session expired | Clear session pool |
| "Captcha detected" | Bot detection | Rotate proxies |
| "Connection timeout" | Network issues | Check proxy provider |

### SEV3: Single Surface Failing

**Symptoms:**
- One surface adapter returning errors
- Other surfaces working normally

**Actions:**

1. **Disable the surface temporarily:**
   ```bash
   pnpm admin:surface disable openai-api
   ```

2. **Check surface-specific issues:**
   - OpenAI status: https://status.openai.com
   - Anthropic status: https://status.anthropic.com

3. **Test surface manually:**
   ```bash
   pnpm test:surface openai-api --live
   ```

4. **Re-enable when fixed:**
   ```bash
   pnpm admin:surface enable openai-api
   ```

---

## Maintenance Procedures

### Database Maintenance

**Weekly Tasks:**

1. **Update table statistics:**
   ```sql
   ANALYZE jobs;
   ANALYZE studies;
   ANALYZE results;
   ```

2. **Check for bloat:**
   ```sql
   SELECT
     relname,
     pg_size_pretty(pg_total_relation_size(relid)) as total_size,
     n_dead_tup as dead_tuples
   FROM pg_stat_user_tables
   ORDER BY n_dead_tup DESC
   LIMIT 10;
   ```

3. **Vacuum if needed:**
   ```sql
   VACUUM ANALYZE jobs;
   ```

### Evidence Cleanup

Old evidence files (non-legal-hold) are automatically cleaned up. Manual cleanup:

```bash
# List old evidence (>30 days)
aws s3 ls s3://bentham-evidence --recursive | \
  awk '{if ($1 < "2025-12-01") print $4}'

# Delete old evidence (careful!)
aws s3 rm s3://bentham-evidence/study_old123/ --recursive
```

### Session Pool Maintenance

Clear stale sessions:

```bash
pnpm admin:sessions cleanup --older-than 24h
```

Force refresh all sessions:

```bash
pnpm admin:sessions refresh --all
```

### Deploying Updates

**Standard Deployment:**

```bash
# Build and test
pnpm build
pnpm test

# Deploy to staging
kubectl apply -f k8s/staging/ -n bentham-staging

# Verify staging
curl https://api-staging.bentham.io/health

# Deploy to production (rolling)
kubectl apply -f k8s/production/ -n bentham-prod

# Monitor rollout
kubectl rollout status deployment/api-gateway -n bentham-prod
```

**Emergency Rollback:**

```bash
kubectl rollout undo deployment/api-gateway -n bentham-prod
```

---

## Disaster Recovery

### Backup Schedule

| Data | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Database | Hourly | 7 days | S3 (cross-region) |
| Database | Daily | 30 days | S3 (cross-region) |
| Redis | Daily | 7 days | S3 |
| Evidence | Real-time | Per retention policy | S3 (Object Lock) |

### Database Recovery

**Point-in-Time Recovery:**

```bash
# List available backups
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier bentham-prod

# Restore to point in time
aws rds restore-db-cluster-to-point-in-time \
  --source-db-cluster-identifier bentham-prod \
  --target-db-cluster-identifier bentham-recovered \
  --restore-to-time "2026-01-17T02:00:00Z"
```

### Evidence Recovery

Evidence files are stored with S3 Object Lock and versioning:

```bash
# List versions of a file
aws s3api list-object-versions \
  --bucket bentham-evidence \
  --prefix study_abc123/

# Restore a specific version
aws s3api copy-object \
  --bucket bentham-evidence \
  --copy-source bentham-evidence/study_abc123/screenshot.png?versionId=xxx \
  --key study_abc123/screenshot.png
```

### Full System Recovery

1. **Provision new infrastructure** (if needed)
2. **Restore database from backup**
3. **Restore Redis from backup**
4. **Deploy application**
5. **Verify health checks**
6. **Update DNS/load balancer**
7. **Verify tenant access**

---

## Security Procedures

### Rotating API Keys

```bash
# Generate new key
pnpm admin:apikey create \
  --tenant-id tenant-kyanos \
  --name "Production Key (rotated)" \
  --permissions "*"

# Notify tenant of new key
# Wait for tenant to update their integration

# Revoke old key
pnpm admin:apikey revoke --key-id old-key-id
```

### Rotating Database Credentials

```bash
# Update credentials in secrets manager
aws secretsmanager update-secret \
  --secret-id bentham/db-credentials \
  --secret-string '{"username":"bentham","password":"new-password"}'

# Restart API Gateway to pick up new credentials
kubectl rollout restart deployment/api-gateway -n bentham-prod
```

### Security Incident Response

1. **Isolate affected systems**
2. **Preserve logs and evidence**
3. **Notify security team**
4. **Assess scope of breach**
5. **Notify affected tenants if required**
6. **Remediate vulnerability**
7. **Post-incident review**

---

## Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-Call Engineer | PagerDuty | Automatic |
| Database Admin | dba@bentham.io | SEV1/SEV2 |
| Security | security@bentham.io | Any security issue |
| Product Owner | product@bentham.io | SEV1 |

---

## Appendix: Useful Commands

```bash
# Check all pod status
kubectl get pods -n bentham-prod

# Tail all logs
kubectl logs -f -l app=bentham -n bentham-prod --all-containers

# Get database connection count
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='bentham'"

# Check Redis memory
redis-cli -h redis.bentham.io INFO memory | grep used_memory_human

# List active studies
psql -c "SELECT id, tenant_id, status FROM studies WHERE status IN ('executing', 'queued')"

# Force study completion (emergency)
psql -c "UPDATE studies SET status='cancelled' WHERE id='study_xxx'"
```
