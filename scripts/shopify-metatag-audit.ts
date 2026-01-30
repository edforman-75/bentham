#!/usr/bin/env npx tsx
/**
 * Shopify Meta Tag Audit Script
 *
 * Pulls existing meta tags from Shopify PDPs and identifies
 * what's missing for optimal AI visibility.
 *
 * Usage:
 *   npx tsx scripts/shopify-metatag-audit.ts https://misschase.com
 *   npx tsx scripts/shopify-metatag-audit.ts https://misschase.com/products/specific-product
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';

// What AI systems look for (in order of importance)
const AI_VISIBILITY_CHECKLIST = {
  // Open Graph (critical for social + AI)
  og: {
    'og:title': { required: true, description: 'Product title for social/AI previews' },
    'og:description': { required: true, description: 'Product description (150-300 chars ideal)' },
    'og:image': { required: true, description: 'Product image (1200x630 recommended)' },
    'og:url': { required: true, description: 'Canonical product URL' },
    'og:type': { required: false, description: 'Should be "product" for PDPs' },
    'og:site_name': { required: false, description: 'Brand/store name' },
    'og:price:amount': { required: false, description: 'Product price' },
    'og:price:currency': { required: false, description: 'Currency code (INR, USD)' },
  },

  // Twitter Cards
  twitter: {
    'twitter:card': { required: false, description: 'Card type (summary_large_image best)' },
    'twitter:title': { required: false, description: 'Falls back to og:title if missing' },
    'twitter:description': { required: false, description: 'Falls back to og:description' },
    'twitter:image': { required: false, description: 'Falls back to og:image' },
  },

  // Standard meta
  standard: {
    'description': { required: true, description: 'Meta description for search engines' },
    'robots': { required: false, description: 'Indexing directives' },
    'canonical': { required: true, description: 'Canonical URL (as link rel)' },
  },

  // Schema.org JSON-LD (critical for AI)
  jsonld: {
    '@type Product': { required: true, description: 'Product schema type' },
    'name': { required: true, description: 'Product name' },
    'description': { required: true, description: 'Product description' },
    'image': { required: true, description: 'Product image(s)' },
    'brand': { required: true, description: 'Brand name (critical for AI visibility)' },
    'sku': { required: false, description: 'Product SKU' },
    'gtin/gtin13/gtin14': { required: false, description: 'Barcode (helps product matching)' },
    'offers': { required: true, description: 'Price and availability' },
    'offers.price': { required: true, description: 'Numeric price' },
    'offers.priceCurrency': { required: true, description: 'Currency code' },
    'offers.availability': { required: true, description: 'Stock status URL' },
    'aggregateRating': { required: false, description: 'Average rating (boosts AI trust)' },
    'review': { required: false, description: 'Individual reviews' },
    'color': { required: false, description: 'Product color' },
    'material': { required: false, description: 'Product material' },
    'category': { required: false, description: 'Product category' },
  },
};

interface MetaTag {
  property?: string;
  name?: string;
  content?: string;
  href?: string;
}

interface JsonLdData {
  '@type'?: string;
  [key: string]: unknown;
}

interface AuditResult {
  url: string;
  title: string;
  metaTags: MetaTag[];
  jsonLd: JsonLdData[];
  og: Record<string, string>;
  twitter: Record<string, string>;
  standard: Record<string, string>;
  missing: {
    critical: string[];
    recommended: string[];
  };
  present: string[];
  score: number;
  imageAnalysis?: {
    ogImage?: string;
    ogImageDimensions?: string;
    hasHighResImage: boolean;
  };
}

/**
 * Fetch and parse a URL
 */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

/**
 * Extract product URLs from a Shopify sitemap or collection page
 */
async function discoverProductUrls(baseUrl: string, limit = 10): Promise<string[]> {
  const urls: string[] = [];

  // Try sitemap first
  try {
    const sitemapUrl = new URL('/sitemap_products_1.xml', baseUrl).toString();
    const sitemapHtml = await fetchPage(sitemapUrl);
    const $ = cheerio.load(sitemapHtml, { xmlMode: true });

    $('url loc').each((_, el) => {
      const loc = $(el).text();
      if (loc.includes('/products/') && urls.length < limit) {
        urls.push(loc);
      }
    });

    if (urls.length > 0) {
      console.log(`Found ${urls.length} products from sitemap`);
      return urls;
    }
  } catch (e) {
    // Sitemap not accessible, try collections
  }

  // Try collections/all page
  try {
    const collectionsUrl = new URL('/collections/all', baseUrl).toString();
    const html = await fetchPage(collectionsUrl);
    const $ = cheerio.load(html);

    $('a[href*="/products/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && urls.length < limit) {
        const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
        if (!urls.includes(fullUrl)) {
          urls.push(fullUrl);
        }
      }
    });

    console.log(`Found ${urls.length} products from collections page`);
  } catch (e) {
    console.error('Could not discover products:', e);
  }

  return urls;
}

/**
 * Audit a single PDP
 */
async function auditPdp(url: string): Promise<AuditResult> {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const result: AuditResult = {
    url,
    title: $('title').text().trim(),
    metaTags: [],
    jsonLd: [],
    og: {},
    twitter: {},
    standard: {},
    missing: { critical: [], recommended: [] },
    present: [],
    score: 0,
  };

  // Extract all meta tags
  $('meta').each((_, el) => {
    const tag: MetaTag = {
      property: $(el).attr('property'),
      name: $(el).attr('name'),
      content: $(el).attr('content'),
    };
    result.metaTags.push(tag);

    // Categorize
    if (tag.property?.startsWith('og:')) {
      result.og[tag.property] = tag.content || '';
    } else if (tag.property?.startsWith('twitter:') || tag.name?.startsWith('twitter:')) {
      const key = tag.property || tag.name || '';
      result.twitter[key] = tag.content || '';
    } else if (tag.name === 'description') {
      result.standard['description'] = tag.content || '';
    } else if (tag.name === 'robots') {
      result.standard['robots'] = tag.content || '';
    }
  });

  // Extract canonical
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    result.standard['canonical'] = canonical;
  }

  // Extract JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}');
      if (Array.isArray(json)) {
        result.jsonLd.push(...json);
      } else if (json['@graph']) {
        result.jsonLd.push(...json['@graph']);
      } else {
        result.jsonLd.push(json);
      }
    } catch (e) {
      // Invalid JSON-LD
    }
  });

  // Find Product schema
  const productSchema = result.jsonLd.find(
    (item) => item['@type'] === 'Product' || (Array.isArray(item['@type']) && item['@type'].includes('Product'))
  );

  // Check against checklist
  let totalChecks = 0;
  let passedChecks = 0;

  // Check OG tags
  for (const [tag, info] of Object.entries(AI_VISIBILITY_CHECKLIST.og)) {
    totalChecks++;
    if (result.og[tag]) {
      passedChecks++;
      result.present.push(tag);
    } else if (info.required) {
      result.missing.critical.push(`${tag} - ${info.description}`);
    } else {
      result.missing.recommended.push(`${tag} - ${info.description}`);
    }
  }

  // Check Twitter tags
  for (const [tag, info] of Object.entries(AI_VISIBILITY_CHECKLIST.twitter)) {
    totalChecks++;
    if (result.twitter[tag] || result.twitter[tag.replace('twitter:', '')]) {
      passedChecks++;
      result.present.push(tag);
    } else if (info.required) {
      result.missing.critical.push(`${tag} - ${info.description}`);
    } else {
      result.missing.recommended.push(`${tag} - ${info.description}`);
    }
  }

  // Check standard meta
  for (const [tag, info] of Object.entries(AI_VISIBILITY_CHECKLIST.standard)) {
    totalChecks++;
    if (result.standard[tag]) {
      passedChecks++;
      result.present.push(`meta ${tag}`);
    } else if (info.required) {
      result.missing.critical.push(`meta ${tag} - ${info.description}`);
    } else {
      result.missing.recommended.push(`meta ${tag} - ${info.description}`);
    }
  }

  // Check JSON-LD Product schema
  if (productSchema) {
    result.present.push('JSON-LD Product schema');
    passedChecks++;
    totalChecks++;

    // Check individual fields
    const schemaChecks: Record<string, boolean> = {
      'name': !!productSchema.name,
      'description': !!productSchema.description,
      'image': !!productSchema.image,
      'brand': !!productSchema.brand,
      'sku': !!productSchema.sku,
      'gtin/gtin13/gtin14': !!(productSchema.gtin || productSchema.gtin13 || productSchema.gtin14),
      'offers': !!productSchema.offers,
      'offers.price': !!(productSchema.offers?.price || productSchema.offers?.[0]?.price),
      'offers.priceCurrency': !!(productSchema.offers?.priceCurrency || productSchema.offers?.[0]?.priceCurrency),
      'offers.availability': !!(productSchema.offers?.availability || productSchema.offers?.[0]?.availability),
      'aggregateRating': !!productSchema.aggregateRating,
      'review': !!productSchema.review,
      'color': !!productSchema.color,
      'material': !!productSchema.material,
    };

    for (const [field, info] of Object.entries(AI_VISIBILITY_CHECKLIST.jsonld)) {
      if (field === '@type Product') continue; // Already checked

      totalChecks++;
      const fieldKey = field.replace('offers.', '');

      if (schemaChecks[field]) {
        passedChecks++;
        result.present.push(`schema:${field}`);
      } else if (info.required) {
        result.missing.critical.push(`schema:${field} - ${info.description}`);
      } else {
        result.missing.recommended.push(`schema:${field} - ${info.description}`);
      }
    }
  } else {
    totalChecks++;
    result.missing.critical.push('JSON-LD Product schema - Critical for AI visibility');
  }

  // Image analysis
  if (result.og['og:image']) {
    result.imageAnalysis = {
      ogImage: result.og['og:image'],
      hasHighResImage: result.og['og:image'].includes('1200') || result.og['og:image'].includes('width=1200'),
    };
  }

  result.score = Math.round((passedChecks / totalChecks) * 100);

  return result;
}

/**
 * Format audit results for console
 */
function formatResults(results: AuditResult[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('  SHOPIFY META TAG AUDIT FOR AI VISIBILITY');
  console.log('='.repeat(70));

  // Summary
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  console.log(`\nPages audited: ${results.length}`);
  console.log(`Average AI Visibility Score: ${avgScore}%`);

  // Aggregate missing tags
  const criticalMissing: Record<string, number> = {};
  const recommendedMissing: Record<string, number> = {};

  for (const result of results) {
    for (const item of result.missing.critical) {
      const tag = item.split(' - ')[0];
      criticalMissing[tag] = (criticalMissing[tag] || 0) + 1;
    }
    for (const item of result.missing.recommended) {
      const tag = item.split(' - ')[0];
      recommendedMissing[tag] = (recommendedMissing[tag] || 0) + 1;
    }
  }

  // Critical missing
  console.log('\n' + '-'.repeat(70));
  console.log('CRITICAL MISSING (blocks AI visibility):');
  console.log('-'.repeat(70));

  const sortedCritical = Object.entries(criticalMissing).sort((a, b) => b[1] - a[1]);
  if (sortedCritical.length === 0) {
    console.log('  ✅ None - all critical tags present!');
  } else {
    for (const [tag, count] of sortedCritical) {
      const pct = Math.round((count / results.length) * 100);
      console.log(`  ❌ ${tag} - missing on ${count}/${results.length} pages (${pct}%)`);
    }
  }

  // Recommended missing
  console.log('\n' + '-'.repeat(70));
  console.log('RECOMMENDED (improves AI visibility):');
  console.log('-'.repeat(70));

  const sortedRecommended = Object.entries(recommendedMissing).sort((a, b) => b[1] - a[1]);
  if (sortedRecommended.length === 0) {
    console.log('  ✅ All recommended tags present!');
  } else {
    for (const [tag, count] of sortedRecommended.slice(0, 10)) {
      const pct = Math.round((count / results.length) * 100);
      console.log(`  ⚠️  ${tag} - missing on ${count}/${results.length} pages (${pct}%)`);
    }
  }

  // Per-page details
  console.log('\n' + '-'.repeat(70));
  console.log('PER-PAGE SCORES:');
  console.log('-'.repeat(70));

  for (const result of results) {
    const icon = result.score >= 80 ? '✅' : result.score >= 60 ? '⚠️' : '❌';
    const shortUrl = result.url.replace(/https?:\/\/[^/]+/, '');
    console.log(`  ${icon} ${result.score}% - ${shortUrl}`);
  }

  // JSON-LD sample
  const sampleWithSchema = results.find(r => r.jsonLd.some(j => j['@type'] === 'Product'));
  if (sampleWithSchema) {
    const productSchema = sampleWithSchema.jsonLd.find(j => j['@type'] === 'Product');
    console.log('\n' + '-'.repeat(70));
    console.log('SAMPLE EXISTING JSON-LD (from first product):');
    console.log('-'.repeat(70));
    console.log(JSON.stringify(productSchema, null, 2).slice(0, 1500));
    if (JSON.stringify(productSchema).length > 1500) {
      console.log('  ... (truncated)');
    }
  }

  // Recommendations
  console.log('\n' + '='.repeat(70));
  console.log('  RECOMMENDATIONS');
  console.log('='.repeat(70));

  if (sortedCritical.some(([tag]) => tag.startsWith('schema:brand'))) {
    console.log('\n1. ADD BRAND TO SCHEMA');
    console.log('   Your Product schema is missing the brand field.');
    console.log('   This is critical for AI systems to associate products with Miss Chase.');
    console.log('   Add to your product-schema.liquid:');
    console.log('   "brand": { "@type": "Brand", "name": "Miss Chase" }');
  }

  if (sortedCritical.some(([tag]) => tag === 'og:image')) {
    console.log('\n2. ADD OG:IMAGE TAGS');
    console.log('   Products are missing og:image meta tags.');
    console.log('   AI systems and social platforms use this for previews.');
  }

  if (sortedRecommended.some(([tag]) => tag === 'schema:aggregateRating')) {
    console.log('\n3. ADD RATINGS TO SCHEMA');
    console.log('   Adding aggregateRating increases AI trust signals.');
    console.log('   If you have reviews, include them in the schema.');
  }

  console.log('\n' + '='.repeat(70));
}

/**
 * Export results as JSON
 */
function exportJson(results: AuditResult[], outputPath: string): void {
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      pagesAudited: results.length,
      averageScore: Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length),
    },
    results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults exported to: ${outputPath}`);
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx tsx scripts/shopify-metatag-audit.ts <store-url> [--json output.json] [--limit N]');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/shopify-metatag-audit.ts https://misschase.com');
    console.log('  npx tsx scripts/shopify-metatag-audit.ts https://misschase.com/products/specific-product');
    console.log('  npx tsx scripts/shopify-metatag-audit.ts https://misschase.com --limit 20 --json audit.json');
    process.exit(1);
  }

  const url = args[0];
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;
  const jsonIdx = args.indexOf('--json');
  const jsonOutput = jsonIdx !== -1 ? args[jsonIdx + 1] : null;

  console.log(`\nAuditing: ${url}`);
  console.log(`Product limit: ${limit}`);

  let urls: string[];

  if (url.includes('/products/')) {
    // Single product URL
    urls = [url];
  } else {
    // Discover products from store
    console.log('Discovering product URLs...');
    urls = await discoverProductUrls(url, limit);
  }

  if (urls.length === 0) {
    console.error('No product URLs found. Try providing a specific product URL.');
    process.exit(1);
  }

  console.log(`\nAuditing ${urls.length} product pages...\n`);

  const results: AuditResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    const productUrl = urls[i];
    process.stdout.write(`  [${i + 1}/${urls.length}] ${productUrl.split('/products/')[1] || productUrl}...`);

    try {
      const result = await auditPdp(productUrl);
      results.push(result);
      console.log(` ${result.score}%`);
    } catch (e) {
      console.log(` ERROR: ${e instanceof Error ? e.message : e}`);
    }

    // Rate limit
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  formatResults(results);

  if (jsonOutput) {
    exportJson(results, jsonOutput);
  }
}

main().catch(console.error);
