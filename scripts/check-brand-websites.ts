#!/usr/bin/env npx tsx
/**
 * Check which dog food brands have direct shopping on their own website
 */

import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';

const BRANDS_TO_CHECK = [
  { name: 'Natural Balance', url: 'https://www.naturalbalanceinc.com' },
  { name: 'Blue Buffalo', url: 'https://www.bluebuffalo.com' },
  { name: 'Wellness', url: 'https://www.wellnesspetfood.com' },
  { name: 'Merrick', url: 'https://www.merrickpetcare.com' },
  { name: 'Orijen', url: 'https://www.orijen.com' },
  { name: 'Acana', url: 'https://www.acana.com' },
  { name: 'Canidae', url: 'https://www.canidae.com' },
  { name: 'Nutro', url: 'https://www.nutro.com' },
  { name: 'Taste of the Wild', url: 'https://www.tasteofthewildpetfood.com' },
  { name: 'Fromm', url: 'https://www.frommfamily.com' },
  { name: 'Nulo', url: 'https://www.nulo.com' },
  { name: 'Purina', url: 'https://www.purina.com' },
  { name: 'Pedigree', url: 'https://www.pedigree.com' },
  { name: 'Iams', url: 'https://www.iams.com' },
  { name: "Hill's Science Diet", url: 'https://www.hillspet.com' },
  { name: 'Royal Canin', url: 'https://www.royalcanin.com' },
  { name: 'Rachael Ray Nutrish', url: 'https://www.nutrish.com' },
];

interface WebsiteResult {
  brand: string;
  url: string;
  hasDirectShopping: boolean;
  shopUrl?: string;
  notes?: string;
}

async function checkWebsite(page: any, brand: string, url: string): Promise<WebsiteResult> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 1000);

    // Check for shopping indicators
    const shopInfo = await page.evaluate(() => {
      const indicators = {
        hasShopLink: false,
        hasCart: false,
        hasAddToCart: false,
        hasBuyNow: false,
        hasCheckout: false,
        shopUrl: '',
        notes: [] as string[],
      };

      // Check for shop/store links in navigation
      const navLinks = document.querySelectorAll('nav a, header a, [class*="nav"] a, [class*="menu"] a');
      for (const link of navLinks) {
        const text = (link.textContent || '').toLowerCase();
        const href = (link as HTMLAnchorElement).href || '';
        if (text.includes('shop') || text.includes('store') || text.includes('buy') ||
            href.includes('/shop') || href.includes('/store') || href.includes('/products')) {
          indicators.hasShopLink = true;
          indicators.shopUrl = href;
          indicators.notes.push(`Shop link: "${link.textContent?.trim()}"`);
          break;
        }
      }

      // Check for cart icon/link
      const cartSelectors = [
        '[class*="cart"]', '[id*="cart"]', '[aria-label*="cart"]',
        '[class*="basket"]', '[id*="basket"]',
        'a[href*="/cart"]', 'a[href*="/basket"]',
      ];
      for (const selector of cartSelectors) {
        if (document.querySelector(selector)) {
          indicators.hasCart = true;
          indicators.notes.push('Cart found');
          break;
        }
      }

      // Check for "Add to Cart" buttons
      const allButtons = document.querySelectorAll('button, a.button, [class*="btn"]');
      for (const btn of allButtons) {
        const text = (btn.textContent || '').toLowerCase();
        if (text.includes('add to cart') || text.includes('add to bag')) {
          indicators.hasAddToCart = true;
          indicators.notes.push('Add to Cart button found');
          break;
        }
        if (text.includes('buy now') || text.includes('purchase')) {
          indicators.hasBuyNow = true;
          indicators.notes.push('Buy Now button found');
          break;
        }
      }

      // Check for "Where to Buy" (indicates NO direct shopping)
      const allText = document.body.innerText.toLowerCase();
      if (allText.includes('where to buy') || allText.includes('find a retailer') ||
          allText.includes('find a store') || allText.includes('store locator')) {
        indicators.notes.push('Has "Where to Buy" section');
      }

      return indicators;
    });

    const hasDirectShopping = shopInfo.hasCart || shopInfo.hasAddToCart ||
                              (shopInfo.hasShopLink && !shopInfo.notes.some(n => n.includes('Where to Buy')));

    return {
      brand,
      url,
      hasDirectShopping,
      shopUrl: shopInfo.shopUrl || undefined,
      notes: shopInfo.notes.join('; ') || undefined,
    };
  } catch (error) {
    return {
      brand,
      url,
      hasDirectShopping: false,
      notes: `Error: ${error}`,
    };
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  BRAND WEBSITE DIRECT SHOPPING CHECK');
  console.log('======================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  const results: WebsiteResult[] = [];

  for (let i = 0; i < BRANDS_TO_CHECK.length; i++) {
    const { name, url } = BRANDS_TO_CHECK[i];
    process.stdout.write(`[${i + 1}/${BRANDS_TO_CHECK.length}] ${name}... `);

    const result = await checkWebsite(page, name, url);
    results.push(result);

    if (result.hasDirectShopping) {
      console.log(`✅ Direct Shopping`);
    } else {
      console.log(`❌ No Direct Shopping`);
    }

    await page.waitForTimeout(1500 + Math.random() * 1000);
  }

  await page.close();
  await browser.close();

  console.log('\n======================================================================');
  console.log('  SUMMARY');
  console.log('======================================================================\n');

  const withShopping = results.filter(r => r.hasDirectShopping);
  const withoutShopping = results.filter(r => !r.hasDirectShopping);

  console.log(`✅ Brands WITH Direct Website Shopping (${withShopping.length}/${results.length}):`);
  for (const r of withShopping) {
    console.log(`   - ${r.brand} (${r.url})`);
  }

  console.log(`\n❌ Brands WITHOUT Direct Website Shopping (${withoutShopping.length}/${results.length}):`);
  for (const r of withoutShopping) {
    console.log(`   - ${r.brand} (${r.url})`);
    if (r.notes) console.log(`     ${r.notes}`);
  }

  // Save results
  const outputPath = 'repository/results/glu/natural-balance-us-visibility/brand-website-shopping.json';
  const { writeFileSync } = await import('fs');
  writeFileSync(outputPath, JSON.stringify({
    checkedAt: new Date().toISOString(),
    totalBrands: BRANDS_TO_CHECK.length,
    brandsWithDirectShopping: withShopping.map(r => r.brand),
    brandsWithoutDirectShopping: withoutShopping.map(r => r.brand),
    details: results,
  }, null, 2));

  console.log(`\n💾 Saved to: ${outputPath}`);
}

main().catch(console.error);
