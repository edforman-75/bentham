#!/usr/bin/env npx tsx
/**
 * Check which footwear brands have Amazon Brand Stores
 * Includes all Deckers brands and key competitors
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_DIR = 'repository/results/glu/deckers-us-visibility';

// All brands to check
const BRANDS_TO_CHECK = [
  // Deckers brands
  'UGG',
  'HOKA',
  'Teva',
  'Sanuk',
  'Koolaburra',

  // Premium Performance competitors
  'Nike',
  'Adidas',
  'New Balance',
  'Brooks',
  'ASICS',
  'Saucony',
  'On Running',

  // Outdoor/Hiking competitors
  'Merrell',
  'Salomon',
  'Keen',
  'Columbia',
  'The North Face',

  // Casual/Lifestyle competitors
  'Birkenstock',
  'Crocs',
  'Allbirds',
  'Vans',
  'Converse',

  // Comfort/Boot competitors
  'Timberland',
  'Dr. Martens',
  'Clarks',
  'Sorel',
];

const DECKERS_BRANDS = ['UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra'];

interface BrandStoreResult {
  brand: string;
  isDeckersBrand: boolean;
  hasStore: boolean;
  storeUrl?: string;
  storeName?: string;
}

async function checkBrandStore(page: any, brand: string): Promise<BrandStoreResult> {
  const isDeckers = DECKERS_BRANDS.includes(brand);

  // Search for brand + shoes/footwear
  const searchTerm = `${brand} shoes`;
  const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}`;

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500 + Math.random() * 1000);

    // Look for "Visit the X Store" link
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
        isDeckersBrand: isDeckers,
        hasStore: true,
        storeUrl: storeInfo.url,
        storeName: storeInfo.text,
      };
    }

    return { brand, isDeckersBrand: isDeckers, hasStore: false };
  } catch (error) {
    console.error(`  Error: ${error}`);
    return { brand, isDeckersBrand: isDeckers, hasStore: false };
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  AMAZON BRAND STORE CHECK - FOOTWEAR BRANDS');
  console.log('======================================================================\n');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];

  const page = await context.newPage();
  const results: BrandStoreResult[] = [];

  for (let i = 0; i < BRANDS_TO_CHECK.length; i++) {
    const brand = BRANDS_TO_CHECK[i];
    const isDeckers = DECKERS_BRANDS.includes(brand);
    const marker = isDeckers ? '[DECKERS]' : '';

    process.stdout.write(`[${i + 1}/${BRANDS_TO_CHECK.length}] ${brand} ${marker}... `);

    const result = await checkBrandStore(page, brand);
    results.push(result);

    if (result.hasStore) {
      console.log(`[OK] ${result.storeName}`);
    } else {
      console.log(`[NONE] No Store Found`);
    }

    await page.waitForTimeout(2000 + Math.random() * 1500);
  }

  await page.close();
  await browser.close();

  // Summary
  console.log('\n======================================================================');
  console.log('  SUMMARY');
  console.log('======================================================================\n');

  // Deckers brands
  const deckersResults = results.filter(r => r.isDeckersBrand);
  const deckersWithStores = deckersResults.filter(r => r.hasStore);

  console.log(`\n--- DECKERS BRANDS (${deckersWithStores.length}/${deckersResults.length} have stores) ---`);
  for (const r of deckersResults) {
    const status = r.hasStore ? '[OK]' : '[NONE]';
    console.log(`   ${status} ${r.brand}${r.storeUrl ? ` - ${r.storeUrl}` : ''}`);
  }

  // Competitors
  const competitorResults = results.filter(r => !r.isDeckersBrand);
  const competitorsWithStores = competitorResults.filter(r => r.hasStore);

  console.log(`\n--- COMPETITORS (${competitorsWithStores.length}/${competitorResults.length} have stores) ---`);

  console.log('\n   WITH Amazon Brand Stores:');
  for (const r of competitorResults.filter(r => r.hasStore)) {
    console.log(`     [OK] ${r.brand}`);
  }

  console.log('\n   WITHOUT Amazon Brand Stores:');
  for (const r of competitorResults.filter(r => !r.hasStore)) {
    console.log(`     [NONE] ${r.brand}`);
  }

  // Strategic insights
  console.log('\n======================================================================');
  console.log('  STRATEGIC INSIGHTS');
  console.log('======================================================================\n');

  const deckersWithoutStores = deckersResults.filter(r => !r.hasStore);
  if (deckersWithoutStores.length > 0) {
    console.log('  [ACTION] Deckers brands missing Amazon Brand Stores:');
    for (const r of deckersWithoutStores) {
      console.log(`    - ${r.brand}`);
    }
    console.log('\n  Recommendation: Consider creating Amazon Brand Stores for these brands');
    console.log('  to improve discoverability and brand presentation on Amazon.');
  } else {
    console.log('  [OK] All Deckers brands have Amazon Brand Stores!');
  }

  // Save results
  const output = {
    checkedAt: new Date().toISOString(),
    totalBrands: BRANDS_TO_CHECK.length,
    summary: {
      deckersBrands: {
        total: deckersResults.length,
        withStores: deckersWithStores.length,
        withoutStores: deckersResults.length - deckersWithStores.length,
        brands: deckersResults.map(r => ({ brand: r.brand, hasStore: r.hasStore, storeUrl: r.storeUrl })),
      },
      competitors: {
        total: competitorResults.length,
        withStores: competitorsWithStores.length,
        withoutStores: competitorResults.length - competitorsWithStores.length,
        brandsWithStores: competitorsWithStores.map(r => r.brand),
        brandsWithoutStores: competitorResults.filter(r => !r.hasStore).map(r => r.brand),
      },
    },
    details: results,
  };

  writeFileSync(`${OUTPUT_DIR}/amazon-brand-stores.json`, JSON.stringify(output, null, 2));
  console.log(`\n[SAVE] ${OUTPUT_DIR}/amazon-brand-stores.json`);
}

main().catch(console.error);
