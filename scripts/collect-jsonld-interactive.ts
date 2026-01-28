import { chromium } from 'playwright';
import * as fs from 'fs';
import * as readline from 'readline';

const OUTPUT_FILE = '/Users/edf/bentham/repository/results/glu/deckers-us-visibility/collected-jsonld.json';

interface CollectedProduct {
  url: string;
  brand: string;
  productName: string;
  timestamp: string;
  score: number;
  grade: string;
  hasRating: boolean;
  ratingValue: number | null;
  reviewCount: number | null;
  hasPrice: boolean;
  price: string | null;
  hasReviews: boolean;
  reviewsInSchema: number;
  descriptionLength: number;
  issues: string[];
  strengths: string[];
  rawJsonLd: any;
}

function waitForInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => { rl.question(prompt, (answer) => { rl.close(); resolve(answer); }); });
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  INTERACTIVE JSON-LD COLLECTOR');
  console.log('═'.repeat(60));
  console.log('\n  Navigate to product pages in Chrome, then press ENTER');
  console.log('  to extract and save the JSON-LD. Type "done" to finish.\n');

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

  // Load existing data if any
  let collected: CollectedProduct[] = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      collected = existing.products || [];
      console.log(`  Loaded ${collected.length} existing products\n`);
    } catch (e) {}
  }

  while (true) {
    const input = await waitForInput('\n  Press ENTER to extract (or type "done" to finish): ');

    if (input.toLowerCase() === 'done') break;

    const pages = context.pages();
    if (pages.length === 0) {
      console.log('  No pages open');
      continue;
    }

    const page = pages[0];
    const url = page.url();

    // Check if already collected
    if (collected.find(p => p.url === url)) {
      console.log('  ⚠️  Already collected this URL');
      continue;
    }

    const title = await page.title();
    console.log(`\n  📄 ${title}`);

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

    if (!productSchema) {
      console.log('  ❌ No Product schema found');
      continue;
    }

    // Evaluate
    let score = 0;
    const issues: string[] = [];
    const strengths: string[] = [];

    if (productSchema.name) { score += 10; strengths.push('Name'); }
    if (productSchema.description?.length > 50) { score += 10; strengths.push(`Desc(${productSchema.description.length}c)`); }
    else { issues.push('No/short description'); }
    if (productSchema.image) { score += 10; strengths.push('Images'); }
    if (productSchema.sku) { score += 5; strengths.push('SKU'); }
    if (productSchema.mpn) { score += 3; strengths.push('MPN'); }
    if (productSchema.brand?.['@type'] === 'Brand') { score += 10; strengths.push('Brand'); }

    const offer = productSchema.offers?.[0] || productSchema.offers;
    if (offer?.price && offer?.priceCurrency) { score += 10; strengths.push(`$${offer.price}`); }
    else { issues.push('No price'); }
    if (offer?.availability) { score += 5; strengths.push('Avail'); }

    const hasRating = !!productSchema.aggregateRating?.ratingValue;
    if (hasRating) {
      score += 15;
      strengths.push(`★${productSchema.aggregateRating.ratingValue}`);
    } else { issues.push('No AggregateRating'); }

    const hasReviews = !!productSchema.review;
    if (hasReviews) {
      const count = Array.isArray(productSchema.review) ? productSchema.review.length : 1;
      score += 5;
      strengths.push(`${count} reviews`);
    }

    let grade: string;
    if (score >= 90) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B+';
    else if (score >= 60) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'F';

    // Determine brand
    let brand = 'Unknown';
    if (url.includes('hoka.com')) brand = 'HOKA';
    else if (url.includes('ugg.com')) brand = 'UGG';
    else if (url.includes('teva.com')) brand = 'Teva';
    else if (url.includes('sorel.com')) brand = 'Sorel';
    else if (url.includes('keenfootwear.com')) brand = 'Keen';
    else if (url.includes('brooksrunning.com')) brand = 'Brooks';

    const product: CollectedProduct = {
      url,
      brand,
      productName: productSchema.name || title,
      timestamp: new Date().toISOString(),
      score,
      grade,
      hasRating,
      ratingValue: productSchema.aggregateRating?.ratingValue || null,
      reviewCount: productSchema.aggregateRating?.reviewCount || null,
      hasPrice: !!(offer?.price),
      price: offer?.price ? `${offer.price} ${offer.priceCurrency || ''}` : null,
      hasReviews,
      reviewsInSchema: Array.isArray(productSchema.review) ? productSchema.review.length : (productSchema.review ? 1 : 0),
      descriptionLength: productSchema.description?.length || 0,
      issues,
      strengths,
      rawJsonLd: productSchema
    };

    collected.push(product);

    console.log(`  ✅ Grade: ${grade} (${score}/100) | ${strengths.join(', ')}`);
    if (issues.length) console.log(`     Issues: ${issues.join(', ')}`);

    // Save after each collection
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      totalProducts: collected.length,
      products: collected
    }, null, 2));
    console.log(`  💾 Saved (${collected.length} total)`);
  }

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log('  COLLECTION SUMMARY');
  console.log('═'.repeat(60));

  const byBrand: Record<string, CollectedProduct[]> = {};
  for (const p of collected) {
    if (!byBrand[p.brand]) byBrand[p.brand] = [];
    byBrand[p.brand].push(p);
  }

  for (const [brand, products] of Object.entries(byBrand)) {
    const avgScore = Math.round(products.reduce((s, p) => s + p.score, 0) / products.length);
    const withRating = products.filter(p => p.hasRating).length;
    const withPrice = products.filter(p => p.hasPrice).length;
    console.log(`\n  ${brand}: ${products.length} products, avg ${avgScore}/100`);
    console.log(`    Rating: ${withRating}/${products.length} | Price: ${withPrice}/${products.length}`);
  }

  console.log(`\n  💾 All data saved to: ${OUTPUT_FILE}\n`);
}

main().catch(console.error);
