/**
 * Shopify Store Scraper
 *
 * Scrapes Shopify stores to extract product data and generate
 * CSV files for bulk write-back.
 *
 * Shopify stores expose /products.json publicly, which we use for
 * basic product data, then scrape individual pages for JSON-LD and
 * rendered content.
 *
 * Usage:
 *   npx ts-node index.ts --store tascperformance.com --output ./output
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';

// Image optimization imports
import {
  optimizeAllProductImages,
  generateOptimizationCsvWithImages,
  getImageOptimizationStats,
  validateCloudinaryConfig,
  type ScrapedProductWithOptimizedImages,
} from './image-integration';

// ============================================================================
// Types
// ============================================================================

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  published_at: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options: ShopifyOption[];
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  position: number;
  inventory_policy: string;
  compare_at_price: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  taxable: boolean;
  barcode: string | null;
  grams: number;
  weight: number;
  weight_unit: string;
  requires_shipping: boolean;
}

export interface ShopifyImage {
  id: number;
  product_id: number;
  position: number;
  src: string;
  alt: string | null;
  width: number;
  height: number;
}

export interface ShopifyOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyCollection {
  id: number;
  handle: string;
  title: string;
  description: string;
  published_at: string;
  updated_at: string;
  image?: {
    src: string;
    alt: string | null;
  };
  products_count?: number;
}

export interface ScrapedProduct {
  // From Shopify API
  shopifyId: number;
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];

  // From page scrape
  url: string;
  pageTitle: string;
  metaDescription: string;
  jsonLd: any | null;
  ogTags: Record<string, string>;

  // Computed
  scrapedAt: string;
  collections: string[];
}

export interface ScrapedCollection {
  shopifyId: number;
  handle: string;
  title: string;
  description: string;
  url: string;
  productCount: number;
  pageTitle: string;
  metaDescription: string;
  jsonLd: any | null;
  scrapedAt: string;
}

export interface ScrapeResult {
  store: string;
  scrapedAt: string;
  products: ScrapedProduct[];
  collections: ScrapedCollection[];
  errors: Array<{ url: string; error: string }>;
  stats: {
    totalProducts: number;
    totalCollections: number;
    productsScraped: number;
    collectionsScraped: number;
    errorCount: number;
    duration: number;
  };
}

export interface ScrapeOptions {
  maxProducts?: number;
  maxCollections?: number;
  includePageScrape?: boolean;
  delayBetweenRequests?: number;
  timeout?: number;
  onProgress?: (message: string, current: number, total: number) => void;
}

// ============================================================================
// Shopify API Scraper
// ============================================================================

export class ShopifyScraper {
  private baseUrl: string;
  private browser: Browser | null = null;

  constructor(private storeUrl: string) {
    // Normalize URL
    this.baseUrl = storeUrl.startsWith('http')
      ? storeUrl.replace(/\/$/, '')
      : `https://${storeUrl.replace(/\/$/, '')}`;
  }

  /**
   * Fetch all products from Shopify's public API
   */
  async fetchProducts(limit: number = 250): Promise<ShopifyProduct[]> {
    const products: ShopifyProduct[] = [];
    let page = 1;

    while (true) {
      const url = `${this.baseUrl}/products.json?limit=${Math.min(limit, 250)}&page=${page}`;
      console.log(`Fetching products page ${page}...`);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.products || data.products.length === 0) {
          break;
        }

        products.push(...data.products);

        if (products.length >= limit || data.products.length < 250) {
          break;
        }

        page++;
        // Respect rate limits
        await this.delay(500);
      } catch (error) {
        console.error(`Error fetching products page ${page}:`, error);
        break;
      }
    }

    return products.slice(0, limit);
  }

  /**
   * Fetch all collections from Shopify's public API
   */
  async fetchCollections(limit: number = 100): Promise<ShopifyCollection[]> {
    const collections: ShopifyCollection[] = [];
    let page = 1;

    while (true) {
      const url = `${this.baseUrl}/collections.json?limit=${Math.min(limit, 250)}&page=${page}`;
      console.log(`Fetching collections page ${page}...`);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          // Collections endpoint might not be enabled
          if (response.status === 404) {
            console.log('Collections API not available, will discover via crawl');
            break;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.collections || data.collections.length === 0) {
          break;
        }

        collections.push(...data.collections);

        if (collections.length >= limit || data.collections.length < 250) {
          break;
        }

        page++;
        await this.delay(500);
      } catch (error) {
        console.error(`Error fetching collections:`, error);
        break;
      }
    }

    return collections.slice(0, limit);
  }

  /**
   * Scrape individual product page for meta data and JSON-LD
   */
  async scrapeProductPage(
    page: Page,
    handle: string
  ): Promise<{
    pageTitle: string;
    metaDescription: string;
    jsonLd: any | null;
    ogTags: Record<string, string>;
  }> {
    const url = `${this.baseUrl}/products/${handle}`;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(500);

      // Extract page title
      const pageTitle = await page.title();

      // Extract meta description
      const metaDescription = await page.$eval(
        'meta[name="description"]',
        (el) => el.getAttribute('content') || ''
      ).catch(() => '');

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

      return { pageTitle, metaDescription, jsonLd, ogTags };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return { pageTitle: '', metaDescription: '', jsonLd: null, ogTags: {} };
    }
  }

  /**
   * Full store scrape: API + page scraping
   */
  async scrapeStore(options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const {
      maxProducts = 500,
      maxCollections = 50,
      includePageScrape = true,
      delayBetweenRequests = 1000,
      onProgress,
    } = options;

    const startTime = Date.now();
    const errors: Array<{ url: string; error: string }> = [];

    // Fetch from API
    const apiProducts = await this.fetchProducts(maxProducts);
    const apiCollections = await this.fetchCollections(maxCollections);

    const products: ScrapedProduct[] = [];
    const collections: ScrapedCollection[] = [];

    // Page scraping with Playwright
    if (includePageScrape) {
      this.browser = await chromium.launch({ headless: true });
      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      // Scrape product pages
      for (let i = 0; i < apiProducts.length; i++) {
        const product = apiProducts[i];
        onProgress?.(`Scraping product: ${product.handle}`, i + 1, apiProducts.length);

        try {
          const pageData = await this.scrapeProductPage(page, product.handle);

          products.push({
            shopifyId: product.id,
            handle: product.handle,
            title: product.title,
            bodyHtml: product.body_html,
            vendor: product.vendor,
            productType: product.product_type,
            tags: product.tags,
            variants: product.variants,
            images: product.images,
            url: `${this.baseUrl}/products/${product.handle}`,
            pageTitle: pageData.pageTitle,
            metaDescription: pageData.metaDescription,
            jsonLd: pageData.jsonLd,
            ogTags: pageData.ogTags,
            scrapedAt: new Date().toISOString(),
            collections: [], // Populated later if needed
          });

          await this.delay(delayBetweenRequests);
        } catch (error: any) {
          errors.push({
            url: `${this.baseUrl}/products/${product.handle}`,
            error: error.message,
          });
        }
      }

      // Scrape collection pages
      for (let i = 0; i < apiCollections.length; i++) {
        const collection = apiCollections[i];
        onProgress?.(`Scraping collection: ${collection.handle}`, i + 1, apiCollections.length);

        try {
          const url = `${this.baseUrl}/collections/${collection.handle}`;
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await this.delay(500);

          const pageTitle = await page.title();
          const metaDescription = await page.$eval(
            'meta[name="description"]',
            (el) => el.getAttribute('content') || ''
          ).catch(() => '');

          // Get product count from page if possible
          const productCount = await page.$$eval(
            '[data-product-id], .product-card, .product-item',
            (els) => els.length
          ).catch(() => 0);

          collections.push({
            shopifyId: collection.id,
            handle: collection.handle,
            title: collection.title,
            description: collection.description || '',
            url,
            productCount: collection.products_count || productCount,
            pageTitle,
            metaDescription,
            jsonLd: null, // Collections usually don't have Product JSON-LD
            scrapedAt: new Date().toISOString(),
          });

          await this.delay(delayBetweenRequests);
        } catch (error: any) {
          errors.push({
            url: `${this.baseUrl}/collections/${collection.handle}`,
            error: error.message,
          });
        }
      }

      await this.browser.close();
      this.browser = null;
    } else {
      // Just use API data without page scraping
      for (const product of apiProducts) {
        products.push({
          shopifyId: product.id,
          handle: product.handle,
          title: product.title,
          bodyHtml: product.body_html,
          vendor: product.vendor,
          productType: product.product_type,
          tags: product.tags,
          variants: product.variants,
          images: product.images,
          url: `${this.baseUrl}/products/${product.handle}`,
          pageTitle: '',
          metaDescription: '',
          jsonLd: null,
          ogTags: {},
          scrapedAt: new Date().toISOString(),
          collections: [],
        });
      }
    }

    const duration = Date.now() - startTime;

    return {
      store: this.storeUrl,
      scrapedAt: new Date().toISOString(),
      products,
      collections,
      errors,
      stats: {
        totalProducts: apiProducts.length,
        totalCollections: apiCollections.length,
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

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// ============================================================================
// CSV Export for Shopify Bulk Import
// ============================================================================

export interface CsvExportOptions {
  includeVariants?: boolean;
  includeImages?: boolean;
  customFields?: string[];
}

/**
 * Generate Shopify-compatible CSV for bulk product import/update
 * See: https://help.shopify.com/en/manual/products/import-export/using-csv
 */
export function generateShopifyCsv(
  products: ScrapedProduct[],
  options: CsvExportOptions = {}
): string {
  const { includeVariants = true, includeImages = true } = options;

  // Shopify CSV headers
  const headers = [
    'Handle',
    'Title',
    'Body (HTML)',
    'Vendor',
    'Product Category',
    'Type',
    'Tags',
    'Published',
    'Option1 Name',
    'Option1 Value',
    'Option2 Name',
    'Option2 Value',
    'Option3 Name',
    'Option3 Value',
    'Variant SKU',
    'Variant Grams',
    'Variant Inventory Tracker',
    'Variant Inventory Qty',
    'Variant Inventory Policy',
    'Variant Fulfillment Service',
    'Variant Price',
    'Variant Compare At Price',
    'Variant Requires Shipping',
    'Variant Taxable',
    'Variant Barcode',
    'Image Src',
    'Image Position',
    'Image Alt Text',
    'Gift Card',
    'SEO Title',
    'SEO Description',
    'Google Shopping / Google Product Category',
    'Google Shopping / Gender',
    'Google Shopping / Age Group',
    'Google Shopping / MPN',
    'Google Shopping / Condition',
    'Google Shopping / Custom Product',
    'Google Shopping / Custom Label 0',
    'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2',
    'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4',
    'Variant Image',
    'Variant Weight Unit',
    'Variant Tax Code',
    'Cost per item',
    'Included / United States',
    'Price / United States',
    'Compare At Price / United States',
    'Included / International',
    'Price / International',
    'Compare At Price / International',
    'Status',
  ];

  const rows: string[][] = [headers];

  for (const product of products) {
    const variants = includeVariants ? product.variants : [product.variants[0]];
    const images = includeImages ? product.images : [];

    // First row: product + first variant + first image
    const firstVariant = variants[0];
    const firstImage = images[0];

    const firstRow = [
      product.handle,
      product.title,
      escapeCsvField(product.bodyHtml),
      product.vendor,
      '', // Product Category
      product.productType,
      product.tags.join(', '),
      'TRUE', // Published
      firstVariant?.option1 ? 'Size' : '', // Option1 Name (common for apparel)
      firstVariant?.option1 || '',
      firstVariant?.option2 ? 'Color' : '',
      firstVariant?.option2 || '',
      firstVariant?.option3 ? 'Style' : '',
      firstVariant?.option3 || '',
      firstVariant?.sku || '',
      String(firstVariant?.grams || 0),
      'shopify', // Inventory Tracker
      '', // Inventory Qty (leave blank for update)
      firstVariant?.inventory_policy || 'deny',
      'manual', // Fulfillment Service
      firstVariant?.price || '',
      firstVariant?.compare_at_price || '',
      firstVariant?.requires_shipping ? 'TRUE' : 'FALSE',
      firstVariant?.taxable ? 'TRUE' : 'FALSE',
      firstVariant?.barcode || '',
      firstImage?.src || '',
      firstImage ? '1' : '',
      firstImage?.alt || '',
      'FALSE', // Gift Card
      product.pageTitle || product.title, // SEO Title
      product.metaDescription || '', // SEO Description
      '', // Google Product Category
      '', // Gender
      '', // Age Group
      '', // MPN
      'new', // Condition
      '', // Custom Product
      '', // Custom Labels
      '', '', '', '',
      '', // Variant Image
      firstVariant?.weight_unit || 'kg',
      '', // Tax Code
      '', // Cost per item
      'TRUE', '', '', // US pricing
      'TRUE', '', '', // International
      'active', // Status
    ];

    rows.push(firstRow);

    // Additional variant rows
    for (let i = 1; i < variants.length; i++) {
      const variant = variants[i];
      const image = images[i];

      const variantRow = [
        product.handle,
        '', // Title empty for variants
        '', // Body empty for variants
        '', '', '', '', '', // Vendor, Category, Type, Tags, Published
        '', variant.option1 || '',
        '', variant.option2 || '',
        '', variant.option3 || '',
        variant.sku || '',
        String(variant.grams || 0),
        'shopify',
        '',
        variant.inventory_policy || 'deny',
        'manual',
        variant.price || '',
        variant.compare_at_price || '',
        variant.requires_shipping ? 'TRUE' : 'FALSE',
        variant.taxable ? 'TRUE' : 'FALSE',
        variant.barcode || '',
        image?.src || '',
        image ? String(i + 1) : '',
        image?.alt || '',
        '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        '', variant.weight_unit || 'kg',
        '', '', 'TRUE', '', '', 'TRUE', '', '', '',
      ];

      rows.push(variantRow);
    }

    // Additional image rows (if more images than variants)
    for (let i = variants.length; i < images.length; i++) {
      const image = images[i];
      const imageRow = new Array(headers.length).fill('');
      imageRow[0] = product.handle;
      imageRow[headers.indexOf('Image Src')] = image.src;
      imageRow[headers.indexOf('Image Position')] = String(i + 1);
      imageRow[headers.indexOf('Image Alt Text')] = image.alt || '';
      rows.push(imageRow);
    }
  }

  // Convert to CSV string
  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function escapeCsvField(field: string): string {
  if (!field) return '';
  // Remove problematic characters for CSV
  return field
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ');
}

/**
 * Generate optimized content CSV with AI visibility recommendations
 */
export function generateOptimizationCsv(products: ScrapedProduct[]): string {
  const headers = [
    'Handle',
    'URL',
    'Current Title',
    'Current Description (first 200 chars)',
    'Current Meta Description',
    'Has JSON-LD',
    'JSON-LD Type',
    'Has Brand in JSON-LD',
    'Has Reviews in JSON-LD',
    'Has Offers in JSON-LD',
    'Tag Count',
    'Variant Count',
    'Image Count',
    'Recommended Title',
    'Recommended Meta Description',
    'Optimization Notes',
  ];

  const rows: string[][] = [headers];

  for (const product of products) {
    const jsonLd = product.jsonLd || {};
    const hasJsonLd = !!product.jsonLd;

    // Basic optimization recommendations
    const notes: string[] = [];
    if (!hasJsonLd) {
      notes.push('Missing Product JSON-LD schema');
    } else {
      if (!jsonLd.brand) notes.push('Add brand to JSON-LD');
      if (!jsonLd.aggregateRating && !jsonLd.review) notes.push('Add reviews/ratings to JSON-LD');
      if (!jsonLd.offers) notes.push('Add offers/pricing to JSON-LD');
    }
    if (!product.metaDescription) {
      notes.push('Missing meta description');
    } else if (product.metaDescription.length < 120) {
      notes.push('Meta description too short (<120 chars)');
    }
    if (product.title.length < 30) {
      notes.push('Title may be too short');
    }

    const row = [
      product.handle,
      product.url,
      product.title,
      stripHtml(product.bodyHtml).substring(0, 200),
      product.metaDescription,
      hasJsonLd ? 'Yes' : 'No',
      jsonLd['@type'] || '',
      jsonLd.brand ? 'Yes' : 'No',
      jsonLd.aggregateRating || jsonLd.review ? 'Yes' : 'No',
      jsonLd.offers ? 'Yes' : 'No',
      String(product.tags.length),
      String(product.variants.length),
      String(product.images.length),
      '', // Recommended Title (to be filled by user)
      '', // Recommended Meta Description (to be filled by user)
      notes.join('; '),
    ];

    rows.push(row);
  }

  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Shopify Store Scraper

Usage:
  npx ts-node index.ts --store <domain> [options]

Options:
  --store <domain>     Shopify store domain (e.g., tascperformance.com)
  --output <dir>       Output directory (default: ./output)
  --max-products <n>   Maximum products to scrape (default: 500)
  --skip-pages         Skip page scraping, use API only (faster)
  --format <type>      Output format: json, csv, both (default: both)
  --optimize-images    Generate Cloudinary-optimized image URLs (requires CLOUDINARY_CLOUD_NAME env var)

Environment Variables:
  CLOUDINARY_CLOUD_NAME  Your Cloudinary cloud name (required for --optimize-images)

Examples:
  npx ts-node index.ts --store tascperformance.com
  npx ts-node index.ts --store mystore.myshopify.com --max-products 100 --skip-pages
  CLOUDINARY_CLOUD_NAME=mycloud npx ts-node index.ts --store tascperformance.com --optimize-images
`);
    process.exit(0);
  }

  // Parse arguments
  const storeIndex = args.indexOf('--store');
  const outputIndex = args.indexOf('--output');
  const maxProductsIndex = args.indexOf('--max-products');
  const formatIndex = args.indexOf('--format');

  const store = storeIndex !== -1 ? args[storeIndex + 1] : null;
  const outputDir = outputIndex !== -1 ? args[outputIndex + 1] : './output';
  const maxProducts = maxProductsIndex !== -1 ? parseInt(args[maxProductsIndex + 1], 10) : 500;
  const skipPages = args.includes('--skip-pages');
  const format = formatIndex !== -1 ? args[formatIndex + 1] : 'both';
  const optimizeImages = args.includes('--optimize-images');

  // Validate Cloudinary config if image optimization requested
  const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (optimizeImages && !cloudinaryCloudName) {
    console.error('Error: --optimize-images requires CLOUDINARY_CLOUD_NAME environment variable');
    process.exit(1);
  }

  if (!store) {
    console.error('Error: --store is required');
    process.exit(1);
  }

  console.log(`\n🛍️  SHOPIFY STORE SCRAPER\n`);
  console.log(`Store: ${store}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Max Products: ${maxProducts}`);
  console.log(`Page Scraping: ${skipPages ? 'Disabled' : 'Enabled'}`);
  console.log(`Format: ${format}`);
  console.log(`Image Optimization: ${optimizeImages ? `Enabled (Cloudinary: ${cloudinaryCloudName})` : 'Disabled'}`);
  console.log('');

  // Create output directory
  await fs.promises.mkdir(outputDir, { recursive: true });

  // Scrape store
  const scraper = new ShopifyScraper(store);

  const result = await scraper.scrapeStore({
    maxProducts,
    includePageScrape: !skipPages,
    onProgress: (msg, current, total) => {
      process.stdout.write(`\r[${current}/${total}] ${msg}`.padEnd(80));
    },
  });

  console.log('\n\n📊 SCRAPE RESULTS\n');
  console.log(`Products scraped: ${result.stats.productsScraped}`);
  console.log(`Collections scraped: ${result.stats.collectionsScraped}`);
  console.log(`Errors: ${result.stats.errorCount}`);
  console.log(`Duration: ${(result.stats.duration / 1000).toFixed(1)}s`);

  // Image optimization (if enabled)
  let optimizedProducts: ScrapedProductWithOptimizedImages[] | null = null;

  if (optimizeImages && cloudinaryCloudName && validateCloudinaryConfig(cloudinaryCloudName)) {
    console.log('\n📸 OPTIMIZING IMAGES...\n');

    optimizedProducts = optimizeAllProductImages(result.products, {
      cloudName: cloudinaryCloudName,
      onProgress: (completed, total, msg) => {
        process.stdout.write(`\r[${completed}/${total}] ${msg}`.padEnd(80));
      },
    });

    const stats = getImageOptimizationStats(optimizedProducts);
    console.log('\n\n📸 IMAGE OPTIMIZATION RESULTS\n');
    console.log(`Products with images: ${stats.productsWithImages}/${stats.totalProducts}`);
    console.log(`Total images: ${stats.totalImages}`);
    console.log(`Average images per product: ${stats.averageImagesPerProduct}`);
    console.log(`Optimized URLs generated: ${stats.optimizedUrls}`);
  }

  // Save outputs
  const timestamp = new Date().toISOString().split('T')[0];
  const storeSlug = store.replace(/\./g, '-');

  if (format === 'json' || format === 'both') {
    const jsonPath = path.join(outputDir, `${storeSlug}-${timestamp}.json`);

    // Include optimized images in JSON if available
    const jsonOutput = optimizedProducts
      ? { ...result, products: optimizedProducts }
      : result;

    await fs.promises.writeFile(jsonPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`\n✅ JSON saved: ${jsonPath}`);
  }

  if (format === 'csv' || format === 'both') {
    // Shopify import CSV
    const shopifyCsvPath = path.join(outputDir, `${storeSlug}-shopify-import-${timestamp}.csv`);
    const shopifyCsv = generateShopifyCsv(result.products);
    await fs.promises.writeFile(shopifyCsvPath, shopifyCsv);
    console.log(`✅ Shopify Import CSV saved: ${shopifyCsvPath}`);

    // Optimization CSV (with or without optimized images)
    if (optimizedProducts) {
      // Use enhanced optimization CSV with Cloudinary URLs
      const optCsvPath = path.join(outputDir, `${storeSlug}-optimization-with-images-${timestamp}.csv`);
      const optCsv = generateOptimizationCsvWithImages(optimizedProducts);
      await fs.promises.writeFile(optCsvPath, optCsv);
      console.log(`✅ Optimization CSV (with Cloudinary URLs) saved: ${optCsvPath}`);
    } else {
      // Standard optimization CSV
      const optCsvPath = path.join(outputDir, `${storeSlug}-optimization-${timestamp}.csv`);
      const optCsv = generateOptimizationCsv(result.products);
      await fs.promises.writeFile(optCsvPath, optCsv);
      console.log(`✅ Optimization CSV saved: ${optCsvPath}`);
    }
  }

  console.log('\nDone!\n');
}

// Only run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts')) {
  main().catch(console.error);
}
