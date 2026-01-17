/**
 * Google AI (Gemini) API Surface Adapter
 *
 * Adapter for querying Google's Gemini API
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
 * Google AI adapter configuration
 */
export interface GoogleAIAdapterConfig extends Partial<BaseAdapterConfig> {
  /** API configuration */
  apiConfig: ApiConfig;
  /** Default model */
  defaultModel?: string;
}

/**
 * Gemini API response types
 */
interface GeminiContent {
  parts: Array<{ text: string }>;
  role: 'user' | 'model';
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
    index: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Google AI surface metadata
 */
export const GOOGLE_AI_METADATA: SurfaceMetadata = {
  id: 'google-ai-api',
  name: 'Google AI (Gemini) API',
  category: 'api',
  authRequirement: 'api_key',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  capabilities: {
    streaming: true,
    systemPrompts: true,
    conversationHistory: true,
    fileUploads: true,
    modelSelection: true,
    responseFormat: true,
    maxInputTokens: 1000000, // Gemini 1.5 Pro
    maxOutputTokens: 8192,
  },
  rateLimit: 60, // Free tier
  costPerInputToken: 0.00125 / 1000, // Gemini 1.5 Pro pricing
  costPerOutputToken: 0.005 / 1000,
  enabled: true,
};

/**
 * Model pricing per 1K tokens
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash-lite': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
};

/**
 * Google AI (Gemini) Surface Adapter
 */
export class GoogleAIAdapter extends BaseSurfaceAdapter {
  private apiConfig: ApiConfig;
  private defaultModel: string;

  constructor(config: GoogleAIAdapterConfig) {
    super(GOOGLE_AI_METADATA, config);
    this.apiConfig = config.apiConfig;
    this.defaultModel = config.defaultModel ?? 'gemini-2.0-flash';

    // Validate API key
    if (!this.apiConfig.apiKey) {
      throw new Error('Google AI API key is required');
    }
  }

  /**
   * Execute a query against Google AI API
   */
  protected async executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    try {
      // Build contents array
      const contents: GeminiContent[] = [];

      // Add conversation history
      if (request.conversationHistory) {
        for (const msg of request.conversationHistory) {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          });
        }
      }

      // Add the user query
      contents.push({
        role: 'user',
        parts: [{ text: request.query }],
      });

      // Make API request
      const response = await this.makeApiRequest(contents, model, request);
      const endTime = Date.now();

      // Parse response
      if (!response.candidates || response.candidates.length === 0) {
        return {
          success: false,
          timing: this.createTimingWithTTFB(startTime, endTime),
          error: {
            code: 'INVALID_RESPONSE',
            message: 'No candidates in response',
            retryable: true,
          },
        };
      }

      const candidate = response.candidates[0];
      const responseText = candidate.content.parts
        .map(p => p.text)
        .join('\n');

      const tokenUsage = this.calculateTokenUsage(response.usageMetadata, model);

      return {
        success: true,
        responseText,
        structured: {
          mainResponse: responseText,
          model: model,
        },
        timing: this.createTimingWithTTFB(startTime, endTime),
        tokenUsage,
        rawResponse: { finishReason: candidate.finishReason },
      };
    } catch (error) {
      throw error; // Let base class handle error classification
    }
  }

  /**
   * Make the actual API request
   */
  private async makeApiRequest(
    contents: GeminiContent[],
    model: string,
    request: SurfaceQueryRequest
  ): Promise<GeminiResponse> {
    const baseUrl = this.apiConfig.baseUrl ?? GOOGLE_AI_METADATA.baseUrl;
    const url = `${baseUrl}/models/${model}:generateContent?key=${this.apiConfig.apiKey}`;

    const body: Record<string, unknown> = {
      contents,
    };

    // Add system instruction if provided
    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    // Add generation config
    const generationConfig: Record<string, unknown> = {};

    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }

    if (request.options?.maxTokens) {
      generationConfig.maxOutputTokens = request.options.maxTokens;
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

    return response.json() as Promise<GeminiResponse>;
  }

  /**
   * Calculate token usage and cost
   */
  private calculateTokenUsage(
    usage: GeminiResponse['usageMetadata'],
    model: string
  ): TokenUsage {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gemini-2.0-flash'];
    const inputCost = (usage.promptTokenCount / 1000) * pricing.input;
    const outputCost = (usage.candidatesTokenCount / 1000) * pricing.output;

    return {
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      totalTokens: usage.totalTokenCount,
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
 * Create a Google AI adapter
 */
export function createGoogleAIAdapter(config: GoogleAIAdapterConfig): GoogleAIAdapter {
  return new GoogleAIAdapter(config);
}
