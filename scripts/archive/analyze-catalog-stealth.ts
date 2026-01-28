import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as readline from 'readline';

// Products to analyze
const PRODUCTS_TO_ANALYZE = {
  'UGG': [
    'https://www.ugg.com/women-boots-classic-boots/classic-short-ii-boot/1016223.html',
    'https://www.ugg.com/women-boots-classic-boots/classic-mini-ii-boot/1016222.html',
    'https://www.ugg.com/women-boots-classic-boots/classic-ultra-mini-boot/1116109.html',
    'https://www.ugg.com/men-slippers/tasman-slipper/5950.html',
    'https://www.ugg.com/women-slippers/scuffette-ii-slipper/1106872.html',
    'https://www.ugg.com/women-slippers/coquette-slipper/5125.html',
    'https://www.ugg.com/men-boots/butte-boot/5521.html',
    'https://www.ugg.com/men-shoes/neumel-boot/3236.html',
  ],
  'Sorel': [
    'https://www.sorel.com/p/mens-caribou-boot-NM1000.html',
    'https://www.sorel.com/p/womens-joan-of-arctic-boot-1855131.html',
    'https://www.sorel.com/p/womens-tofino-ii-boot-1758231.html',
    'https://www.sorel.com/p/womens-out-n-about-iii-classic-boot-1951331.html',
  ],
  'HOKA': [
    'https://www.hoka.com/en/us/mens-road/bondi-8/1123202.html',
    'https://www.hoka.com/en/us/mens-road/clifton-9/1127895.html',
    'https://www.hoka.com/en/us/mens-road/mach-6/1147790.html',
    'https://www.hoka.com/en/us/womens-road/bondi-8/1127952.html',
    'https://www.hoka.com/en/us/mens-trail/speedgoat-6/1160053.html',
    'https://www.hoka.com/en/us/mens-sandals-and-slides/ora-recovery-slide-3/1135061.html',
  ],
  'Teva': [
    'https://www.teva.com/women-sandals/hurricane-xlt2/1019235.html',
    'https://www.teva.com/women-sandals/original-universal/1003987.html',
    'https://www.teva.com/women-sandals/tirra/4266.html',
    'https://www.teva.com/men-sandals/hurricane-xlt2/1019234.html',
    'https://www.teva.com/women-sandals/midform-universal/1090969.html',
    'https://www.teva.com/men-sandals/terra-fi-5-universal/1102456.html',
  ],
};

// Human-like random delay
function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Simulate human-like mouse movement
async function humanMouseMove(page: Page): Promise<void> {
  const viewportSize = page.viewportSize() || { width: 1280, height: 800 };
  const x = Math.floor(Math.random() * viewportSize.width * 0.8) + viewportSize.width * 0.1;
  const y = Math.floor(Math.random() * viewportSize.height * 0.8) + viewportSize.height * 0.1;

  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
}

// Simulate human-like scrolling
async function humanScroll(page: Page): Promise<void> {
  const scrollAmount = Math.floor(Math.random() * 300) + 100;
  await page.evaluate((amount) => {
    window.scrollBy({ top: amount, behavior: 'smooth' });
  }, scrollAmount);
  await randomDelay(500, 1500);
}

function evaluateJsonLdQuality(jsonLd: any[]): any {
  const issues: string[] = [];
  const strengths: string[] = [];
  let score = 0;

  if (!jsonLd || jsonLd.length === 0) {
    return { score: 0, grade: 'F', issues: ['No JSON-LD structured data found'], strengths: [] };
  }

  const productSchema = jsonLd.find((item: any) => item['@type'] === 'Product');

  if (!productSchema) {
    return { score: 10, grade: 'F', issues: ['JSON-LD present but no Product schema'], strengths: ['Has some structured data'] };
  }

  if (productSchema.name) { score += 10; strengths.push('Product name'); }
  else { issues.push('Missing product name'); }

  if (productSchema.description && productSchema.description.length > 50) {
    score += 10; strengths.push(`Description (${productSchema.description.length} chars)`);
  } else if (productSchema.description) {
    score += 5; issues.push(`Short description`);
  } else { issues.push('Missing description'); }

  if (productSchema.image) {
    const count = Array.isArray(productSchema.image) ? productSchema.image.length : 1;
    score += 10; strengths.push(`Images (${count})`);
  } else { issues.push('Missing images'); }

  if (productSchema.sku || productSchema.productID) { score += 5; strengths.push('SKU/ID'); }
  if (productSchema.mpn) { score += 3; strengths.push('MPN'); }
  if (productSchema.gtin || productSchema.gtin13) { score += 2; strengths.push('GTIN'); }

  if (productSchema.brand?.['@type'] === 'Brand') { score += 10; strengths.push('Brand schema'); }
  else if (productSchema.brand) { score += 5; issues.push('Brand not structured'); }
  else { issues.push('Missing brand'); }

  const offer = productSchema.offers?.[0] || productSchema.offers;
  if (offer) {
    if (offer['@type']) { score += 5; strengths.push('Offer schema'); }
    if (offer.price && offer.priceCurrency) { score += 5; strengths.push('Price + currency'); }
    else if (offer.price) { score += 2; issues.push('Missing currency'); }
    else { issues.push('Missing price'); }
    if (offer.availability) { score += 5; strengths.push('Availability'); }
  } else { issues.push('Missing offers'); }

  if (productSchema.aggregateRating?.ratingValue && productSchema.aggregateRating?.reviewCount) {
    score += 15; strengths.push(`Rating (${productSchema.aggregateRating.ratingValue}★)`);
  } else { issues.push('Missing AggregateRating'); }

  if (productSchema.review) {
    const count = Array.isArray(productSchema.review) ? productSchema.review.length : 1;
    score += 5; strengths.push(`Reviews (${count})`);
  }

  if (productSchema.category) { score += 3; strengths.push('Category'); }
  if (productSchema.color) { score += 2; strengths.push('Color'); }
  if (productSchema.material) { score += 2; strengths.push('Material'); }

  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B+';
  else if (score >= 60) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  return { score, grade, issues, strengths };
}

async function waitForUser(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => { rl.question(prompt, () => { rl.close(); resolve(); }); });
}

async function analyzeProductStealth(page: Page, url: string, brand: string): Promise<any | null> {
  try {
    console.log(`\n  🔍 ${url.split('/').pop()}`);

    // Human-like pre-navigation delay
    await randomDelay(2000, 4000);

    // Navigate with longer timeout
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

    // Human-like post-load behavior
    await randomDelay(1500, 3000);
    await humanMouseMove(page);
    await randomDelay(500, 1000);
    await humanScroll(page);
    await randomDelay(1000, 2000);

    // Check for bot detection
    const pageTitle = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');

    const isBlocked =
      pageTitle.toLowerCase().includes('verify') ||
      pageTitle.toLowerCase().includes('human') ||
      pageTitle.toLowerCase().includes('denied') ||
      pageTitle.toLowerCase().includes('blocked') ||
      bodyText.toLowerCase().includes('verify you are a human') ||
      bodyText.toLowerCase().includes('access denied') ||
      bodyText.toLowerCase().includes('please complete') ||
      bodyText.toLowerCase().includes('security check');

    if (isBlocked) {
      console.log(`\n  ⚠️  BOT DETECTION! Please unblock in browser.`);
      console.log(`  Title: "${pageTitle}"`);
      await waitForUser('  Press ENTER when unblocked: ');
      await randomDelay(2000, 3000);
      await humanScroll(page);
    }

    // More human behavior
    await humanMouseMove(page);
    await randomDelay(800, 1500);

    // Extract JSON-LD
    const jsonLdScripts = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
      scripts.map(s => { try { return JSON.parse(s.textContent || ''); } catch { return null; } }).filter(Boolean)
    );

    const flatJsonLd: any[] = [];
    for (const item of jsonLdScripts) {
      if (item['@graph']) flatJsonLd.push(...item['@graph']);
      else flatJsonLd.push(item);
    }

    const productSchema = flatJsonLd.find((item: any) => item['@type'] === 'Product');
    const quality = evaluateJsonLdQuality(flatJsonLd);
    const offer = productSchema?.offers?.[0] || productSchema?.offers;

    const productName = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1?.textContent?.trim() || '';
    });

    // Display result
    const ratingStr = productSchema?.aggregateRating
      ? `★${productSchema.aggregateRating.ratingValue} (${productSchema.aggregateRating.reviewCount})`
      : '—';
    const priceStr = offer?.price ? `$${offer.price}` : '—';

    console.log(`     ${productName || '(no name)'}`);
    console.log(`     Grade: ${quality.grade} (${quality.score}) | Rating: ${ratingStr} | Price: ${priceStr}`);

    if (quality.issues.length > 0 && quality.score < 70) {
      console.log(`     Issues: ${quality.issues.slice(0, 2).join(', ')}`);
    }

    return {
      url,
      brand,
      productName,
      jsonLd: {
        found: flatJsonLd.length > 0,
        hasProduct: !!productSchema,
        hasAggregateRating: !!productSchema?.aggregateRating,
        ratingValue: productSchema?.aggregateRating?.ratingValue || null,
        ratingCount: productSchema?.aggregateRating?.reviewCount || null,
        hasReview: !!productSchema?.review,
        reviewCount: Array.isArray(productSchema?.review) ? productSchema.review.length : 0,
        hasPrice: !!(offer?.price),
        priceValue: offer?.price || null,
        priceCurrency: offer?.priceCurrency || null,
        descriptionLength: productSchema?.description?.length || 0,
        description: productSchema?.description?.substring(0, 300) || '',
        raw: flatJsonLd,
        quality
      }
    };
  } catch (e) {
    console.log(`     ❌ Error: ${e}`);
    return null;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  STEALTH CATALOG ANALYSIS');
  console.log('======================================================================');
  console.log('\n  Using human-like behavior to avoid bot detection.');
  console.log('  Will pause for manual unblock if needed.\n');

  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✓ Connected to Chrome\n');
  } catch (e) {
    console.error('Failed to connect. Run Chrome with --remote-debugging-port=9222');
    process.exit(1);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  // Set realistic viewport
  await page.setViewportSize({ width: 1440, height: 900 });

  const results: Record<string, any[]> = {};

  for (const [brand, urls] of Object.entries(PRODUCTS_TO_ANALYZE)) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${brand}`);
    console.log('═'.repeat(60));

    results[brand] = [];

    for (let i = 0; i < urls.length; i++) {
      console.log(`\n[${i + 1}/${urls.length}]`);
      const result = await analyzeProductStealth(page, urls[i], brand);
      if (result) {
        results[brand].push(result);
      }

      // Longer delay between products to appear more human
      if (i < urls.length - 1) {
        const waitTime = Math.floor(Math.random() * 3000) + 2000;
        console.log(`     Waiting ${(waitTime/1000).toFixed(1)}s...`);
        await randomDelay(waitTime, waitTime + 1000);
      }
    }

    // Brand summary
    const products = results[brand];
    if (products.length > 0) {
      const avgScore = Math.round(products.reduce((sum, p) => sum + p.jsonLd.quality.score, 0) / products.length);
      const withRating = products.filter(p => p.jsonLd.hasAggregateRating).length;
      const withPrice = products.filter(p => p.jsonLd.hasPrice).length;
      const withReviews = products.filter(p => p.jsonLd.hasReview).length;

      let grade: string;
      if (avgScore >= 90) grade = 'A+';
      else if (avgScore >= 80) grade = 'A';
      else if (avgScore >= 70) grade = 'B+';
      else if (avgScore >= 60) grade = 'B';
      else if (avgScore >= 50) grade = 'C';
      else if (avgScore >= 40) grade = 'D';
      else grade = 'F';

      console.log(`\n  ┌─────────────────────────────────────────┐`);
      console.log(`  │  ${brand} SUMMARY`.padEnd(42) + '│');
      console.log(`  ├─────────────────────────────────────────┤`);
      console.log(`  │  Average Score: ${avgScore}/100 (${grade})`.padEnd(42) + '│');
      console.log(`  │  AggregateRating: ${withRating}/${products.length}`.padEnd(42) + '│');
      console.log(`  │  Price in Schema: ${withPrice}/${products.length}`.padEnd(42) + '│');
      console.log(`  │  Reviews in Schema: ${withReviews}/${products.length}`.padEnd(42) + '│');
      console.log(`  └─────────────────────────────────────────┘`);
    }

    // Longer delay between brands
    await randomDelay(5000, 8000);
  }

  // Save results
  const outputPath = '/Users/edf/bentham/repository/results/glu/deckers-us-visibility/catalog-stealth-results.json';
  fs.writeFileSync(outputPath, JSON.stringify({
    studyName: 'Stealth Catalog Analysis',
    timestamp: new Date().toISOString(),
    results
  }, null, 2));

  console.log(`\n\n💾 Results saved to: ${outputPath}`);

  // Final comparison
  console.log('\n' + '═'.repeat(60));
  console.log('  FINAL COMPARISON');
  console.log('═'.repeat(60) + '\n');

  const summaries: { brand: string; score: number; rating: number; price: number; total: number }[] = [];

  for (const [brand, products] of Object.entries(results)) {
    if (products.length > 0) {
      const avgScore = Math.round(products.reduce((sum: number, p: any) => sum + p.jsonLd.quality.score, 0) / products.length);
      const withRating = products.filter((p: any) => p.jsonLd.hasAggregateRating).length;
      const withPrice = products.filter((p: any) => p.jsonLd.hasPrice).length;
      summaries.push({ brand, score: avgScore, rating: withRating, price: withPrice, total: products.length });
    }
  }

  summaries.sort((a, b) => b.score - a.score);

  console.log('  Rank  Brand        Score    Ratings    Price');
  console.log('  ' + '─'.repeat(50));

  summaries.forEach((s, i) => {
    const isDeckers = ['HOKA', 'UGG', 'Teva'].includes(s.brand);
    const tag = isDeckers ? '🔵' : '⚪';
    console.log(`  ${i + 1}.    ${tag} ${s.brand.padEnd(10)} ${String(s.score).padStart(3)}/100   ${s.rating}/${s.total}        ${s.price}/${s.total}`);
  });

  await page.close();
}

main().catch(console.error);
