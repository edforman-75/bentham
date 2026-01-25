/**
 * Unified Study Runner
 *
 * Single entry point for running studies across all surfaces.
 * Routes queries to appropriate collection methods:
 * - SerpAPI for Google Search (handles location via params)
 * - Browser CDP for Cloudflare-protected surfaces (ChatGPT, etc.)
 * - Direct API for API surfaces
 *
 * NOTE: Google Search should ALWAYS use SerpAPI, not browser automation.
 */

import {
  SURFACE_COLLECTION_CONFIG,
  getCollectionConfig,
  getSerpApiParams,
  type CollectionMethod,
} from '../config/surface-defaults.js';

/**
 * Query to execute
 */
export interface StudyQuery {
  /** Query index in the study */
  index: number;
  /** Query text */
  text: string;
  /** Category for grouping */
  category?: string;
}

/**
 * Query result from any surface
 */
export interface QueryResult {
  /** Query index */
  queryIndex: number;
  /** Original query text */
  queryText: string;
  /** Surface that answered */
  surfaceId: string;
  /** Location used */
  locationId: string;
  /** Whether query succeeded */
  success: boolean;
  /** Response text */
  responseText?: string;
  /** Response time in ms */
  responseTimeMs: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp */
  timestamp: string;
  /** Collection method used */
  collectionMethod: CollectionMethod;
  /** Brand mentions extracted */
  brandMentions?: Array<{ brand: string; count: number }>;
}

/**
 * Study configuration
 */
export interface StudyConfig {
  /** Study name/identifier */
  name: string;
  /** Surfaces to query */
  surfaces: string[];
  /** Location ID (e.g., 'in-mum', 'us-national') */
  locationId: string;
  /** Queries to run */
  queries: StudyQuery[];
  /** Brands to track in responses */
  brandsToTrack?: string[];
  /** Output directory */
  outputDir: string;
  /** Save progress after each N queries */
  saveInterval?: number;
  /** Delay between queries in ms (min, max) */
  queryDelay?: [number, number];
}

/**
 * Study progress state
 */
export interface StudyProgress {
  /** Study name */
  studyName: string;
  /** Start time */
  startTime: string;
  /** Last update */
  lastUpdate: string;
  /** Total queries per surface */
  totalQueries: number;
  /** Completed queries per surface */
  completedBySurface: Record<string, number>;
  /** Failed queries per surface */
  failedBySurface: Record<string, number>;
  /** All results */
  results: QueryResult[];
}

/**
 * Extract brand mentions from response text
 */
export function extractBrandMentions(
  text: string,
  brands: string[]
): Array<{ brand: string; count: number }> {
  const mentions: Array<{ brand: string; count: number }> = [];
  const lowerText = text.toLowerCase();

  for (const brand of brands) {
    const lowerBrand = brand.toLowerCase();
    let count = 0;
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerBrand, pos)) !== -1) {
      count++;
      pos += lowerBrand.length;
    }
    if (count > 0) {
      mentions.push({ brand, count });
    }
  }

  return mentions.sort((a, b) => b.count - a.count);
}

/**
 * Get the recommended collection method for a surface
 */
export function getCollectionMethod(surfaceId: string): CollectionMethod {
  const config = getCollectionConfig(surfaceId);
  return config?.method ?? 'api';
}

/**
 * Check if a surface should use SerpAPI
 */
export function shouldUseSerpApi(surfaceId: string): boolean {
  return getCollectionMethod(surfaceId) === 'serpapi';
}

/**
 * Check if a surface requires browser automation
 */
export function requiresBrowser(surfaceId: string): boolean {
  const method = getCollectionMethod(surfaceId);
  return method === 'browser-cdp' || method === 'browser-proxy';
}

/**
 * Check if a surface uses direct API
 */
export function usesDirectApi(surfaceId: string): boolean {
  return getCollectionMethod(surfaceId) === 'api';
}

/**
 * Route a query to the appropriate collection method
 */
export async function routeQuery(
  surfaceId: string,
  query: string,
  locationId: string,
  options: {
    serpApiKey?: string;
    cdpPort?: number;
    apiKey?: string;
  } = {}
): Promise<{
  method: CollectionMethod;
  params: Record<string, unknown>;
}> {
  const method = getCollectionMethod(surfaceId);

  switch (method) {
    case 'serpapi': {
      const serpParams = getSerpApiParams(locationId);
      return {
        method: 'serpapi',
        params: {
          api_key: options.serpApiKey,
          engine: 'google',
          q: query,
          ...serpParams,
        },
      };
    }

    case 'browser-cdp': {
      return {
        method: 'browser-cdp',
        params: {
          cdpPort: options.cdpPort ?? 9222,
          query,
          surfaceId,
        },
      };
    }

    case 'browser-proxy': {
      return {
        method: 'browser-proxy',
        params: {
          query,
          surfaceId,
          locationId,
        },
      };
    }

    case 'api':
    default: {
      return {
        method: 'api',
        params: {
          apiKey: options.apiKey,
          query,
          surfaceId,
        },
      };
    }
  }
}

/**
 * Get surface routing summary for a study
 */
export function getStudyRoutingSummary(
  surfaces: string[],
  _locationId: string
): Array<{
  surfaceId: string;
  method: CollectionMethod;
  notes: string;
}> {
  return surfaces.map(surfaceId => {
    const config = getCollectionConfig(surfaceId);
    return {
      surfaceId,
      method: config?.method ?? 'api',
      notes: config?.notes ?? 'No configuration found',
    };
  });
}

/**
 * Validate study configuration
 */
export function validateStudyConfig(config: StudyConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check surfaces exist in config
  for (const surfaceId of config.surfaces) {
    const surfaceConfig = SURFACE_COLLECTION_CONFIG[surfaceId];
    if (!surfaceConfig) {
      warnings.push(`Surface '${surfaceId}' not in SURFACE_COLLECTION_CONFIG`);
    }
  }

  // Check for browser surfaces that need special handling
  const browserSurfaces = config.surfaces.filter(requiresBrowser);
  if (browserSurfaces.length > 0) {
    warnings.push(
      `Browser automation required for: ${browserSurfaces.join(', ')}. ` +
      `Ensure Chrome is running with CDP or VPN is connected for location.`
    );
  }

  // Check queries
  if (config.queries.length === 0) {
    errors.push('No queries specified');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Create per-surface output paths to avoid race conditions
 */
export function getSurfaceOutputPath(
  outputDir: string,
  studyName: string,
  surfaceId: string
): string {
  const safeName = studyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const safeSurface = surfaceId.replace(/[^a-z0-9]+/g, '-');
  return `${outputDir}/${safeName}-${safeSurface}-results.json`;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max
 */
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
