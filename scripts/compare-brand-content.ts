#!/usr/bin/env npx tsx
/**
 * Compare product content between Amazon and brand websites
 * Extracts data from search results and clicks using visible text
 */

import { chromium, Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const SCREENSHOT_DIR = 'repository/results/glu/natural-balance-us-visibility/screenshots';

const BRANDS = [
  { name: 'Blue Buffalo', amazon: 'Blue Buffalo Life Protection dog food', website: 'https://www.bluebuffalo.com' },
  { name: 'Canidae', amazon: 'Canidae PURE dog food', website: 'https://www.canidae.com' },
  { name: 'Nutro', amazon: 'Nutro Natural Choice dog food', website: 'https://www.nutro.com' },
  { name: 'Taste of the Wild', amazon: 'Taste of the Wild High Prairie dog food', website: 'https://www.tasteofthewildpetfood.com' },
  { name: 'Pedigree', amazon: 'Pedigree Complete Nutrition dog food', website: 'https://www.pedigree.com' },
  { name: 'Iams', amazon: 'Iams Proactive Health dog food', website: 'https://www.iams.com' },
];

async function findAmazonPage(context: any): Promise<Page | null> {
  for (const p of context.pages()) {
    if (p.url().includes('amazon.com')) return p;
  }
  return null;
}

async function main() {
  console.log('======================================================================');
  console.log('  AMAZON vs WEBSITE CONTENT COMPARISON');
  console.log('======================================================================\n');

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];

  let amazonPage = await findAmazonPage(context);
  if (!amazonPage) {
    console.log('❌ No Amazon page found');
    await browser.close();
    return;
  }
  console.log('✅ Found existing Amazon page\n');

  const websitePage = await context.newPage();
  const results: any[] = [];

  for (const brand of BRANDS) {
    console.log(`\n▶ ${brand.name}`);
    console.log('─'.repeat(50));

    const result: any = { brand: brand.name, amazon: null, website: null };

    // AMAZON
    try {
      console.log('  📦 Searching Amazon...');
      const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(brand.amazon)}`;
      await amazonPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await amazonPage.waitForTimeout(4000);

      // Try to find and click first product using text content
      const clicked = await amazonPage.evaluate((brandName) => {
        // Find all product title links
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
        await amazonPage.waitForTimeout(5000);
        await amazonPage.screenshot({ path: `${SCREENSHOT_DIR}/${brand.name.replace(/\s/g, '-')}-amazon.png` });

        result.amazon = await amazonPage.evaluate(() => {
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

        console.log(`     ✓ Title: ${result.amazon.title?.slice(0, 50)}...`);
        console.log(`     ✓ ${result.amazon.bullets?.length || 0} bullet points`);
      } else {
        console.log('     ⚠️ Could not click on product');
      }
    } catch (e: any) {
      console.log(`     ✗ Error: ${e.message?.slice(0, 60)}`);
    }

    await amazonPage.waitForTimeout(2000);

    // WEBSITE
    try {
      console.log('  🌐 Brand website...');
      await websitePage.goto(brand.website, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await websitePage.waitForTimeout(3000);
      await websitePage.screenshot({ path: `${SCREENSHOT_DIR}/${brand.name.replace(/\s/g, '-')}-website.png` });

      result.website = await websitePage.evaluate(() => {
        const title = document.querySelector('h1')?.textContent?.trim() || document.title;
        const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

        const keyPhrases: string[] = [];
        document.querySelectorAll('p, h2, h3').forEach(el => {
          const t = el.textContent?.trim();
          if (t && t.length > 25 && t.length < 250 && !keyPhrases.includes(t)) {
            keyPhrases.push(t);
          }
        });

        return { title, url: window.location.href, metaDescription: metaDesc, keyPhrases: keyPhrases.slice(0, 10) };
      });

      console.log(`     ✓ Title: ${result.website.title?.slice(0, 50)}...`);
    } catch (e: any) {
      console.log(`     ✗ Error: ${e.message?.slice(0, 60)}`);
    }

    results.push(result);
    await websitePage.waitForTimeout(1500);
  }

  await websitePage.close();
  await browser.close();

  // Print comparison
  console.log('\n\n' + '═'.repeat(70));
  console.log('  DETAILED COMPARISON');
  console.log('═'.repeat(70));

  for (const r of results) {
    console.log(`\n\n▶▶▶ ${r.brand.toUpperCase()} ◀◀◀`);
    console.log('─'.repeat(70));

    if (r.amazon?.title) {
      console.log('\n📦 AMAZON LISTING:');
      console.log(`   URL: ${r.amazon.url}`);
      console.log(`\n   TITLE:\n   ${r.amazon.title}`);
      if (r.amazon.bullets?.length) {
        console.log('\n   BULLET POINTS:');
        r.amazon.bullets.forEach((b: string, i: number) => console.log(`   ${i + 1}. ${b.slice(0, 120)}`));
      }
      if (r.amazon.aplusContent) {
        console.log(`\n   A+ CONTENT (excerpt):\n   ${r.amazon.aplusContent.slice(0, 500)}...`);
      }
    } else {
      console.log('\n📦 AMAZON: Not captured');
    }

    if (r.website) {
      console.log('\n🌐 BRAND WEBSITE:');
      console.log(`   URL: ${r.website.url}`);
      if (r.website.metaDescription) {
        console.log(`\n   META DESCRIPTION:\n   ${r.website.metaDescription}`);
      }
      if (r.website.keyPhrases?.length) {
        console.log('\n   KEY MESSAGING:');
        r.website.keyPhrases.slice(0, 5).forEach((p: string, i: number) => console.log(`   ${i + 1}. ${p.slice(0, 100)}`));
      }
    }
  }

  const outputPath = 'repository/results/glu/natural-balance-us-visibility/brand-content-comparison.json';
  writeFileSync(outputPath, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\n\n💾 Results: ${outputPath}`);
}

main().catch(console.error);
