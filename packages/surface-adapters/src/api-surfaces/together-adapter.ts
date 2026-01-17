/**
 * Together.ai API Surface Adapter
 *
 * Adapter for querying Together.ai's API (Meta Llama and other open models)
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
 * Together adapter configuration
 */
export interface TogetherAdapterConfig extends Partial<BaseAdapterConfig> {
  /** API configuration */
  apiConfig: ApiConfig;
  /** Default model */
  defaultModel?: string;
}

/**
 * Together API message types (OpenAI-compatible)
 */
interface TogetherMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface TogetherResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Together surface metadata
 */
export const TOGETHER_METADATA: SurfaceMetadata = {
  id: 'together-api',
  name: 'Together.ai API (Meta Llama)',
  category: 'api',
  authRequirement: 'api_key',
  baseUrl: 'https://api.together.xyz/v1',
  capabilities: {
    streaming: true,
    systemPrompts: true,
    conversationHistory: true,
    fileUploads: false,
    modelSelection: true,
    responseFormat: true,
    maxInputTokens: 128000, // Llama 3.1
    maxOutputTokens: 4096,
  },
  rateLimit: 60,
  costPerInputToken: 0.0008 / 1000, // Llama 3.1 70B pricing
  costPerOutputToken: 0.0008 / 1000,
  enabled: true,
};

/**
 * Model pricing per 1K tokens
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Meta Llama 3.3
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': { input: 0.00088, output: 0.00088 },
  // Meta Llama 3.1
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': { input: 0.00018, output: 0.00018 },
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { input: 0.00088, output: 0.00088 },
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': { input: 0.005, output: 0.005 },
  // DeepSeek
  'deepseek-ai/DeepSeek-R1': { input: 0.003, output: 0.007 },
  'deepseek-ai/DeepSeek-V3': { input: 0.00049, output: 0.00049 },
  // Qwen
  'Qwen/Qwen2.5-72B-Instruct-Turbo': { input: 0.0012, output: 0.0012 },
};

/**
 * Together.ai API Surface Adapter
 */
export class TogetherAdapter extends BaseSurfaceAdapter {
  private apiConfig: ApiConfig;
  private defaultModel: string;

  constructor(config: TogetherAdapterConfig) {
    super(TOGETHER_METADATA, config);
    this.apiConfig = config.apiConfig;
    this.defaultModel = config.defaultModel ?? 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

    if (!this.apiConfig.apiKey) {
      throw new Error('Together API key is required');
    }
  }

  /**
   * Execute a query against Together API
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    try {
      const messages: TogetherMessage[] = [];

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

      const response = await this.makeApiRequest(messages, model, request);
      const endTime = Date.now();

      if (!response.choices || response.choices.length === 0) {
        return {
          success: false,
          timing: this.buildTiming(startTime, endTime),
          error: {
            code: 'INVALID_RESPONSE',
            message: 'No choices in response',
            retryable: true,
          },
        };
      }

      const responseText = response.choices[0].message.content;
      const tokenUsage = this.calculateTokenUsage(response.usage, model);

      return {
        success: true,
        responseText,
        structured: {
          mainResponse: responseText,
          model: response.model,
        },
        timing: this.buildTiming(startTime, endTime),
        tokenUsage,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Make the actual API request
   */
  private async makeApiRequest(
    messages: TogetherMessage[],
    model: string,
    request: SurfaceQueryRequest
  ): Promise<TogetherResponse> {
    const url = `${this.apiConfig.baseUrl ?? TOGETHER_METADATA.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiConfig.apiKey}`,
    };

    const body: Record<string, unknown> = {
      model,
      messages,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.options?.maxTokens) {
      body.max_tokens = request.options.maxTokens;
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

      throw new Error(`${response.status}: ${errorMessage}`);
    }

    return response.json() as Promise<TogetherResponse>;
  }

  /**
   * Calculate token usage and cost
   */
  private calculateTokenUsage(
    usage: TogetherResponse['usage'],
    model: string
  ): TokenUsage {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['meta-llama/Llama-3.3-70B-Instruct-Turbo'];
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
   * Create timing object
   */
  private buildTiming(startTime: number, endTime: number): ResponseTiming {
    const totalMs = endTime - startTime;
    return {
      totalMs,
      responseMs: totalMs,
    };
  }

  /**
   * Health check
   */
  protected async executeHealthCheck(): Promise<SurfaceQueryResponse> {
    return this.executeQuery({
      query: 'Say "OK"',
      options: { maxTokens: 5 },
    });
  }

  async close(): Promise<void> {
    // No persistent connections
  }
}

/**
 * Create a Together adapter
 */
export function createTogetherAdapter(config: TogetherAdapterConfig): TogetherAdapter {
  return new TogetherAdapter(config);
}
