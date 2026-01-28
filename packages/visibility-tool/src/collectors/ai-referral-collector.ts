/**
 * AI Referral Traffic Collector
 *
 * Collects referral traffic data from AI sources via Google Analytics 4 API.
 * Outputs raw data as JSON - analysis is tenant-specific.
 *
 * Requires:
 * - GA4 property ID
 * - Google service account credentials (JSON key file)
 *
 * @see https://developers.google.com/analytics/devguides/reporting/data/v1
 */

/**
 * Known AI referral sources to track
 */
export const AI_REFERRAL_SOURCES = [
  // OpenAI / ChatGPT
  { domain: 'chat.openai.com', name: 'ChatGPT', type: 'chatbot' },
  { domain: 'chatgpt.com', name: 'ChatGPT', type: 'chatbot' },
  { domain: 'openai.com', name: 'OpenAI', type: 'chatbot' },

  // Anthropic / Claude
  { domain: 'claude.ai', name: 'Claude', type: 'chatbot' },
  { domain: 'claude.com', name: 'Claude', type: 'chatbot' },
  { domain: 'anthropic.com', name: 'Anthropic', type: 'chatbot' },

  // Perplexity
  { domain: 'perplexity.ai', name: 'Perplexity', type: 'search' },
  { domain: 'perplexity.com', name: 'Perplexity', type: 'search' },

  // Google AI
  { domain: 'gemini.google.com', name: 'Gemini', type: 'chatbot' },
  { domain: 'bard.google.com', name: 'Bard', type: 'chatbot' },
  { domain: 'google.com/search', name: 'Google AI Overview', type: 'search' },

  // Microsoft / Bing / Copilot
  { domain: 'bing.com', name: 'Bing/Copilot', type: 'search' },
  { domain: 'copilot.microsoft.com', name: 'Copilot', type: 'chatbot' },
  { domain: 'copilot.com', name: 'Copilot', type: 'chatbot' },

  // Meta AI
  { domain: 'meta.ai', name: 'Meta AI', type: 'chatbot' },

  // You.com
  { domain: 'you.com', name: 'You.com', type: 'search' },

  // Phind (developer focused)
  { domain: 'phind.com', name: 'Phind', type: 'search' },

  // Brave Search (has AI features)
  { domain: 'search.brave.com', name: 'Brave Search', type: 'search' },
] as const;

/**
 * A single referral data point
 */
export interface AIReferralEntry {
  /** Source domain */
  source: string;
  /** Matched AI source name (if known) */
  aiSourceName: string | null;
  /** AI source type */
  aiSourceType: 'chatbot' | 'search' | 'unknown';
  /** Landing page path */
  landingPage: string;
  /** Number of sessions */
  sessions: number;
  /** Number of users */
  users: number;
  /** Number of pageviews */
  pageviews: number;
  /** Average session duration in seconds */
  avgSessionDuration: number;
  /** Bounce rate (0-1) */
  bounceRate: number;
  /** Date of the data (YYYY-MM-DD) */
  date: string;
}

/**
 * Result of AI referral collection
 */
export interface AIReferralResult {
  /** GA4 property ID */
  propertyId: string;
  /** Date range start */
  startDate: string;
  /** Date range end */
  endDate: string;
  /** Timestamp of collection */
  timestamp: string;
  /** Whether collection succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Raw referral data */
  referrals: AIReferralEntry[];
  /** Summary counts */
  totals: {
    totalSessions: number;
    totalUsers: number;
    totalPageviews: number;
    uniqueAISources: number;
  };
}

/**
 * Options for collecting AI referral data
 */
export interface AIReferralOptions {
  /** GA4 property ID (e.g., 'properties/123456789') */
  propertyId: string;
  /** Path to service account JSON key file */
  credentialsPath?: string;
  /** Service account credentials object (alternative to path) */
  credentials?: {
    client_email: string;
    private_key: string;
    project_id?: string;
  };
  /** Start date (YYYY-MM-DD or relative like '30daysAgo') */
  startDate: string;
  /** End date (YYYY-MM-DD or 'today') */
  endDate: string;
  /** Include all referrals or only known AI sources */
  includeAllReferrals?: boolean;
  /** Filter to specific landing pages (regex patterns) */
  landingPageFilters?: string[];
}

/**
 * Match a referral source to known AI sources
 */
export function matchAISource(source: string): {
  name: string | null;
  type: 'chatbot' | 'search' | 'unknown';
} {
  const sourceLower = source.toLowerCase();

  for (const aiSource of AI_REFERRAL_SOURCES) {
    if (sourceLower.includes(aiSource.domain)) {
      return { name: aiSource.name, type: aiSource.type };
    }
  }

  return { name: null, type: 'unknown' };
}

/**
 * Check if a source is a known AI referrer
 */
export function isAIReferrer(source: string): boolean {
  return matchAISource(source).name !== null;
}

/**
 * Collect AI referral traffic data from GA4
 *
 * Note: Requires @google-analytics/data package and valid credentials.
 * If credentials are not available, returns an error result.
 */
export async function collectAIReferrals(
  options: AIReferralOptions
): Promise<AIReferralResult> {
  const timestamp = new Date().toISOString();

  try {
    // Dynamic import to avoid requiring the package if not used
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let BetaAnalyticsDataClient: any;
    try {
      // @ts-expect-error - Optional dependency, may not be installed
      const module = await import('@google-analytics/data');
      BetaAnalyticsDataClient = module.BetaAnalyticsDataClient;
    } catch {
      return {
        propertyId: options.propertyId,
        startDate: options.startDate,
        endDate: options.endDate,
        timestamp,
        success: false,
        error: 'Google Analytics Data API package not installed. Run: pnpm add @google-analytics/data',
        referrals: [],
        totals: { totalSessions: 0, totalUsers: 0, totalPageviews: 0, uniqueAISources: 0 },
      };
    }

    // Initialize the client
    const clientOptions: any = {};
    if (options.credentialsPath) {
      clientOptions.keyFilename = options.credentialsPath;
    } else if (options.credentials) {
      clientOptions.credentials = options.credentials;
    }

    const analyticsDataClient = new BetaAnalyticsDataClient(clientOptions);

    // Build dimension filter for AI sources (if not including all)
    const dimensionFilter = options.includeAllReferrals ? undefined : {
      orGroup: {
        expressions: AI_REFERRAL_SOURCES.map(source => ({
          filter: {
            fieldName: 'sessionSource',
            stringFilter: {
              matchType: 'CONTAINS',
              value: source.domain,
              caseSensitive: false,
            },
          },
        })),
      },
    };

    // Run the report
    const [response] = await analyticsDataClient.runReport({
      property: options.propertyId.startsWith('properties/')
        ? options.propertyId
        : `properties/${options.propertyId}`,
      dateRanges: [{ startDate: options.startDate, endDate: options.endDate }],
      dimensions: [
        { name: 'sessionSource' },
        { name: 'landingPage' },
        { name: 'date' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' },
      ],
      dimensionFilter,
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10000,
    });

    // Parse response into referral entries
    const referrals: AIReferralEntry[] = [];
    const seenSources = new Set<string>();

    for (const row of response.rows || []) {
      const source = row.dimensionValues?.[0]?.value || '';
      const landingPage = row.dimensionValues?.[1]?.value || '';
      const date = row.dimensionValues?.[2]?.value || '';

      // Apply landing page filters if specified
      if (options.landingPageFilters && options.landingPageFilters.length > 0) {
        const matchesFilter = options.landingPageFilters.some(pattern =>
          new RegExp(pattern).test(landingPage)
        );
        if (!matchesFilter) continue;
      }

      const aiMatch = matchAISource(source);

      // Skip non-AI sources if not including all
      if (!options.includeAllReferrals && !aiMatch.name) continue;

      seenSources.add(aiMatch.name || source);

      referrals.push({
        source,
        aiSourceName: aiMatch.name,
        aiSourceType: aiMatch.type,
        landingPage,
        sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
        users: parseInt(row.metricValues?.[1]?.value || '0', 10),
        pageviews: parseInt(row.metricValues?.[2]?.value || '0', 10),
        avgSessionDuration: parseFloat(row.metricValues?.[3]?.value || '0'),
        bounceRate: parseFloat(row.metricValues?.[4]?.value || '0'),
        date,
      });
    }

    // Calculate totals
    const totals = {
      totalSessions: referrals.reduce((sum, r) => sum + r.sessions, 0),
      totalUsers: referrals.reduce((sum, r) => sum + r.users, 0),
      totalPageviews: referrals.reduce((sum, r) => sum + r.pageviews, 0),
      uniqueAISources: seenSources.size,
    };

    return {
      propertyId: options.propertyId,
      startDate: options.startDate,
      endDate: options.endDate,
      timestamp,
      success: true,
      referrals,
      totals,
    };

  } catch (error) {
    return {
      propertyId: options.propertyId,
      startDate: options.startDate,
      endDate: options.endDate,
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      referrals: [],
      totals: { totalSessions: 0, totalUsers: 0, totalPageviews: 0, uniqueAISources: 0 },
    };
  }
}

/**
 * Get a list of all known AI referral source domains
 */
export function getKnownAISources(): Array<{ domain: string; name: string; type: string }> {
  return [...AI_REFERRAL_SOURCES];
}
