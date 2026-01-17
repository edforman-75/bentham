/**
 * OpenAI API Surface Adapter
 *
 * Adapter for querying OpenAI's API (GPT-4, GPT-3.5, etc.)
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
 * OpenAI adapter configuration
 */
export interface OpenAIAdapterConfig extends Partial<BaseAdapterConfig> {
  /** API configuration */
  apiConfig: ApiConfig;
  /** Default model */
  defaultModel?: string;
}

/**
 * OpenAI API response types
 */
interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChatResponse {
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
 * OpenAI surface metadata
 */
export const OPENAI_METADATA: SurfaceMetadata = {
  id: 'openai-api',
  name: 'OpenAI API',
  category: 'api',
  authRequirement: 'api_key',
  baseUrl: 'https://api.openai.com/v1',
  capabilities: {
    streaming: true,
    systemPrompts: true,
    conversationHistory: true,
    fileUploads: true,
    modelSelection: true,
    responseFormat: true,
    maxInputTokens: 128000, // GPT-4 Turbo
    maxOutputTokens: 4096,
  },
  rateLimit: 500, // Tier 1 default
  costPerInputToken: 0.01 / 1000, // GPT-4 Turbo pricing
  costPerOutputToken: 0.03 / 1000,
  enabled: true,
};

/**
 * Model pricing per 1K tokens
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

/**
 * OpenAI API Surface Adapter
 */
export class OpenAIAdapter extends BaseSurfaceAdapter {
  private apiConfig: ApiConfig;
  private defaultModel: string;

  constructor(config: OpenAIAdapterConfig) {
    super(OPENAI_METADATA, config);
    this.apiConfig = config.apiConfig;
    this.defaultModel = config.defaultModel ?? 'gpt-4-turbo';

    // Validate API key
    if (!this.apiConfig.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  /**
   * Execute a query against OpenAI API
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    try {
      // Build messages array
      const messages: OpenAIChatMessage[] = [];

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
    messages: OpenAIChatMessage[],
    model: string,
    request: SurfaceQueryRequest
  ): Promise<OpenAIChatResponse> {
    const url = `${this.apiConfig.baseUrl ?? OPENAI_METADATA.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiConfig.apiKey}`,
    };

    if (this.apiConfig.organizationId) {
      headers['OpenAI-Organization'] = this.apiConfig.organizationId;
    }

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

    if (request.options?.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
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

    return response.json() as Promise<OpenAIChatResponse>;
  }

  /**
   * Calculate token usage and cost
   */
  private calculateTokenUsage(
    usage: OpenAIChatResponse['usage'],
    model: string
  ): TokenUsage {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4-turbo'];
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
      // Note: For streaming, we'd track TTFB separately
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
 * Create an OpenAI adapter
 */
export function createOpenAIAdapter(config: OpenAIAdapterConfig): OpenAIAdapter {
  return new OpenAIAdapter(config);
}
