/**
 * Site Crawler Module
 * Discovers all URLs on a site with page type classification
 * Supports sitemap.xml parsing and link-following crawl
 */

import { Page } from 'playwright';

/**
 * Page types that can be discovered
 */
export type PageType =
  | 'product'
  | 'collection'
  | 'article'
  | 'blog-index'
  | 'faq'
  | 'landing'
  | 'homepage'
  | 'policy'
  | 'contact'
  | 'about'
  | 'other';

/**
 * A discovered page with its classification
 */
export interface DiscoveredPage {
  url: string;
  title: string | null;
  pageType: PageType;
  lastModified: string | null;
  priority: number | null;
  source: 'sitemap' | 'crawl' | 'link';
}

/**
 * Sitemap entry from XML parsing
 */
interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

/**
 * Options for site crawling
 */
export interface CrawlOptions {
  /** Maximum number of pages to discover */
  maxPages: number;
  /** Timeout for each page load in ms */
  pageTimeout: number;
  /** Whether to parse sitemap.xml first */
  useSitemap: boolean;
  /** Whether to follow links for additional discovery */
  followLinks: boolean;
  /** Page types to include (null = all types) */
  includeTypes: PageType[] | null;
  /** Page types to exclude */
  excludeTypes: PageType[];
  /** URL patterns to exclude (regex) */
  excludePatterns: RegExp[];
  /** Delay between page loads in ms */
  crawlDelay: number;
  /** Maximum crawl depth for link following */
  maxDepth: number;
  /** Progress callback */
  onProgress?: (discovered: number, crawled: number, current: string) => void;
}

const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  maxPages: 500,
  pageTimeout: 30000,
  useSitemap: true,
  followLinks: true,
  includeTypes: null,
  excludeTypes: [],
  excludePatterns: [
    /\/cart/i,
    /\/checkout/i,
    /\/account/i,
    /\/login/i,
    /\/register/i,
    /\/wishlist/i,
    /\/search\?/i,
    /\?variant=/i,
    /\?color=/i,
    /\?size=/i,
  ],
  crawlDelay: 500,
  maxDepth: 3,
};

/**
 * URL patterns for page type classification
 */
const PAGE_TYPE_PATTERNS: Array<{ type: PageType; patterns: RegExp[] }> = [
  {
    type: 'product',
    patterns: [
      /\/products?\//i,
      /\/p\//i,
      /\/item\//i,
      /\/dp\/[A-Z0-9]{10}/i,
      /\/shop\/[^/]+\/[^/]+$/i,
    ],
  },
  {
    type: 'collection',
    patterns: [
      /\/collections?\/[^/]+$/i,
      /\/category\//i,
      /\/categories\//i,
      /\/c\//i,
      /\/shop\/?$/i,
      /\/catalog\//i,
    ],
  },
  {
    type: 'article',
    patterns: [
      /\/blog\/[^/]+$/i,
      /\/article\//i,
      /\/news\/[^/]+$/i,
      /\/post\//i,
      /\/journal\/[^/]+$/i,
    ],
  },
  {
    type: 'blog-index',
    patterns: [
      /\/blog\/?$/i,
      /\/news\/?$/i,
      /\/articles\/?$/i,
      /\/journal\/?$/i,
    ],
  },
  {
    type: 'faq',
    patterns: [
      /\/faq/i,
      /\/help\/?$/i,
      /\/frequently-asked/i,
      /\/questions/i,
      /\/support\/?$/i,
    ],
  },
  {
    type: 'landing',
    patterns: [
      /\/landing\//i,
      /\/lp\//i,
      /\/campaign\//i,
      /\/promo\//i,
      /\/sale\/?$/i,
    ],
  },
  {
    type: 'policy',
    patterns: [
      /\/privacy/i,
      /\/terms/i,
      /\/conditions/i,
      /\/shipping/i,
      /\/returns/i,
      /\/refund/i,
      /\/policy/i,
      /\/legal/i,
      /\/disclaimer/i,
      /\/accessibility/i,
    ],
  },
  {
    type: 'contact',
    patterns: [
      /\/contact/i,
      /\/get-in-touch/i,
      /\/reach-us/i,
      /\/locations?$/i,
      /\/store-locator/i,
    ],
  },
  {
    type: 'about',
    patterns: [
      /\/about/i,
      /\/our-story/i,
      /\/who-we-are/i,
      /\/team/i,
      /\/company/i,
      /\/mission/i,
    ],
  },
];

/**
 * Classify a URL into a page type
 */
export function classifyPageType(url: string): PageType {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();

    // Check for homepage
    if (path === '/' || path === '') {
      return 'homepage';
    }

    // Check against known patterns
    for (const { type, patterns } of PAGE_TYPE_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(path)) {
          return type;
        }
      }
    }

    return 'other';
  } catch {
    return 'other';
  }
}

/**
 * Extract base domain from URL
 */
function getBaseDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return '';
  }
}

/**
 * Check if URL should be excluded
 */
function shouldExclude(url: string, options: CrawlOptions, baseDomain: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be same domain
    if (!parsed.hostname.includes(baseDomain.replace(/^www\./, ''))) {
      return true;
    }

    // Check exclude patterns
    for (const pattern of options.excludePatterns) {
      if (pattern.test(url)) {
        return true;
      }
    }

    // Check page type filters
    const pageType = classifyPageType(url);
    if (options.excludeTypes.includes(pageType)) {
      return true;
    }
    if (options.includeTypes && !options.includeTypes.includes(pageType)) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Parse sitemap XML content
 */
function parseSitemapXml(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  // Extract all <url> entries
  const urlMatches = xml.matchAll(/<url>([\s\S]*?)<\/url>/gi);
  for (const match of urlMatches) {
    const urlBlock = match[1];

    const loc = urlBlock.match(/<loc>(.*?)<\/loc>/i)?.[1]?.trim();
    if (!loc) continue;

    const lastmod = urlBlock.match(/<lastmod>(.*?)<\/lastmod>/i)?.[1]?.trim();
    const changefreq = urlBlock.match(/<changefreq>(.*?)<\/changefreq>/i)?.[1]?.trim();
    const priority = urlBlock.match(/<priority>(.*?)<\/priority>/i)?.[1]?.trim();

    entries.push({
      loc: decodeHtmlEntities(loc),
      lastmod,
      changefreq,
      priority,
    });
  }

  return entries;
}

/**
 * Parse sitemap index to get all sitemap URLs
 */
function parseSitemapIndex(xml: string): string[] {
  const sitemaps: string[] = [];

  const matches = xml.matchAll(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/gi);
  for (const match of matches) {
    const loc = match[1]?.trim();
    if (loc) {
      sitemaps.push(decodeHtmlEntities(loc));
    }
  }

  return sitemaps;
}

/**
 * Decode HTML entities in XML content
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Fetch and parse sitemap.xml
 */
async function fetchSitemap(
  baseUrl: string,
  options: CrawlOptions
): Promise<SitemapEntry[]> {
  const allEntries: SitemapEntry[] = [];
  const sitemapUrls: string[] = [];

  // Start with standard sitemap locations
  const baseHost = new URL(baseUrl).origin;
  const possibleSitemaps = [
    `${baseHost}/sitemap.xml`,
    `${baseHost}/sitemap_index.xml`,
    `${baseHost}/sitemap-index.xml`,
  ];

  // Try to find sitemaps from robots.txt first
  try {
    const robotsResponse = await fetch(`${baseHost}/robots.txt`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BenthamBot/1.0)' },
    });
    if (robotsResponse.ok) {
      const robotsText = await robotsResponse.text();
      const sitemapMatches = robotsText.matchAll(/^Sitemap:\s*(.+)$/gmi);
      for (const match of sitemapMatches) {
        const sitemapUrl = match[1].trim();
        if (!possibleSitemaps.includes(sitemapUrl)) {
          possibleSitemaps.unshift(sitemapUrl); // Add to beginning (higher priority)
        }
      }
    }
  } catch {
    // Continue without robots.txt
  }

  // Try each possible sitemap
  for (const sitemapUrl of possibleSitemaps) {
    try {
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BenthamBot/1.0)' },
        signal: AbortSignal.timeout(options.pageTimeout),
      });

      if (!response.ok) continue;

      const xml = await response.text();

      // Check if it's a sitemap index
      if (xml.includes('<sitemapindex') || xml.includes('<sitemap>')) {
        const indexedSitemaps = parseSitemapIndex(xml);
        sitemapUrls.push(...indexedSitemaps);
      } else if (xml.includes('<urlset')) {
        const entries = parseSitemapXml(xml);
        allEntries.push(...entries);
      }

      // If we found something, don't check other default locations
      if (allEntries.length > 0 || sitemapUrls.length > 0) break;
    } catch {
      // Continue to next sitemap URL
    }
  }

  // Fetch any indexed sitemaps
  for (const sitemapUrl of sitemapUrls) {
    if (allEntries.length >= options.maxPages) break;

    try {
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BenthamBot/1.0)' },
        signal: AbortSignal.timeout(options.pageTimeout),
      });

      if (response.ok) {
        const xml = await response.text();
        const entries = parseSitemapXml(xml);
        allEntries.push(...entries);
      }
    } catch {
      // Continue with other sitemaps
    }
  }

  return allEntries;
}

/**
 * Extract links from a page
 */
async function extractLinks(page: Page, baseDomain: string): Promise<Array<{ url: string; text: string }>> {
  try {
    return await page.evaluate((domain) => {
      const links: Array<{ url: string; text: string }> = [];
      const seen = new Set<string>();

      document.querySelectorAll('a[href]').forEach((anchor) => {
        const href = (anchor as HTMLAnchorElement).href;
        if (!href || seen.has(href)) return;
        seen.add(href);

        try {
          const parsed = new URL(href);
          // Only include same-domain links
          if (parsed.hostname.includes(domain.replace(/^www\./, ''))) {
            links.push({
              url: href,
              text: anchor.textContent?.trim()?.slice(0, 100) || '',
            });
          }
        } catch {
          // Skip invalid URLs
        }
      });

      return links;
    }, baseDomain);
  } catch {
    return [];
  }
}

/**
 * Get page title from a Playwright page
 */
async function getPageTitle(page: Page): Promise<string | null> {
  try {
    return await page.title();
  } catch {
    return null;
  }
}

/**
 * Crawl a site to discover all pages
 */
export async function crawlSite(
  page: Page,
  startUrl: string,
  options: Partial<CrawlOptions> = {}
): Promise<DiscoveredPage[]> {
  const opts: CrawlOptions = { ...DEFAULT_CRAWL_OPTIONS, ...options };
  const baseDomain = getBaseDomain(startUrl);
  const discovered: Map<string, DiscoveredPage> = new Map();
  const toVisit: Array<{ url: string; depth: number }> = [];
  const visited = new Set<string>();

  // Step 1: Parse sitemap if enabled
  if (opts.useSitemap) {
    opts.onProgress?.(0, 0, 'Parsing sitemap...');

    const sitemapEntries = await fetchSitemap(startUrl, opts);

    for (const entry of sitemapEntries) {
      if (discovered.size >= opts.maxPages) break;

      const normalizedUrl = normalizeUrl(entry.loc);
      if (shouldExclude(normalizedUrl, opts, baseDomain)) continue;

      const pageType = classifyPageType(normalizedUrl);
      discovered.set(normalizedUrl, {
        url: normalizedUrl,
        title: null,
        pageType,
        lastModified: entry.lastmod || null,
        priority: entry.priority ? parseFloat(entry.priority) : null,
        source: 'sitemap',
      });
    }

    opts.onProgress?.(discovered.size, 0, `Found ${discovered.size} URLs in sitemap`);
  }

  // Step 2: Crawl for additional discovery if enabled
  if (opts.followLinks && discovered.size < opts.maxPages) {
    // Add start URL and sitemap URLs to crawl queue
    toVisit.push({ url: startUrl, depth: 0 });

    // Also add a sample of discovered URLs to crawl for more links
    const sitemapUrls = Array.from(discovered.keys());
    const sampleSize = Math.min(20, sitemapUrls.length);
    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * sitemapUrls.length);
      toVisit.push({ url: sitemapUrls[randomIndex], depth: 1 });
    }

    let crawled = 0;

    while (toVisit.length > 0 && discovered.size < opts.maxPages) {
      const { url, depth } = toVisit.shift()!;
      const normalizedUrl = normalizeUrl(url);

      if (visited.has(normalizedUrl)) continue;
      if (depth > opts.maxDepth) continue;
      if (shouldExclude(normalizedUrl, opts, baseDomain)) continue;

      visited.add(normalizedUrl);
      crawled++;

      opts.onProgress?.(discovered.size, crawled, normalizedUrl);

      try {
        await page.goto(normalizedUrl, {
          waitUntil: 'domcontentloaded',
          timeout: opts.pageTimeout,
        });

        // Wait for dynamic content
        await page.waitForTimeout(1000);

        const title = await getPageTitle(page);

        // Add this page if not already discovered
        if (!discovered.has(normalizedUrl)) {
          discovered.set(normalizedUrl, {
            url: normalizedUrl,
            title,
            pageType: classifyPageType(normalizedUrl),
            lastModified: null,
            priority: null,
            source: 'crawl',
          });
        } else if (title && !discovered.get(normalizedUrl)!.title) {
          // Update title if we didn't have it
          discovered.get(normalizedUrl)!.title = title;
        }

        // Extract links for further crawling
        if (depth < opts.maxDepth) {
          const links = await extractLinks(page, baseDomain);

          for (const link of links) {
            const linkUrl = normalizeUrl(link.url);
            if (!visited.has(linkUrl) && !shouldExclude(linkUrl, opts, baseDomain)) {
              // Add to discovered if new
              if (!discovered.has(linkUrl)) {
                discovered.set(linkUrl, {
                  url: linkUrl,
                  title: link.text || null,
                  pageType: classifyPageType(linkUrl),
                  lastModified: null,
                  priority: null,
                  source: 'link',
                });
              }

              // Add to crawl queue
              toVisit.push({ url: linkUrl, depth: depth + 1 });
            }
          }
        }

        // Respect crawl delay
        await page.waitForTimeout(opts.crawlDelay);

      } catch (error) {
        // Page failed to load, skip it
        console.warn(`Failed to crawl ${normalizedUrl}:`, error);
      }
    }
  }

  return Array.from(discovered.values());
}

/**
 * Normalize a URL for comparison
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    // Remove common tracking parameters
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid'].forEach(param => {
      parsed.searchParams.delete(param);
    });
    // Remove trailing slash
    let normalized = parsed.toString();
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

/**
 * Summarize discovered pages by type
 */
export function summarizeDiscoveredPages(pages: DiscoveredPage[]): {
  total: number;
  byType: Record<PageType, number>;
  bySource: Record<'sitemap' | 'crawl' | 'link', number>;
} {
  const byType: Record<PageType, number> = {
    product: 0,
    collection: 0,
    article: 0,
    'blog-index': 0,
    faq: 0,
    landing: 0,
    homepage: 0,
    policy: 0,
    contact: 0,
    about: 0,
    other: 0,
  };

  const bySource: Record<'sitemap' | 'crawl' | 'link', number> = {
    sitemap: 0,
    crawl: 0,
    link: 0,
  };

  for (const page of pages) {
    byType[page.pageType]++;
    bySource[page.source]++;
  }

  return {
    total: pages.length,
    byType,
    bySource,
  };
}

/**
 * Filter discovered pages by type
 */
export function filterPagesByType(
  pages: DiscoveredPage[],
  types: PageType[]
): DiscoveredPage[] {
  return pages.filter(p => types.includes(p.pageType));
}

/**
 * Get pages of a specific type
 */
export function getPagesByType(
  pages: DiscoveredPage[],
  type: PageType
): DiscoveredPage[] {
  return pages.filter(p => p.pageType === type);
}
