# @bentham/session-pool

Browser session management for web-based AI surfaces.

## Installation

```bash
pnpm add @bentham/session-pool
```

## Overview

The session pool manages browser sessions for web automation:

- **Session lifecycle** - Creation, warming, and cleanup
- **Multi-engine support** - Playwright and Puppeteer
- **Session health** - Monitoring and auto-rotation
- **CAPTCHA handling** - Detection and solver integration
- **Pooling** - Efficient session reuse

## Quick Start

```typescript
import { createSessionPool } from '@bentham/session-pool';

const pool = createSessionPool({
  maxSessions: 10,
  engine: 'playwright',
  headless: true,
});

// Acquire a session
const session = await pool.acquire({
  surfaceId: 'chatgpt-web',
  requiresAuth: true,
});

// Use the session
await session.page.goto('https://chat.openai.com');

// Release when done
await pool.release(session);
```

## Session Lifecycle

```
idle → warming → ready → in_use → cooling → idle
                   ↓         ↓
              error/stale → recycling
```

### States

| State | Description |
|-------|-------------|
| `idle` | Available in pool |
| `warming` | Being initialized |
| `ready` | Warmed up, ready to acquire |
| `in_use` | Currently in use by a job |
| `cooling` | Post-use cleanup |
| `recycling` | Being reset after issues |

## API Reference

### Pool Management

```typescript
// Create pool
const pool = createSessionPool({
  maxSessions: 10,
  minSessions: 2,
  engine: 'playwright',
  warmupOnStart: true,
});

// Acquire session
const session = await pool.acquire({
  surfaceId: 'chatgpt-web',
  timeout: 30000,
});

// Release session
await pool.release(session);

// Force recycle (on error)
await pool.recycle(session);
```

### Session Operations

```typescript
// Get session health
const health = await getSessionHealth(session);
// { status, pageResponsive, cookiesValid, memoryUsage }

// Rotate session (get fresh one)
const newSession = await pool.rotate(session);

// Validate session still works
const valid = await session.validate();
```

### Browser Engine Selection

```typescript
const pool = createSessionPool({
  engine: 'playwright',  // or 'puppeteer'
  engineConfig: {
    browser: 'chromium',  // or 'firefox', 'webkit'
    args: ['--no-sandbox'],
    headless: true,
    slowMo: 0,
  },
});
```

### Surface-Specific Configuration

Different surfaces may work better with different engines:

```typescript
const pool = createSessionPool({
  defaultEngine: 'playwright',
  surfaceOverrides: {
    'chatgpt-web': { engine: 'playwright' },
    'meta-ai': { engine: 'puppeteer' },
  },
});
```

| Surface | Recommended Engine | Reason |
|---------|-------------------|--------|
| ChatGPT Web | Playwright | Better stealth |
| Gemini Web | Playwright | Google detection |
| Perplexity Web | Either | No preference |
| Meta AI | Puppeteer | Meta's detection |
| Google Search | Playwright | Stealth issues |

## CAPTCHA Integration

```typescript
const pool = createSessionPool({
  captchaSolver: captchaSolverClient,
  onCaptcha: async (session, type) => {
    // Automatic solving
    const solution = await captchaSolver.solve(type, session.page);
    return solution;
  },
});

// Manual CAPTCHA detection
const hasCaptcha = await session.detectCaptcha();
if (hasCaptcha) {
  await pool.requestCaptchaSolve(session);
}
```

## Session Warming

Pre-warm sessions for faster acquisition:

```typescript
const pool = createSessionPool({
  warmupOnStart: true,
  warmupConfig: {
    surfaceIds: ['chatgpt-web', 'perplexity-web'],
    sessionsPerSurface: 2,
    warmupTimeout: 60000,
  },
});

// Manual warmup
await pool.warmup('chatgpt-web', 3);
```

## Health Monitoring

```typescript
// Get pool status
const status = pool.getStatus();
// {
//   totalSessions: 10,
//   available: 5,
//   inUse: 3,
//   warming: 2,
//   unhealthy: 0,
// }

// Get session metrics
const metrics = pool.getMetrics();
// {
//   acquisitionTimeMs: { avg, p50, p95, p99 },
//   sessionLifetimeMs: { avg, max },
//   recycleCount: 15,
//   captchaCount: 3,
// }
```

## Configuration

```typescript
interface SessionPoolConfig {
  // Pool size
  maxSessions: number;
  minSessions?: number;

  // Engine
  engine: 'playwright' | 'puppeteer';
  engineConfig?: BrowserConfig;

  // Timeouts
  acquisitionTimeout?: number;  // ms
  sessionTimeout?: number;      // Max session lifetime
  idleTimeout?: number;         // Max idle time

  // Health
  healthCheckInterval?: number;
  maxConsecutiveFailures?: number;

  // Warmup
  warmupOnStart?: boolean;
  warmupConfig?: WarmupConfig;

  // CAPTCHA
  captchaSolver?: CaptchaSolver;
}
```

## Testing

```bash
pnpm test        # Run tests (57 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- Playwright or Puppeteer
- Redis (for distributed pooling)
