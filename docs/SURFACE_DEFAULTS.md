# Surface Defaults & Pricing Configuration

This document explains how default models and pricing are configured for each AI platform in Bentham.

## Overview

Each AI surface has:

- A **default model** (economy tier by default to minimize costs)
- **Multiple model options** that customers can override in their manifest
- **Accurate pricing data** based on current API rates

## Default Models by Platform

| Platform | Default Model | Tier | Cost per 10 Questions |
|----------|---------------|------|----------------------|
| OpenAI | gpt-4o-mini | Economy | $0.004 |
| Together (Meta) | Llama-3.3-70B | Standard | $0.006 |
| Google AI | gemini-2.0-flash | Economy | $0.008 |
| Anthropic | claude-3-5-haiku | Economy | $0.014 |
| Perplexity | sonar | Standard | $0.06* |
| xAI | grok-3-mini | Economy | $0.004 |

\* Perplexity charges $0.005 per request + token costs

## Cost Ranking (Cheapest to Most Expensive)

For standard usage with economy defaults:

1. **OpenAI gpt-4o-mini** - $0.004/10 questions
2. **xAI grok-3-mini** - $0.004/10 questions
3. **Together Llama-3.3-70B** - $0.006/10 questions
4. **Google gemini-2.0-flash** - $0.008/10 questions
5. **Anthropic claude-3-5-haiku** - $0.014/10 questions
6. **Perplexity sonar** - $0.06/10 questions

## Premium Model Costs (for comparison)

| Platform | Premium Model | Cost per 10 Questions |
|----------|---------------|----------------------|
| OpenAI | gpt-4-turbo | $0.16 |
| Anthropic | claude-opus-4 | $0.40 |
| Google AI | gemini-2.5-pro | $0.11 |
| xAI | grok-3 | $0.21 |
| Together | Llama-3.1-405B | $0.05 |

## Manifest Override Example

To override the default model for a surface in your manifest:

```json
{
  "surfaces": [
    {
      "id": "openai-api",
      "required": true,
      "options": {
        "model": "gpt-4o"
      }
    },
    {
      "id": "anthropic-api",
      "required": true
    }
  ]
}
```

In this example:

- OpenAI uses `gpt-4o` (standard tier, overridden)
- Anthropic uses `claude-3-5-haiku` (economy, default)

## Available Models by Platform

### OpenAI (`openai-api`)

| Model | Tier | Input $/1K | Output $/1K |
|-------|------|-----------|-------------|
| gpt-4o-mini | Economy | $0.00015 | $0.0006 |
| gpt-4o | Standard | $0.0025 | $0.01 |
| gpt-4-turbo | Premium | $0.01 | $0.03 |

### Anthropic (`anthropic-api`)

| Model | Tier | Input $/1K | Output $/1K |
|-------|------|-----------|-------------|
| claude-3-5-haiku-latest | Economy | $0.001 | $0.005 |
| claude-sonnet-4-20250514 | Standard | $0.003 | $0.015 |
| claude-opus-4-20250514 | Premium | $0.015 | $0.075 |

### Google AI (`google-ai-api`)

| Model | Tier | Input $/1K | Output $/1K |
|-------|------|-----------|-------------|
| gemini-2.0-flash | Economy | $0.0001 | $0.0004 |
| gemini-2.5-flash | Standard | $0.000075 | $0.0003 |
| gemini-2.5-pro | Premium | $0.00125 | $0.005 |

### xAI (`xai-api`)

| Model | Tier | Input $/1K | Output $/1K |
|-------|------|-----------|-------------|
| grok-3-mini | Economy | $0.0003 | $0.0005 |
| grok-3 | Premium | $0.003 | $0.015 |
| grok-4-fast-reasoning | Premium | $0.005 | $0.025 |

### Together.ai (`together-api`)

| Model | Tier | Input $/1K | Output $/1K |
|-------|------|-----------|-------------|
| Llama-3.1-8B-Instruct-Turbo | Economy | $0.00018 | $0.00018 |
| Llama-3.3-70B-Instruct-Turbo | Standard | $0.00088 | $0.00088 |
| Llama-3.1-405B-Instruct-Turbo | Premium | $0.005 | $0.005 |

### Perplexity (`perplexity-api`)

| Model | Tier | Input $/1K | Output $/1K | Request Fee |
|-------|------|-----------|-------------|-------------|
| sonar | Standard | $0.001 | $0.001 | $0.005 |
| sonar-pro | Premium | $0.003 | $0.015 | $0.005 |

## Cost Estimation at Scale

For 1,000 questions with all 6 API surfaces (using defaults):

| Platform | Est. Cost |
|----------|-----------|
| OpenAI | $0.40 |
| xAI | $0.40 |
| Together | $0.60 |
| Google AI | $0.80 |
| Anthropic | $1.40 |
| Perplexity | $6.00 |
| **Total** | **$9.60** |

## Web Surfaces

Web surfaces (chatgpt-web, perplexity-web, google-search) do not have model selection as they use the platform's web interface. Their costs are primarily proxy-related, not API token costs.

## API Usage

```typescript
import {
  SURFACE_DEFAULTS,
  getDefaultModel,
  getModelConfig,
  estimateQueryCost,
  estimateStudyCost,
  getAvailableModels,
  isValidModel,
} from '@bentham/core';

// Get default model for a surface
const defaultModel = getDefaultModel('openai-api'); // 'gpt-4o-mini'

// Get model configuration
const config = getModelConfig('openai-api', 'gpt-4o');

// Estimate cost for a single query
const costPerQuery = estimateQueryCost('openai-api', 'gpt-4o');

// Estimate total study cost
const estimate = estimateStudyCost(
  [{ id: 'openai-api' }, { id: 'anthropic-api' }],
  100, // queries
  3    // locations
);
// Returns: { perQuery, total, breakdown }

// Check if model is valid for surface
const valid = isValidModel('openai-api', 'gpt-4o'); // true

// List available models
const models = getAvailableModels('openai-api');
```

## Notes

- **xAI grok-3 is expensive** (~50x more than gpt-4o-mini). The default is now grok-3-mini.
- **Perplexity has per-request fees** ($0.005) in addition to token costs.
- **Google AI is very cheap** for high-volume usage due to low token prices.
- **Web surfaces have no model selection** - they use the platform's default.
