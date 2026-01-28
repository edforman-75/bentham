#!/usr/bin/env npx tsx
/**
 * Deckers Brands - Compare product content between Amazon, Zappos, and brand websites
 * Extracts data from search results and clicks using visible text
 */

import { chromium, Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const SCREENSHOT_DIR = 'repository/results/glu/deckers-us-visibility/screenshots';
const OUTPUT_DIR = 'repository/results/glu/deckers-us-visibility';

// Deckers brands with product search terms
const DECKERS_BRANDS = [
  { name: 'UGG', amazon: 'UGG Classic Short II Boot', zappos: 'UGG Classic Short II', website: 'https://www.ugg.com' },
  { name: 'HOKA', amazon: 'HOKA Clifton 9 running shoe', zappos: 'HOKA Clifton 9', website: 'https://www.hoka.com' },
  { name: 'Teva', amazon: 'Teva Original Universal sandal', zappos: 'Teva Original Universal', website: 'https://www.teva.com' },
  { name: 'Sanuk', amazon: 'Sanuk Vagabond slip on', zappos: 'Sanuk Vagabond', website: 'https://www.sanuk.com' },
  { name: 'Koolaburra', amazon: 'Koolaburra by UGG short boot', zappos: 'Koolaburra by UGG', website: 'https://www.koolaburra.com' },
];

// Key competitors
const COMPETITOR_BRANDS = [
  { name: 'Nike', amazon: 'Nike Pegasus running shoe', zappos: 'Nike Pegasus', website: 'https://www.nike.com' },
  { name: 'Brooks', amazon: 'Brooks Ghost running shoe', zappos: 'Brooks Ghost', website: 'https://www.brooksrunning.com' },
  { name: 'New Balance', amazon: 'New Balance 990 sneaker', zappos: 'New Balance 990', website: 'https://www.newbalance.com' },
  { name: 'Birkenstock', amazon: 'Birkenstock Arizona sandal', zappos: 'Birkenstock Arizona', website: 'https://www.birkenstock.com' },
  { name: 'Merrell', amazon: 'Merrell Moab hiking shoe', zappos: 'Merrell Moab', website: 'https://www.merrell.com' },
  { name: 'Sorel', amazon: 'Sorel Joan of Arctic boot', zappos: 'Sorel Joan of Arctic', website: 'https://www.sorel.com' },
];

const ALL_BRANDS = [...DECKERS_BRANDS, ...COMPETITOR_BRANDS];

async function findOrCreatePage(context: any, urlMatch: string): Promise<Page | null> {
  for (const p of context.pages()) {
    if (p.url().includes(urlMatch)) return p;
  }
  return null;
}

async function extractAmazonData(page: Page, brand: { name: string; amazon: string }) {
  const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(brand.amazon)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Try to find and click first product
  const clicked = await page.evaluate((brandName) => {
    const links = document.querySelectorAll('.s-main-slot h2 a, [data-cy="title-recipe"] a, .s-result-item h2 a');
    for (const link of links) {
      const text = link.textContent || '';
      if (text.toLowerCase().includes(brandName.toLowerCase().split(' ')[0])) {
        (link as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, brand.name);

  if (clicked) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${brand.name.replace(/\s/g, '-')}-amazon.png` });

    return await page.evaluate(() => {
      const title = document.querySelector('#productTitle')?.textContent?.trim() || '';

      const bullets: string[] = [];
      document.querySelectorAll('#feature-bullets li span.a-list-item, #feature-bullets li').forEach(el => {
        const t = el.textContent?.trim();
        if (t && t.length > 15 && !bullets.some(b => b.includes(t) || t.includes(b))) {
          bullets.push(t);
        }
      });

      const aplus = document.querySelector('#aplus')?.textContent?.trim() || '';
      const rating = document.querySelector('#acrPopover')?.getAttribute('title') || '';
      const reviewCount = document.querySelector('#acrCustomerReviewText')?.textContent?.trim() || '';
      const price = document.querySelector('.a-price .a-offscreen')?.textContent?.trim() || '';

      return {
        title,
        bullets: bullets.slice(0, 6),
        aplusContent: aplus.slice(0, 1500),
        rating,
        reviewCount,
        price,
        url: window.location.href,
      };
    });
  }
  return null;
}

async function extractZapposData(page: Page, brand: { name: string; zappos: string }) {
  const searchUrl = `https://www.zappos.com/search?term=${encodeURIComponent(brand.zappos)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Click first product
  const clicked = await page.evaluate((brandName) => {
    const productCards = document.querySelectorAll('[data-product-id], .product, article');
    for (const card of productCards) {
      const link = card.querySelector('a');
      if (link && (link.textContent?.toLowerCase().includes(brandName.toLowerCase().split(' ')[0]) || true)) {
        (link as HTMLElement).click();
        return true;
      }
    }
    // Fallback: click first product link
    const firstLink = document.querySelector('.product a, [itemprop="url"]');
    if (firstLink) {
      (firstLink as HTMLElement).click();
      return true;
    }
    return false;
  }, brand.name);

  if (clicked) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${brand.name.replace(/\s/g, '-')}-zappos.png` });

    return await page.evaluate(() => {
      const title = document.querySelector('h1, [itemprop="name"]')?.textContent?.trim() || '';
      const price = document.querySelector('[itemprop="price"], .price')?.textContent?.trim() || '';
      const rating = document.querySelector('[itemprop="ratingValue"]')?.textContent?.trim() || '';
      const reviewCount = document.querySelector('[itemprop="reviewCount"]')?.textContent?.trim() || '';

      const description: string[] = [];
      document.querySelectorAll('[itemprop="description"] li, .description li, #description li').forEach(el => {
        const t = el.textContent?.trim();
        if (t && t.length > 10) description.push(t);
      });

      return {
        title,
        price,
        rating,
        reviewCount,
        description: description.slice(0, 8),
        url: window.location.href,
      };
    });
  }
  return null;
}

async function extractWebsiteData(page: Page, brand: { name: string; website: string }) {
  await page.goto(brand.website, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${brand.name.replace(/\s/g, '-')}-website.png` });

  return await page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || document.title;
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    const keyPhrases: string[] = [];
    document.querySelectorAll('p, h2, h3').forEach(el => {
      const t = el.textContent?.trim();
      if (t && t.length > 25 && t.length < 250 && !keyPhrases.includes(t)) {
        keyPhrases.push(t);
      }
    });

    // Check for shop/ecommerce functionality
    const hasShop = !!document.querySelector('[href*="/shop"], [href*="/products"], .add-to-cart, #add-to-cart');

    return {
      title,
      url: window.location.href,
      metaDescription: metaDesc,
      keyPhrases: keyPhrases.slice(0, 10),
      hasEcommerce: hasShop,
    };
  });
}

async function main() {
  console.log('======================================================================');
  console.log('  DECKERS BRANDS - AMAZON vs ZAPPOS vs WEBSITE CONTENT COMPARISON');
  console.log('======================================================================\n');

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];

  // Create pages for each surface
  const amazonPage = await context.newPage();
  const zapposPage = await context.newPage();
  const websitePage = await context.newPage();

  const results: any[] = [];

  for (const brand of ALL_BRANDS) {
    const isDeckers = DECKERS_BRANDS.some(b => b.name === brand.name);
    const brandType = isDeckers ? 'DECKERS' : 'COMPETITOR';

    console.log(`\n[${brandType}] ${brand.name}`);
    console.log('-'.repeat(50));

    const result: any = {
      brand: brand.name,
      isDeckersBrand: isDeckers,
      amazon: null,
      zappos: null,
      website: null,
    };

    // AMAZON
    try {
      console.log('  [AMAZON] Searching...');
      result.amazon = await extractAmazonData(amazonPage, brand);
      if (result.amazon) {
        console.log(`     [OK] Title: ${result.amazon.title?.slice(0, 50)}...`);
        console.log(`     [OK] ${result.amazon.bullets?.length || 0} bullets, Rating: ${result.amazon.rating}`);
      } else {
        console.log('     [WARN] Could not extract data');
      }
    } catch (e: any) {
      console.log(`     [FAIL] ${e.message?.slice(0, 60)}`);
    }

    await amazonPage.waitForTimeout(2000);

    // ZAPPOS
    try {
      console.log('  [ZAPPOS] Searching...');
      result.zappos = await extractZapposData(zapposPage, brand);
      if (result.zappos) {
        console.log(`     [OK] Title: ${result.zappos.title?.slice(0, 50)}...`);
        console.log(`     [OK] Price: ${result.zappos.price}, Rating: ${result.zappos.rating}`);
      } else {
        console.log('     [WARN] Could not extract data');
      }
    } catch (e: any) {
      console.log(`     [FAIL] ${e.message?.slice(0, 60)}`);
    }

    await zapposPage.waitForTimeout(2000);

    // WEBSITE
    try {
      console.log('  [WEBSITE] Loading...');
      result.website = await extractWebsiteData(websitePage, brand);
      if (result.website) {
        console.log(`     [OK] Title: ${result.website.title?.slice(0, 50)}...`);
        console.log(`     [OK] E-commerce: ${result.website.hasEcommerce ? 'Yes' : 'No'}`);
      }
    } catch (e: any) {
      console.log(`     [FAIL] ${e.message?.slice(0, 60)}`);
    }

    results.push(result);
    await websitePage.waitForTimeout(1500);
  }

  await amazonPage.close();
  await zapposPage.close();
  await websitePage.close();
  await browser.close();

  // Print detailed comparison
  console.log('\n\n' + '='.repeat(70));
  console.log('  DETAILED COMPARISON');
  console.log('='.repeat(70));

  // Deckers brands first
  console.log('\n\n--- DECKERS BRANDS ---\n');
  for (const r of results.filter(r => r.isDeckersBrand)) {
    printBrandSummary(r);
  }

  console.log('\n\n--- KEY COMPETITORS ---\n');
  for (const r of results.filter(r => !r.isDeckersBrand)) {
    printBrandSummary(r);
  }

  // Entity coherence analysis
  console.log('\n\n' + '='.repeat(70));
  console.log('  ENTITY COHERENCE ANALYSIS');
  console.log('='.repeat(70));

  for (const r of results.filter(r => r.isDeckersBrand)) {
    console.log(`\n${r.brand}:`);
    const hasAmazon = !!r.amazon?.title;
    const hasZappos = !!r.zappos?.title;
    const hasWebsite = !!r.website?.title;
    const channels = [hasAmazon, hasZappos, hasWebsite].filter(Boolean).length;

    console.log(`  Present on: ${channels}/3 channels`);
    console.log(`    - Amazon: ${hasAmazon ? 'Yes' : 'No'}`);
    console.log(`    - Zappos: ${hasZappos ? 'Yes' : 'No'}`);
    console.log(`    - Website: ${hasWebsite ? 'Yes' : 'No'}`);

    if (r.amazon?.bullets && r.website?.keyPhrases) {
      // Simple coherence check: do messaging themes align?
      const amazonText = r.amazon.bullets.join(' ').toLowerCase();
      const websiteText = r.website.keyPhrases.join(' ').toLowerCase();
      const commonThemes = ['comfort', 'quality', 'style', 'performance', 'cushion', 'support'];
      const sharedThemes = commonThemes.filter(t => amazonText.includes(t) && websiteText.includes(t));
      console.log(`  Shared messaging themes: ${sharedThemes.join(', ') || 'None identified'}`);
    }
  }

  // Save results
  const output = {
    checkedAt: new Date().toISOString(),
    totalBrands: ALL_BRANDS.length,
    deckersBrands: DECKERS_BRANDS.length,
    competitorBrands: COMPETITOR_BRANDS.length,
    results,
    summary: {
      deckersBrands: results.filter(r => r.isDeckersBrand).map(r => ({
        brand: r.brand,
        amazonPresent: !!r.amazon?.title,
        zapposPresent: !!r.zappos?.title,
        websiteEcommerce: r.website?.hasEcommerce,
      })),
      competitors: results.filter(r => !r.isDeckersBrand).map(r => ({
        brand: r.brand,
        amazonPresent: !!r.amazon?.title,
        zapposPresent: !!r.zappos?.title,
        websiteEcommerce: r.website?.hasEcommerce,
      })),
    },
  };

  writeFileSync(`${OUTPUT_DIR}/brand-content-comparison.json`, JSON.stringify(output, null, 2));
  console.log(`\n\n[SAVE] Results: ${OUTPUT_DIR}/brand-content-comparison.json`);
}

function printBrandSummary(r: any) {
  console.log(`\n>>> ${r.brand.toUpperCase()} <<<`);
  console.log('-'.repeat(70));

  if (r.amazon?.title) {
    console.log('\n[AMAZON]');
    console.log(`   Title: ${r.amazon.title}`);
    console.log(`   Price: ${r.amazon.price} | Rating: ${r.amazon.rating} | Reviews: ${r.amazon.reviewCount}`);
    if (r.amazon.bullets?.length) {
      console.log('   Bullets:');
      r.amazon.bullets.slice(0, 3).forEach((b: string, i: number) => console.log(`     ${i + 1}. ${b.slice(0, 100)}`));
    }
  }

  if (r.zappos?.title) {
    console.log('\n[ZAPPOS]');
    console.log(`   Title: ${r.zappos.title}`);
    console.log(`   Price: ${r.zappos.price} | Rating: ${r.zappos.rating}`);
  }

  if (r.website) {
    console.log('\n[WEBSITE]');
    console.log(`   URL: ${r.website.url}`);
    if (r.website.metaDescription) {
      console.log(`   Meta: ${r.website.metaDescription.slice(0, 120)}...`);
    }
    console.log(`   E-commerce: ${r.website.hasEcommerce ? 'Yes' : 'No'}`);
  }
}

main().catch(console.error);
