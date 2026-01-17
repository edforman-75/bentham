/**
 * Perplexity API Surface Adapter
 *
 * Adapter for querying Perplexity's API (Sonar models with citations)
 * Uses OpenAI-compatible API format
 */

import {
  BaseSurfaceAdapter,
  type BaseAdapterConfig,
} from '../base/base-adapter.js';
import type {
  SurfaceMetadata,
  SurfaceQueryRequest,
  SurfaceQueryResponse,
  ApiConfig,
  TokenUsage,
  ResponseTiming,
} from '../types.js';

/**
 * Perplexity adapter configuration
 */
export interface PerplexityAdapterConfig extends Partial<BaseAdapterConfig> {
  /** API configuration */
  apiConfig: ApiConfig;
  /** Default model */
  defaultModel?: string;
}

/**
 * Perplexity API message types (OpenAI-compatible)
 */
interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
  object: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
}

/**
 * Perplexity surface metadata
 */
export const PERPLEXITY_METADATA: SurfaceMetadata = {
  id: 'perplexity-api',
  name: 'Perplexity API',
  category: 'api',
  authRequirement: 'api_key',
  baseUrl: 'https://api.perplexity.ai',
  capabilities: {
    streaming: true,
    systemPrompts: true,
    conversationHistory: true,
    fileUploads: false,
    modelSelection: true,
    responseFormat: false,
    maxInputTokens: 127072, // Sonar models
    maxOutputTokens: 4096,
  },
  rateLimit: 50, // Default rate limit
  costPerInputToken: 0.001 / 1000, // Sonar pricing
  costPerOutputToken: 0.001 / 1000,
  enabled: true,
};

/**
 * Model pricing per 1K tokens (updated Jan 2026)
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'sonar': { input: 0.001, output: 0.001 },
  'sonar-pro': { input: 0.003, output: 0.015 },
  'sonar-reasoning': { input: 0.001, output: 0.005 },
  'sonar-reasoning-pro': { input: 0.002, output: 0.008 },
};

/**
 * Perplexity API Surface Adapter
 */
export class PerplexityAdapter extends BaseSurfaceAdapter {
  private apiConfig: ApiConfig;
  private defaultModel: string;

  constructor(config: PerplexityAdapterConfig) {
    super(PERPLEXITY_METADATA, config);
    this.apiConfig = config.apiConfig;
    this.defaultModel = config.defaultModel ?? 'sonar';

    // Validate API key
    if (!this.apiConfig.apiKey) {
      throw new Error('Perplexity API key is required');
    }
  }

  /**
   * Execute a query against Perplexity API
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    try {
      // Build messages array
      const messages: PerplexityMessage[] = [];

      // Add system prompt if provided
      if (request.systemPrompt) {
        messages.push({
          role: 'system',
          content: request.systemPrompt,
        });
      }

      // Add conversation history
      if (request.conversationHistory) {
        for (const msg of request.conversationHistory) {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      // Add the user query
      messages.push({
        role: 'user',
        content: request.query,
      });

      // Make API request
      const response = await this.makeApiRequest(messages, model, request);
      const endTime = Date.now();

      // Parse response
      if (!response.choices || response.choices.length === 0) {
        return {
          success: false,
          timing: this.createTimingWithTTFB(startTime, endTime),
          error: {
            code: 'INVALID_RESPONSE',
            message: 'No choices in response',
            retryable: true,
          },
        };
      }

      const responseText = response.choices[0].message.content;
      const tokenUsage = this.calculateTokenUsage(response.usage, model);

      // Convert citations to SourceCitation format
      const sources = response.citations?.map((url, index) => ({
        url,
        index,
      }));

      return {
        success: true,
        responseText,
        structured: {
          mainResponse: responseText,
          model: response.model,
          sources,
        },
        timing: this.createTimingWithTTFB(startTime, endTime),
        tokenUsage,
      };
    } catch (error) {
      throw error; // Let base class handle error classification
    }
  }

  /**
   * Make the actual API request
   */
  private async makeApiRequest(
    messages: PerplexityMessage[],
    model: string,
    request: SurfaceQueryRequest
  ): Promise<PerplexityResponse> {
    const url = `${this.apiConfig.baseUrl ?? PERPLEXITY_METADATA.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiConfig.apiKey}`,
    };

    const body: Record<string, unknown> = {
      model,
      messages,
    };

    // Add optional parameters
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.options?.maxTokens) {
      body.max_tokens = request.options.maxTokens;
    }

    // Perplexity-specific options
    if (request.options?.returnCitations !== false) {
      body.return_citations = true;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message ?? errorText;
      } catch {
        errorMessage = errorText;
      }

      // Add status code to message for error classification
      throw new Error(`${response.status}: ${errorMessage}`);
    }

    return response.json() as Promise<PerplexityResponse>;
  }

  /**
   * Calculate token usage and cost
   */
  private calculateTokenUsage(
    usage: PerplexityResponse['usage'],
    model: string
  ): TokenUsage {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['sonar'];
    const inputCost = (usage.prompt_tokens / 1000) * pricing.input;
    const outputCost = (usage.completion_tokens / 1000) * pricing.output;

    return {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      estimatedCostUsd: inputCost + outputCost,
    };
  }

  /**
   * Create timing with TTFB
   */
  private createTimingWithTTFB(startTime: number, endTime: number): ResponseTiming {
    const totalMs = endTime - startTime;
    return {
      totalMs,
      responseMs: totalMs,
    };
  }

  /**
   * Health check with a simple query
   */
  protected async executeHealthCheck(): Promise<SurfaceQueryResponse> {
    return this.executeQuery({
      query: 'Say "OK"',
      options: { maxTokens: 5 },
    });
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    // No persistent connections to close for API adapter
  }
}

/**
 * Create a Perplexity adapter
 */
export function createPerplexityAdapter(config: PerplexityAdapterConfig): PerplexityAdapter {
  return new PerplexityAdapter(config);
}
