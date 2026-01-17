/**
 * xAI (Grok) API Surface Adapter
 *
 * Adapter for querying xAI's Grok API
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
 * xAI adapter configuration
 */
export interface XAIAdapterConfig extends Partial<BaseAdapterConfig> {
  /** API configuration */
  apiConfig: ApiConfig;
  /** Default model */
  defaultModel?: string;
}

/**
 * xAI API message types (OpenAI-compatible)
 */
interface XAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface XAIResponse {
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
 * xAI surface metadata
 */
export const XAI_METADATA: SurfaceMetadata = {
  id: 'xai-api',
  name: 'xAI Grok API',
  category: 'api',
  authRequirement: 'api_key',
  baseUrl: 'https://api.x.ai/v1',
  capabilities: {
    streaming: true,
    systemPrompts: true,
    conversationHistory: true,
    fileUploads: false,
    modelSelection: true,
    responseFormat: true,
    maxInputTokens: 131072,
    maxOutputTokens: 4096,
  },
  rateLimit: 60,
  costPerInputToken: 0.005 / 1000, // Grok-2 pricing estimate
  costPerOutputToken: 0.015 / 1000,
  enabled: true,
};

/**
 * Model pricing per 1K tokens (Jan 2026)
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'grok-3': { input: 0.003, output: 0.015 },
  'grok-3-mini': { input: 0.0003, output: 0.0005 },
  'grok-4-0709': { input: 0.005, output: 0.025 },
  'grok-4-fast-reasoning': { input: 0.005, output: 0.025 },
  'grok-4-fast-non-reasoning': { input: 0.005, output: 0.025 },
};

/**
 * xAI (Grok) API Surface Adapter
 */
export class XAIAdapter extends BaseSurfaceAdapter {
  private apiConfig: ApiConfig;
  private defaultModel: string;

  constructor(config: XAIAdapterConfig) {
    super(XAI_METADATA, config);
    this.apiConfig = config.apiConfig;
    this.defaultModel = config.defaultModel ?? 'grok-3';

    if (!this.apiConfig.apiKey) {
      throw new Error('xAI API key is required');
    }
  }

  /**
   * Execute a query against xAI API
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    try {
      const messages: XAIMessage[] = [];

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
    messages: XAIMessage[],
    model: string,
    request: SurfaceQueryRequest
  ): Promise<XAIResponse> {
    const url = `${this.apiConfig.baseUrl ?? XAI_METADATA.baseUrl}/chat/completions`;

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

    return response.json() as Promise<XAIResponse>;
  }

  /**
   * Calculate token usage and cost
   */
  private calculateTokenUsage(
    usage: XAIResponse['usage'],
    model: string
  ): TokenUsage {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['grok-3'];
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
 * Create an xAI adapter
 */
export function createXAIAdapter(config: XAIAdapterConfig): XAIAdapter {
  return new XAIAdapter(config);
}
