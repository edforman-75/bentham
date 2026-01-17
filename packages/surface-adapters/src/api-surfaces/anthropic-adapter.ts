/**
 * Anthropic API Surface Adapter
 *
 * Adapter for querying Anthropic's Claude API
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
 * Anthropic adapter configuration
 */
export interface AnthropicAdapterConfig extends Partial<BaseAdapterConfig> {
  /** API configuration */
  apiConfig: ApiConfig;
  /** Default model */
  defaultModel?: string;
}

/**
 * Anthropic API message types
 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic surface metadata
 */
export const ANTHROPIC_METADATA: SurfaceMetadata = {
  id: 'anthropic-api',
  name: 'Anthropic Claude API',
  category: 'api',
  authRequirement: 'api_key',
  baseUrl: 'https://api.anthropic.com/v1',
  capabilities: {
    streaming: true,
    systemPrompts: true,
    conversationHistory: true,
    fileUploads: true,
    modelSelection: true,
    responseFormat: false, // No JSON mode yet
    maxInputTokens: 200000, // Claude 3
    maxOutputTokens: 4096,
  },
  rateLimit: 1000, // Varies by tier
  costPerInputToken: 0.003 / 1000, // Claude 3 Sonnet
  costPerOutputToken: 0.015 / 1000,
  enabled: true,
};

/**
 * Model pricing per 1K tokens
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  'claude-3-5-sonnet-20240620': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
};

/**
 * Anthropic API Surface Adapter
 */
export class AnthropicAdapter extends BaseSurfaceAdapter {
  private apiConfig: ApiConfig;
  private defaultModel: string;
  private readonly apiVersion = '2023-06-01';

  constructor(config: AnthropicAdapterConfig) {
    super(ANTHROPIC_METADATA, config);
    this.apiConfig = config.apiConfig;
    this.defaultModel = config.defaultModel ?? 'claude-3-5-sonnet-20241022';

    // Validate API key
    if (!this.apiConfig.apiKey) {
      throw new Error('Anthropic API key is required');
    }
  }

  /**
   * Execute a query against Anthropic API
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    try {
      // Build messages array
      const messages: AnthropicMessage[] = [];

      // Add conversation history
      if (request.conversationHistory) {
        for (const msg of request.conversationHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
              role: msg.role,
              content: msg.content,
            });
          }
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
      if (!response.content || response.content.length === 0) {
        return {
          success: false,
          timing: this.createTimingWithTTFB(startTime, endTime),
          error: {
            code: 'INVALID_RESPONSE',
            message: 'No content in response',
            retryable: true,
          },
        };
      }

      const responseText = response.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      const tokenUsage = this.calculateTokenUsage(response.usage, model);

      return {
        success: true,
        responseText,
        structured: {
          mainResponse: responseText,
          model: response.model,
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
    messages: AnthropicMessage[],
    model: string,
    request: SurfaceQueryRequest
  ): Promise<AnthropicResponse> {
    const url = `${this.apiConfig.baseUrl ?? ANTHROPIC_METADATA.baseUrl}/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiConfig.apiKey,
      'anthropic-version': this.apiVersion,
    };

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: (request.options?.maxTokens as number) ?? 4096,
    };

    // Add system prompt if provided
    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }

    // Add optional parameters
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
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

    return response.json() as Promise<AnthropicResponse>;
  }

  /**
   * Calculate token usage and cost
   */
  private calculateTokenUsage(
    usage: AnthropicResponse['usage'],
    model: string
  ): TokenUsage {
    // Find matching model pricing
    let pricing = MODEL_PRICING[model];
    if (!pricing) {
      // Try to match by prefix
      const modelPrefix = Object.keys(MODEL_PRICING).find(key => model.startsWith(key.split('-').slice(0, -1).join('-')));
      pricing = modelPrefix ? MODEL_PRICING[modelPrefix] : MODEL_PRICING['claude-3-5-sonnet-20241022'];
    }

    const inputCost = (usage.input_tokens / 1000) * pricing.input;
    const outputCost = (usage.output_tokens / 1000) * pricing.output;

    return {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      totalTokens: usage.input_tokens + usage.output_tokens,
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
 * Create an Anthropic adapter
 */
export function createAnthropicAdapter(config: AnthropicAdapterConfig): AnthropicAdapter {
  return new AnthropicAdapter(config);
}
