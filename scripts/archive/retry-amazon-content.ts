#!/usr/bin/env npx tsx
/**
 * Retry Amazon content capture for Canidae, Taste of the Wild, Pedigree
 */

import { chromium, Page } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const CDP_URL = 'http://localhost:9222';

const BRANDS = [
  { name: 'Canidae', search: 'Canidae dog food' },
  { name: 'Taste of the Wild', search: 'Taste of the Wild dog food' },
  { name: 'Pedigree', search: 'Pedigree dog food' },
];

async function findAmazonPage(context: any): Promise<Page | null> {
  for (const p of context.pages()) {
    if (p.url().includes('amazon.com')) return p;
  }
  return null;
}

async function main() {
  console.log('======================================================================');
  console.log('  RETRY AMAZON CONTENT CAPTURE');
  console.log('======================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];

  const amazonPage = await findAmazonPage(context);
  if (!amazonPage) {
    console.log('No Amazon page found');
    await browser.close();
    return;
  }
  console.log('Found existing Amazon page\n');

  const results: any[] = [];

  for (const brand of BRANDS) {
    console.log(`\n▶ ${brand.name}`);
    console.log('─'.repeat(50));

    try {
      // Search for the brand
      const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(brand.search)}`;
      console.log(`  Searching: ${brand.search}`);
      await amazonPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await amazonPage.waitForTimeout(4000);

      // Take screenshot for debugging
      await amazonPage.screenshot({ path: `repository/results/glu/natural-balance-us-visibility/screenshots/${brand.name.replace(/\s/g, '-')}-search.png` });

      // Get all product links and their text for debugging - try multiple selector strategies
      const productLinks = await amazonPage.evaluate(() => {
        const links: { text: string; href: string }[] = [];

        // Strategy 1: Standard search results
        document.querySelectorAll('.s-main-slot h2 a, .s-result-item h2 a').forEach(el => {
          const text = el.textContent?.trim() || '';
          const href = (el as HTMLAnchorElement).href || '';
          if (text && href && href.includes('/dp/')) {
            links.push({ text: text.slice(0, 80), href });
          }
        });

        // Strategy 2: Any link with /dp/ in search results area
        if (links.length === 0) {
          document.querySelectorAll('[data-component-type="s-search-result"] a[href*="/dp/"]').forEach(el => {
            const text = el.textContent?.trim() || '';
            const href = (el as HTMLAnchorElement).href || '';
            if (text && text.length > 10 && href) {
              links.push({ text: text.slice(0, 80), href });
            }
          });
        }

        // Strategy 3: Look for product titles in any format
        if (links.length === 0) {
          document.querySelectorAll('a[href*="/dp/"]').forEach(el => {
            const text = el.textContent?.trim() || '';
            const href = (el as HTMLAnchorElement).href || '';
            if (text && text.length > 20 && text.length < 300 && href) {
              links.push({ text: text.slice(0, 80), href });
            }
          });
        }

        // Debug info
        const debug = {
          h2Count: document.querySelectorAll('h2').length,
          dpLinks: document.querySelectorAll('a[href*="/dp/"]').length,
          bodyText: document.body.innerText.slice(0, 500),
        };

        return { links: links.slice(0, 5), debug };
      });

      console.log(`  Found ${productLinks.links.length} product links (h2: ${productLinks.debug.h2Count}, dp links: ${productLinks.debug.dpLinks}):`);
      productLinks.links.forEach((p, i) => console.log(`    ${i + 1}. ${p.text}...`));

      if (productLinks.links.length === 0) {
        console.log(`  Page text: ${productLinks.debug.bodyText.slice(0, 200)}...`);
        console.log('  No products found');
        results.push({ brand: brand.name, amazon: null });
        continue;
      }

      // Click the first product link directly
      const firstProductUrl = productLinks.links[0].href;
      console.log(`  Navigating to first product...`);
      await amazonPage.goto(firstProductUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await amazonPage.waitForTimeout(5000);

      // Extract product data
      const amazonData = await amazonPage.evaluate(() => {
        const title = document.querySelector('#productTitle')?.textContent?.trim() || '';

        const bullets: string[] = [];
        document.querySelectorAll('#feature-bullets li span.a-list-item, #feature-bullets li').forEach(el => {
          const t = el.textContent?.trim();
          if (t && t.length > 15 && !bullets.some(b => b.includes(t) || t.includes(b))) {
            bullets.push(t);
          }
        });

        const aplus = document.querySelector('#aplus')?.textContent?.trim() || '';

        return {
          title,
          bullets: bullets.slice(0, 6),
          aplusContent: aplus.slice(0, 1500),
          url: window.location.href,
        };
      });

      if (amazonData.title) {
        console.log(`  ✓ Title: ${amazonData.title.slice(0, 60)}...`);
        console.log(`  ✓ ${amazonData.bullets.length} bullet points`);
        results.push({ brand: brand.name, amazon: amazonData });
      } else {
        console.log('  ✗ Could not extract product data');
        results.push({ brand: brand.name, amazon: null });
      }

    } catch (e: any) {
      console.log(`  ✗ Error: ${e.message?.slice(0, 80)}`);
      results.push({ brand: brand.name, amazon: null });
    }

    await amazonPage.waitForTimeout(2000);
  }

  await browser.close();

  // Update the existing results file
  const resultsPath = 'repository/results/glu/natural-balance-us-visibility/brand-content-comparison.json';
  const existing = JSON.parse(readFileSync(resultsPath, 'utf-8'));

  for (const r of results) {
    const idx = existing.results.findIndex((e: any) => e.brand === r.brand);
    if (idx >= 0 && r.amazon) {
      existing.results[idx].amazon = r.amazon;
      console.log(`\n✓ Updated ${r.brand} with Amazon data`);
    }
  }

  existing.updatedAt = new Date().toISOString();
  writeFileSync(resultsPath, JSON.stringify(existing, null, 2));
  console.log(`\n💾 Updated: ${resultsPath}`);

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log('  CAPTURED DATA');
  console.log('═'.repeat(70));

  for (const r of results) {
    if (r.amazon?.title) {
      console.log(`\n▶ ${r.brand.toUpperCase()}`);
      console.log(`  Title: ${r.amazon.title}`);
      console.log(`  Bullets:`);
      r.amazon.bullets.forEach((b: string, i: number) => console.log(`    ${i + 1}. ${b.slice(0, 100)}`));
    }
  }
}

main().catch(console.error);
