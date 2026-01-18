/**
 * @bentham/surface-adapters
 *
 * Types and interfaces for AI surface adapters.
 */

import type { QualityGates, EvidenceLevel } from '@bentham/core';

/**
 * Surface categories
 */
export type SurfaceCategory = 'api' | 'web_chatbot' | 'search';

/**
 * Surface authentication requirements
 */
export type AuthRequirement = 'none' | 'api_key' | 'session' | 'oauth';

/**
 * Surface capability flags
 */
export interface SurfaceCapabilities {
  /** Supports streaming responses */
  streaming: boolean;
  /** Supports system prompts */
  systemPrompts: boolean;
  /** Supports conversation history */
  conversationHistory: boolean;
  /** Supports file/image uploads */
  fileUploads: boolean;
  /** Supports specific model selection */
  modelSelection: boolean;
  /** Supports response format specification (JSON mode, etc.) */
  responseFormat: boolean;
  /** Maximum input tokens (approximate) */
  maxInputTokens?: number;
  /** Maximum output tokens (approximate) */
  maxOutputTokens?: number;
}

/**
 * Surface metadata
 */
export interface SurfaceMetadata {
  /** Unique surface identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Surface category */
  category: SurfaceCategory;
  /** Authentication requirement */
  authRequirement: AuthRequirement;
  /** Base URL for the surface */
  baseUrl: string;
  /** Surface capabilities */
  capabilities: SurfaceCapabilities;
  /** Rate limit (requests per minute) */
  rateLimit?: number;
  /** Cost per 1K input tokens (for API surfaces) */
  costPerInputToken?: number;
  /** Cost per 1K output tokens (for API surfaces) */
  costPerOutputToken?: number;
  /** Whether the surface is currently enabled */
  enabled: boolean;
}

/**
 * Query request to a surface
 */
export interface SurfaceQueryRequest {
  /** Query text */
  query: string;
  /** Optional system prompt (for API surfaces) */
  systemPrompt?: string;
  /** Optional conversation history */
  conversationHistory?: ConversationMessage[];
  /** Quality gates to apply */
  qualityGates?: QualityGates;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to capture evidence */
  captureEvidence?: boolean;
  /** Evidence level if capturing */
  evidenceLevel?: EvidenceLevel;
  /** Optional model override */
  model?: string;
  /** Optional temperature setting */
  temperature?: number;
  /** Additional surface-specific options */
  options?: Record<string, unknown>;
}

/**
 * Conversation message for history
 */
export interface ConversationMessage {
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp?: Date;
}

/**
 * Response from a surface query
 */
export interface SurfaceQueryResponse {
  /** Whether the query succeeded */
  success: boolean;
  /** Response text */
  responseText?: string;
  /** Structured response data (if available) */
  structured?: {
    /** Main response content */
    mainResponse: string;
    /** Cited sources */
    sources?: SourceCitation[];
    /** Suggested follow-up questions */
    followUps?: string[];
    /** Model used */
    model?: string;
  };
  /** Response timing */
  timing: ResponseTiming;
  /** Token usage (for API surfaces) */
  tokenUsage?: TokenUsage;
  /** Evidence captured (if requested) */
  evidence?: CapturedEvidence;
  /** Error information if failed */
  error?: SurfaceError;
  /** Raw response (for debugging) */
  rawResponse?: unknown;
}

/**
 * Source citation in response
 */
export interface SourceCitation {
  /** Citation title or label */
  title?: string;
  /** Source URL */
  url?: string;
  /** Snippet from the source */
  snippet?: string;
  /** Citation index/number */
  index?: number;
}

/**
 * Response timing information
 */
export interface ResponseTiming {
  /** Total request duration in ms */
  totalMs: number;
  /** Time to first byte (for streaming) */
  ttfbMs?: number;
  /** Time for full response */
  responseMs: number;
  /** Network latency */
  networkMs?: number;
}

/**
 * Token usage for API surfaces
 */
export interface TokenUsage {
  /** Input tokens used */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd?: number;
}

/**
 * Evidence captured from a query
 */
export interface CapturedEvidence {
  /** Screenshot of the page (base64 PNG) */
  screenshot?: string;
  /** Images extracted from the response */
  images?: CapturedImage[];
  /** HTML content */
  htmlContent?: string;
  /** HAR file data */
  harData?: unknown;
  /** Response headers */
  headers?: Record<string, string>;
  /** Timestamp of capture */
  capturedAt: Date;
}

/**
 * Image captured from a response
 */
export interface CapturedImage {
  /** Image data (base64) */
  data: string;
  /** Image MIME type */
  mimeType: string;
  /** Image source URL (if from web) */
  sourceUrl?: string;
  /** Alt text or description */
  altText?: string;
  /** Image dimensions */
  width?: number;
  height?: number;
  /** Whether this is AI-generated */
  isGenerated?: boolean;
}

/**
 * Surface error information
 */
export interface SurfaceError {
  /** Error code */
  code: SurfaceErrorCode;
  /** Error message */
  message: string;
  /** Whether the error is retryable */
  retryable: boolean;
  /** Suggested retry delay in ms */
  retryDelayMs?: number;
  /** Original error */
  originalError?: unknown;
}

/**
 * Surface error codes
 */
export type SurfaceErrorCode =
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'CONTENT_BLOCKED'
  | 'SERVICE_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'SESSION_EXPIRED'
  | 'CAPTCHA_REQUIRED'
  | 'UNKNOWN_ERROR';

/**
 * Session configuration for web surfaces
 */
export interface WebSessionConfig {
  /** Browser user agent */
  userAgent?: string;
  /** Viewport size */
  viewport?: { width: number; height: number };
  /** Cookies to set */
  cookies?: SessionCookie[];
  /** Local storage items */
  localStorage?: Record<string, string>;
  /** Proxy configuration */
  proxy?: ProxyConfig;
}

/**
 * Session cookie
 */
export interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks5';
}

/**
 * API configuration for API surfaces
 */
export interface ApiConfig {
  /** API key */
  apiKey: string;
  /** Organization ID (for OpenAI) */
  organizationId?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Base URL override */
  baseUrl?: string;
  /** Request timeout */
  timeoutMs?: number;
  /** Max retries */
  maxRetries?: number;
}

/**
 * Surface adapter interface
 */
export interface SurfaceAdapter {
  /** Surface metadata */
  readonly metadata: SurfaceMetadata;

  /**
   * Execute a query against the surface
   */
  query(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse>;

  /**
   * Check if the surface is healthy/available
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus;

  /**
   * Close/cleanup the adapter
   */
  close(): Promise<void>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Whether the surface is healthy */
  healthy: boolean;
  /** Latency in ms */
  latencyMs?: number;
  /** Error message if unhealthy */
  error?: string;
  /** Last successful query time */
  lastSuccessAt?: Date;
  /** Consecutive failure count */
  failureCount: number;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Current request count in window */
  currentCount: number;
  /** Maximum allowed in window */
  maxCount: number;
  /** Window reset time */
  resetAt?: Date;
  /** Whether currently rate limited */
  isLimited: boolean;
  /** Time until limit resets (ms) */
  resetInMs?: number;
}

/**
 * Adapter factory configuration
 */
export interface AdapterFactoryConfig {
  /** API configurations by surface ID */
  apiConfigs?: Record<string, ApiConfig>;
  /** Web session configurations by surface ID */
  webConfigs?: Record<string, WebSessionConfig>;
  /** Default timeout for all surfaces */
  defaultTimeoutMs?: number;
  /** Default retry configuration */
  defaultRetries?: number;
}

/**
 * Adapter statistics
 */
export interface AdapterStats {
  /** Total queries executed */
  totalQueries: number;
  /** Successful queries */
  successfulQueries: number;
  /** Failed queries */
  failedQueries: number;
  /** Average response time ms */
  avgResponseTimeMs: number;
  /** Total tokens used (API surfaces) */
  totalTokensUsed: number;
  /** Total estimated cost */
  totalCostUsd: number;
  /** Queries by error code */
  errorsByCode: Record<SurfaceErrorCode, number>;
  /** Last query timestamp */
  lastQueryAt?: Date;
}

/**
 * Default adapter configuration
 */
export const DEFAULT_ADAPTER_CONFIG: AdapterFactoryConfig = {
  defaultTimeoutMs: 30000,
  defaultRetries: 3,
};

/**
 * Default surface capabilities
 */
export const DEFAULT_CAPABILITIES: SurfaceCapabilities = {
  streaming: false,
  systemPrompts: false,
  conversationHistory: false,
  fileUploads: false,
  modelSelection: false,
  responseFormat: false,
};
