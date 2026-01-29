/**
 * Citation Collector
 *
 * Extracts citations/sources from AI surface responses.
 * Supports Perplexity (API) and Google SERP (scraping).
 *
 * Outputs raw citation data as JSON - analysis is tenant-specific.
 */

import { Page } from 'playwright';

/**
 * A citation extracted from an AI response
 */
export interface Citation {
  /** URL of the cited source */
  url: string;
  /** Title of the cited source */
  title: string | null;
  /** Domain of the source */
  domain: string;
  /** Snippet/context where the citation appeared */
  context: string | null;
  /** Position in the response (1-indexed) */
  position: number;
  /** Source surface that provided this citation */
  surface: 'perplexity' | 'google-ai-overview' | 'google-featured-snippet' | 'bing-copilot';
}

/**
 * Result of a citation query
 */
export interface CitationResult {
  /** The query that was run */
  query: string;
  /** AI response text */
  responseText: string;
  /** Extracted citations */
  citations: Citation[];
  /** Timestamp of collection */
  timestamp: string;
  /** Surface that was queried */
  surface: string;
  /** Whether collection succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Aggregated citation results
 */
export interface CitationSummary {
  /** Total queries run */
  totalQueries: number;
  /** Total citations found */
  totalCitations: number;
  /** Unique domains cited */
  uniqueDomains: string[];
  /** Citations by domain */
  citationsByDomain: Record<string, number>;
  /** Citations by surface */
  citationsBySurface: Record<string, number>;
}

/**
 * Options for Perplexity queries
 */
export interface PerplexityOptions {
  /** API key (or uses PERPLEXITY_API_KEY env var) */
  apiKey?: string;
  /** Model to use */
  model?: string;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Query Perplexity API and extract citations
 *
 * Perplexity returns citations in the response with [1], [2] etc markers
 * and provides the actual URLs in the citations array.
 */
export async function queryPerplexity(
  query: string,
  options: PerplexityOptions = {}
): Promise<CitationResult> {
  const timestamp = new Date().toISOString();
  const apiKey = options.apiKey || process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    return {
      query,
      responseText: '',
      citations: [],
      timestamp,
      surface: 'perplexity',
      success: false,
      error: 'Perplexity API key not provided. Set PERPLEXITY_API_KEY env var or pass apiKey option.',
    };
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'user', content: query },
        ],
        return_citations: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        query,
        responseText: '',
        citations: [],
        timestamp,
        surface: 'perplexity',
        success: false,
        error: `Perplexity API error: ${response.status} ${errorText}`,
      };
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';
    const citationUrls: string[] = data.citations || [];

    // Extract citations with context
    const citations: Citation[] = citationUrls.map((url, index) => {
      // Try to find context around the citation marker [n]
      const marker = `[${index + 1}]`;
      const markerIndex = responseText.indexOf(marker);
      let context: string | null = null;

      if (markerIndex !== -1) {
        // Get surrounding text (50 chars before and after)
        const start = Math.max(0, markerIndex - 50);
        const end = Math.min(responseText.length, markerIndex + marker.length + 50);
        context = responseText.slice(start, end).trim();
      }

      return {
        url,
        title: null, // Perplexity doesn't provide titles directly
        domain: extractDomain(url),
        context,
        position: index + 1,
        surface: 'perplexity' as const,
      };
    });

    return {
      query,
      responseText,
      citations,
      timestamp,
      surface: 'perplexity',
      success: true,
    };

  } catch (error) {
    return {
      query,
      responseText: '',
      citations: [],
      timestamp,
      surface: 'perplexity',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scrape Google search results for AI Overview and featured snippets
 */
export async function scrapeGoogleCitations(
  page: Page,
  query: string
): Promise<CitationResult> {
  const timestamp = new Date().toISOString();

  try {
    // Navigate to Google search
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for results
    await page.waitForTimeout(2000);

    // Extract AI Overview (if present) and featured snippets
    const extractedData = await page.evaluate(() => {
      const citations: Array<{
        url: string;
        title: string | null;
        context: string | null;
        type: 'ai-overview' | 'featured-snippet';
      }> = [];

      let responseText = '';

      // Look for AI Overview (Google's SGE/AI-generated content)
      // This appears in a special container
      const aiOverview = document.querySelector('[data-attrid="ai_overview"]') ||
        document.querySelector('.kp-blk') ||
        document.querySelector('[jsname="N760b"]');

      if (aiOverview) {
        responseText = aiOverview.textContent?.trim() || '';

        // Extract links from AI Overview
        aiOverview.querySelectorAll('a[href]').forEach(link => {
          const href = (link as HTMLAnchorElement).href;
          if (href && href.startsWith('http') && !href.includes('google.com')) {
            citations.push({
              url: href,
              title: link.textContent?.trim() || null,
              context: link.closest('p, div, li')?.textContent?.trim()?.slice(0, 200) || null,
              type: 'ai-overview',
            });
          }
        });
      }

      // Look for Featured Snippet
      const featuredSnippet = document.querySelector('.xpdopen') ||
        document.querySelector('[data-attrid="wa:/description"]') ||
        document.querySelector('.ifM9O');

      if (featuredSnippet) {
        const snippetText = featuredSnippet.textContent?.trim() || '';
        if (!responseText) responseText = snippetText;
        else responseText += '\n\n' + snippetText;

        // Extract the source link
        const sourceLink = featuredSnippet.querySelector('a[href]') ||
          featuredSnippet.parentElement?.querySelector('a[href]');

        if (sourceLink) {
          const href = (sourceLink as HTMLAnchorElement).href;
          if (href && !href.includes('google.com')) {
            citations.push({
              url: href,
              title: sourceLink.textContent?.trim() || null,
              context: snippetText.slice(0, 200),
              type: 'featured-snippet',
            });
          }
        }
      }

      // Also get People Also Ask citations
      document.querySelectorAll('[data-q]').forEach(paa => {
        const expanded = paa.querySelector('.wQiwMc');
        if (expanded) {
          const link = expanded.querySelector('a[href]');
          if (link) {
            const href = (link as HTMLAnchorElement).href;
            if (href && !href.includes('google.com')) {
              citations.push({
                url: href,
                title: link.textContent?.trim() || null,
                context: expanded.textContent?.trim()?.slice(0, 200) || null,
                type: 'featured-snippet',
              });
            }
          }
        }
      });

      return { responseText, citations };
    });

    const citations: Citation[] = extractedData.citations.map((c, index) => ({
      url: c.url,
      title: c.title,
      domain: extractDomain(c.url),
      context: c.context,
      position: index + 1,
      surface: c.type === 'ai-overview' ? 'google-ai-overview' as const : 'google-featured-snippet' as const,
    }));

    return {
      query,
      responseText: extractedData.responseText,
      citations,
      timestamp,
      surface: 'google',
      success: true,
    };

  } catch (error) {
    return {
      query,
      responseText: '',
      citations: [],
      timestamp,
      surface: 'google',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run citation queries across multiple surfaces
 */
export async function collectCitations(
  queries: string[],
  options: {
    perplexity?: PerplexityOptions | false;
    google?: { page: Page } | false;
    onProgress?: (completed: number, total: number, result: CitationResult) => void;
  } = {}
): Promise<CitationResult[]> {
  const results: CitationResult[] = [];
  const surfaces = [];

  if (options.perplexity !== false) surfaces.push('perplexity');
  if (options.google !== false && options.google?.page) surfaces.push('google');

  const totalOps = queries.length * surfaces.length;
  let completed = 0;

  for (const query of queries) {
    // Query Perplexity
    if (options.perplexity !== false) {
      const result = await queryPerplexity(query, options.perplexity || {});
      results.push(result);
      completed++;
      options.onProgress?.(completed, totalOps, result);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Query Google
    if (options.google !== false && options.google?.page) {
      const result = await scrapeGoogleCitations(options.google.page, query);
      results.push(result);
      completed++;
      options.onProgress?.(completed, totalOps, result);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return results;
}

/**
 * Summarize citation results
 */
export function summarizeCitations(results: CitationResult[]): CitationSummary {
  const allCitations = results.flatMap(r => r.citations);
  const domains = allCitations.map(c => c.domain);
  const uniqueDomains = [...new Set(domains)];

  const citationsByDomain: Record<string, number> = {};
  for (const domain of domains) {
    citationsByDomain[domain] = (citationsByDomain[domain] || 0) + 1;
  }

  const citationsBySurface: Record<string, number> = {};
  for (const citation of allCitations) {
    citationsBySurface[citation.surface] = (citationsBySurface[citation.surface] || 0) + 1;
  }

  return {
    totalQueries: results.length,
    totalCitations: allCitations.length,
    uniqueDomains: uniqueDomains.sort(),
    citationsByDomain,
    citationsBySurface,
  };
}

/**
 * Filter citations to find brand-relevant ones
 */
export function filterCitationsForBrand(
  results: CitationResult[],
  brandDomains: string[]
): Citation[] {
  const allCitations = results.flatMap(r => r.citations);
  const brandDomainsLower = brandDomains.map(d => d.toLowerCase());

  return allCitations.filter(citation => {
    const citationDomain = citation.domain.toLowerCase();
    return brandDomainsLower.some(bd =>
      citationDomain.includes(bd) || bd.includes(citationDomain)
    );
  });
}
