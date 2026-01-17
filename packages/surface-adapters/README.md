# @bentham/surface-adapters

Surface adapters for interacting with AI services and web chatbots.

## Installation

```bash
pnpm add @bentham/surface-adapters
```

## Overview

This package provides adapters for different AI surfaces:

- **API Surfaces** - Direct API integrations (OpenAI, Anthropic)
- **Web Surfaces** - Browser-based chatbots (ChatGPT Web, Perplexity)
- **Search Surfaces** - Search engines with AI features (Google)

## Quick Start

```typescript
import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createChatGPTWebAdapter,
} from '@bentham/surface-adapters';

// API adapter
const openai = createOpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
});

const result = await openai.executeQuery({
  text: 'What is machine learning?',
  context: { surfaceId: 'openai-api' },
});

// Web adapter (requires browser provider)
const chatgpt = createChatGPTWebAdapter({
  browserProvider: myBrowserProvider,
});

await chatgpt.initialize();
const webResult = await chatgpt.executeQuery({
  text: 'Explain neural networks',
  context: { surfaceId: 'chatgpt-web' },
});
```

## Available Adapters

### API Adapters

| Adapter | Surface ID | Description |
|---------|-----------|-------------|
| `OpenAIAdapter` | `openai-api` | OpenAI GPT models via API |
| `AnthropicAdapter` | `anthropic-api` | Anthropic Claude models via API |

### Web Adapters

| Adapter | Surface ID | Description |
|---------|-----------|-------------|
| `ChatGPTWebAdapter` | `chatgpt-web` | ChatGPT web interface |
| `PerplexityWebAdapter` | `perplexity-web` | Perplexity AI web interface |
| `GoogleSearchAdapter` | `google-search` | Google Search with AI Overview |

## API Reference

### Adapter Interface

All adapters implement the `SurfaceAdapter` interface:

```typescript
interface SurfaceAdapter {
  // Identification
  readonly id: SurfaceId;
  readonly name: string;
  readonly category: SurfaceCategory;

  // Capabilities
  getCapabilities(): SurfaceCapabilities;

  // Lifecycle
  initialize(): Promise<void>;
  cleanup(): Promise<void>;

  // Query execution
  executeQuery(query: AdapterQuery): Promise<AdapterResult>;

  // Health
  healthCheck(): Promise<HealthCheckResult>;
}
```

### API Adapters

#### OpenAI Adapter

```typescript
import { createOpenAIAdapter } from '@bentham/surface-adapters';

const adapter = createOpenAIAdapter({
  apiKey: 'sk-...',
  model: 'gpt-4',              // Optional, default: gpt-4
  maxTokens: 4096,             // Optional
  temperature: 0.7,            // Optional
  timeout: 30000,              // Optional, ms
  maxRetries: 3,               // Optional
});

const result = await adapter.executeQuery({
  text: 'Your question here',
  context: {
    surfaceId: 'openai-api',
    systemPrompt: 'You are a helpful assistant',
  },
});
```

#### Anthropic Adapter

```typescript
import { createAnthropicAdapter } from '@bentham/surface-adapters';

const adapter = createAnthropicAdapter({
  apiKey: 'sk-ant-...',
  model: 'claude-3-opus-20240229',
  maxTokens: 4096,
});
```

### Web Adapters

Web adapters require a browser provider for automation:

```typescript
interface BrowserProvider {
  launch(): Promise<BrowserPage>;
  close(): Promise<void>;
}

interface BrowserPage {
  goto(url: string): Promise<void>;
  waitForSelector(selector: string, options?: WaitOptions): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string, options?: TypeOptions): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  screenshot(): Promise<Buffer>;
  content(): Promise<string>;
  url(): string;
  close(): Promise<void>;
}
```

#### ChatGPT Web Adapter

```typescript
import { createChatGPTWebAdapter } from '@bentham/surface-adapters';

const adapter = createChatGPTWebAdapter({
  browserProvider: playwrightProvider,
  timeout: 60000,
  humanBehavior: {
    typingDelay: [50, 150],  // ms between keystrokes
    readingDelay: [1000, 3000],
  },
});

await adapter.initialize();
const result = await adapter.executeQuery({ text: '...' });
await adapter.cleanup();
```

#### Perplexity Web Adapter

```typescript
import { createPerplexityWebAdapter } from '@bentham/surface-adapters';

const adapter = createPerplexityWebAdapter({
  browserProvider: playwrightProvider,
});
```

#### Google Search Adapter

```typescript
import { createGoogleSearchAdapter } from '@bentham/surface-adapters';

const adapter = createGoogleSearchAdapter({
  browserProvider: playwrightProvider,
  captureAIOverview: true,  // Capture AI-generated content
});
```

### Error Handling

Adapters classify errors for retry logic:

```typescript
interface AdapterError extends Error {
  code: string;
  isRetryable: boolean;
  category: 'rate_limit' | 'auth' | 'network' | 'content_policy' | 'unknown';
  surfaceId: SurfaceId;
  originalError?: Error;
}
```

### Adapter Registry

```typescript
import {
  AdapterRegistry,
  createAdapterRegistry
} from '@bentham/surface-adapters';

const registry = createAdapterRegistry();

// Register adapters
registry.register('openai-api', openaiAdapter);
registry.register('chatgpt-web', chatgptAdapter);

// Get adapter by surface ID
const adapter = registry.get('openai-api');

// List available surfaces
const surfaces = registry.list(); // ['openai-api', 'chatgpt-web']
```

## Testing

```bash
pnpm test        # Run tests (30 tests)
pnpm test:watch  # Watch mode
```

The package includes a `MockBrowserProvider` for testing web adapters without a real browser.

## Dependencies

- `@bentham/core` - Core types and utilities
