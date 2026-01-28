import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as readline from 'readline';

// Products that need to be re-analyzed (failed in previous run)
const RETRY_PRODUCTS = {
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
    'https://www.hoka.com/en/us/mens-road/rincon-4/1155040.html',
    'https://www.hoka.com/en/us/womens-road/gaviota-5/1127932.html',
    'https://www.hoka.com/en/us/mens-trail/speedgoat-6/1160053.html',
    'https://www.hoka.com/en/us/womens-trail/speedgoat-6/1160054.html',
    'https://www.hoka.com/en/us/mens-lifestyle/transport/1159260.html',
    'https://www.hoka.com/en/us/womens-lifestyle/transport/1159261.html',
  ],
  'Keen': [
    'https://www.keenfootwear.com/p/1001938.html',  // Newport H2
    'https://www.keenfootwear.com/p/1027074.html',  // Targhee III WP
    'https://www.keenfootwear.com/p/1026329.html',  // Circadia Mid WP
  ],
  'Teva': [
    'https://www.teva.com/women-sandals/tirra/4266.html',
    'https://www.teva.com/women-shoes/grandview-gtx/1134095.html',
    'https://www.teva.com/women-shoes/ridgeview-mid/1116627.html',
    'https://www.teva.com/men-slippers/reember-moc/1125472.html',
  ]
};

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

  // Core fields
  if (productSchema.name) { score += 10; strengths.push('Product name'); }
  else { issues.push('Missing product name'); }

  if (productSchema.description && productSchema.description.length > 50) {
    score += 10; strengths.push(`Description (${productSchema.description.length} chars)`);
  } else if (productSchema.description) {
    score += 5; issues.push(`Short description (${productSchema.description.length} chars)`);
  } else { issues.push('Missing description'); }

  if (productSchema.image) {
    const count = Array.isArray(productSchema.image) ? productSchema.image.length : 1;
    score += 10; strengths.push(`Images (${count})`);
  } else { issues.push('Missing images'); }

  if (productSchema.sku || productSchema.productID) { score += 5; strengths.push('SKU/ID'); }
  else { issues.push('Missing SKU'); }

  if (productSchema.mpn) { score += 3; strengths.push('MPN'); }
  if (productSchema.gtin || productSchema.gtin13) { score += 2; strengths.push('GTIN'); }

  // Brand
  if (productSchema.brand?.['@type'] === 'Brand') { score += 10; strengths.push('Brand schema proper'); }
  else if (productSchema.brand) { score += 5; issues.push('Brand not fully structured'); }
  else { issues.push('Missing brand'); }

  // Offer
  const offer = productSchema.offers?.[0] || productSchema.offers;
  if (offer) {
    if (offer['@type']) { score += 5; strengths.push('Offer schema'); }
    if (offer.price && offer.priceCurrency) { score += 5; strengths.push('Price + currency'); }
    else if (offer.price) { score += 2; issues.push('Missing currency'); }
    else { issues.push('Missing price'); }
    if (offer.availability) { score += 5; strengths.push('Availability'); }
    else { issues.push('Missing availability'); }
  } else { issues.push('Missing offers'); }

  // Reviews & Ratings
  if (productSchema.aggregateRating?.ratingValue && productSchema.aggregateRating?.reviewCount) {
    score += 15; strengths.push(`AggregateRating (${productSchema.aggregateRating.ratingValue}★, ${productSchema.aggregateRating.reviewCount} reviews)`);
  } else if (productSchema.aggregateRating?.ratingValue) {
    score += 10; issues.push('AggregateRating missing review count');
  } else { issues.push('Missing AggregateRating - CRITICAL for AI'); }

  if (productSchema.review) {
    const count = Array.isArray(productSchema.review) ? productSchema.review.length : 1;
    score += 5; strengths.push(`Individual reviews (${count})`);
  }

  // Additional
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

async function waitForUserInput(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function analyzeProduct(page: Page, url: string, brand: string): Promise<any | null> {
  try {
    console.log(`\n  Loading: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Check for bot detection
    const pageTitle = await page.title();
    const pageContent = await page.content();

    const isBlocked =
      pageTitle.includes('verify') ||
      pageTitle.includes('human') ||
      pageTitle.includes('Access Denied') ||
      pageContent.includes('Please verify you are a human') ||
      pageContent.includes('Access Denied') ||
      pageContent.includes('captcha');

    if (isBlocked) {
      console.log(`\n  ⚠️  BOT DETECTION on ${brand} page!`);
      console.log(`  Page title: "${pageTitle}"`);
      console.log(`  Please unblock in the browser window, then press ENTER to continue...`);
      await waitForUserInput('  Press ENTER when page is unblocked: ');

      // Wait for page to settle after unblock
      await page.waitForTimeout(2000);
    }

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

    // Get product name from page
    const productName = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1?.textContent?.trim() || '';
    });

    console.log(`  Product: ${productName || '(no name found)'}`);
    console.log(`  Grade: ${quality.grade} (${quality.score}/100)`);
    console.log(`  JSON-LD: ${flatJsonLd.length > 0 ? 'Found' : 'NOT FOUND'}`);
    console.log(`  AggregateRating: ${productSchema?.aggregateRating ? `${productSchema.aggregateRating.ratingValue}★ (${productSchema.aggregateRating.reviewCount} reviews)` : 'MISSING'}`);

    if (quality.issues.length > 0) {
      console.log(`  Issues: ${quality.issues.slice(0, 3).join(', ')}`);
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
        price: offer?.price ? `${offer.price} ${offer.priceCurrency || ''}` : null,
        descriptionLength: productSchema?.description?.length || 0,
        raw: flatJsonLd,
        quality
      }
    };
  } catch (e) {
    console.log(`  ❌ Error: ${e}`);
    return null;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  RETRY ANALYSIS - WITH MANUAL UNBLOCK SUPPORT');
  console.log('======================================================================');
  console.log('\n  I will pause when bot detection is encountered.');
  console.log('  Please unblock pages in the browser when prompted.\n');

  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('Connected to Chrome via CDP\n');
  } catch (e) {
    console.error('Failed to connect to Chrome.');
    process.exit(1);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  const results: Record<string, any[]> = {};

  for (const [brand, urls] of Object.entries(RETRY_PRODUCTS)) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ${brand}`);
    console.log('='.repeat(70));

    results[brand] = [];

    for (let i = 0; i < urls.length; i++) {
      console.log(`\n[${i + 1}/${urls.length}]`);
      const result = await analyzeProduct(page, urls[i], brand);
      if (result) {
        results[brand].push(result);
      }
    }

    // Summary for this brand
    const products = results[brand];
    if (products.length > 0) {
      const avgScore = Math.round(products.reduce((sum, p) => sum + p.jsonLd.quality.score, 0) / products.length);
      const withRating = products.filter(p => p.jsonLd.hasAggregateRating).length;
      const withPrice = products.filter(p => p.jsonLd.hasPrice).length;

      console.log(`\n  ${brand} SUMMARY:`);
      console.log(`  ${'─'.repeat(50)}`);
      console.log(`  Products analyzed: ${products.length}`);
      console.log(`  Average Score: ${avgScore}/100`);
      console.log(`  With AggregateRating: ${withRating}/${products.length}`);
      console.log(`  With Price: ${withPrice}/${products.length}`);
    }
  }

  // Save results
  const outputPath = '/Users/edf/bentham/repository/results/glu/deckers-us-visibility/catalog-retry-results.json';
  fs.writeFileSync(outputPath, JSON.stringify({
    studyName: 'Catalog Retry Analysis',
    timestamp: new Date().toISOString(),
    results
  }, null, 2));

  console.log(`\n\n💾 Results saved to: ${outputPath}`);

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(70) + '\n');

  for (const [brand, products] of Object.entries(results)) {
    if (products.length > 0) {
      const avgScore = Math.round(products.reduce((sum: number, p: any) => sum + p.jsonLd.quality.score, 0) / products.length);
      const withRating = products.filter((p: any) => p.jsonLd.hasAggregateRating).length;
      console.log(`  ${brand.padEnd(10)} Avg: ${avgScore}/100  |  Ratings: ${withRating}/${products.length}`);
    } else {
      console.log(`  ${brand.padEnd(10)} No products analyzed`);
    }
  }

  await page.close();
}

main().catch(console.error);
