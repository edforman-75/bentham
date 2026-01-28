/**
 * Surface Defaults Configuration
 *
 * Defines default models and pricing for each surface.
 * Customers can override these in the manifest.
 */

/**
 * Model tier for cost/quality tradeoff
 */
export type ModelTier = 'economy' | 'standard' | 'premium';

/**
 * Model configuration for a surface
 */
export interface ModelConfig {
  /** Model identifier */
  id: string;
  /** Display name */
  name: string;
  /** Cost tier */
  tier: ModelTier;
  /** Cost per 1K input tokens in USD */
  inputCostPer1K: number;
  /** Cost per 1K output tokens in USD */
  outputCostPer1K: number;
  /** Fixed cost per request (e.g., Perplexity) */
  requestCost?: number;
  /** Average tokens per response (for estimation) */
  avgOutputTokens: number;
  /** Average input tokens per query */
  avgInputTokens: number;
}

/**
 * Surface configuration with available models
 */
export interface SurfaceConfig {
  /** Surface ID */
  id: string;
  /** Display name */
  name: string;
  /** Default model ID */
  defaultModel: string;
  /** Available models for this surface */
  models: Record<string, ModelConfig>;
}

/**
 * Data collection method for a surface
 */
export type CollectionMethod =
  | 'serpapi'        // Use SerpAPI (Google Search)
  | 'browser-cdp'    // Use browser via Chrome DevTools Protocol (requires user's Chrome)
  | 'browser-proxy'  // Use Playwright browser with proxy
  | 'api';           // Direct API call

/**
 * How location/geo is handled for this surface
 */
export type LocationHandling =
  | 'params'         // Location set via API/request parameters
  | 'ip'             // Location determined by IP address
  | 'none';          // No location control available

/**
 * Surface collection configuration
 * Defines HOW to collect data from each surface
 */
export interface SurfaceCollectionConfig {
  /** Primary data collection method */
  method: CollectionMethod;
  /** Fallback method if primary fails */
  fallbackMethod?: CollectionMethod;
  /** How location/geo targeting works */
  locationHandling: LocationHandling;
  /** Whether a proxy is required for this surface */
  proxyRequired: boolean;
  /** Whether surface has Cloudflare protection that blocks automation */
  cloudflareProtected: boolean;
  /** Specific proxy providers that work for this surface */
  supportedProxies?: string[];
  /** Notes about limitations or special requirements */
  notes?: string;
}

/**
 * Collection configuration for all surfaces
 *
 * This determines which method Bentham uses to query each surface:
 * - serpapi: For Google Search - handles location natively via params
 * - browser-cdp: For Cloudflare-protected sites - requires user's real Chrome
 * - browser-proxy: For sites that allow Playwright with residential proxy
 * - api: For direct API calls
 */
export const SURFACE_COLLECTION_CONFIG: Record<string, SurfaceCollectionConfig> = {
  // === Google Surfaces ===
  'google-search': {
    method: 'serpapi',
    fallbackMethod: 'browser-cdp',
    locationHandling: 'params',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'SerpAPI handles location via params (location, gl, google_domain). No proxy needed.',
  },
  'google-ai-overview': {
    method: 'serpapi',
    locationHandling: 'params',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'Use SerpAPI with AI Overview extraction. Location via params.',
  },

  // === ChatGPT / OpenAI ===
  'chatgpt-web': {
    method: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: false,
    cloudflareProtected: true,
    notes: 'Cloudflare blocks all proxy/Playwright approaches. Requires user\'s real Chrome + VPN for location.',
  },
  'openai-api': {
    method: 'api',
    locationHandling: 'none',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'Direct API. No location control - use "in [location]" suffix in prompts if needed.',
  },
  'chat-api': {
    method: 'api',
    locationHandling: 'none',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'OpenAI Chat Completions API. No location control.',
  },
  'websearch-api': {
    method: 'api',
    locationHandling: 'params',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'OpenAI Responses API with web_search tool. Can set user_location param.',
  },

  // === Google AI ===
  'google-ai-api': {
    method: 'api',
    locationHandling: 'params',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'Gemini API. Can set user_location in request.',
  },
  'gemini-web': {
    method: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: false,
    cloudflareProtected: true,
    notes: 'Google Gemini web interface. Use CDP + VPN for location.',
  },

  // === Perplexity ===
  'perplexity-api': {
    method: 'api',
    locationHandling: 'none',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'Direct API. Has per-request cost ($0.005).',
  },
  'perplexity-web': {
    method: 'browser-proxy',
    fallbackMethod: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: true,
    cloudflareProtected: false,
    supportedProxies: ['2captcha'],
    notes: 'Lighter Cloudflare protection. Playwright + residential proxy works.',
  },

  // === Anthropic ===
  'anthropic-api': {
    method: 'api',
    locationHandling: 'none',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'Direct API. No location control.',
  },
  'claude-web': {
    method: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: false,
    cloudflareProtected: true,
    notes: 'Cloudflare protected. Requires user\'s real Chrome + VPN.',
  },

  // === xAI ===
  'xai-api': {
    method: 'api',
    locationHandling: 'none',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'Grok API. No location control.',
  },
  'x-grok-web': {
    method: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: false,
    cloudflareProtected: true,
    notes: 'X.com Grok interface. Requires user\'s real Chrome + VPN.',
  },

  // === Meta ===
  'meta-ai-web': {
    method: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: false,
    cloudflareProtected: true,
    notes: 'Meta AI web interface. Requires user\'s real Chrome + VPN.',
  },

  // === Microsoft ===
  'copilot-web': {
    method: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: false,
    cloudflareProtected: true,
    notes: 'Microsoft Copilot. Requires user\'s real Chrome + VPN.',
  },
  'bing-search': {
    method: 'browser-proxy',
    fallbackMethod: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: true,
    cloudflareProtected: false,
    supportedProxies: ['2captcha'],
    notes: 'Bing Search. Playwright + residential proxy works.',
  },

  // === Together.ai ===
  'together-api': {
    method: 'api',
    locationHandling: 'none',
    proxyRequired: false,
    cloudflareProtected: false,
    notes: 'Together.ai API (Llama models). No location control.',
  },

  // === E-commerce ===
  'amazon-rufus': {
    method: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: false,
    cloudflareProtected: true,
    notes: 'Amazon Rufus AI. Heavy bot protection. Requires user\'s real Chrome.',
  },
  'amazon-web': {
    method: 'browser-proxy',
    fallbackMethod: 'browser-cdp',
    locationHandling: 'ip',
    proxyRequired: true,
    cloudflareProtected: false,
    supportedProxies: ['2captcha'],
    notes: 'Amazon search results. Residential proxy usually works.',
  },
};

/**
 * Proxy provider configuration
 */
export interface ProxyProviderConfig {
  /** Provider name */
  name: string;
  /** Proxy server URL */
  server: string;
  /** Username template (use {API_KEY}, {LOCATION}, {CITY}, {SESSION} placeholders) */
  usernameTemplate: string;
  /** Password (or template) */
  password: string;
  /** Whether this provider supports browser HTTPS tunneling */
  supportsBrowser: boolean;
  /** Whether this provider supports API/HTTP calls */
  supportsApi: boolean;
  /** Available locations */
  locations: string[];
}

/**
 * Location-specific configuration
 */
export interface LocationConfig {
  /** Location ID */
  id: string;
  /** Display name */
  name: string;
  /** Country code */
  countryCode: string;
  /** For SerpAPI: location parameter */
  serpApiLocation?: string;
  /** For SerpAPI: google domain */
  serpApiGoogleDomain?: string;
  /** For SerpAPI: gl parameter */
  serpApiGl?: string;
  /** For browser: which proxy provider works */
  browserProxy?: {
    provider: string;
    city?: string;
    state?: string;
  };
  /** Whether VPN is required (no working proxy) */
  vpnRequired: boolean;
  /** Notes about this location */
  notes?: string;
}

/**
 * Proxy providers available in Bentham
 */
export const PROXY_PROVIDERS: Record<string, ProxyProviderConfig> = {
  '2captcha': {
    name: '2Captcha Residential',
    server: 'http://170.106.118.114:2334',
    usernameTemplate: '{API_KEY}-zone-custom-region-{COUNTRY}-st-{STATE}-city-{CITY}',
    password: '{API_KEY}',
    supportsBrowser: true,
    supportsApi: true,
    locations: ['us', 'uk', 'de', 'fr', 'au'],  // Does NOT include India
  },
  'cherry': {
    name: 'Cherry Proxy',
    server: 'http://aus.360s5.com:3600',
    usernameTemplate: '10016865-zone-custom-region-{COUNTRY}-sessid-{SESSION}-sessTime-120',
    password: 'WFRqYTzM',
    supportsBrowser: false,  // Only works for API calls, NOT browser HTTPS
    supportsApi: true,
    locations: ['IN', 'US', 'UK'],  // Includes India but browser doesn't work
  },
};

/**
 * Location configurations
 */
export const LOCATION_CONFIG: Record<string, LocationConfig> = {
  // === India ===
  'in-mum': {
    id: 'in-mum',
    name: 'India (Mumbai)',
    countryCode: 'IN',
    serpApiLocation: 'Mumbai,Maharashtra,India',
    serpApiGoogleDomain: 'google.co.in',
    serpApiGl: 'in',
    vpnRequired: true,  // No proxy works for browser in India
    notes: '2Captcha has no India servers. Cherry only works for API, not browser. VPN required for browser.',
  },
  'in-blr': {
    id: 'in-blr',
    name: 'India (Bangalore)',
    countryCode: 'IN',
    serpApiLocation: 'Bangalore,Karnataka,India',
    serpApiGoogleDomain: 'google.co.in',
    serpApiGl: 'in',
    vpnRequired: true,
    notes: 'Same as Mumbai - VPN required for browser.',
  },
  'in-del': {
    id: 'in-del',
    name: 'India (Delhi)',
    countryCode: 'IN',
    serpApiLocation: 'Delhi,Delhi,India',
    serpApiGoogleDomain: 'google.co.in',
    serpApiGl: 'in',
    vpnRequired: true,
    notes: 'Same as Mumbai - VPN required for browser.',
  },

  // === United States ===
  'us-national': {
    id: 'us-national',
    name: 'United States',
    countryCode: 'US',
    serpApiLocation: 'United States',
    serpApiGoogleDomain: 'google.com',
    serpApiGl: 'us',
    browserProxy: {
      provider: '2captcha',
      state: 'california',
      city: 'los_angeles',
    },
    vpnRequired: false,
    notes: '2Captcha works for US browser automation.',
  },
  'us-nyc': {
    id: 'us-nyc',
    name: 'United States (New York)',
    countryCode: 'US',
    serpApiLocation: 'New York,New York,United States',
    serpApiGoogleDomain: 'google.com',
    serpApiGl: 'us',
    browserProxy: {
      provider: '2captcha',
      state: 'new_york',
      city: 'new_york',
    },
    vpnRequired: false,
  },

  // === United Kingdom ===
  'uk-lon': {
    id: 'uk-lon',
    name: 'United Kingdom (London)',
    countryCode: 'UK',
    serpApiLocation: 'London,England,United Kingdom',
    serpApiGoogleDomain: 'google.co.uk',
    serpApiGl: 'uk',
    browserProxy: {
      provider: '2captcha',
      state: 'england',
      city: 'london',
    },
    vpnRequired: false,
  },

  // === Germany ===
  'de-ber': {
    id: 'de-ber',
    name: 'Germany (Berlin)',
    countryCode: 'DE',
    serpApiLocation: 'Berlin,Berlin,Germany',
    serpApiGoogleDomain: 'google.de',
    serpApiGl: 'de',
    browserProxy: {
      provider: '2captcha',
      state: 'berlin',
      city: 'berlin',
    },
    vpnRequired: false,
  },
};

/**
 * Get collection configuration for a surface
 */
export function getCollectionConfig(surfaceId: string): SurfaceCollectionConfig | undefined {
  return SURFACE_COLLECTION_CONFIG[surfaceId];
}

/**
 * Get location configuration
 */
export function getLocationConfig(locationId: string): LocationConfig | undefined {
  return LOCATION_CONFIG[locationId];
}

/**
 * Check if a location requires VPN for browser automation
 */
export function locationRequiresVpn(locationId: string): boolean {
  const config = LOCATION_CONFIG[locationId];
  return config?.vpnRequired ?? true;
}

/**
 * Get SerpAPI parameters for a location
 */
export function getSerpApiParams(locationId: string): {
  location: string;
  google_domain: string;
  gl: string;
  hl: string;
} | undefined {
  const config = LOCATION_CONFIG[locationId];
  if (!config?.serpApiLocation) return undefined;

  return {
    location: config.serpApiLocation,
    google_domain: config.serpApiGoogleDomain || 'google.com',
    gl: config.serpApiGl || 'us',
    hl: 'en',
  };
}

/**
 * Get proxy configuration for browser automation at a location
 * Returns undefined if VPN is required (no proxy works)
 */
export function getBrowserProxyConfig(locationId: string): {
  provider: string;
  server: string;
  usernameTemplate: string;
  password: string;
} | undefined {
  const locConfig = LOCATION_CONFIG[locationId];
  if (!locConfig || locConfig.vpnRequired || !locConfig.browserProxy) {
    return undefined;
  }

  const providerConfig = PROXY_PROVIDERS[locConfig.browserProxy.provider];
  if (!providerConfig || !providerConfig.supportsBrowser) {
    return undefined;
  }

  return {
    provider: locConfig.browserProxy.provider,
    server: providerConfig.server,
    usernameTemplate: providerConfig.usernameTemplate
      .replace('{COUNTRY}', locConfig.countryCode.toLowerCase())
      .replace('{STATE}', locConfig.browserProxy.state || '')
      .replace('{CITY}', locConfig.browserProxy.city || ''),
    password: providerConfig.password,
  };
}

/**
 * Check if a surface requires VPN (not proxy) for location control
 */
export function requiresVpnForLocation(surfaceId: string): boolean {
  const config = SURFACE_COLLECTION_CONFIG[surfaceId];
  return config?.cloudflareProtected === true && config?.locationHandling === 'ip';
}

/**
 * Get recommended collection method for a surface
 */
export function getRecommendedMethod(surfaceId: string): CollectionMethod {
  const config = SURFACE_COLLECTION_CONFIG[surfaceId];
  return config?.method ?? 'api';
}

/**
 * Check if SerpAPI should be used for this surface
 */
export function useSerpApi(surfaceId: string): boolean {
  const config = SURFACE_COLLECTION_CONFIG[surfaceId];
  return config?.method === 'serpapi';
}

/**
 * Surface defaults configuration
 */
export const SURFACE_DEFAULTS: Record<string, SurfaceConfig> = {
  'openai-api': {
    id: 'openai-api',
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini', // Economy default
    models: {
      'gpt-4o-mini': {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        tier: 'economy',
        inputCostPer1K: 0.00015,
        outputCostPer1K: 0.0006,
        avgInputTokens: 50,
        avgOutputTokens: 450,
      },
      'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4o',
        tier: 'standard',
        inputCostPer1K: 0.0025,
        outputCostPer1K: 0.01,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
      'gpt-4-turbo': {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        tier: 'premium',
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
    },
  },

  'anthropic-api': {
    id: 'anthropic-api',
    name: 'Anthropic',
    defaultModel: 'claude-3-5-haiku-latest', // Economy default
    models: {
      'claude-3-5-haiku-latest': {
        id: 'claude-3-5-haiku-latest',
        name: 'Claude 3.5 Haiku',
        tier: 'economy',
        inputCostPer1K: 0.001,
        outputCostPer1K: 0.005,
        avgInputTokens: 50,
        avgOutputTokens: 280,
      },
      'claude-sonnet-4-20250514': {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        tier: 'standard',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.015,
        avgInputTokens: 50,
        avgOutputTokens: 400,
      },
      'claude-opus-4-20250514': {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        tier: 'premium',
        inputCostPer1K: 0.015,
        outputCostPer1K: 0.075,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
    },
  },

  'google-ai-api': {
    id: 'google-ai-api',
    name: 'Google AI',
    defaultModel: 'gemini-2.0-flash', // Economy default (very cheap)
    models: {
      'gemini-2.0-flash': {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        tier: 'economy',
        inputCostPer1K: 0.0001,
        outputCostPer1K: 0.0004,
        avgInputTokens: 50,
        avgOutputTokens: 1900,
      },
      'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        tier: 'standard',
        inputCostPer1K: 0.000075,
        outputCostPer1K: 0.0003,
        avgInputTokens: 50,
        avgOutputTokens: 2000,
      },
      'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        tier: 'premium',
        inputCostPer1K: 0.00125,
        outputCostPer1K: 0.005,
        avgInputTokens: 50,
        avgOutputTokens: 2000,
      },
    },
  },

  'perplexity-api': {
    id: 'perplexity-api',
    name: 'Perplexity',
    defaultModel: 'sonar', // Only option, has per-request cost
    models: {
      'sonar': {
        id: 'sonar',
        name: 'Sonar',
        tier: 'standard',
        inputCostPer1K: 0.001,
        outputCostPer1K: 0.001,
        requestCost: 0.005, // $0.005 per request
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
      'sonar-pro': {
        id: 'sonar-pro',
        name: 'Sonar Pro',
        tier: 'premium',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.015,
        requestCost: 0.005,
        avgInputTokens: 50,
        avgOutputTokens: 600,
      },
    },
  },

  'xai-api': {
    id: 'xai-api',
    name: 'xAI (Grok)',
    defaultModel: 'grok-3-mini', // Economy default (grok-3 is expensive)
    models: {
      'grok-3-mini': {
        id: 'grok-3-mini',
        name: 'Grok 3 Mini',
        tier: 'economy',
        inputCostPer1K: 0.0003,
        outputCostPer1K: 0.0005,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
      'grok-3': {
        id: 'grok-3',
        name: 'Grok 3',
        tier: 'premium',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.015,
        avgInputTokens: 50,
        avgOutputTokens: 1300,
      },
      'grok-4-fast-reasoning': {
        id: 'grok-4-fast-reasoning',
        name: 'Grok 4 Fast',
        tier: 'premium',
        inputCostPer1K: 0.005,
        outputCostPer1K: 0.025,
        avgInputTokens: 50,
        avgOutputTokens: 1500,
      },
    },
  },

  'together-api': {
    id: 'together-api',
    name: 'Together.ai (Meta Llama)',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', // Good balance
    models: {
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': {
        id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        name: 'Llama 3.1 8B',
        tier: 'economy',
        inputCostPer1K: 0.00018,
        outputCostPer1K: 0.00018,
        avgInputTokens: 50,
        avgOutputTokens: 600,
      },
      'meta-llama/Llama-3.3-70B-Instruct-Turbo': {
        id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        name: 'Llama 3.3 70B',
        tier: 'standard',
        inputCostPer1K: 0.00088,
        outputCostPer1K: 0.00088,
        avgInputTokens: 50,
        avgOutputTokens: 650,
      },
      'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': {
        id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
        name: 'Llama 3.1 405B',
        tier: 'premium',
        inputCostPer1K: 0.005,
        outputCostPer1K: 0.005,
        avgInputTokens: 50,
        avgOutputTokens: 700,
      },
    },
  },

  // OpenAI Chat API (standard, no web search)
  'chat-api': {
    id: 'chat-api',
    name: 'OpenAI Chat API',
    defaultModel: 'gpt-4o',
    models: {
      'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4o',
        tier: 'standard',
        inputCostPer1K: 0.0025,
        outputCostPer1K: 0.01,
        avgInputTokens: 50,
        avgOutputTokens: 350,  // Based on HUFT study data
      },
      'gpt-4o-mini': {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        tier: 'economy',
        inputCostPer1K: 0.00015,
        outputCostPer1K: 0.0006,
        avgInputTokens: 50,
        avgOutputTokens: 350,
      },
    },
  },

  // OpenAI Web Search API (Responses endpoint with web_search tool)
  'websearch-api': {
    id: 'websearch-api',
    name: 'OpenAI Web Search API',
    defaultModel: 'gpt-4o',
    models: {
      'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4o + Web Search',
        tier: 'standard',
        inputCostPer1K: 0.0025,
        outputCostPer1K: 0.01,
        requestCost: 0.03,  // Web search tool cost per query
        avgInputTokens: 50,
        avgOutputTokens: 500,  // Based on HUFT study data
      },
    },
  },

  // Web surfaces - subscription-based, browser automation required
  'chatgpt-web': {
    id: 'chatgpt-web',
    name: 'ChatGPT Web',
    defaultModel: 'default',
    models: {
      'default': {
        id: 'default',
        name: 'ChatGPT (Web Default)',
        tier: 'standard',
        inputCostPer1K: 0,
        outputCostPer1K: 0,
        requestCost: 0.02,  // Subscription amortized: $20/mo ÷ 1000 queries
        avgInputTokens: 50,
        avgOutputTokens: 550,  // Based on HUFT study data
      },
    },
  },

  'perplexity-web': {
    id: 'perplexity-web',
    name: 'Perplexity Web',
    defaultModel: 'default',
    models: {
      'default': {
        id: 'default',
        name: 'Perplexity (Web Default)',
        tier: 'standard',
        inputCostPer1K: 0,
        outputCostPer1K: 0,
        avgInputTokens: 50,
        avgOutputTokens: 500,
      },
    },
  },

  'google-search': {
    id: 'google-search',
    name: 'Google Search',
    defaultModel: 'default',
    models: {
      'default': {
        id: 'default',
        name: 'Google Search',
        tier: 'standard',
        inputCostPer1K: 0,
        outputCostPer1K: 0,
        avgInputTokens: 20,
        avgOutputTokens: 200,
      },
    },
  },
};

/**
 * Get the default model for a surface
 */
export function getDefaultModel(surfaceId: string): string | undefined {
  return SURFACE_DEFAULTS[surfaceId]?.defaultModel;
}

/**
 * Get model config for a surface and model
 */
export function getModelConfig(surfaceId: string, modelId?: string): ModelConfig | undefined {
  const surface = SURFACE_DEFAULTS[surfaceId];
  if (!surface) return undefined;

  const model = modelId ?? surface.defaultModel;
  return surface.models[model];
}

/**
 * Estimate cost per query for a surface/model combination
 */
export function estimateQueryCost(surfaceId: string, modelId?: string): number {
  const config = getModelConfig(surfaceId, modelId);
  if (!config) return 0.01; // Default fallback

  const inputCost = (config.avgInputTokens / 1000) * config.inputCostPer1K;
  const outputCost = (config.avgOutputTokens / 1000) * config.outputCostPer1K;
  const requestCost = config.requestCost ?? 0;

  return inputCost + outputCost + requestCost;
}

/**
 * Estimate total cost for a study based on surfaces and query count
 */
export function estimateStudyCost(
  surfaces: Array<{ id: string; options?: { model?: string } }>,
  queryCount: number,
  locationCount: number
): {
  perQuery: number;
  total: number;
  breakdown: Array<{ surfaceId: string; model: string; costPer10: number }>;
} {
  let totalPerQuery = 0;
  const breakdown: Array<{ surfaceId: string; model: string; costPer10: number }> = [];

  for (const surface of surfaces) {
    const modelId = surface.options?.model;
    const costPerQuery = estimateQueryCost(surface.id, modelId);
    totalPerQuery += costPerQuery;

    const config = getModelConfig(surface.id, modelId);
    breakdown.push({
      surfaceId: surface.id,
      model: config?.name ?? 'Unknown',
      costPer10: Math.round(costPerQuery * 10 * 10000) / 10000, // Round to 4 decimals
    });
  }

  const totalCells = queryCount * surfaces.length * locationCount;
  const total = totalCells * (totalPerQuery / surfaces.length);

  return {
    perQuery: Math.round(totalPerQuery * 10000) / 10000,
    total: Math.round(total * 100) / 100,
    breakdown,
  };
}

/**
 * Get all available models for a surface
 */
export function getAvailableModels(surfaceId: string): ModelConfig[] {
  const surface = SURFACE_DEFAULTS[surfaceId];
  if (!surface) return [];
  return Object.values(surface.models);
}

/**
 * Validate that a model is available for a surface
 */
export function isValidModel(surfaceId: string, modelId: string): boolean {
  const surface = SURFACE_DEFAULTS[surfaceId];
  if (!surface) return false;
  return modelId in surface.models;
}

/**
 * Proxy cost configuration by type and region
 */
export const PROXY_COSTS: Record<string, Record<string, number>> = {
  residential: {
    'in-mum': 0.025,    // India - Cherry Proxy rate
    'us-nyc': 0.015,    // US locations cheaper
    'us-la': 0.015,
    'uk-lon': 0.020,
    'default': 0.020,   // Default for unlisted locations
  },
  datacenter: {
    'default': 0.005,
  },
  mobile: {
    'default': 0.050,
  },
};

/**
 * Get proxy cost per request for a location
 */
export function getProxyCost(
  locationId: string,
  proxyType: 'residential' | 'datacenter' | 'mobile' = 'residential'
): number {
  const typeCosts = PROXY_COSTS[proxyType];
  return typeCosts[locationId] ?? typeCosts['default'] ?? 0.02;
}

/**
 * Estimate full study cost including API, proxy, and infrastructure costs
 */
export function estimateFullStudyCost(
  surfaces: Array<{ id: string; options?: { model?: string } }>,
  locations: Array<{ id: string; proxyType?: 'residential' | 'datacenter' | 'mobile' }>,
  queryCount: number
): {
  perQuery: Record<string, number>;
  perSurface: Record<string, { api: number; proxy: number; total: number }>;
  perLocation: Record<string, { proxy: number }>;
  total: { api: number; proxy: number; grand: number };
  breakdown: Array<{
    surface: string;
    location: string;
    queries: number;
    apiCost: number;
    proxyCost: number;
    totalCost: number;
  }>;
} {
  const breakdown: Array<{
    surface: string;
    location: string;
    queries: number;
    apiCost: number;
    proxyCost: number;
    totalCost: number;
  }> = [];

  const perSurface: Record<string, { api: number; proxy: number; total: number }> = {};
  const perLocation: Record<string, { proxy: number }> = {};
  let totalApi = 0;
  let totalProxy = 0;

  for (const surface of surfaces) {
    const apiCostPerQuery = estimateQueryCost(surface.id, surface.options?.model);

    if (!perSurface[surface.id]) {
      perSurface[surface.id] = { api: 0, proxy: 0, total: 0 };
    }

    for (const location of locations) {
      const proxyCostPerQuery = getProxyCost(location.id, location.proxyType);
      const apiCost = apiCostPerQuery * queryCount;
      const proxyCost = proxyCostPerQuery * queryCount;

      breakdown.push({
        surface: surface.id,
        location: location.id,
        queries: queryCount,
        apiCost,
        proxyCost,
        totalCost: apiCost + proxyCost,
      });

      perSurface[surface.id].api += apiCost;
      perSurface[surface.id].proxy += proxyCost;
      perSurface[surface.id].total += apiCost + proxyCost;

      if (!perLocation[location.id]) {
        perLocation[location.id] = { proxy: 0 };
      }
      perLocation[location.id].proxy += proxyCost;

      totalApi += apiCost;
      totalProxy += proxyCost;
    }
  }

  return {
    perQuery: Object.fromEntries(
      surfaces.map(s => [s.id, estimateQueryCost(s.id, s.options?.model)])
    ),
    perSurface,
    perLocation,
    total: {
      api: Math.round(totalApi * 100) / 100,
      proxy: Math.round(totalProxy * 100) / 100,
      grand: Math.round((totalApi + totalProxy) * 100) / 100,
    },
    breakdown,
  };
}
