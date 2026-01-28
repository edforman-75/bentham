#!/usr/bin/env tsx
/**
 * Extract metadata from a URL
 *
 * Usage:
 *   pnpm tsx scripts/extract-metadata.ts https://example.com/products/test
 */

import { chromium } from 'playwright';
import {
  extractPageMetadata,
  scoreMetadataCompleteness,
} from '../packages/visibility-tool/src/collectors/metadata-collector.js';

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.log('Usage: pnpm tsx scripts/extract-metadata.ts <url>');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm tsx scripts/extract-metadata.ts https://example.com/products/test');
    process.exit(1);
  }

  console.log(`\nExtracting metadata from: ${url}\n`);

  let browser;
  try {
    // Try to connect to existing Chrome first
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('Connected to existing Chrome instance');
  } catch {
    // Launch new browser
    browser = await chromium.launch({ headless: true });
    console.log('Launched headless browser');
  }

  const context = browser.contexts()[0] || await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000); // Let page stabilize

    const metadata = await extractPageMetadata(page, url);
    const score = scoreMetadataCompleteness(metadata);

    console.log('═'.repeat(60));
    console.log('PAGE METADATA EXTRACTION');
    console.log('═'.repeat(60));

    console.log('\n📋 Basic Info');
    console.log('─'.repeat(40));
    console.log(`  URL: ${metadata.url}`);
    console.log(`  Page Type: ${metadata.pageType}`);
    console.log(`  Platform: ${metadata.platform}`);
    console.log(`  Title: ${metadata.pageTitle || '(none)'}`);

    console.log('\n🏷️  Meta Tags');
    console.log('─'.repeat(40));
    console.log(`  Title: ${metadata.metaTags.title || '❌ Missing'}`);
    console.log(`  Description: ${metadata.metaTags.description?.slice(0, 60) || '❌ Missing'}${metadata.metaTags.description && metadata.metaTags.description.length > 60 ? '...' : ''}`);
    console.log(`  Canonical: ${metadata.metaTags.canonical || '❌ Missing'}`);
    console.log(`  Robots: ${metadata.metaTags.robots || '(default)'}`);

    console.log('\n📘 Open Graph');
    console.log('─'.repeat(40));
    console.log(`  og:title: ${metadata.openGraph.title || '❌ Missing'}`);
    console.log(`  og:description: ${metadata.openGraph.description?.slice(0, 50) || '❌ Missing'}${metadata.openGraph.description && metadata.openGraph.description.length > 50 ? '...' : ''}`);
    console.log(`  og:image: ${metadata.openGraph.image ? '✅ Present' : '❌ Missing'}`);
    console.log(`  og:type: ${metadata.openGraph.type || '(none)'}`);

    console.log('\n🐦 Twitter Card');
    console.log('─'.repeat(40));
    console.log(`  twitter:card: ${metadata.twitterCard.card || '❌ Missing'}`);
    console.log(`  twitter:title: ${metadata.twitterCard.title || '(inherits og:title)'}`);
    console.log(`  twitter:image: ${metadata.twitterCard.image ? '✅ Present' : '(inherits og:image)'}`);

    console.log('\n📊 Structured Data (JSON-LD)');
    console.log('─'.repeat(40));
    console.log(`  Total schemas: ${metadata.jsonLd.length}`);
    console.log(`  Product schema: ${metadata.productSchema ? '✅ Present' : '❌ Missing'}`);
    console.log(`  Organization schema: ${metadata.organizationSchema ? '✅ Present' : '(none)'}`);
    console.log(`  BreadcrumbList: ${metadata.breadcrumbSchema ? '✅ Present' : '(none)'}`);

    if (metadata.pageType === 'product' && metadata.product) {
      console.log('\n🛍️  Product Data');
      console.log('─'.repeat(40));
      console.log(`  Name: ${metadata.product.name || '(none)'}`);
      console.log(`  Price: ${metadata.product.price ? `${metadata.product.currency || '$'}${metadata.product.price}` : '(none)'}`);
      console.log(`  SKU: ${metadata.product.sku || '(none)'}`);
      console.log(`  Brand: ${metadata.product.brand || '(none)'}`);
      console.log(`  Tags: ${metadata.product.tags.length > 0 ? metadata.product.tags.join(', ') : '(none)'}`);
      console.log(`  Categories: ${metadata.product.categories.length > 0 ? metadata.product.categories.join(' > ') : '(none)'}`);
      console.log(`  Rating: ${metadata.product.rating.value ? `${metadata.product.rating.value}/5 (${metadata.product.rating.count} reviews)` : '(none)'}`);
      console.log(`  Images: ${metadata.product.images.length}`);
    }

    console.log('\n📈 Metadata Score');
    console.log('─'.repeat(40));
    console.log(`  Overall Score: ${score.score}/100`);
    console.log(`  Breakdown:`);
    console.log(`    Meta Tags:       ${score.breakdown.metaTags}/25`);
    console.log(`    Open Graph:      ${score.breakdown.openGraph}/25`);
    console.log(`    Twitter Card:    ${score.breakdown.twitterCard}/15`);
    console.log(`    Structured Data: ${score.breakdown.structuredData}/20`);
    console.log(`    Product Data:    ${score.breakdown.productData}/15`);

    if (score.missing.length > 0) {
      console.log('\n⚠️  Missing Elements');
      console.log('─'.repeat(40));
      score.missing.forEach(item => {
        console.log(`  • ${item}`);
      });
    }

    // Output JSON-LD for inspection
    if (metadata.jsonLd.length > 0) {
      console.log('\n📝 JSON-LD Schemas (types only)');
      console.log('─'.repeat(40));
      metadata.jsonLd.forEach((schema, i) => {
        const type = schema['@type'] || 'Unknown';
        console.log(`  ${i + 1}. ${Array.isArray(type) ? type.join(', ') : type}`);
      });
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  } finally {
    await page.close();
  }

  console.log('\n');
}

main().catch(console.error);
