/**
 * Surface Defaults Configuration
 *
 * Defines default models and pricing for each surface.
 * Customers can override these in the manifest.
 */

/**
 * Model tier for cost/quality tradeoff
 */
export type ModelTier = 'economy' | 'standard' | 'premium';

/**
 * Model configuration for a surface
 */
export interface ModelConfig {
  /** Model identifier */
  id: string;
  /** Display name */
  name: string;
  /** Cost tier */
  tier: ModelTier;
  /** Cost per 1K input tokens in USD */
  inputCostPer1K: number;
  /** Cost per 1K output tokens in USD */
  outputCostPer1K: number;
  /** Fixed cost per request (e.g., Perplexity) */
  requestCost?: number;
  /** Average tokens per response (for estimation) */
  avgOutputTokens: number;
  /** Average input tokens per query */
  avgInputTokens: number;
}

/**
 * Surface configuration with available models
 */
export interface SurfaceConfig {
  /** Surface ID */
  id: string;
  /** Display name */
  name: string;
  /** Default model ID */
  defaultModel: string;
  /** Available models for this surface */
  models: Record<string, ModelConfig>;
}

/**
 * Surface defaults configuration
 */
export const SURFACE_DEFAULTS: Record<string, SurfaceConfig> = {
  'openai-api': {
    id: 'openai-api',
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini', // Economy default
    models: {
      'gpt-4o-mini': {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        tier: 'economy',
        inputCostPer1K: 0.00015,
        outputCostPer1K: 0.0006,
        avgInputTokens: 50,
        avgOutputTokens: 450,
      },
      'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4o',
        tier: 'standard',
        inputCostPer1K: 0.0025,
        outputCostPer1K: 0.01,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
      'gpt-4-turbo': {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        tier: 'premium',
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
    },
  },

  'anthropic-api': {
    id: 'anthropic-api',
    name: 'Anthropic',
    defaultModel: 'claude-3-5-haiku-latest', // Economy default
    models: {
      'claude-3-5-haiku-latest': {
        id: 'claude-3-5-haiku-latest',
        name: 'Claude 3.5 Haiku',
        tier: 'economy',
        inputCostPer1K: 0.001,
        outputCostPer1K: 0.005,
        avgInputTokens: 50,
        avgOutputTokens: 280,
      },
      'claude-sonnet-4-20250514': {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        tier: 'standard',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.015,
        avgInputTokens: 50,
        avgOutputTokens: 400,
      },
      'claude-opus-4-20250514': {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        tier: 'premium',
        inputCostPer1K: 0.015,
        outputCostPer1K: 0.075,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
    },
  },

  'google-ai-api': {
    id: 'google-ai-api',
    name: 'Google AI',
    defaultModel: 'gemini-2.0-flash', // Economy default (very cheap)
    models: {
      'gemini-2.0-flash': {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        tier: 'economy',
        inputCostPer1K: 0.0001,
        outputCostPer1K: 0.0004,
        avgInputTokens: 50,
        avgOutputTokens: 1900,
      },
      'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        tier: 'standard',
        inputCostPer1K: 0.000075,
        outputCostPer1K: 0.0003,
        avgInputTokens: 50,
        avgOutputTokens: 2000,
      },
      'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        tier: 'premium',
        inputCostPer1K: 0.00125,
        outputCostPer1K: 0.005,
        avgInputTokens: 50,
        avgOutputTokens: 2000,
      },
    },
  },

  'perplexity-api': {
    id: 'perplexity-api',
    name: 'Perplexity',
    defaultModel: 'sonar', // Only option, has per-request cost
    models: {
      'sonar': {
        id: 'sonar',
        name: 'Sonar',
        tier: 'standard',
        inputCostPer1K: 0.001,
        outputCostPer1K: 0.001,
        requestCost: 0.005, // $0.005 per request
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
      'sonar-pro': {
        id: 'sonar-pro',
        name: 'Sonar Pro',
        tier: 'premium',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.015,
        requestCost: 0.005,
        avgInputTokens: 50,
        avgOutputTokens: 600,
      },
    },
  },

  'xai-api': {
    id: 'xai-api',
    name: 'xAI (Grok)',
    defaultModel: 'grok-3-mini', // Economy default (grok-3 is expensive)
    models: {
      'grok-3-mini': {
        id: 'grok-3-mini',
        name: 'Grok 3 Mini',
        tier: 'economy',
        inputCostPer1K: 0.0003,
        outputCostPer1K: 0.0005,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
      'grok-3': {
        id: 'grok-3',
        name: 'Grok 3',
        tier: 'premium',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.015,
        avgInputTokens: 50,
        avgOutputTokens: 1300,
      },
      'grok-4-fast-reasoning': {
        id: 'grok-4-fast-reasoning',
        name: 'Grok 4 Fast',
        tier: 'premium',
        inputCostPer1K: 0.005,
        outputCostPer1K: 0.025,
        avgInputTokens: 50,
        avgOutputTokens: 1500,
      },
    },
  },

  'together-api': {
    id: 'together-api',
    name: 'Together.ai (Meta Llama)',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', // Good balance
    models: {
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': {
        id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        name: 'Llama 3.1 8B',
        tier: 'economy',
        inputCostPer1K: 0.00018,
        outputCostPer1K: 0.00018,
        avgInputTokens: 50,
        avgOutputTokens: 600,
      },
      'meta-llama/Llama-3.3-70B-Instruct-Turbo': {
        id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        name: 'Llama 3.3 70B',
        tier: 'standard',
        inputCostPer1K: 0.00088,
        outputCostPer1K: 0.00088,
        avgInputTokens: 50,
        avgOutputTokens: 650,
      },
      'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': {
        id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
        name: 'Llama 3.1 405B',
        tier: 'premium',
        inputCostPer1K: 0.005,
        outputCostPer1K: 0.005,
        avgInputTokens: 50,
        avgOutputTokens: 700,
      },
    },
  },

  // Web surfaces - no model selection, fixed costs
  'chatgpt-web': {
    id: 'chatgpt-web',
    name: 'ChatGPT Web',
    defaultModel: 'default',
    models: {
      'default': {
        id: 'default',
        name: 'ChatGPT (Web Default)',
        tier: 'standard',
        inputCostPer1K: 0,
        outputCostPer1K: 0,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
    },
  },

  'perplexity-web': {
    id: 'perplexity-web',
    name: 'Perplexity Web',
    defaultModel: 'default',
    models: {
      'default': {
        id: 'default',
        name: 'Perplexity (Web Default)',
        tier: 'standard',
        inputCostPer1K: 0,
        outputCostPer1K: 0,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
    },
  },

  'google-search': {
    id: 'google-search',
    name: 'Google Search',
    defaultModel: 'default',
    models: {
      'default': {
        id: 'default',
        name: 'Google Search',
        tier: 'standard',
        inputCostPer1K: 0,
        outputCostPer1K: 0,
        avgInputTokens: 20,
        avgOutputTokens: 200,
      },
    },
  },
};

/**
 * Get the default model for a surface
 */
export function getDefaultModel(surfaceId: string): string | undefined {
  return SURFACE_DEFAULTS[surfaceId]?.defaultModel;
}

/**
 * Get model config for a surface and model
 */
export function getModelConfig(surfaceId: string, modelId?: string): ModelConfig | undefined {
  const surface = SURFACE_DEFAULTS[surfaceId];
  if (!surface) return undefined;

  const model = modelId ?? surface.defaultModel;
  return surface.models[model];
}

/**
 * Estimate cost per query for a surface/model combination
 */
export function estimateQueryCost(surfaceId: string, modelId?: string): number {
  const config = getModelConfig(surfaceId, modelId);
  if (!config) return 0.01; // Default fallback

  const inputCost = (config.avgInputTokens / 1000) * config.inputCostPer1K;
  const outputCost = (config.avgOutputTokens / 1000) * config.outputCostPer1K;
  const requestCost = config.requestCost ?? 0;

  return inputCost + outputCost + requestCost;
}

/**
 * Estimate total cost for a study based on surfaces and query count
 */
export function estimateStudyCost(
  surfaces: Array<{ id: string; options?: { model?: string } }>,
  queryCount: number,
  locationCount: number
): {
  perQuery: number;
  total: number;
  breakdown: Array<{ surfaceId: string; model: string; costPer10: number }>;
} {
  let totalPerQuery = 0;
  const breakdown: Array<{ surfaceId: string; model: string; costPer10: number }> = [];

  for (const surface of surfaces) {
    const modelId = surface.options?.model;
    const costPerQuery = estimateQueryCost(surface.id, modelId);
    totalPerQuery += costPerQuery;

    const config = getModelConfig(surface.id, modelId);
    breakdown.push({
      surfaceId: surface.id,
      model: config?.name ?? 'Unknown',
      costPer10: Math.round(costPerQuery * 10 * 10000) / 10000, // Round to 4 decimals
    });
  }

  const totalCells = queryCount * surfaces.length * locationCount;
  const total = totalCells * (totalPerQuery / surfaces.length);

  return {
    perQuery: Math.round(totalPerQuery * 10000) / 10000,
    total: Math.round(total * 100) / 100,
    breakdown,
  };
}

/**
 * Get all available models for a surface
 */
export function getAvailableModels(surfaceId: string): ModelConfig[] {
  const surface = SURFACE_DEFAULTS[surfaceId];
  if (!surface) return [];
  return Object.values(surface.models);
}

/**
 * Validate that a model is available for a surface
 */
export function isValidModel(surfaceId: string, modelId: string): boolean {
  const surface = SURFACE_DEFAULTS[surfaceId];
  if (!surface) return false;
  return modelId in surface.models;
}
