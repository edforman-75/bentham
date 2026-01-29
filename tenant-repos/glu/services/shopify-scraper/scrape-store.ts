/**
 * Unified Store Scraper
 *
 * Auto-detects platform and routes to the appropriate scraper:
 * - Shopify stores → ShopifyScraper (uses /products.json API)
 * - Other platforms → GenericScraper (sitemap + crawl)
 *
 * Usage:
 *   npx ts-node scrape-store.ts tascperformance.com
 *   npx ts-node scrape-store.ts example.com --output ./data --max-products 100
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ShopifyScraper,
  ScrapeResult,
  generateShopifyCsv,
  generateOptimizationCsv,
} from './index';
import {
  GenericScraper,
  GenericScrapeResult,
  generateGenericCsv,
  generateGenericOptimizationCsv,
} from './generic-scraper';

// ============================================================================
// Platform Detection
// ============================================================================

export async function detectPlatform(storeUrl: string): Promise<'shopify' | 'generic'> {
  const baseUrl = storeUrl.startsWith('http')
    ? storeUrl.replace(/\/$/, '')
    : `https://${storeUrl.replace(/\/$/, '')}`;

  // Try Shopify's products.json endpoint
  try {
    const response = await fetch(`${baseUrl}/products.json?limit=1`);
    if (response.ok) {
      const data = await response.json();
      if (data.products && Array.isArray(data.products)) {
        return 'shopify';
      }
    }
  } catch (e) {
    // Not Shopify
  }

  return 'generic';
}

// ============================================================================
// Unified Scraper
// ============================================================================

export interface UnifiedScrapeOptions {
  output?: string;
  maxProducts?: number;
  maxCollections?: number;
  skipPages?: boolean;
  format?: 'json' | 'csv' | 'both';
  forceGeneric?: boolean;
}

export interface UnifiedScrapeResult {
  platform: 'shopify' | 'generic';
  store: string;
  scrapedAt: string;
  files: {
    json?: string;
    shopifyCsv?: string;
    productsCsv?: string;
    optimizationCsv?: string;
  };
  stats: {
    productsScraped: number;
    collectionsScraped: number;
    errorCount: number;
    duration: number;
  };
}

export async function scrapeStore(
  storeUrl: string,
  options: UnifiedScrapeOptions = {}
): Promise<UnifiedScrapeResult> {
  const {
    output = './output',
    maxProducts = 500,
    maxCollections = 50,
    skipPages = false,
    format = 'both',
    forceGeneric = false,
  } = options;

  console.log(`\n🔍 Detecting platform for ${storeUrl}...`);
  const platform = forceGeneric ? 'generic' : await detectPlatform(storeUrl);
  console.log(`   Platform: ${platform === 'shopify' ? '🛍️  Shopify' : '🌐 Generic'}\n`);

  await fs.promises.mkdir(output, { recursive: true });

  const timestamp = new Date().toISOString().split('T')[0];
  const storeSlug = storeUrl.replace(/^https?:\/\//, '').replace(/[\/\.]/g, '-');
  const files: UnifiedScrapeResult['files'] = {};

  let stats: UnifiedScrapeResult['stats'];

  if (platform === 'shopify') {
    // Use Shopify scraper
    const scraper = new ShopifyScraper(storeUrl);
    const result = await scraper.scrapeStore({
      maxProducts,
      maxCollections,
      includePageScrape: !skipPages,
      onProgress: (msg, current, total) => {
        process.stdout.write(`\r[${current}/${total}] ${msg}`.padEnd(80));
      },
    });

    stats = {
      productsScraped: result.stats.productsScraped,
      collectionsScraped: result.stats.collectionsScraped,
      errorCount: result.stats.errorCount,
      duration: result.stats.duration,
    };

    // Save outputs
    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(output, `${storeSlug}-${timestamp}.json`);
      await fs.promises.writeFile(jsonPath, JSON.stringify(result, null, 2));
      files.json = jsonPath;
    }

    if (format === 'csv' || format === 'both') {
      // Shopify import CSV
      const shopifyCsvPath = path.join(output, `${storeSlug}-shopify-import-${timestamp}.csv`);
      await fs.promises.writeFile(shopifyCsvPath, generateShopifyCsv(result.products));
      files.shopifyCsv = shopifyCsvPath;

      // Optimization CSV
      const optCsvPath = path.join(output, `${storeSlug}-optimization-${timestamp}.csv`);
      await fs.promises.writeFile(optCsvPath, generateOptimizationCsv(result.products));
      files.optimizationCsv = optCsvPath;
    }
  } else {
    // Use generic scraper
    const scraper = new GenericScraper(storeUrl);
    const result = await scraper.scrapeStore({
      maxProducts,
      maxCollections,
      onProgress: (msg, current, total) => {
        process.stdout.write(`\r[${current}/${total}] ${msg}`.padEnd(80));
      },
    });

    stats = {
      productsScraped: result.stats.productsScraped,
      collectionsScraped: result.stats.collectionsScraped,
      errorCount: result.stats.errorCount,
      duration: result.stats.duration,
    };

    // Save outputs
    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(output, `${storeSlug}-${timestamp}.json`);
      await fs.promises.writeFile(jsonPath, JSON.stringify(result, null, 2));
      files.json = jsonPath;
    }

    if (format === 'csv' || format === 'both') {
      // Products CSV
      const csvPath = path.join(output, `${storeSlug}-products-${timestamp}.csv`);
      await fs.promises.writeFile(csvPath, generateGenericCsv(result.products));
      files.productsCsv = csvPath;

      // Optimization CSV
      const optCsvPath = path.join(output, `${storeSlug}-optimization-${timestamp}.csv`);
      await fs.promises.writeFile(optCsvPath, generateGenericOptimizationCsv(result.products));
      files.optimizationCsv = optCsvPath;
    }
  }

  return {
    platform,
    store: storeUrl,
    scrapedAt: new Date().toISOString(),
    files,
    stats,
  };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
🛒 UNIFIED STORE SCRAPER

Auto-detects platform and extracts product data for AI visibility optimization.

Usage:
  npx ts-node scrape-store.ts <store-domain> [options]

Options:
  --output <dir>       Output directory (default: ./output)
  --max-products <n>   Maximum products to scrape (default: 500)
  --skip-pages         Skip individual page scraping (faster, less data)
  --format <type>      Output format: json, csv, both (default: both)
  --force-generic      Force generic scraper even for Shopify stores

Output Files:
  For Shopify stores:
    - <store>-<date>.json              Full scrape data
    - <store>-shopify-import-<date>.csv  Shopify bulk import format
    - <store>-optimization-<date>.csv   AI visibility recommendations

  For other platforms:
    - <store>-<date>.json              Full scrape data
    - <store>-products-<date>.csv      Generic product CSV
    - <store>-optimization-<date>.csv   AI visibility recommendations

Examples:
  # Scrape TASC Performance (Shopify)
  npx ts-node scrape-store.ts tascperformance.com

  # Scrape with custom output
  npx ts-node scrape-store.ts example.com --output ./data --max-products 100

  # Quick scrape (API only, no page rendering)
  npx ts-node scrape-store.ts mystore.com --skip-pages

Supported Platforms:
  ✅ Shopify (auto-detected via /products.json)
  ✅ BigCommerce, WooCommerce, Magento, Squarespace
  ✅ Any platform with sitemap.xml and standard product URLs
`);
    process.exit(0);
  }

  // Parse arguments
  const store = args.find(arg => !arg.startsWith('--'));
  const outputIndex = args.indexOf('--output');
  const maxProductsIndex = args.indexOf('--max-products');
  const formatIndex = args.indexOf('--format');

  const options: UnifiedScrapeOptions = {
    output: outputIndex !== -1 ? args[outputIndex + 1] : './output',
    maxProducts: maxProductsIndex !== -1 ? parseInt(args[maxProductsIndex + 1], 10) : 500,
    skipPages: args.includes('--skip-pages'),
    format: (formatIndex !== -1 ? args[formatIndex + 1] : 'both') as 'json' | 'csv' | 'both',
    forceGeneric: args.includes('--force-generic'),
  };

  if (!store) {
    console.error('Error: Store domain is required');
    console.error('Usage: npx ts-node scrape-store.ts <store-domain> [options]');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  🛒 UNIFIED STORE SCRAPER');
  console.log('═'.repeat(60));

  const result = await scrapeStore(store, options);

  console.log('\n\n' + '─'.repeat(60));
  console.log('  📊 RESULTS');
  console.log('─'.repeat(60));
  console.log(`  Platform:    ${result.platform === 'shopify' ? 'Shopify' : 'Generic'}`);
  console.log(`  Products:    ${result.stats.productsScraped}`);
  console.log(`  Collections: ${result.stats.collectionsScraped}`);
  console.log(`  Errors:      ${result.stats.errorCount}`);
  console.log(`  Duration:    ${(result.stats.duration / 1000).toFixed(1)}s`);
  console.log('─'.repeat(60));
  console.log('  📁 OUTPUT FILES');
  console.log('─'.repeat(60));
  if (result.files.json) console.log(`  JSON:         ${result.files.json}`);
  if (result.files.shopifyCsv) console.log(`  Shopify CSV:  ${result.files.shopifyCsv}`);
  if (result.files.productsCsv) console.log(`  Products CSV: ${result.files.productsCsv}`);
  if (result.files.optimizationCsv) console.log(`  Optimization: ${result.files.optimizationCsv}`);
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
