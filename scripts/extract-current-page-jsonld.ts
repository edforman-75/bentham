import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  if (pages.length === 0) {
    console.log('No pages open');
    return;
  }

  const page = pages[0];
  const url = page.url();
  const title = await page.title();

  console.log(`\n📄 Current Page: ${title}`);
  console.log(`🔗 URL: ${url}\n`);

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
    console.log('❌ No Product schema found on this page');
    console.log(`   Found schemas: ${flatJsonLd.map(i => i['@type']).join(', ') || 'none'}`);
    return;
  }

  // Evaluate quality
  let score = 0;
  const issues: string[] = [];
  const strengths: string[] = [];

  if (productSchema.name) { score += 10; strengths.push('Name'); }
  if (productSchema.description?.length > 50) { score += 10; strengths.push(`Description (${productSchema.description.length}c)`); }
  else if (productSchema.description) { score += 5; issues.push('Short description'); }
  else { issues.push('No description'); }

  if (productSchema.image) { score += 10; strengths.push('Images'); }
  if (productSchema.sku) { score += 5; strengths.push('SKU'); }
  if (productSchema.mpn) { score += 3; strengths.push('MPN'); }
  if (productSchema.brand?.['@type'] === 'Brand') { score += 10; strengths.push('Brand'); }
  else if (productSchema.brand) { score += 5; }

  const offer = productSchema.offers?.[0] || productSchema.offers;
  if (offer?.price && offer?.priceCurrency) { score += 10; strengths.push(`Price ($${offer.price})`); }
  else if (offer?.price) { score += 5; issues.push('No currency'); }
  else { issues.push('No price'); }
  if (offer?.availability) { score += 5; strengths.push('Availability'); }

  if (productSchema.aggregateRating?.ratingValue) {
    score += 15;
    strengths.push(`Rating (${productSchema.aggregateRating.ratingValue}★, ${productSchema.aggregateRating.reviewCount || '?'} reviews)`);
  } else { issues.push('No AggregateRating'); }

  if (productSchema.review) {
    const count = Array.isArray(productSchema.review) ? productSchema.review.length : 1;
    score += 5;
    strengths.push(`Reviews (${count})`);
  }

  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B+';
  else if (score >= 60) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  console.log('═'.repeat(60));
  console.log(`  PRODUCT: ${productSchema.name}`);
  console.log('═'.repeat(60));
  console.log(`  Grade: ${grade} (${score}/100)`);
  console.log(`  Strengths: ${strengths.join(', ')}`);
  if (issues.length) console.log(`  Issues: ${issues.join(', ')}`);

  console.log('\n─── JSON-LD MARKUP ───\n');
  console.log(JSON.stringify(productSchema, null, 2));
}

main().catch(console.error);
