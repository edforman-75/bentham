/**
 * OpenAI Responses API Surface Adapter
 *
 * Adapter for querying OpenAI's Responses API with web search capability.
 * Unlike the Chat Completions API, the Responses API can search the web
 * for real-time information before generating responses.
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
  SourceCitation,
} from '../types.js';

/**
 * OpenAI Responses API adapter configuration
 */
export interface OpenAIResponsesAdapterConfig extends Partial<BaseAdapterConfig> {
  /** API configuration */
  apiConfig: ApiConfig;
  /** Default model */
  defaultModel?: string;
  /** Enable web search tool (default: true) */
  enableWebSearch?: boolean;
}

/**
 * Responses API output item types
 */
interface ResponsesOutputItem {
  type: 'message' | 'web_search_call' | 'function_call';
  id?: string;
  status?: string;
  content?: Array<{
    type: 'output_text' | 'refusal';
    text?: string;
    annotations?: Array<{
      type: 'url_citation';
      start_index: number;
      end_index: number;
      url: string;
      title?: string;
    }>;
  }>;
}

/**
 * OpenAI Responses API response structure
 */
interface OpenAIResponsesResponse {
  id: string;
  object: string;
  created_at: number;
  model: string;
  output: ResponsesOutputItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  status: 'completed' | 'failed' | 'incomplete';
  error?: {
    code: string;
    message: string;
  };
}

/**
 * OpenAI Responses API surface metadata
 */
export const OPENAI_RESPONSES_METADATA: SurfaceMetadata = {
  id: 'openai-responses-api',
  name: 'OpenAI Responses API',
  category: 'api',
  authRequirement: 'api_key',
  baseUrl: 'https://api.openai.com/v1',
  capabilities: {
    streaming: false,
    systemPrompts: true,
    conversationHistory: false, // Responses API is single-turn with tools
    fileUploads: false,
    modelSelection: true,
    responseFormat: true,
    maxInputTokens: 128000,
    maxOutputTokens: 16384,
  },
  rateLimit: 500,
  costPerInputToken: 0.0025 / 1000, // GPT-4o pricing
  costPerOutputToken: 0.01 / 1000,
  enabled: true,
};

/**
 * Model pricing per 1K tokens for Responses API
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o-search-preview': { input: 0.0025, output: 0.01 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
};

/**
 * OpenAI Responses API Surface Adapter
 *
 * Key differences from Chat Completions API:
 * - Uses `/v1/responses` endpoint
 * - Uses `input` instead of `messages`
 * - Supports `web_search_preview` tool for real-time web data
 * - Returns structured `output` array instead of `choices`
 */
export class OpenAIResponsesAdapter extends BaseSurfaceAdapter {
  private apiConfig: ApiConfig;
  private defaultModel: string;
  private enableWebSearch: boolean;

  constructor(config: OpenAIResponsesAdapterConfig) {
    super(OPENAI_RESPONSES_METADATA, config);
    this.apiConfig = config.apiConfig;
    this.defaultModel = config.defaultModel ?? 'gpt-4o';
    this.enableWebSearch = config.enableWebSearch ?? true;

    if (!this.apiConfig.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  /**
   * Execute a query against OpenAI Responses API
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    try {
      const response = await this.makeApiRequest(request.query, model, request);
      const endTime = Date.now();

      if (response.status === 'failed') {
        return {
          success: false,
          timing: this.createTimingWithTTFB(startTime, endTime),
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: response.error?.message ?? 'Response failed',
            retryable: true,
          },
        };
      }

      // Extract response text and citations from output
      const { text, citations } = this.extractOutputContent(response.output);

      if (!text) {
        return {
          success: false,
          timing: this.createTimingWithTTFB(startTime, endTime),
          error: {
            code: 'INVALID_RESPONSE',
            message: 'No text content in response',
            retryable: true,
          },
        };
      }

      const tokenUsage = this.calculateTokenUsage(response.usage, model);

      return {
        success: true,
        responseText: text,
        structured: {
          mainResponse: text,
          model: response.model,
          sources: citations.length > 0 ? citations : undefined,
        },
        timing: this.createTimingWithTTFB(startTime, endTime),
        tokenUsage,
        rawResponse: {
          responseId: response.id,
          status: response.status,
          webSearchEnabled: this.enableWebSearch,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Make the actual API request
   */
  private async makeApiRequest(
    query: string,
    model: string,
    request: SurfaceQueryRequest
  ): Promise<OpenAIResponsesResponse> {
    const url = `${this.apiConfig.baseUrl ?? OPENAI_RESPONSES_METADATA.baseUrl}/responses`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiConfig.apiKey}`,
    };

    if (this.apiConfig.organizationId) {
      headers['OpenAI-Organization'] = this.apiConfig.organizationId;
    }

    const body: Record<string, unknown> = {
      model,
      input: query,
    };

    // Add web search tool if enabled
    if (this.enableWebSearch) {
      body.tools = [{ type: 'web_search_preview' }];
    }

    // Add system instructions if provided
    if (request.systemPrompt) {
      body.instructions = request.systemPrompt;
    }

    // Add optional parameters
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.options?.maxTokens) {
      body.max_output_tokens = request.options.maxTokens;
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

    return response.json() as Promise<OpenAIResponsesResponse>;
  }

  /**
   * Extract text content and citations from output array
   */
  private extractOutputContent(output: ResponsesOutputItem[]): {
    text: string;
    citations: SourceCitation[];
  } {
    let text = '';
    const citations: SourceCitation[] = [];

    for (const item of output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.text) {
            text += content.text;

            // Extract URL citations from annotations
            if (content.annotations) {
              for (const annotation of content.annotations) {
                if (annotation.type === 'url_citation') {
                  citations.push({
                    url: annotation.url,
                    title: annotation.title ?? this.extractDomain(annotation.url),
                    snippet: content.text.slice(
                      annotation.start_index,
                      annotation.end_index
                    ),
                  });
                }
              }
            }
          }
        }
      }
    }

    return { text, citations };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Calculate token usage and cost
   */
  private calculateTokenUsage(
    usage: OpenAIResponsesResponse['usage'],
    model: string
  ): TokenUsage {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o'];
    const inputCost = (usage.input_tokens / 1000) * pricing.input;
    const outputCost = (usage.output_tokens / 1000) * pricing.output;

    return {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
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
    // Temporarily disable web search for health check to make it faster
    const originalWebSearch = this.enableWebSearch;
    this.enableWebSearch = false;

    try {
      return await this.executeQuery({
        query: 'Say "OK"',
        options: { maxTokens: 5 },
      });
    } finally {
      this.enableWebSearch = originalWebSearch;
    }
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    // No persistent connections to close for API adapter
  }
}

/**
 * Create an OpenAI Responses API adapter
 */
export function createOpenAIResponsesAdapter(
  config: OpenAIResponsesAdapterConfig
): OpenAIResponsesAdapter {
  return new OpenAIResponsesAdapter(config);
}

/**
 * Create an OpenAI Responses API adapter with web search enabled (convenience function)
 */
export function createOpenAIWebSearchAdapter(
  apiKey: string,
  options?: Partial<OpenAIResponsesAdapterConfig>
): OpenAIResponsesAdapter {
  return new OpenAIResponsesAdapter({
    apiConfig: { apiKey },
    enableWebSearch: true,
    ...options,
  });
}
