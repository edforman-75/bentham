/**
 * @bentham/surface-adapters
 *
 * AI surface adapters for Bentham.
 * Provides adapters for API, Web Chatbot, and Search surfaces.
 */

// Types
export type {
  SurfaceCategory,
  AuthRequirement,
  SurfaceCapabilities,
  SurfaceMetadata,
  SurfaceQueryRequest,
  SurfaceQueryResponse,
  ConversationMessage,
  SourceCitation,
  ResponseTiming,
  TokenUsage,
  CapturedEvidence,
  SurfaceError,
  SurfaceErrorCode,
  WebSessionConfig,
  SessionCookie,
  ProxyConfig,
  ApiConfig,
  SurfaceAdapter,
  HealthCheckResult,
  RateLimitStatus,
  AdapterFactoryConfig,
  AdapterStats,
} from './types.js';

export {
  DEFAULT_ADAPTER_CONFIG,
  DEFAULT_CAPABILITIES,
} from './types.js';

// Base adapters
export {
  BaseSurfaceAdapter,
  type BaseAdapterConfig,
  DEFAULT_BASE_CONFIG,
  type ErrorClassification,
} from './base/base-adapter.js';

export {
  BaseWebAdapter,
  type WebAdapterConfig,
  DEFAULT_WEB_CONFIG,
  type BrowserPage,
  type BrowserContext,
  type Browser,
  type BrowserProvider,
  MockBrowserProvider,
  type WebSurfaceSelectors,
} from './base/web-adapter.js';

// API Surface Adapters
export {
  OpenAIAdapter,
  createOpenAIAdapter,
  OPENAI_METADATA,
  type OpenAIAdapterConfig,
} from './api-surfaces/openai-adapter.js';

export {
  AnthropicAdapter,
  createAnthropicAdapter,
  ANTHROPIC_METADATA,
  type AnthropicAdapterConfig,
} from './api-surfaces/anthropic-adapter.js';

// Web Chatbot Adapters
export {
  ChatGPTWebAdapter,
  createChatGPTWebAdapter,
  CHATGPT_WEB_METADATA,
  type ChatGPTWebAdapterConfig,
} from './web-chatbots/chatgpt-web-adapter.js';

export {
  PerplexityWebAdapter,
  createPerplexityWebAdapter,
  PERPLEXITY_WEB_METADATA,
  type PerplexityWebAdapterConfig,
} from './web-chatbots/perplexity-web-adapter.js';

// Search Surface Adapters
export {
  GoogleSearchAdapter,
  createGoogleSearchAdapter,
  GOOGLE_SEARCH_METADATA,
  type GoogleSearchAdapterConfig,
} from './search-surfaces/google-search-adapter.js';

/**
 * All available surface metadata (statically defined)
 */
export const ALL_SURFACE_METADATA: Record<string, SurfaceMetadata> = {
  'openai-api': OPENAI_METADATA,
  'anthropic-api': ANTHROPIC_METADATA,
  'chatgpt-web': CHATGPT_WEB_METADATA,
  'perplexity-web': PERPLEXITY_WEB_METADATA,
  'google-search': GOOGLE_SEARCH_METADATA,
};

/**
 * Get metadata for a surface by ID
 */
export function getSurfaceMetadata(surfaceId: string): SurfaceMetadata | undefined {
  return ALL_SURFACE_METADATA[surfaceId];
}

/**
 * Get all surface IDs
 */
export function getAllSurfaceIds(): string[] {
  return Object.keys(ALL_SURFACE_METADATA);
}

/**
 * Get surfaces by category
 */
export function getSurfacesByCategory(category: SurfaceCategory): SurfaceMetadata[] {
  return Object.values(ALL_SURFACE_METADATA).filter(
    (metadata) => metadata.category === category
  );
}

// Re-export types for convenience
import type { SurfaceCategory, SurfaceMetadata } from './types.js';
import { OPENAI_METADATA } from './api-surfaces/openai-adapter.js';
import { ANTHROPIC_METADATA } from './api-surfaces/anthropic-adapter.js';
import { CHATGPT_WEB_METADATA } from './web-chatbots/chatgpt-web-adapter.js';
import { PERPLEXITY_WEB_METADATA } from './web-chatbots/perplexity-web-adapter.js';
import { GOOGLE_SEARCH_METADATA } from './search-surfaces/google-search-adapter.js';
