# @bentham/proxy-manager

Residential proxy management with geographic targeting and provider monitoring.

## Installation

```bash
pnpm add @bentham/proxy-manager
```

## Overview

The proxy manager handles:

- **Proxy acquisition** with geographic targeting
- **Provider management** across multiple vendors
- **Health monitoring** and automatic failover
- **Cost tracking** per provider and location
- **IP rotation** strategies

## Quick Start

```typescript
import { createProxyManager } from '@bentham/proxy-manager';

const manager = createProxyManager({
  providers: [
    { id: 'brightdata', apiKey: process.env.BRIGHTDATA_KEY },
    { id: 'oxylabs', apiKey: process.env.OXYLABS_KEY },
  ],
  defaultProvider: 'brightdata',
});

// Get proxy for location
const proxy = await manager.acquireProxy({
  location: 'us-east',
  surfaceId: 'chatgpt-web',
});

// Use proxy
await page.setProxy(proxy.config);

// Release when done
await manager.releaseProxy(proxy);
```

## Supported Providers

| Provider | ID | Features |
|----------|-----|----------|
| Bright Data | `brightdata` | Residential, datacenter, mobile |
| Oxylabs | `oxylabs` | Residential, datacenter |
| SmartProxy | `smartproxy` | Residential |
| IPRoyal | `iproyal` | Residential, datacenter |

## API Reference

### Proxy Acquisition

```typescript
// Get proxy for location
const proxy = await manager.acquireProxy({
  location: 'us-west',
  sticky: true,       // Maintain same IP
  timeout: 30000,
});

// Get proxy for surface (uses optimal provider)
const proxy = await manager.getProxyForSurface('chatgpt-web', 'eu-west');

// Release proxy
await manager.releaseProxy(proxy);

// Rotate proxy (get new IP)
const newProxy = await manager.rotateProxy(proxy);
```

### Provider Management

```typescript
// Get provider status
const status = await manager.getProviderStatus('brightdata');
// {
//   status: 'healthy' | 'degraded' | 'down',
//   uptime24h: 0.995,
//   avgLatencyMs: 150,
//   successRate: 0.97,
//   activeAlerts: [],
// }

// Get provider metrics
const metrics = await manager.getProviderMetrics('brightdata', '24h');
// {
//   requestCount: 10000,
//   bandwidthGB: 5.2,
//   successRate: 0.97,
//   costPerGB: 12.50,
// }

// Test connectivity
const result = await manager.testProviderConnectivity('brightdata');
```

### Location Management

```typescript
// Check location availability
const available = await manager.getLocationAvailability('us-east');
// {
//   available: true,
//   providers: ['brightdata', 'oxylabs'],
//   latency: { brightdata: 120, oxylabs: 150 },
// }

// Get location metrics
const locationMetrics = await manager.getLocationMetrics('us-east', '24h');
```

### Cost Tracking

```typescript
// Get usage stats
const usage = await manager.getProxyUsage({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  groupBy: 'provider',
});

// Get cost breakdown
const cost = await manager.getProxyCost({
  studyId,
  breakdown: true,
});
```

## Provider Health Monitoring

The manager continuously monitors provider health:

```typescript
interface ProviderHealth {
  providerId: string;
  status: 'healthy' | 'degraded' | 'down';
  lastChecked: Date;

  // Availability
  uptime24h: number;
  currentlyAvailable: boolean;

  // Performance
  avgLatencyMs: number;
  successRate: number;

  // Geographic coverage
  locationStatus: Map<LocationId, {
    available: boolean;
    successRate: number;
    avgLatencyMs: number;
  }>;

  // Alerts
  activeAlerts: string[];
}
```

### Health Checks

- Periodic connectivity tests to each provider
- Per-location availability verification
- Latency monitoring by region
- Success rate tracking
- Automatic failover when degraded

### Alerting

```typescript
manager.on('provider:degraded', (event) => {
  console.log(`Provider ${event.providerId} degraded: ${event.reason}`);
});

manager.on('provider:down', (event) => {
  console.log(`Provider ${event.providerId} is down!`);
});

manager.on('location:unavailable', (event) => {
  console.log(`Location ${event.location} unavailable on ${event.providerId}`);
});
```

## Rotation Strategies

```typescript
const manager = createProxyManager({
  rotationStrategy: 'round_robin',  // or 'random', 'sticky', 'least_used'
  rotationInterval: 300000,  // Rotate every 5 minutes
});

// Strategies:
// - round_robin: Cycle through providers
// - random: Random provider selection
// - sticky: Keep same IP until failure
// - least_used: Use provider with lowest recent usage
```

## Configuration

```typescript
interface ProxyManagerConfig {
  providers: ProviderConfig[];
  defaultProvider: string;

  // Selection
  rotationStrategy: RotationStrategy;
  rotationInterval?: number;

  // Health
  healthCheckInterval?: number;  // ms
  maxConsecutiveFailures?: number;
  failoverEnabled?: boolean;

  // Timeouts
  connectionTimeout?: number;
  requestTimeout?: number;

  // Cost limits
  maxDailyCost?: number;
  alertThreshold?: number;
}
```

## Testing

```bash
pnpm test        # Run tests (49 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
- `@bentham/notification-hub` - Alerts
- Provider SDKs
