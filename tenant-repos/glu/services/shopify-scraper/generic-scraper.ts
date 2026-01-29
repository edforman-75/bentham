/**
 * Generic E-Commerce Store Scraper
 *
 * Alternative to Shopify scraper for non-Shopify stores.
 * Uses sitemap + page crawling to discover and extract product data.
 *
 * Supports:
 * - BigCommerce
 * - WooCommerce
 * - Magento
 * - Custom platforms
 *
 * Usage:
 *   npx ts-node generic-scraper.ts --store example.com --output ./output
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export interface GenericProduct {
  url: string;
  handle: string; // URL path slug
  title: string;
  description: string;
  price: string | null;
  compareAtPrice: string | null;
  currency: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  images: string[];
  variants: Array<{
    title: string;
    price: string | null;
    sku: string | null;
    available: boolean;
  }>;

  // Meta
  pageTitle: string;
  metaDescription: string;
  jsonLd: any | null;
  ogTags: Record<string, string>;

  // Platform hints
  detectedPlatform: string | null;

  scrapedAt: string;
}

export interface GenericCollection {
  url: string;
  handle: string;
  title: string;
  description: string;
  productUrls: string[];
  pageTitle: string;
  metaDescription: string;
  scrapedAt: string;
}

export interface GenericScrapeResult {
  store: string;
  detectedPlatform: string | null;
  scrapedAt: string;
  products: GenericProduct[];
  collections: GenericCollection[];
  errors: Array<{ url: string; error: string }>;
  stats: {
    urlsDiscovered: number;
    productsScraped: number;
    collectionsScraped: number;
    errorCount: number;
    duration: number;
  };
}

export interface GenericScrapeOptions {
  maxProducts?: number;
  maxCollections?: number;
  productUrlPatterns?: RegExp[];
  collectionUrlPatterns?: RegExp[];
  excludePatterns?: RegExp[];
  delayBetweenRequests?: number;
  timeout?: number;
  onProgress?: (message: string, current: number, total: number) => void;
}

// ============================================================================
// Platform Detection
// ============================================================================

interface PlatformSignature {
  name: string;
  signatures: {
    html?: RegExp[];
    scripts?: RegExp[];
    headers?: Record<string, RegExp>;
    jsonLd?: (jsonLd: any) => boolean;
  };
  productPatterns: RegExp[];
  collectionPatterns: RegExp[];
}

const PLATFORM_SIGNATURES: PlatformSignature[] = [
  {
    name: 'shopify',
    signatures: {
      html: [/Shopify\.theme/i, /cdn\.shopify\.com/i],
      scripts: [/shopify/i],
    },
    productPatterns: [/\/products\/[^\/\?]+$/i],
    collectionPatterns: [/\/collections\/[^\/\?]+$/i],
  },
  {
    name: 'bigcommerce',
    signatures: {
      html: [/BigCommerce/i, /cdn\d+\.bigcommerce\.com/i],
      scripts: [/bigcommerce/i],
    },
    productPatterns: [/\/[^\/]+\/$/i, /\/products\/[^\/]+$/i],
    collectionPatterns: [/\/categories\/[^\/]+$/i],
  },
  {
    name: 'woocommerce',
    signatures: {
      html: [/woocommerce/i, /wc-/i],
      scripts: [/woocommerce/i, /wc_/i],
    },
    productPatterns: [/\/product\/[^\/]+$/i, /\?product=[^&]+$/i],
    collectionPatterns: [/\/product-category\/[^\/]+$/i, /\/shop\/?$/i],
  },
  {
    name: 'magento',
    signatures: {
      html: [/Magento/i, /mage\//i],
      scripts: [/mage\/cookies/i, /Magento_/i],
    },
    productPatterns: [/\.html$/i],
    collectionPatterns: [/\/category\/[^\/]+$/i],
  },
  {
    name: 'squarespace',
    signatures: {
      html: [/squarespace/i, /static\.squarespace/i],
    },
    productPatterns: [/\/store\/p\/[^\/]+$/i, /\/product-page\/[^\/]+$/i],
    collectionPatterns: [/\/store$/i, /\/shop$/i],
  },
];

// ============================================================================
// Generic Scraper
// ============================================================================

export class GenericScraper {
  private baseUrl: string;
  private browser: Browser | null = null;
  private detectedPlatform: string | null = null;

  constructor(private storeUrl: string) {
    this.baseUrl = storeUrl.startsWith('http')
      ? storeUrl.replace(/\/$/, '')
      : `https://${storeUrl.replace(/\/$/, '')}`;
  }

  /**
   * Detect e-commerce platform from homepage
   */
  async detectPlatform(page: Page): Promise<string | null> {
    try {
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const html = await page.content();
      const scripts = await page.$$eval('script[src]', (els) =>
        els.map(el => el.getAttribute('src') || '')
      );

      for (const platform of PLATFORM_SIGNATURES) {
        // Check HTML patterns
        if (platform.signatures.html) {
          for (const pattern of platform.signatures.html) {
            if (pattern.test(html)) {
              this.detectedPlatform = platform.name;
              return platform.name;
            }
          }
        }

        // Check script sources
        if (platform.signatures.scripts) {
          for (const src of scripts) {
            for (const pattern of platform.signatures.scripts) {
              if (pattern.test(src)) {
                this.detectedPlatform = platform.name;
                return platform.name;
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Platform detection failed:', error);
      return null;
    }
  }

  /**
   * Discover product and collection URLs from sitemap
   */
  async discoverUrlsFromSitemap(): Promise<{ products: string[]; collections: string[] }> {
    const products: Set<string> = new Set();
    const collections: Set<string> = new Set();

    const sitemapUrls = [
      `${this.baseUrl}/sitemap.xml`,
      `${this.baseUrl}/sitemap_index.xml`,
      `${this.baseUrl}/sitemap_products_1.xml`,
    ];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await fetch(sitemapUrl);
        if (!response.ok) continue;

        const xml = await response.text();

        // Extract URLs from sitemap
        const urlMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
        for (const match of urlMatches) {
          const url = match[1];

          // Classify URL
          const platform = PLATFORM_SIGNATURES.find(p => p.name === this.detectedPlatform);
          const productPatterns = platform?.productPatterns || [
            /\/products?\//i,
            /\/item\//i,
            /\/p\//i,
          ];
          const collectionPatterns = platform?.collectionPatterns || [
            /\/collections?\//i,
            /\/categor(y|ies)\//i,
            /\/shop\//i,
          ];

          if (productPatterns.some(p => p.test(url))) {
            products.add(url);
          } else if (collectionPatterns.some(p => p.test(url))) {
            collections.add(url);
          }
        }
      } catch (error) {
        // Sitemap might not exist
      }
    }

    return {
      products: Array.from(products),
      collections: Array.from(collections),
    };
  }

  /**
   * Extract product data from a product page
   */
  async scrapeProductPage(page: Page, url: string): Promise<GenericProduct | null> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(500);

      // Extract JSON-LD
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

      // Find Product schema
      let jsonLd: any = null;
      for (const script of jsonLdScripts) {
        if (script['@graph']) {
          const product = script['@graph'].find((item: any) => item['@type'] === 'Product');
          if (product) {
            jsonLd = product;
            break;
          }
        } else if (script['@type'] === 'Product') {
          jsonLd = script;
          break;
        }
      }

      // Extract basic page data
      const pageTitle = await page.title();
      const metaDescription = await page.$eval(
        'meta[name="description"]',
        (el) => el.getAttribute('content') || ''
      ).catch(() => '');

      // Extract OG tags
      const ogTags: Record<string, string> = {};
      const ogElements = await page.$$eval('meta[property^="og:"]', (metas) =>
        metas.map(m => ({
          property: m.getAttribute('property') || '',
          content: m.getAttribute('content') || '',
        }))
      );
      for (const og of ogElements) {
        ogTags[og.property] = og.content;
      }

      // Try to extract product data from page structure
      let title = '';
      let description = '';
      let price: string | null = null;
      let images: string[] = [];

      // From JSON-LD (preferred)
      if (jsonLd) {
        title = jsonLd.name || '';
        description = jsonLd.description || '';
        price = jsonLd.offers?.price || jsonLd.offers?.[0]?.price || null;

        if (jsonLd.image) {
          if (Array.isArray(jsonLd.image)) {
            images = jsonLd.image.map((img: any) =>
              typeof img === 'string' ? img : img.url
            );
          } else if (typeof jsonLd.image === 'string') {
            images = [jsonLd.image];
          } else if (jsonLd.image.url) {
            images = [jsonLd.image.url];
          }
        }
      }

      // Fallback to page scraping
      if (!title) {
        title = await page.$eval('h1', el => el.textContent?.trim() || '').catch(() => '');
      }
      if (!title) {
        title = ogTags['og:title'] || pageTitle.split('|')[0].trim();
      }

      if (!description) {
        description = await page.$eval(
          '[data-product-description], .product-description, .description',
          el => el.textContent?.trim() || ''
        ).catch(() => metaDescription);
      }

      if (!price) {
        price = await page.$eval(
          '[data-price], .price, .product-price',
          el => el.textContent?.trim() || null
        ).catch(() => null);
      }

      if (images.length === 0) {
        images = await page.$$eval(
          '.product-image img, .product-gallery img, [data-product-image]',
          els => els.map(el => el.getAttribute('src') || '').filter(Boolean)
        ).catch(() => []);
      }

      if (images.length === 0 && ogTags['og:image']) {
        images = [ogTags['og:image']];
      }

      // Extract URL handle
      const urlObj = new URL(url);
      const handle = urlObj.pathname.split('/').filter(Boolean).pop() || '';

      return {
        url,
        handle,
        title,
        description,
        price,
        compareAtPrice: jsonLd?.offers?.priceSpecification?.referencePrice || null,
        currency: jsonLd?.offers?.priceCurrency || null,
        sku: jsonLd?.sku || null,
        brand: jsonLd?.brand?.name || jsonLd?.brand || null,
        category: jsonLd?.category || null,
        images,
        variants: [],
        pageTitle,
        metaDescription,
        jsonLd,
        ogTags,
        detectedPlatform: this.detectedPlatform,
        scrapedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract collection data from a collection page
   */
  async scrapeCollectionPage(page: Page, url: string): Promise<GenericCollection | null> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(500);

      const pageTitle = await page.title();
      const metaDescription = await page.$eval(
        'meta[name="description"]',
        (el) => el.getAttribute('content') || ''
      ).catch(() => '');

      const title = await page.$eval('h1', el => el.textContent?.trim() || '').catch(() =>
        pageTitle.split('|')[0].trim()
      );

      const description = await page.$eval(
        '.collection-description, .category-description',
        el => el.textContent?.trim() || ''
      ).catch(() => metaDescription);

      // Find product links
      const productUrls = await page.$$eval(
        'a[href*="/product"], a[href*="/products/"], .product-card a, .product-item a',
        els => els.map(el => el.getAttribute('href') || '').filter(Boolean)
      );

      // Normalize URLs
      const baseHost = new URL(url).origin;
      const normalizedUrls = productUrls
        .map(href => href.startsWith('/') ? `${baseHost}${href}` : href)
        .filter(href => href.startsWith(baseHost));

      const urlObj = new URL(url);
      const handle = urlObj.pathname.split('/').filter(Boolean).pop() || '';

      return {
        url,
        handle,
        title,
        description,
        productUrls: [...new Set(normalizedUrls)],
        pageTitle,
        metaDescription,
        scrapedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error scraping collection ${url}:`, error);
      return null;
    }
  }

  /**
   * Full store scrape
   */
  async scrapeStore(options: GenericScrapeOptions = {}): Promise<GenericScrapeResult> {
    const {
      maxProducts = 500,
      maxCollections = 50,
      delayBetweenRequests = 1500,
      onProgress,
    } = options;

    const startTime = Date.now();
    const errors: Array<{ url: string; error: string }> = [];

    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Detect platform
    console.log('Detecting platform...');
    await this.detectPlatform(page);
    console.log(`Detected platform: ${this.detectedPlatform || 'unknown'}`);

    // Discover URLs
    console.log('Discovering URLs from sitemap...');
    const discovered = await this.discoverUrlsFromSitemap();
    console.log(`Found ${discovered.products.length} product URLs, ${discovered.collections.length} collection URLs`);

    const products: GenericProduct[] = [];
    const collections: GenericCollection[] = [];

    // Scrape products
    const productUrls = discovered.products.slice(0, maxProducts);
    for (let i = 0; i < productUrls.length; i++) {
      const url = productUrls[i];
      onProgress?.(`Scraping product: ${url.split('/').pop()}`, i + 1, productUrls.length);

      const product = await this.scrapeProductPage(page, url);
      if (product) {
        products.push(product);
      } else {
        errors.push({ url, error: 'Failed to extract product data' });
      }

      await this.delay(delayBetweenRequests);
    }

    // Scrape collections
    const collectionUrls = discovered.collections.slice(0, maxCollections);
    for (let i = 0; i < collectionUrls.length; i++) {
      const url = collectionUrls[i];
      onProgress?.(`Scraping collection: ${url.split('/').pop()}`, i + 1, collectionUrls.length);

      const collection = await this.scrapeCollectionPage(page, url);
      if (collection) {
        collections.push(collection);
      } else {
        errors.push({ url, error: 'Failed to extract collection data' });
      }

      await this.delay(delayBetweenRequests);
    }

    await this.browser.close();
    this.browser = null;

    const duration = Date.now() - startTime;

    return {
      store: this.storeUrl,
      detectedPlatform: this.detectedPlatform,
      scrapedAt: new Date().toISOString(),
      products,
      collections,
      errors,
      stats: {
        urlsDiscovered: discovered.products.length + discovered.collections.length,
        productsScraped: products.length,
        collectionsScraped: collections.length,
        errorCount: errors.length,
        duration,
      },
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// CSV Export (Generic Format)
// ============================================================================

/**
 * Generate a generic CSV for any platform
 * Users can use this as a template for manual updates or feed import
 */
export function generateGenericCsv(products: GenericProduct[]): string {
  const headers = [
    'URL',
    'Handle',
    'Title',
    'Description',
    'Price',
    'Compare At Price',
    'Currency',
    'SKU',
    'Brand',
    'Category',
    'Image URLs',
    'Page Title',
    'Meta Description',
    'Has JSON-LD',
    'JSON-LD Brand',
    'JSON-LD Reviews',
    'Detected Platform',
    'Scraped At',
  ];

  const rows: string[][] = [headers];

  for (const product of products) {
    const jsonLd = product.jsonLd || {};

    const row = [
      product.url,
      product.handle,
      product.title,
      product.description.substring(0, 500),
      product.price || '',
      product.compareAtPrice || '',
      product.currency || '',
      product.sku || '',
      product.brand || '',
      product.category || '',
      product.images.join(' | '),
      product.pageTitle,
      product.metaDescription,
      product.jsonLd ? 'Yes' : 'No',
      jsonLd.brand?.name || jsonLd.brand || '',
      jsonLd.aggregateRating ? 'Yes' : 'No',
      product.detectedPlatform || 'unknown',
      product.scrapedAt,
    ];

    rows.push(row);
  }

  return rows.map(row => row.map(cell =>
    `"${String(cell).replace(/"/g, '""').replace(/\n/g, ' ')}"`
  ).join(',')).join('\n');
}

/**
 * Generate optimization recommendations CSV
 */
export function generateGenericOptimizationCsv(products: GenericProduct[]): string {
  const headers = [
    'URL',
    'Handle',
    'Current Title',
    'Current Meta Description',
    'Has JSON-LD',
    'Has Brand',
    'Has Reviews',
    'Has Price',
    'Image Count',
    'Issues Found',
    'Recommended Actions',
  ];

  const rows: string[][] = [headers];

  for (const product of products) {
    const jsonLd = product.jsonLd || {};
    const issues: string[] = [];
    const actions: string[] = [];

    // Check for issues
    if (!product.jsonLd) {
      issues.push('No JSON-LD schema');
      actions.push('Add Product JSON-LD schema');
    } else {
      if (!jsonLd.brand) {
        issues.push('Missing brand in schema');
        actions.push('Add brand property to JSON-LD');
      }
      if (!jsonLd.aggregateRating && !jsonLd.review) {
        issues.push('No reviews in schema');
        actions.push('Add aggregateRating or review to JSON-LD');
      }
      if (!jsonLd.offers) {
        issues.push('No pricing in schema');
        actions.push('Add offers property with price to JSON-LD');
      }
    }

    if (!product.metaDescription) {
      issues.push('Missing meta description');
      actions.push('Add unique meta description');
    } else if (product.metaDescription.length < 100) {
      issues.push('Meta description too short');
      actions.push('Expand meta description to 150-160 characters');
    }

    if (product.images.length === 0) {
      issues.push('No images found');
      actions.push('Add product images with alt text');
    }

    if (!product.brand) {
      issues.push('Brand not visible');
      actions.push('Ensure brand is prominently displayed');
    }

    const row = [
      product.url,
      product.handle,
      product.title,
      product.metaDescription,
      product.jsonLd ? 'Yes' : 'No',
      product.brand ? 'Yes' : 'No',
      jsonLd.aggregateRating ? 'Yes' : 'No',
      product.price ? 'Yes' : 'No',
      String(product.images.length),
      issues.join('; ') || 'None',
      actions.join('; ') || 'None',
    ];

    rows.push(row);
  }

  return rows.map(row => row.map(cell =>
    `"${String(cell).replace(/"/g, '""').replace(/\n/g, ' ')}"`
  ).join(',')).join('\n');
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Generic E-Commerce Store Scraper

Usage:
  npx ts-node generic-scraper.ts --store <domain> [options]

Options:
  --store <domain>     Store domain (e.g., example.com)
  --output <dir>       Output directory (default: ./output)
  --max-products <n>   Maximum products to scrape (default: 500)
  --format <type>      Output format: json, csv, both (default: both)

Supported Platforms:
  - Shopify (use shopify-scraper.ts for better results)
  - BigCommerce
  - WooCommerce
  - Magento
  - Squarespace Commerce
  - Any platform with sitemap.xml and standard product URLs

Examples:
  npx ts-node generic-scraper.ts --store example.com
  npx ts-node generic-scraper.ts --store mybigcommercestore.com --max-products 100
`);
    process.exit(0);
  }

  const storeIndex = args.indexOf('--store');
  const outputIndex = args.indexOf('--output');
  const maxProductsIndex = args.indexOf('--max-products');
  const formatIndex = args.indexOf('--format');

  const store = storeIndex !== -1 ? args[storeIndex + 1] : null;
  const outputDir = outputIndex !== -1 ? args[outputIndex + 1] : './output';
  const maxProducts = maxProductsIndex !== -1 ? parseInt(args[maxProductsIndex + 1], 10) : 500;
  const format = formatIndex !== -1 ? args[formatIndex + 1] : 'both';

  if (!store) {
    console.error('Error: --store is required');
    process.exit(1);
  }

  console.log(`\n🌐 GENERIC E-COMMERCE SCRAPER\n`);
  console.log(`Store: ${store}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Max Products: ${maxProducts}`);
  console.log(`Format: ${format}`);
  console.log('');

  await fs.promises.mkdir(outputDir, { recursive: true });

  const scraper = new GenericScraper(store);

  const result = await scraper.scrapeStore({
    maxProducts,
    onProgress: (msg, current, total) => {
      process.stdout.write(`\r[${current}/${total}] ${msg}`.padEnd(80));
    },
  });

  console.log('\n\n📊 SCRAPE RESULTS\n');
  console.log(`Platform detected: ${result.detectedPlatform || 'unknown'}`);
  console.log(`URLs discovered: ${result.stats.urlsDiscovered}`);
  console.log(`Products scraped: ${result.stats.productsScraped}`);
  console.log(`Collections scraped: ${result.stats.collectionsScraped}`);
  console.log(`Errors: ${result.stats.errorCount}`);
  console.log(`Duration: ${(result.stats.duration / 1000).toFixed(1)}s`);

  const timestamp = new Date().toISOString().split('T')[0];
  const storeSlug = store.replace(/\./g, '-');

  if (format === 'json' || format === 'both') {
    const jsonPath = path.join(outputDir, `${storeSlug}-generic-${timestamp}.json`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(`\n✅ JSON saved: ${jsonPath}`);
  }

  if (format === 'csv' || format === 'both') {
    const csvPath = path.join(outputDir, `${storeSlug}-products-${timestamp}.csv`);
    const csv = generateGenericCsv(result.products);
    await fs.promises.writeFile(csvPath, csv);
    console.log(`✅ Products CSV saved: ${csvPath}`);

    const optCsvPath = path.join(outputDir, `${storeSlug}-optimization-${timestamp}.csv`);
    const optCsv = generateGenericOptimizationCsv(result.products);
    await fs.promises.writeFile(optCsvPath, optCsv);
    console.log(`✅ Optimization CSV saved: ${optCsvPath}`);
  }

  console.log('\nDone!\n');
}

// Only run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generic-scraper.ts')) {
  main().catch(console.error);
}
