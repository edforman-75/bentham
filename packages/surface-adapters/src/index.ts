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

export {
  GoogleAIAdapter,
  createGoogleAIAdapter,
  GOOGLE_AI_METADATA,
  type GoogleAIAdapterConfig,
} from './api-surfaces/google-ai-adapter.js';

export {
  PerplexityAdapter,
  createPerplexityAdapter,
  PERPLEXITY_METADATA,
  type PerplexityAdapterConfig,
} from './api-surfaces/perplexity-adapter.js';

export {
  XAIAdapter,
  createXAIAdapter,
  XAI_METADATA,
  type XAIAdapterConfig,
} from './api-surfaces/xai-adapter.js';

export {
  TogetherAdapter,
  createTogetherAdapter,
  TOGETHER_METADATA,
  type TogetherAdapterConfig,
} from './api-surfaces/together-adapter.js';

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

// E-commerce Surface Adapters
export {
  AmazonWebAdapter,
  createAmazonWebAdapter,
  AMAZON_WEB_METADATA,
  type AmazonWebAdapterConfig,
} from './ecommerce-surfaces/amazon-web-adapter.js';

export {
  AmazonRufusAdapter,
  createAmazonRufusAdapter,
  AMAZON_RUFUS_METADATA,
  type AmazonRufusAdapterConfig,
} from './ecommerce-surfaces/amazon-rufus-adapter.js';

export {
  ZapposWebAdapter,
  createZapposWebAdapter,
  ZAPPOS_WEB_METADATA,
  type ZapposWebAdapterConfig,
} from './ecommerce-surfaces/zappos-web-adapter.js';

// Pool Management
export {
  SurfacePool,
  createSurfacePool,
  type SurfacePoolConfig,
  type PoolHealthStatus,
  type AdapterHealth,
  type CircuitState,
  type CircuitBreaker,
  type PooledAdapter,
  DEFAULT_POOL_CONFIG,
} from './pool/surface-pool.js';

export {
  PoolManager,
  createPoolManager,
  type PoolManagerConfig,
  type AdapterRegistration,
  type SystemHealthStatus,
  type HealthChangeEvent,
  type HealthChangeListener,
  DEFAULT_POOL_MANAGER_CONFIG,
} from './pool/pool-manager.js';

// Browser & Session Management
export {
  ChromeSessionManager,
  createSessionManager,
  type StoredSession,
  type SessionManagerConfig,
  type SessionValidationResult,
  DEFAULT_SESSION_CONFIG,
} from './browser/chrome-session-manager.js';

export {
  PlaywrightBrowserProvider,
  createPlaywrightProvider,
  createProviderWithSession,
  type PlaywrightProviderConfig,
  DEFAULT_PLAYWRIGHT_CONFIG,
} from './browser/playwright-provider.js';

/**
 * All available surface metadata (statically defined)
 */
export const ALL_SURFACE_METADATA: Record<string, SurfaceMetadata> = {
  // API Surfaces
  'openai-api': OPENAI_METADATA,
  'anthropic-api': ANTHROPIC_METADATA,
  'google-ai-api': GOOGLE_AI_METADATA,
  'perplexity-api': PERPLEXITY_METADATA,
  'xai-api': XAI_METADATA,
  'together-api': TOGETHER_METADATA,
  // Web Chatbots
  'chatgpt-web': CHATGPT_WEB_METADATA,
  'perplexity-web': PERPLEXITY_WEB_METADATA,
  // Search
  'google-search': GOOGLE_SEARCH_METADATA,
  // E-commerce
  'amazon-web': AMAZON_WEB_METADATA,
  'amazon-rufus': AMAZON_RUFUS_METADATA,
  'zappos-web': ZAPPOS_WEB_METADATA,
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
import { GOOGLE_AI_METADATA } from './api-surfaces/google-ai-adapter.js';
import { PERPLEXITY_METADATA } from './api-surfaces/perplexity-adapter.js';
import { XAI_METADATA } from './api-surfaces/xai-adapter.js';
import { TOGETHER_METADATA } from './api-surfaces/together-adapter.js';
import { CHATGPT_WEB_METADATA } from './web-chatbots/chatgpt-web-adapter.js';
import { PERPLEXITY_WEB_METADATA } from './web-chatbots/perplexity-web-adapter.js';
import { GOOGLE_SEARCH_METADATA } from './search-surfaces/google-search-adapter.js';
import { AMAZON_WEB_METADATA } from './ecommerce-surfaces/amazon-web-adapter.js';
import { AMAZON_RUFUS_METADATA } from './ecommerce-surfaces/amazon-rufus-adapter.js';
import { ZAPPOS_WEB_METADATA } from './ecommerce-surfaces/zappos-web-adapter.js';
