# Failover Rules for Stuck/Detected Jobs

This document describes the rules for automatically recovering from stuck or detected automation jobs.

## Detection Triggers

### 1. Cloudflare Challenge Detected
- **Indicators**: Page contains "verify you are human", "just a moment", Turnstile iframe
- **Action**: Attempt 2Captcha Turnstile solver
- **Fallback**: Rotate IP via proxy, use new browser context

### 2. Google Rate Limiting
- **Indicators**: "unusual traffic", reCAPTCHA challenge, 429 response
- **Action**:
  1. Wait 60 seconds before retry
  2. If persists, rotate to new IP
  3. Increase delay between queries to 15-30 seconds
- **Fallback**: Switch to alternate Google account

### 3. ChatGPT Session Expired
- **Indicators**: Login button appears, redirect to /auth/, 403 response
- **Action**:
  1. Notify operator for re-login
  2. Pause and wait for manual intervention
- **Fallback**: Switch to alternate ChatGPT account

### 4. OpenAI API Quota Exceeded
- **Indicators**: 429 error, "insufficient_quota" in response
- **Action**:
  1. Notify operator immediately
  2. Pause OpenAI API calls
- **Fallback**: Switch to alternate API key

### 5. Job Timeout
- **Indicators**: No response after 120 seconds
- **Action**:
  1. Mark job as failed
  2. Open new browser tab/context
  3. Retry in new context
- **Fallback**: Skip and continue, retry at end

## Recovery Strategies

### IP Rotation
```
When: Cloudflare blocks, Google rate limits
How:
1. Close current browser context
2. Create new context with fresh IP from proxy pool
3. Verify new IP location via ipinfo.io
4. Resume from last checkpoint
```

### Browser Context Reset
```
When: Session corrupted, cookies expired, memory leaks
How:
1. Save current progress to intermediate file
2. Close browser
3. Launch fresh browser instance
4. Reload necessary pages (ChatGPT, Google, Gemini)
5. Resume from saved checkpoint
```

### Account Rotation
```
When: Account-specific rate limits or bans
Accounts:
- ChatGPT: Account A (primary) → Account B (backup)
- Google: Account A (primary) → Account B (backup)
- OpenAI API: Key A (primary) → Key B (backup)
```

### Delay Escalation
```
Initial delay: 2 seconds between queries
After warning: 5 seconds
After rate limit: 15 seconds
After captcha: 30 seconds
After block: 60 seconds + IP rotation
```

## Implementation Checklist

- [ ] Add timeout watchdog to all query functions
- [ ] Implement automatic Cloudflare detection and solving
- [ ] Add reCAPTCHA detection for Google
- [ ] Create account credential rotation config
- [ ] Add exponential backoff for rate limits
- [ ] Implement intermediate save on every error
- [ ] Add operator notification system (console alerts)
- [ ] Create health check endpoint for monitoring

## Operator Notifications

When intervention required, script should:
1. Print visible banner with `!` characters
2. State what action is needed
3. Provide manual steps if applicable
4. Wait for operator confirmation (Enter key)

Example:
```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  ⚠️  OPERATOR ACTION REQUIRED: ChatGPT session expired
  Please log in to ChatGPT in the browser window.
  Press Enter when ready to continue...
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

## Configuration

Add to study scripts:
```typescript
const FAILOVER_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  ipRotationOnBlock: true,
  captchaSolverEnabled: true,
  accounts: {
    chatgpt: ['primary@email.com', 'backup@email.com'],
    openai: ['sk-primary-key', 'sk-backup-key'],
  },
};
```
