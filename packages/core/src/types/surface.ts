/**
 * Surface adapter types for Bentham
 */

import type { QueryContext, QueryResult } from './common.js';

/**
 * Categories of AI surfaces
 */
export type SurfaceCategory = 'api' | 'web_chatbot' | 'search';

/**
 * Browser automation engine options
 */
export type BrowserEngine = 'playwright' | 'puppeteer';

/**
 * Configuration for browser engine selection
 */
export interface BrowserEngineConfig {
  /** Default engine to use */
  defaultEngine: BrowserEngine;
  /** Surface-specific engine overrides */
  surfaceOverrides?: Record<string, BrowserEngine>;
  /** Fallback engine if primary fails */
  fallbackEngine?: BrowserEngine;
}

/**
 * Session status for a surface
 */
export interface SessionStatus {
  /** Whether the session is valid */
  valid: boolean;
  /** Whether the session is authenticated */
  authenticated: boolean;
  /** Whether the session is rate limited */
  rateLimited: boolean;
  /** Cooldown time remaining in milliseconds */
  cooldownMs?: number;
  /** Any warnings about the session */
  warnings?: string[];
}

/**
 * Configuration for a surface in a study manifest
 */
export interface SurfaceConfig {
  /** Surface identifier (e.g., 'chatgpt-web', 'openai-api') */
  id: string;
  /** Whether this surface is required for study completion */
  required: boolean;
  /** Surface-specific options */
  options?: Record<string, unknown>;
}

/**
 * Interface that all surface adapters must implement
 */
export interface SurfaceAdapter {
  /** Unique identifier for this surface */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category of surface */
  category: SurfaceCategory;

  // Capabilities
  /** Whether this surface requires authentication */
  requiresAuth: boolean;
  /** Whether this surface supports anonymous access */
  supportsAnonymous: boolean;
  /** Whether this surface responds to geographic targeting */
  supportsGeoTargeting: boolean;

  // Operations
  /** Execute a query against this surface */
  executeQuery(query: string, context: QueryContext): Promise<QueryResult>;
  /** Validate the current session */
  validateSession(): Promise<SessionStatus>;
  /** Reset the session (clear state, cookies, etc.) */
  resetSession(): Promise<void>;
}

/**
 * Human behavior configuration for web-based surfaces
 */
export interface HumanBehaviorConfig {
  /** Typing behavior simulation */
  typing: {
    /** Minimum words per minute */
    minWPM: number;
    /** Maximum words per minute */
    maxWPM: number;
    /** Rate of typos that get corrected (0-1) */
    mistakeRate: number;
    /** Probability of mid-typing pause (0-1) */
    pauseProbability: number;
  };
  /** Mouse movement simulation */
  mouse: {
    /** Movement pattern style */
    movementStyle: 'bezier' | 'natural';
    /** Delay before click in ms [min, max] */
    clickDelay: [number, number];
  };
  /** Timing behavior */
  timing: {
    /** Delay for reading content in ms [min, max] */
    readingDelay: [number, number];
    /** Delay between navigation actions in ms [min, max] */
    navigationDelay: [number, number];
    /** Scrolling behavior */
    scrollBehavior: 'gradual' | 'instant';
  };
}

/**
 * Supported surface definitions
 */
export const SURFACES = {
  // API Surfaces
  'openai-api': {
    name: 'OpenAI API',
    category: 'api' as const,
    requiresAuth: true,
    supportsAnonymous: false,
    supportsGeoTargeting: false,
  },
  'anthropic-api': {
    name: 'Anthropic API',
    category: 'api' as const,
    requiresAuth: true,
    supportsAnonymous: false,
    supportsGeoTargeting: false,
  },
  'google-ai-api': {
    name: 'Google AI API',
    category: 'api' as const,
    requiresAuth: true,
    supportsAnonymous: false,
    supportsGeoTargeting: false,
  },
  'perplexity-api': {
    name: 'Perplexity API',
    category: 'api' as const,
    requiresAuth: true,
    supportsAnonymous: false,
    supportsGeoTargeting: false,
  },

  // Web Chatbots
  'chatgpt-web': {
    name: 'ChatGPT Web',
    category: 'web_chatbot' as const,
    requiresAuth: true,
    supportsAnonymous: false,
    supportsGeoTargeting: true,
  },
  'gemini-web': {
    name: 'Gemini Web',
    category: 'web_chatbot' as const,
    requiresAuth: true,
    supportsAnonymous: false,
    supportsGeoTargeting: true,
  },
  'perplexity-web': {
    name: 'Perplexity Web',
    category: 'web_chatbot' as const,
    requiresAuth: false,
    supportsAnonymous: true,
    supportsGeoTargeting: true,
  },
  'claude-web': {
    name: 'Claude Web',
    category: 'web_chatbot' as const,
    requiresAuth: true,
    supportsAnonymous: false,
    supportsGeoTargeting: true,
  },
  'meta-ai': {
    name: 'Meta AI',
    category: 'web_chatbot' as const,
    requiresAuth: false,
    supportsAnonymous: true,
    supportsGeoTargeting: true,
  },
  'grok': {
    name: 'Grok',
    category: 'web_chatbot' as const,
    requiresAuth: true,
    supportsAnonymous: false,
    supportsGeoTargeting: true,
  },

  // Search Surfaces
  'google-search': {
    name: 'Google Search (+ AI Overview)',
    category: 'search' as const,
    requiresAuth: false,
    supportsAnonymous: true,
    supportsGeoTargeting: true,
  },
  'bing-copilot': {
    name: 'Bing + Copilot',
    category: 'search' as const,
    requiresAuth: false,
    supportsAnonymous: true,
    supportsGeoTargeting: true,
  },
} as const;

/**
 * Valid surface identifiers
 */
export type SurfaceId = keyof typeof SURFACES;

/**
 * Check if a surface ID is valid
 */
export function isValidSurfaceId(id: string): id is SurfaceId {
  return id in SURFACES;
}

/**
 * Get surface definition by ID
 */
export function getSurfaceDefinition(id: SurfaceId): (typeof SURFACES)[SurfaceId] {
  return SURFACES[id];
}
