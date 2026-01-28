/**
 * LLM Reachability Collector
 * Checks if pages are actually accessible to AI crawlers by comparing
 * raw HTML (no JavaScript) vs fully rendered content.
 *
 * AI crawlers like GPTBot typically don't execute JavaScript, so pages
 * that rely on client-side rendering may be "dark" to AI systems.
 */

import { Page, chromium, Browser } from 'playwright';

/**
 * Content extracted from a page
 */
export interface PageContent {
  /** Page title */
  title: string | null;
  /** Meta description */
  description: string | null;
  /** H1 heading(s) */
  h1: string[];
  /** H2 headings */
  h2: string[];
  /** Main text content (paragraphs) */
  textContent: string;
  /** Word count of visible text */
  wordCount: number;
  /** Product name (if product page) */
  productName: string | null;
  /** Product price (if product page) */
  productPrice: string | null;
  /** Product description (if product page) */
  productDescription: string | null;
  /** JSON-LD schemas found */
  jsonLdTypes: string[];
  /** Images with alt text */
  imagesWithAlt: number;
  /** Images without alt text */
  imagesWithoutAlt: number;
  /** Links count */
  linkCount: number;
  /** Meta robots directive */
  metaRobots: string | null;
  /** Canonical URL */
  canonical: string | null;
}

/**
 * Comparison between raw and rendered content
 */
export interface ContentComparison {
  field: string;
  rawValue: string | number | null;
  renderedValue: string | number | null;
  match: boolean;
  severity: 'ok' | 'warning' | 'critical';
  message: string;
}

/**
 * Full reachability analysis result
 */
export interface ReachabilityResult {
  url: string;
  timestamp: string;
  success: boolean;
  error?: string;

  /** Raw HTML content (no JavaScript) - what AI crawlers see */
  rawContent: PageContent;

  /** Fully rendered content (with JavaScript) - what humans see */
  renderedContent: PageContent;

  /** Field-by-field comparison */
  comparisons: ContentComparison[];

  /** Overall reachability score (0-100) */
  reachabilityScore: number;

  /** Is this page effectively "dark" to AI crawlers? */
  isDarkToAI: boolean;

  /** Summary of issues */
  issues: string[];

  /** Recommendations */
  recommendations: string[];
}

/**
 * Extract content from raw HTML string
 */
function extractFromRawHtml(html: string): PageContent {
  // Simple regex-based extraction for raw HTML (no DOM available)
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i);
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);

  // Extract headings
  const h1Matches = html.match(/<h1[^>]*>([^<]*)<\/h1>/gi) || [];
  const h1 = h1Matches.map(m => m.replace(/<[^>]*>/g, '').trim()).filter(Boolean);

  const h2Matches = html.match(/<h2[^>]*>([^<]*)<\/h2>/gi) || [];
  const h2 = h2Matches.map(m => m.replace(/<[^>]*>/g, '').trim()).filter(Boolean);

  // Extract JSON-LD types
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const jsonLdTypes: string[] = [];
  for (const match of jsonLdMatches) {
    try {
      const content = match.replace(/<[^>]*>/g, '');
      const parsed = JSON.parse(content);
      if (parsed['@type']) {
        jsonLdTypes.push(Array.isArray(parsed['@type']) ? parsed['@type'].join(', ') : parsed['@type']);
      }
      if (parsed['@graph']) {
        for (const item of parsed['@graph']) {
          if (item['@type']) {
            jsonLdTypes.push(Array.isArray(item['@type']) ? item['@type'].join(', ') : item['@type']);
          }
        }
      }
    } catch {
      // Invalid JSON-LD
    }
  }

  // Extract text content (strip all HTML tags)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;
  const textContent = bodyHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Count images
  const imgWithAlt = (html.match(/<img[^>]*alt=["'][^"']+["'][^>]*>/gi) || []).length;
  const imgTotal = (html.match(/<img[^>]*>/gi) || []).length;

  // Count links
  const linkCount = (html.match(/<a[^>]*href/gi) || []).length;

  // Try to find product info in structured data or common patterns
  let productName: string | null = null;
  let productPrice: string | null = null;
  let productDescription: string | null = null;

  // Check JSON-LD for Product
  for (const match of jsonLdMatches) {
    try {
      const content = match.replace(/<[^>]*>/g, '');
      const parsed = JSON.parse(content);
      const product = parsed['@type'] === 'Product' ? parsed :
                      parsed['@graph']?.find((i: any) => i['@type'] === 'Product');
      if (product) {
        productName = product.name || null;
        productPrice = product.offers?.price?.toString() || null;
        productDescription = product.description || null;
      }
    } catch {
      // Invalid JSON-LD
    }
  }

  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    description: descMatch ? descMatch[1].trim() : null,
    h1,
    h2,
    textContent,
    wordCount: textContent.split(/\s+/).filter(Boolean).length,
    productName,
    productPrice,
    productDescription,
    jsonLdTypes,
    imagesWithAlt: imgWithAlt,
    imagesWithoutAlt: imgTotal - imgWithAlt,
    linkCount,
    metaRobots: robotsMatch ? robotsMatch[1].trim() : null,
    canonical: canonicalMatch ? canonicalMatch[1].trim() : null,
  };
}

/**
 * Extract content from rendered page (with JavaScript)
 */
async function extractFromRenderedPage(page: Page): Promise<PageContent> {
  return page.evaluate(() => {
    // Title
    const title = document.title || null;

    // Meta description
    const descEl = document.querySelector('meta[name="description"]');
    const description = descEl?.getAttribute('content') || null;

    // Meta robots
    const robotsEl = document.querySelector('meta[name="robots"]');
    const metaRobots = robotsEl?.getAttribute('content') || null;

    // Canonical
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const canonical = canonicalEl?.getAttribute('href') || null;

    // Headings
    const h1 = Array.from(document.querySelectorAll('h1')).map(el => el.textContent?.trim() || '').filter(Boolean);
    const h2 = Array.from(document.querySelectorAll('h2')).map(el => el.textContent?.trim() || '').filter(Boolean);

    // Text content
    const textContent = document.body?.innerText?.replace(/\s+/g, ' ').trim() || '';
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;

    // Images
    const images = document.querySelectorAll('img');
    let imagesWithAlt = 0;
    let imagesWithoutAlt = 0;
    images.forEach(img => {
      if (img.alt && img.alt.trim()) imagesWithAlt++;
      else imagesWithoutAlt++;
    });

    // Links
    const linkCount = document.querySelectorAll('a[href]').length;

    // JSON-LD
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    const jsonLdTypes: string[] = [];
    jsonLdScripts.forEach(script => {
      try {
        const parsed = JSON.parse(script.textContent || '');
        if (parsed['@type']) {
          jsonLdTypes.push(Array.isArray(parsed['@type']) ? parsed['@type'].join(', ') : parsed['@type']);
        }
        if (parsed['@graph']) {
          for (const item of parsed['@graph']) {
            if (item['@type']) {
              jsonLdTypes.push(Array.isArray(item['@type']) ? item['@type'].join(', ') : item['@type']);
            }
          }
        }
      } catch {
        // Invalid JSON-LD
      }
    });

    // Product info
    let productName: string | null = null;
    let productPrice: string | null = null;
    let productDescription: string | null = null;

    // Try from JSON-LD first
    jsonLdScripts.forEach(script => {
      try {
        const parsed = JSON.parse(script.textContent || '');
        const product = parsed['@type'] === 'Product' ? parsed :
                        parsed['@graph']?.find((i: any) => i['@type'] === 'Product');
        if (product) {
          productName = product.name || productName;
          productPrice = product.offers?.price?.toString() || productPrice;
          productDescription = product.description || productDescription;
        }
      } catch {
        // Invalid JSON-LD
      }
    });

    // Fallback to DOM
    if (!productName) {
      productName = document.querySelector('h1')?.textContent?.trim() || null;
    }
    if (!productPrice) {
      const priceEl = document.querySelector('[data-product-price], .product-price, [itemprop="price"]');
      productPrice = priceEl?.textContent?.trim()?.replace(/[^\d.,]/g, '') || null;
    }
    if (!productDescription) {
      const descEl = document.querySelector('[data-product-description], .product-description, [itemprop="description"]');
      productDescription = descEl?.textContent?.trim() || null;
    }

    return {
      title,
      description,
      h1,
      h2,
      textContent,
      wordCount,
      productName,
      productPrice,
      productDescription,
      jsonLdTypes,
      imagesWithAlt,
      imagesWithoutAlt,
      linkCount,
      metaRobots,
      canonical,
    };
  });
}

/**
 * Compare raw and rendered content
 */
function compareContent(raw: PageContent, rendered: PageContent): ContentComparison[] {
  const comparisons: ContentComparison[] = [];

  // Title
  comparisons.push({
    field: 'Title',
    rawValue: raw.title,
    renderedValue: rendered.title,
    match: raw.title === rendered.title,
    severity: raw.title ? 'ok' : 'critical',
    message: raw.title ? 'Title present in raw HTML' : 'Title missing in raw HTML',
  });

  // Meta description
  comparisons.push({
    field: 'Meta Description',
    rawValue: raw.description,
    renderedValue: rendered.description,
    match: raw.description === rendered.description,
    severity: raw.description ? 'ok' : 'warning',
    message: raw.description ? 'Description present in raw HTML' : 'Description missing or JS-rendered',
  });

  // H1
  comparisons.push({
    field: 'H1 Headings',
    rawValue: raw.h1.length,
    renderedValue: rendered.h1.length,
    match: raw.h1.length >= rendered.h1.length,
    severity: raw.h1.length > 0 ? 'ok' : (rendered.h1.length > 0 ? 'critical' : 'warning'),
    message: raw.h1.length > 0 ? `${raw.h1.length} H1(s) in raw HTML` :
             (rendered.h1.length > 0 ? 'H1 only visible after JavaScript' : 'No H1 found'),
  });

  // Word count comparison
  const wordRatio = raw.wordCount / Math.max(rendered.wordCount, 1);
  comparisons.push({
    field: 'Text Content',
    rawValue: raw.wordCount,
    renderedValue: rendered.wordCount,
    match: wordRatio >= 0.8,
    severity: wordRatio >= 0.8 ? 'ok' : (wordRatio >= 0.5 ? 'warning' : 'critical'),
    message: wordRatio >= 0.8 ? `${Math.round(wordRatio * 100)}% of content in raw HTML` :
             `Only ${Math.round(wordRatio * 100)}% of content visible without JavaScript`,
  });

  // JSON-LD
  comparisons.push({
    field: 'Structured Data',
    rawValue: raw.jsonLdTypes.length,
    renderedValue: rendered.jsonLdTypes.length,
    match: raw.jsonLdTypes.length >= rendered.jsonLdTypes.length,
    severity: raw.jsonLdTypes.length > 0 ? 'ok' : (rendered.jsonLdTypes.length > 0 ? 'warning' : 'ok'),
    message: raw.jsonLdTypes.length > 0 ? `${raw.jsonLdTypes.length} schema(s) in raw HTML` :
             (rendered.jsonLdTypes.length > 0 ? 'Structured data only available after JavaScript' : 'No structured data'),
  });

  // Product name (if applicable)
  if (rendered.productName) {
    comparisons.push({
      field: 'Product Name',
      rawValue: raw.productName,
      renderedValue: rendered.productName,
      match: raw.productName === rendered.productName,
      severity: raw.productName ? 'ok' : 'critical',
      message: raw.productName ? 'Product name in raw HTML' : 'Product name only visible after JavaScript',
    });
  }

  // Product price (if applicable)
  if (rendered.productPrice) {
    comparisons.push({
      field: 'Product Price',
      rawValue: raw.productPrice,
      renderedValue: rendered.productPrice,
      match: raw.productPrice === rendered.productPrice,
      severity: raw.productPrice ? 'ok' : 'warning',
      message: raw.productPrice ? 'Price in raw HTML' : 'Price only visible after JavaScript',
    });
  }

  // Meta robots
  if (raw.metaRobots || rendered.metaRobots) {
    const hasNoindex = (raw.metaRobots || '').toLowerCase().includes('noindex');
    comparisons.push({
      field: 'Meta Robots',
      rawValue: raw.metaRobots,
      renderedValue: rendered.metaRobots,
      match: !hasNoindex,
      severity: hasNoindex ? 'critical' : 'ok',
      message: hasNoindex ? 'Page has noindex directive - will not appear in AI training' : 'No blocking directives',
    });
  }

  return comparisons;
}

/**
 * Calculate reachability score
 */
function calculateReachabilityScore(comparisons: ContentComparison[], raw: PageContent, rendered: PageContent): number {
  let score = 100;

  for (const comp of comparisons) {
    if (comp.severity === 'critical') score -= 25;
    else if (comp.severity === 'warning') score -= 10;
  }

  // Bonus for having structured data in raw HTML
  if (raw.jsonLdTypes.length > 0) score += 5;

  // Penalty for large JS-dependent content
  const wordRatio = raw.wordCount / Math.max(rendered.wordCount, 1);
  if (wordRatio < 0.5) score -= 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Analyze reachability of a URL
 */
export async function analyzeReachability(url: string): Promise<ReachabilityResult> {
  const timestamp = new Date().toISOString();

  let browser: Browser | null = null;
  let shouldCloseBrowser = false;

  try {
    // Fetch raw HTML (no JavaScript)
    const rawResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)',
      },
    });

    if (!rawResponse.ok) {
      return {
        url,
        timestamp,
        success: false,
        error: `HTTP ${rawResponse.status}`,
        rawContent: {} as PageContent,
        renderedContent: {} as PageContent,
        comparisons: [],
        reachabilityScore: 0,
        isDarkToAI: true,
        issues: [`Page returned HTTP ${rawResponse.status}`],
        recommendations: ['Ensure page is accessible to crawlers'],
      };
    }

    const rawHtml = await rawResponse.text();
    const rawContent = extractFromRawHtml(rawHtml);

    // Now render with JavaScript using Playwright
    try {
      browser = await chromium.connectOverCDP('http://localhost:9222');
    } catch {
      browser = await chromium.launch({ headless: true });
      shouldCloseBrowser = true;
    }

    const context = browser.contexts()[0] || await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000); // Let JS settle

    const renderedContent = await extractFromRenderedPage(page);
    await page.close();

    // Compare
    const comparisons = compareContent(rawContent, renderedContent);
    const reachabilityScore = calculateReachabilityScore(comparisons, rawContent, renderedContent);

    // Determine if "dark" to AI
    const wordRatio = rawContent.wordCount / Math.max(renderedContent.wordCount, 1);
    const isDarkToAI = wordRatio < 0.3 || reachabilityScore < 40;

    // Generate issues and recommendations
    const issues: string[] = [];
    const recommendations: string[] = [];

    for (const comp of comparisons) {
      if (comp.severity === 'critical') {
        issues.push(comp.message);
      } else if (comp.severity === 'warning') {
        issues.push(comp.message);
      }
    }

    if (wordRatio < 0.5) {
      recommendations.push('Implement server-side rendering (SSR) for critical content');
    }
    if (!rawContent.jsonLdTypes.includes('Product') && renderedContent.productName) {
      recommendations.push('Add Product schema in initial HTML, not via JavaScript');
    }
    if (!rawContent.title) {
      recommendations.push('Ensure <title> tag is in initial HTML');
    }
    if (!rawContent.description) {
      recommendations.push('Ensure meta description is in initial HTML');
    }
    if (rawContent.metaRobots?.toLowerCase().includes('noindex')) {
      recommendations.push('Remove noindex directive if you want AI visibility');
    }

    return {
      url,
      timestamp,
      success: true,
      rawContent,
      renderedContent,
      comparisons,
      reachabilityScore,
      isDarkToAI,
      issues,
      recommendations,
    };

  } catch (error) {
    return {
      url,
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      rawContent: {} as PageContent,
      renderedContent: {} as PageContent,
      comparisons: [],
      reachabilityScore: 0,
      isDarkToAI: true,
      issues: [error instanceof Error ? error.message : 'Unknown error'],
      recommendations: [],
    };
  } finally {
    if (browser && shouldCloseBrowser) {
      await browser.close();
    }
  }
}

/**
 * Analyze multiple URLs
 */
export async function analyzeReachabilityBatch(
  urls: string[],
  onProgress?: (completed: number, total: number, result: ReachabilityResult) => void
): Promise<ReachabilityResult[]> {
  const results: ReachabilityResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    const result = await analyzeReachability(urls[i]);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, urls.length, result);
    }

    // Small delay between requests
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Generate summary report for multiple URLs
 */
export function summarizeReachability(results: ReachabilityResult[]): {
  totalPages: number;
  successfulAnalysis: number;
  darkToAI: number;
  averageScore: number;
  commonIssues: Array<{ issue: string; count: number }>;
} {
  const successful = results.filter(r => r.success);
  const dark = successful.filter(r => r.isDarkToAI);

  const issueCounts: Record<string, number> = {};
  for (const result of successful) {
    for (const issue of result.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  const commonIssues = Object.entries(issueCounts)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalPages: results.length,
    successfulAnalysis: successful.length,
    darkToAI: dark.length,
    averageScore: successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + r.reachabilityScore, 0) / successful.length)
      : 0,
    commonIssues,
  };
}
