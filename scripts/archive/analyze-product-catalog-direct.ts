import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';

// Comprehensive list of product URLs for each brand
const PRODUCT_URLS: Record<string, { urls: string[], competitor: boolean }> = {
  'HOKA': {
    competitor: false,
    urls: [
      // Road Running
      'https://www.hoka.com/en/us/mens-road/bondi-8/1123202.html',
      'https://www.hoka.com/en/us/mens-road/clifton-9/1127895.html',
      'https://www.hoka.com/en/us/mens-road/arahi-7/1147850.html',
      'https://www.hoka.com/en/us/mens-road/mach-6/1147790.html',
      'https://www.hoka.com/en/us/mens-road/rincon-4/1155040.html',
      'https://www.hoka.com/en/us/womens-road/bondi-8/1127952.html',
      'https://www.hoka.com/en/us/womens-road/clifton-9/1127896.html',
      'https://www.hoka.com/en/us/womens-road/gaviota-5/1127932.html',
      // Trail Running
      'https://www.hoka.com/en/us/mens-trail/speedgoat-6/1160053.html',
      'https://www.hoka.com/en/us/mens-trail/challenger-atr-7/1134497.html',
      'https://www.hoka.com/en/us/womens-trail/speedgoat-6/1160054.html',
      // Walking/Lifestyle
      'https://www.hoka.com/en/us/mens-lifestyle/transport/1159260.html',
      'https://www.hoka.com/en/us/womens-lifestyle/transport/1159261.html',
      // Recovery
      'https://www.hoka.com/en/us/mens-sandals-and-slides/ora-recovery-slide-3/1135061.html',
      'https://www.hoka.com/en/us/womens-sandals-and-slides/ora-recovery-slide-3/1135062.html'
    ]
  },
  'UGG': {
    competitor: false,
    urls: [
      // Classic Boots
      'https://www.ugg.com/women-boots-classic-boots/classic-short-ii-boot/1016223.html',
      'https://www.ugg.com/women-boots-classic-boots/classic-mini-ii-boot/1016222.html',
      'https://www.ugg.com/women-boots-classic-boots/classic-tall-ii-boot/1016224.html',
      'https://www.ugg.com/women-boots-classic-boots/classic-ultra-mini-boot/1116109.html',
      'https://www.ugg.com/men-boots/classic-short-boot/5800.html',
      // Slippers
      'https://www.ugg.com/men-slippers/tasman-slipper/5950.html',
      'https://www.ugg.com/women-slippers/scuffette-ii-slipper/1106872.html',
      'https://www.ugg.com/women-slippers/coquette-slipper/5125.html',
      'https://www.ugg.com/men-slippers/ascot-slipper/5775.html',
      'https://www.ugg.com/women-slippers/tasman-slipper/5955.html',
      // Weather Boots
      'https://www.ugg.com/women-boots-weather-boots/adirondack-iii-boot/1095141.html',
      'https://www.ugg.com/men-boots/butte-boot/5521.html',
      // Casual
      'https://www.ugg.com/women-sandals/goldenstar-platform-slide/1138250.html',
      'https://www.ugg.com/men-shoes/neumel-boot/3236.html',
      'https://www.ugg.com/women-shoes/neumel-platform-boot/1130841.html'
    ]
  },
  'Teva': {
    competitor: false,
    urls: [
      // Sandals
      'https://www.teva.com/women-sandals/hurricane-xlt2/1019235.html',
      'https://www.teva.com/women-sandals/original-universal/1003987.html',
      'https://www.teva.com/women-sandals/tirra/4266.html',
      'https://www.teva.com/men-sandals/hurricane-xlt2/1019234.html',
      'https://www.teva.com/men-sandals/original-universal/1004006.html',
      'https://www.teva.com/women-sandals/midform-universal/1090969.html',
      'https://www.teva.com/men-sandals/terra-fi-5-universal/1102456.html',
      'https://www.teva.com/women-sandals/voya-infinity/1019622.html',
      // Water Shoes
      'https://www.teva.com/men-shoes/grandview-gtx/1134094.html',
      'https://www.teva.com/women-shoes/grandview-gtx/1134095.html',
      // Hiking
      'https://www.teva.com/men-shoes/ridgeview-mid/1116626.html',
      'https://www.teva.com/women-shoes/ridgeview-mid/1116627.html',
      // Slippers
      'https://www.teva.com/women-slippers/reember-moc/1129582.html',
      'https://www.teva.com/men-slippers/reember-moc/1125472.html',
      'https://www.teva.com/women-slippers/reember-terrain-mid/1134358.html'
    ]
  },
  'Brooks': {
    competitor: true,
    urls: [
      // Road Running
      'https://www.brooksrunning.com/en_us/ghost-16-mens-road-running-shoe/110418.html',
      'https://www.brooksrunning.com/en_us/glycerin-21-mens-road-running-shoe/110419.html',
      'https://www.brooksrunning.com/en_us/adrenaline-gts-24-mens-road-running-shoe/110401.html',
      'https://www.brooksrunning.com/en_us/ghost-16-womens-road-running-shoe/120407.html',
      'https://www.brooksrunning.com/en_us/glycerin-21-womens-road-running-shoe/120408.html',
      'https://www.brooksrunning.com/en_us/adrenaline-gts-24-womens-road-running-shoe/120390.html',
      // Stability
      'https://www.brooksrunning.com/en_us/beast-20-mens-road-running-shoe/110327.html',
      'https://www.brooksrunning.com/en_us/ariel-20-womens-road-running-shoe/120315.html',
      // Trail
      'https://www.brooksrunning.com/en_us/cascadia-18-mens-trail-running-shoe/110424.html',
      'https://www.brooksrunning.com/en_us/cascadia-18-womens-trail-running-shoe/120413.html',
      // Racing
      'https://www.brooksrunning.com/en_us/hyperion-max-2-mens-performance-running-shoe/110430.html',
      'https://www.brooksrunning.com/en_us/hyperion-max-2-womens-performance-running-shoe/120419.html',
      // Walking
      'https://www.brooksrunning.com/en_us/addiction-walker-2-mens-walking-shoe/110318.html',
      'https://www.brooksrunning.com/en_us/addiction-walker-2-womens-walking-shoe/120307.html',
      'https://www.brooksrunning.com/en_us/launch-gts-10-mens-running-shoe/110421.html'
    ]
  },
  'Sorel': {
    competitor: true,
    urls: [
      // Winter Boots
      'https://www.sorel.com/p/mens-caribou-boot-NM1000.html',
      'https://www.sorel.com/p/womens-joan-of-arctic-boot-1855131.html',
      'https://www.sorel.com/p/womens-kinetic-impact-conquest-boot-2058941.html',
      'https://www.sorel.com/p/mens-caribou-wool-boot-NM2158.html',
      'https://www.sorel.com/p/womens-winter-carnival-boot-NL1495.html',
      'https://www.sorel.com/p/womens-tofino-ii-boot-1758231.html',
      'https://www.sorel.com/p/womens-kinetic-impact-short-boot-2058831.html',
      // Fashion Boots
      'https://www.sorel.com/p/womens-explorer-next-boot-2058551.html',
      'https://www.sorel.com/p/womens-out-n-about-iii-classic-boot-1951331.html',
      'https://www.sorel.com/p/mens-explorer-next-boot-2058331.html',
      // Casual
      'https://www.sorel.com/p/womens-kinetic-rnegd-lace-sneaker-2058961.html',
      'https://www.sorel.com/p/womens-kinetic-rnegd-cozy-boot-2061431.html',
      // Slippers
      'https://www.sorel.com/p/womens-go-mail-run-slipper-2060491.html',
      'https://www.sorel.com/p/mens-go-mail-run-slipper-2060071.html',
      'https://www.sorel.com/p/womens-kinetic-breakthru-day-lace-1966521.html'
    ]
  },
  'Keen': {
    competitor: true,
    urls: [
      // Sandals
      'https://www.keenfootwear.com/p/M-NEWPORT-H2.html',
      'https://www.keenfootwear.com/p/M-CLEARWATER-CNX.html',
      'https://www.keenfootwear.com/p/W-WHISPER.html',
      'https://www.keenfootwear.com/p/W-NEWPORT-H2.html',
      'https://www.keenfootwear.com/p/M-ZERRAPORT-II.html',
      'https://www.keenfootwear.com/p/W-CLEARWATER-CNX.html',
      'https://www.keenfootwear.com/p/M-UNEEK.html',
      'https://www.keenfootwear.com/p/W-UNEEK.html',
      // Hiking
      'https://www.keenfootwear.com/p/M-TARGHEE-III-WP.html',
      'https://www.keenfootwear.com/p/W-TARGHEE-III-WP.html',
      'https://www.keenfootwear.com/p/M-CIRCADIA-MID-WP.html',
      'https://www.keenfootwear.com/p/W-CIRCADIA-MID-WP.html',
      // Work
      'https://www.keenfootwear.com/p/M-LANSING-MID-WP-STEEL-TOE.html',
      'https://www.keenfootwear.com/p/M-CINCINNATI-6-WP-COMP-TOE.html',
      'https://www.keenfootwear.com/p/W-ATLANTA-II-COOLER-WP-STEEL-TOE.html'
    ]
  }
};

interface JsonLdAnalysis {
  found: boolean;
  count: number;
  types: string[];
  hasProduct: boolean;
  hasBrand: boolean;
  brandValue: string | null;
  hasOffer: boolean;
  hasPriceInOffer: boolean;
  priceValue: string | null;
  hasAvailability: boolean;
  hasReview: boolean;
  reviewCount: number;
  hasAggregateRating: boolean;
  ratingValue: number | null;
  ratingCount: number | null;
  hasDescription: boolean;
  descriptionLength: number;
  descriptionSample: string;
  hasImages: boolean;
  imageCount: number;
  hasSku: boolean;
  hasMpn: boolean;
  hasGtin: boolean;
  hasCategory: boolean;
  hasColor: boolean;
  hasMaterial: boolean;
  raw: any[];
  quality: {
    score: number;
    grade: string;
    issues: string[];
    strengths: string[];
  };
}

function evaluateJsonLdQuality(jsonLd: any[]): JsonLdAnalysis['quality'] {
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

  // Core fields (40 points)
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

  // Brand (10 points)
  if (productSchema.brand?.['@type'] === 'Brand') { score += 10; strengths.push('Brand schema proper'); }
  else if (productSchema.brand) { score += 5; issues.push('Brand not fully structured'); }
  else { issues.push('Missing brand'); }

  // Offer (15 points)
  const offer = productSchema.offers?.[0] || productSchema.offers;
  if (offer) {
    if (offer['@type']) { score += 5; strengths.push('Offer schema'); }
    if (offer.price && offer.priceCurrency) { score += 5; strengths.push('Price + currency'); }
    else if (offer.price) { score += 2; issues.push('Missing currency'); }
    else { issues.push('Missing price'); }
    if (offer.availability) { score += 5; strengths.push('Availability'); }
    else { issues.push('Missing availability'); }
  } else { issues.push('Missing offers'); }

  // Reviews & Ratings (20 points)
  if (productSchema.aggregateRating?.ratingValue && productSchema.aggregateRating?.reviewCount) {
    score += 15; strengths.push(`AggregateRating (${productSchema.aggregateRating.ratingValue}★, ${productSchema.aggregateRating.reviewCount} reviews)`);
  } else if (productSchema.aggregateRating?.ratingValue) {
    score += 10; issues.push('AggregateRating missing review count');
  } else { issues.push('Missing AggregateRating - CRITICAL for AI'); }

  if (productSchema.review) {
    const count = Array.isArray(productSchema.review) ? productSchema.review.length : 1;
    score += 5; strengths.push(`Individual reviews (${count})`);
  }

  // Additional (15 points)
  if (productSchema.category) { score += 3; strengths.push('Category'); }
  if (productSchema.color) { score += 2; strengths.push('Color'); }
  if (productSchema.material) { score += 2; strengths.push('Material'); }
  if (productSchema.additionalProperty) { score += 3; strengths.push('Additional properties'); }

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

async function analyzeProduct(page: Page, url: string): Promise<any | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);

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

    const analysis: JsonLdAnalysis = {
      found: flatJsonLd.length > 0,
      count: flatJsonLd.length,
      types: flatJsonLd.map((item: any) => item['@type']).filter(Boolean),
      hasProduct: !!productSchema,
      hasBrand: !!productSchema?.brand,
      brandValue: productSchema?.brand?.name || (typeof productSchema?.brand === 'string' ? productSchema.brand : null),
      hasOffer: !!offer,
      hasPriceInOffer: !!(offer?.price),
      priceValue: offer?.price ? `${offer.price} ${offer.priceCurrency || ''}`.trim() : null,
      hasAvailability: !!offer?.availability,
      hasReview: !!productSchema?.review,
      reviewCount: Array.isArray(productSchema?.review) ? productSchema.review.length : (productSchema?.review ? 1 : 0),
      hasAggregateRating: !!productSchema?.aggregateRating,
      ratingValue: productSchema?.aggregateRating?.ratingValue || null,
      ratingCount: productSchema?.aggregateRating?.reviewCount || null,
      hasDescription: !!productSchema?.description,
      descriptionLength: productSchema?.description?.length || 0,
      descriptionSample: productSchema?.description?.substring(0, 200) || '',
      hasImages: !!productSchema?.image,
      imageCount: Array.isArray(productSchema?.image) ? productSchema.image.length : (productSchema?.image ? 1 : 0),
      hasSku: !!(productSchema?.sku || productSchema?.productID),
      hasMpn: !!productSchema?.mpn,
      hasGtin: !!(productSchema?.gtin || productSchema?.gtin13),
      hasCategory: !!productSchema?.category,
      hasColor: !!productSchema?.color,
      hasMaterial: !!productSchema?.material,
      raw: flatJsonLd,
      quality
    };

    // Get product name from page
    const productName = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1?.textContent?.trim() || '';
    });

    return { url, productName, jsonLd: analysis };
  } catch (e) {
    console.log(`    Error: ${e}`);
    return null;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  FULL PRODUCT CATALOG JSON-LD ANALYSIS');
  console.log('======================================================================\n');

  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('Connected to Chrome via CDP\n');
  } catch (e) {
    console.error('Failed to connect to Chrome. Please run:');
    console.error('/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile --no-first-run &');
    process.exit(1);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  const allResults: Record<string, any> = {};

  for (const [brand, config] of Object.entries(PRODUCT_URLS)) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ${brand} ${config.competitor ? '(COMPETITOR)' : '(DECKERS)'}`);
    console.log('='.repeat(70));

    const products: any[] = [];
    const issueCounter: Record<string, number> = {};
    const strengthCounter: Record<string, number> = {};

    for (let i = 0; i < config.urls.length; i++) {
      const url = config.urls[i];
      process.stdout.write(`  [${i + 1}/${config.urls.length}] `);

      const result = await analyzeProduct(page, url);
      if (result) {
        products.push(result);

        for (const issue of result.jsonLd.quality.issues) {
          issueCounter[issue] = (issueCounter[issue] || 0) + 1;
        }
        for (const strength of result.jsonLd.quality.strengths) {
          strengthCounter[strength] = (strengthCounter[strength] || 0) + 1;
        }

        const name = result.productName.substring(0, 35).padEnd(35);
        const grade = result.jsonLd.quality.grade;
        const score = result.jsonLd.quality.score;
        const rating = result.jsonLd.hasAggregateRating ? `★${result.jsonLd.ratingValue}` : 'No rating';
        console.log(`${name} | ${grade} (${score}) | ${rating}`);
      } else {
        console.log('FAILED');
      }
    }

    // Calculate summary
    const count = products.length;
    const avgScore = Math.round(products.reduce((sum, p) => sum + p.jsonLd.quality.score, 0) / count);
    const jsonLdPresent = products.filter(p => p.jsonLd.found).length;
    const productSchema = products.filter(p => p.jsonLd.hasProduct).length;
    const aggregateRating = products.filter(p => p.jsonLd.hasAggregateRating).length;
    const reviews = products.filter(p => p.jsonLd.hasReview).length;
    const avgDescLen = Math.round(products.reduce((sum, p) => sum + p.jsonLd.descriptionLength, 0) / count);

    let avgGrade: string;
    if (avgScore >= 90) avgGrade = 'A+';
    else if (avgScore >= 80) avgGrade = 'A';
    else if (avgScore >= 70) avgGrade = 'B+';
    else if (avgScore >= 60) avgGrade = 'B';
    else if (avgScore >= 50) avgGrade = 'C';
    else if (avgScore >= 40) avgGrade = 'D';
    else avgGrade = 'F';

    console.log(`\n  ${brand} SUMMARY:`);
    console.log(`  ${'─'.repeat(55)}`);
    console.log(`  Average Score: ${avgScore}/100 (Grade: ${avgGrade})`);
    console.log(`  JSON-LD Present: ${jsonLdPresent}/${count} (${Math.round(jsonLdPresent/count*100)}%)`);
    console.log(`  Product Schema: ${productSchema}/${count} (${Math.round(productSchema/count*100)}%)`);
    console.log(`  AggregateRating: ${aggregateRating}/${count} (${Math.round(aggregateRating/count*100)}%)`);
    console.log(`  Reviews in Schema: ${reviews}/${count} (${Math.round(reviews/count*100)}%)`);
    console.log(`  Avg Description: ${avgDescLen} chars`);

    const sortedIssues = Object.entries(issueCounter).sort((a, b) => b[1] - a[1]);
    if (sortedIssues.length > 0) {
      console.log(`\n  Top Issues:`);
      for (const [issue, cnt] of sortedIssues.slice(0, 4)) {
        const pct = Math.round(cnt / count * 100);
        console.log(`    ⚠️  ${issue} (${cnt}/${count} = ${pct}%)`);
      }
    }

    allResults[brand] = {
      competitor: config.competitor,
      productsAnalyzed: count,
      avgScore,
      avgGrade,
      jsonLdPresent,
      productSchema,
      aggregateRating,
      reviews,
      avgDescriptionLength: avgDescLen,
      issues: sortedIssues,
      products
    };
  }

  // Final comparison
  console.log('\n\n' + '='.repeat(70));
  console.log('  FINAL COMPARISON');
  console.log('='.repeat(70));

  const sorted = Object.entries(allResults).sort((a, b) => b[1].avgScore - a[1].avgScore);

  console.log('\n  RANKINGS BY JSON-LD QUALITY:');
  console.log('  ' + '─'.repeat(66));
  console.log('  Rank  Brand          Score   Grade   Product   Ratings   Reviews   Desc');
  console.log('  ' + '─'.repeat(66));

  sorted.forEach(([brand, data], i) => {
    const tag = data.competitor ? '⚪' : '🔵';
    const name = brand.padEnd(12);
    const score = String(data.avgScore).padStart(3);
    const grade = data.avgGrade.padEnd(5);
    const prod = `${Math.round(data.productSchema/data.productsAnalyzed*100)}%`.padStart(7);
    const rating = `${Math.round(data.aggregateRating/data.productsAnalyzed*100)}%`.padStart(7);
    const rev = `${Math.round(data.reviews/data.productsAnalyzed*100)}%`.padStart(7);
    const desc = `${data.avgDescriptionLength}c`.padStart(5);
    console.log(`  ${i + 1}.    ${tag} ${name} ${score}     ${grade}   ${prod}   ${rating}   ${rev}   ${desc}`);
  });

  console.log('\n  CATEGORY MATCHUPS:');
  console.log('  ' + '─'.repeat(66));

  const comparisons = [
    ['HOKA', 'Brooks', 'Running'],
    ['UGG', 'Sorel', 'Boots'],
    ['Teva', 'Keen', 'Sandals']
  ];

  for (const [deckers, comp, category] of comparisons) {
    const d = allResults[deckers];
    const c = allResults[comp];
    if (d && c) {
      const diff = d.avgScore - c.avgScore;
      const winner = diff >= 0 ? deckers : comp;
      const icon = diff >= 0 ? '✅' : '❌';
      console.log(`  ${category.padEnd(10)} ${deckers} (${d.avgScore}) vs ${comp} (${c.avgScore}) → ${icon} ${winner} (${diff >= 0 ? '+' : ''}${diff})`);
    }
  }

  // Save results
  const outputPath = '/Users/edf/bentham/repository/results/glu/deckers-us-visibility/full-catalog-jsonld-analysis.json';
  fs.writeFileSync(outputPath, JSON.stringify({
    studyName: 'Full Product Catalog JSON-LD Analysis',
    timestamp: new Date().toISOString(),
    results: allResults,
    rankings: sorted.map(([brand, data], i) => ({
      rank: i + 1,
      brand,
      competitor: data.competitor,
      score: data.avgScore,
      grade: data.avgGrade
    }))
  }, null, 2));

  console.log(`\n💾 Full results saved to: ${outputPath}`);
  await page.close();
}

main().catch(console.error);
