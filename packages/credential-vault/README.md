# @bentham/credential-vault

Secure credential storage and rotation for Bentham surface adapters.

## Installation

```bash
pnpm add @bentham/credential-vault
```

## Overview

This package provides:

- **Multiple credential types** (API keys, OAuth tokens, session cookies, etc.)
- **Pluggable storage backends** (memory, environment variables, encrypted files)
- **Credential rotation** with multiple strategies
- **Health tracking** and automatic cooldown after errors
- **Event-based notifications** for credential lifecycle events

## Quick Start

```typescript
import { createEnvVault, createDevVault } from '@bentham/credential-vault';

// Production: Read credentials from environment variables
const vault = createEnvVault();
const credential = await vault.poolManager.getCredential('openai-api');

// Development: In-memory storage
const devVault = createDevVault();
await devVault.provider.store({
  id: 'my-openai-key',
  type: 'api_key',
  surfaceId: 'openai-api',
  apiKey: 'sk-...',
  createdAt: new Date(),
  isActive: true,
});
```

## Credential Types

| Type | Description | Use Case |
|------|-------------|----------|
| `api_key` | Simple API key | OpenAI, Anthropic, Google APIs |
| `oauth_token` | OAuth access/refresh tokens | OAuth-based services |
| `session_cookie` | Browser session cookies | Web chatbots (ChatGPT, Perplexity) |
| `username_password` | Login credentials | Account re-authentication |
| `bearer_token` | Bearer tokens | API authentication |
| `custom` | Flexible format | Custom integrations |

## Storage Providers

### Memory Provider (Development/Testing)

```typescript
import { createMemoryProvider } from '@bentham/credential-vault';

const provider = createMemoryProvider();
await provider.store(credential);
```

### Environment Provider (Production)

Automatically reads from environment variables:

```bash
# Supported environment variables
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
PERPLEXITY_API_KEY=pplx-...
```

```typescript
import { createEnvironmentProvider } from '@bentham/credential-vault';

const provider = createEnvironmentProvider();
const creds = await provider.getBySurface('openai-api');
```

### Encrypted File Provider (Self-hosted)

Stores credentials in an AES-256-GCM encrypted file:

```typescript
import { createEncryptedFileProvider } from '@bentham/credential-vault';

const provider = createEncryptedFileProvider({
  filePath: '/secure/credentials.enc',
  masterPassword: process.env.MASTER_PASSWORD,
});
```

## Credential Rotation

### Rotation Strategies

| Strategy | Description |
|----------|-------------|
| `round_robin` | Cycle through credentials in order |
| `random` | Random selection |
| `least_used` | Prefer credentials with fewer uses |
| `least_errors` | Prefer credentials with fewer errors |
| `weighted` | Weighted random based on error rate |

### Using the Pool Manager

```typescript
import { createCredentialPoolManager, createMemoryProvider } from '@bentham/credential-vault';

const provider = createMemoryProvider();
const poolManager = createCredentialPoolManager(provider, 'least_errors');

// Get next credential (auto-rotates)
const credential = await poolManager.getCredential('openai-api');

// Report success/failure (affects rotation)
await poolManager.reportSuccess('openai-api', credential.id);
await poolManager.reportError('openai-api', credential.id);

// Check health
const health = poolManager.getHealthStatus();
// Map<SurfaceId, { status: 'healthy' | 'degraded' | 'critical', ... }>
```

### Automatic Cooldown

Credentials are automatically put in cooldown after errors:

```typescript
const pool = createCredentialPool(provider, {
  surfaceId: 'openai-api',
  strategy: 'round_robin',
  maxErrors: 5,           // Max errors before cooldown
  errorCooldownMs: 60000, // 1 minute cooldown
  errorWindowMs: 300000,  // 5 minute error window
});
```

## Events

```typescript
pool.on((event) => {
  switch (event.type) {
    case 'credential_added':
    case 'credential_deleted':
    case 'credential_used':
    case 'credential_disabled':
    case 'credential_enabled':
    case 'pool_health_changed':
      console.log(event);
  }
});
```

## API Reference

### Vault

```typescript
import { createCredentialVault, CredentialVault } from '@bentham/credential-vault';

const vault = createCredentialVault({
  provider: 'memory' | 'environment' | 'encrypted-file',
  providerConfig: { ... },
  rotationStrategy: 'round_robin',
});
```

### Provider Interface

```typescript
interface CredentialProvider {
  get(id: string): Promise<Credential | null>;
  getBySurface(surfaceId: SurfaceId): Promise<Credential[]>;
  getActiveBySurface(surfaceId: SurfaceId): Promise<Credential[]>;
  store(credential: Credential): Promise<void>;
  update(id: string, updates: Partial<Credential>): Promise<void>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  list(): Promise<string[]>;
  listByType(type: CredentialType): Promise<Credential[]>;
}
```

## Testing

```bash
pnpm test        # Run tests (42 tests)
pnpm test:watch  # Watch mode
```

## Dependencies

- `@bentham/core` - Core types and utilities
