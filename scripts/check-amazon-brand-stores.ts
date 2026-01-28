#!/usr/bin/env npx tsx
/**
 * Check which dog food brands have Amazon Brand Stores
 */

import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';

const BRANDS_TO_CHECK = [
  'Natural Balance',
  'Blue Buffalo',
  'Wellness',
  'Merrick',
  'Orijen',
  'Acana',
  'Canidae',
  'Nutro',
  'Taste of the Wild',
  'Fromm',
  'Nulo',
  'Purina',
  'Pedigree',
  'Iams',
  "Hill's Science Diet",
  'Royal Canin',
  'Rachael Ray Nutrish',
];

interface BrandStoreResult {
  brand: string;
  hasStore: boolean;
  storeUrl?: string;
  storeName?: string;
}

async function checkBrandStore(page: any, brand: string): Promise<BrandStoreResult> {
  // Search for brand + dog food
  const searchTerm = `${brand} dog food`;
  const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}`;

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500 + Math.random() * 1000);

    // Look for "Visit the X Store" link - this is the standard brand store indicator
    const storeInfo = await page.evaluate(() => {
      // Method 1: Look for "Visit the ... Store" text links
      const allLinks = document.querySelectorAll('a');
      for (const link of allLinks) {
        const text = link.textContent?.trim() || '';
        if (text.toLowerCase().includes('visit the') && text.toLowerCase().includes('store')) {
          return {
            found: true,
            url: (link as HTMLAnchorElement).href,
            text: text,
          };
        }
      }

      // Method 2: Look for brand store links in product cards
      const storeLinks = document.querySelectorAll('a[href*="/stores/"]');
      if (storeLinks.length > 0) {
        const link = storeLinks[0] as HTMLAnchorElement;
        return {
          found: true,
          url: link.href,
          text: link.textContent?.trim() || 'Store',
        };
      }

      // Method 3: Look for sponsored brand banner with store link
      const sponsoredBrand = document.querySelector('[data-component-type="sp-brand"]');
      if (sponsoredBrand) {
        const storeLink = sponsoredBrand.querySelector('a[href*="/stores/"]');
        if (storeLink) {
          return {
            found: true,
            url: (storeLink as HTMLAnchorElement).href,
            text: 'Sponsored Store',
          };
        }
      }

      return { found: false };
    });

    if (storeInfo.found) {
      return {
        brand,
        hasStore: true,
        storeUrl: storeInfo.url,
        storeName: storeInfo.text,
      };
    }

    return { brand, hasStore: false };
  } catch (error) {
    console.error(`  Error: ${error}`);
    return { brand, hasStore: false };
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  AMAZON BRAND STORE CHECK');
  console.log('======================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];

  // Create a new page for checking
  const page = await context.newPage();

  const results: BrandStoreResult[] = [];

  for (let i = 0; i < BRANDS_TO_CHECK.length; i++) {
    const brand = BRANDS_TO_CHECK[i];
    process.stdout.write(`[${i + 1}/${BRANDS_TO_CHECK.length}] ${brand}... `);

    const result = await checkBrandStore(page, brand);
    results.push(result);

    if (result.hasStore) {
      console.log(`✅ ${result.storeName}`);
    } else {
      console.log(`❌ No Store Found`);
    }

    // Human-like delay between searches
    await page.waitForTimeout(2000 + Math.random() * 1500);
  }

  await page.close();
  await browser.close();

  console.log('\n======================================================================');
  console.log('  SUMMARY');
  console.log('======================================================================\n');

  const withStores = results.filter(r => r.hasStore);
  const withoutStores = results.filter(r => !r.hasStore);

  console.log(`✅ Brands WITH Amazon Brand Stores (${withStores.length}/${results.length}):`);
  for (const r of withStores) {
    console.log(`   - ${r.brand}`);
  }

  console.log(`\n❌ Brands WITHOUT Amazon Brand Stores (${withoutStores.length}/${results.length}):`);
  for (const r of withoutStores) {
    console.log(`   - ${r.brand}`);
  }

  // Save results
  const outputPath = 'repository/results/glu/natural-balance-us-visibility/amazon-brand-stores.json';
  const { writeFileSync } = await import('fs');
  writeFileSync(outputPath, JSON.stringify({
    checkedAt: new Date().toISOString(),
    totalBrands: BRANDS_TO_CHECK.length,
    brandsWithStores: withStores.map(r => r.brand),
    brandsWithoutStores: withoutStores.map(r => r.brand),
    details: results,
  }, null, 2));

  console.log(`\n💾 Saved to: ${outputPath}`);
}

main().catch(console.error);
