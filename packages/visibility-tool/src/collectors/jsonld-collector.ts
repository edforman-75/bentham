/**
 * JSON-LD Collector
 * Extracts and evaluates Product schema from web pages
 */

import { chromium, Browser, Page } from 'playwright';
import { scoreJsonLd, ScoringResult } from '../scoring/jsonld-scorer.js';

export interface CollectionResult {
  url: string;
  brand: string;
  productName: string;
  timestamp: string;
  success: boolean;
  error?: string;
  scoring: ScoringResult;
  rawJsonLd: any[];
  productSchema: any | null;
  pageTitle: string;
}

export interface CollectorOptions {
  stealthMode: boolean;
  timeout: number;
  retryAttempts: number;
  delayBetweenRequests: number;
  screenshotDir?: string;
}

const DEFAULT_OPTIONS: CollectorOptions = {
  stealthMode: true,
  timeout: 60000,
  retryAttempts: 2,
  delayBetweenRequests: 2000,
};

function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function humanBehavior(page: Page): Promise<void> {
  const viewport = page.viewportSize() || { width: 1280, height: 800 };

  // Random mouse movement
  const x = Math.floor(Math.random() * viewport.width * 0.6) + viewport.width * 0.2;
  const y = Math.floor(Math.random() * viewport.height * 0.6) + viewport.height * 0.2;
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 5) + 3 });

  // Random scroll
  await page.evaluate(() => {
    window.scrollBy({ top: Math.random() * 300 + 100, behavior: 'smooth' });
  });

  await randomDelay(500, 1500);
}

export async function extractJsonLd(page: Page): Promise<any[]> {
  const jsonLdScripts = await page.$$eval(
    'script[type="application/ld+json"]',
    (scripts) => scripts.map(s => {
      try {
        return JSON.parse(s.textContent || '');
      } catch {
        return null;
      }
    }).filter(Boolean)
  );

  // Flatten @graph structures
  const flattened: any[] = [];
  for (const item of jsonLdScripts) {
    if (item['@graph']) {
      flattened.push(...item['@graph']);
    } else {
      flattened.push(item);
    }
  }

  return flattened;
}

export async function collectFromUrl(
  page: Page,
  url: string,
  brand: string,
  options: Partial<CollectorOptions> = {}
): Promise<CollectionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const timestamp = new Date().toISOString();

  try {
    // Pre-navigation delay for stealth
    if (opts.stealthMode) {
      await randomDelay(1000, 2000);
    }

    // Navigate
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: opts.timeout,
    });

    // Wait for page to stabilize
    await randomDelay(1500, 3000);

    // Human-like behavior
    if (opts.stealthMode) {
      await humanBehavior(page);
    }

    // Check for bot detection
    const pageTitle = await page.title();
    const isBlocked =
      pageTitle.toLowerCase().includes('verify') ||
      pageTitle.toLowerCase().includes('denied') ||
      pageTitle.toLowerCase().includes('blocked');

    if (isBlocked) {
      return {
        url,
        brand,
        productName: '',
        timestamp,
        success: false,
        error: `Bot detection: "${pageTitle}"`,
        scoring: scoreJsonLd([]),
        rawJsonLd: [],
        productSchema: null,
        pageTitle,
      };
    }

    // Extract JSON-LD
    const jsonLd = await extractJsonLd(page);
    const productSchema = jsonLd.find(item =>
      item['@type'] === 'Product' ||
      (Array.isArray(item['@type']) && item['@type'].includes('Product'))
    );

    // Get product name from page if not in schema
    const h1Name = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1?.textContent?.trim() || '';
    });

    const productName = productSchema?.name || h1Name || pageTitle;

    // Score the JSON-LD
    const scoring = scoreJsonLd(jsonLd);

    // Screenshot if enabled
    if (opts.screenshotDir) {
      const filename = url.split('/').pop()?.replace(/[^a-z0-9]/gi, '_') || 'page';
      await page.screenshot({
        path: `${opts.screenshotDir}/${brand}-${filename}.png`,
        fullPage: false,
      });
    }

    return {
      url,
      brand,
      productName,
      timestamp,
      success: true,
      scoring,
      rawJsonLd: jsonLd,
      productSchema,
      pageTitle,
    };

  } catch (error) {
    return {
      url,
      brand,
      productName: '',
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      scoring: scoreJsonLd([]),
      rawJsonLd: [],
      productSchema: null,
      pageTitle: '',
    };
  }
}

export async function collectFromUrls(
  urls: Array<{ url: string; brand: string }>,
  options: Partial<CollectorOptions> = {},
  onProgress?: (completed: number, total: number, result: CollectionResult) => void
): Promise<CollectionResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: CollectionResult[] = [];

  let browser: Browser;

  try {
    // Try to connect to existing Chrome first
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('Connected to existing Chrome instance');
  } catch {
    // Launch new browser
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });
    console.log('Launched new browser');
  }

  const context = browser.contexts()[0] || await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  for (let i = 0; i < urls.length; i++) {
    const { url, brand } = urls[i];

    let result: CollectionResult | null = null;
    let attempts = 0;

    while (attempts < opts.retryAttempts && (!result || !result.success)) {
      attempts++;
      result = await collectFromUrl(page, url, brand, opts);

      if (!result.success && attempts < opts.retryAttempts) {
        await randomDelay(3000, 5000);
      }
    }

    results.push(result!);

    if (onProgress) {
      onProgress(i + 1, urls.length, result!);
    }

    // Delay between requests
    if (i < urls.length - 1) {
      await randomDelay(opts.delayBetweenRequests, opts.delayBetweenRequests + 1000);
    }
  }

  await page.close();

  return results;
}

export function summarizeResults(results: CollectionResult[]): {
  total: number;
  successful: number;
  failed: number;
  averageScore: number;
  byBrand: Record<string, {
    count: number;
    avgScore: number;
    grade: string;
    withRating: number;
    withPrice: number;
  }>;
} {
  const successful = results.filter(r => r.success);
  const byBrand: Record<string, CollectionResult[]> = {};

  for (const r of results) {
    if (!byBrand[r.brand]) byBrand[r.brand] = [];
    byBrand[r.brand].push(r);
  }

  const brandSummaries: Record<string, any> = {};

  for (const [brand, brandResults] of Object.entries(byBrand)) {
    const successfulBrand = brandResults.filter(r => r.success);
    const avgScore = successfulBrand.length > 0
      ? Math.round(successfulBrand.reduce((s, r) => s + r.scoring.score, 0) / successfulBrand.length)
      : 0;

    let grade: string;
    if (avgScore >= 90) grade = 'A+';
    else if (avgScore >= 80) grade = 'A';
    else if (avgScore >= 70) grade = 'B+';
    else if (avgScore >= 60) grade = 'B';
    else if (avgScore >= 50) grade = 'C';
    else if (avgScore >= 40) grade = 'D';
    else grade = 'F';

    brandSummaries[brand] = {
      count: brandResults.length,
      avgScore,
      grade,
      withRating: successfulBrand.filter(r => r.scoring.breakdown.social >= 15).length,
      withPrice: successfulBrand.filter(r => r.scoring.breakdown.commerce >= 15).length,
    };
  }

  return {
    total: results.length,
    successful: successful.length,
    failed: results.length - successful.length,
    averageScore: successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + r.scoring.score, 0) / successful.length)
      : 0,
    byBrand: brandSummaries,
  };
}
