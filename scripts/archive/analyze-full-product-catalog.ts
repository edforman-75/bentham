import { chromium, Browser, Page } from 'playwright';

// Configuration
const BRANDS_TO_ANALYZE = [
  // Deckers brands
  {
    brand: 'HOKA',
    sitemapUrl: 'https://www.hoka.com/en/us/sitemap.xml',
    productUrlPattern: /hoka\.com\/en\/us\/[^\/]+\/[^\/]+\/\d+\.html/,
    competitor: false
  },
  {
    brand: 'UGG',
    sitemapUrl: 'https://www.ugg.com/sitemap.xml',
    productUrlPattern: /ugg\.com\/[^\/]+-[^\/]+\/\d+\.html/,
    competitor: false
  },
  {
    brand: 'Teva',
    sitemapUrl: 'https://www.teva.com/sitemap.xml',
    productUrlPattern: /teva\.com\/[^\/]+-[^\/]+\/\d+\.html/,
    competitor: false
  },
  // Competitors
  {
    brand: 'Brooks',
    sitemapUrl: 'https://www.brooksrunning.com/sitemap.xml',
    productUrlPattern: /brooksrunning\.com\/en_us\/[^\/]+-shoe\/\d+\.html/,
    competitor: true
  },
  {
    brand: 'Sorel',
    sitemapUrl: 'https://www.sorel.com/sitemap.xml',
    productUrlPattern: /sorel\.com\/p\/[^\/]+/,
    competitor: true
  },
  {
    brand: 'Keen',
    sitemapUrl: 'https://www.keenfootwear.com/sitemap.xml',
    productUrlPattern: /keenfootwear\.com\/p\/[^\/]+/,
    competitor: true
  }
];

interface JsonLdAnalysis {
  found: boolean;
  count: number;
  types: string[];
  hasProduct: boolean;
  hasBrand: boolean;
  hasOffer: boolean;
  hasPriceInOffer: boolean;
  hasAvailability: boolean;
  hasReview: boolean;
  hasAggregateRating: boolean;
  hasDescription: boolean;
  descriptionLength: number;
  hasImages: boolean;
  imageCount: number;
  hasSku: boolean;
  hasMpn: boolean;
  hasGtin: boolean;
  raw: any[];
  quality: {
    score: number;
    grade: string;
    issues: string[];
    strengths: string[];
  };
}

interface ProductAnalysis {
  url: string;
  productName: string;
  timestamp: string;
  jsonLd: JsonLdAnalysis;
  meta: {
    title: string;
    description: string;
    descriptionLength: number;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    canonical: string;
  };
}

interface BrandSummary {
  brand: string;
  competitor: boolean;
  totalProducts: number;
  productsAnalyzed: number;
  avgJsonLdScore: number;
  avgJsonLdGrade: string;
  jsonLdPresent: number;
  productSchemaPresent: number;
  aggregateRatingPresent: number;
  reviewsPresent: number;
  avgDescriptionLength: number;
  commonIssues: { issue: string; count: number }[];
  commonStrengths: { strength: string; count: number }[];
  sampleProducts: ProductAnalysis[];
}

function evaluateJsonLdQuality(jsonLd: any[]): JsonLdAnalysis['quality'] {
  const issues: string[] = [];
  const strengths: string[] = [];
  let score = 0;

  if (!jsonLd || jsonLd.length === 0) {
    return {
      score: 0,
      grade: 'F',
      issues: ['No JSON-LD structured data found'],
      strengths: []
    };
  }

  const productSchema = jsonLd.find((item: any) => item['@type'] === 'Product');

  if (!productSchema) {
    return {
      score: 10,
      grade: 'F',
      issues: ['JSON-LD present but no Product schema'],
      strengths: ['Has some structured data']
    };
  }

  // Core Product fields (40 points max)
  if (productSchema.name) {
    score += 10;
    strengths.push('Product name present');
  } else {
    issues.push('Missing product name');
  }

  if (productSchema.description && productSchema.description.length > 50) {
    score += 10;
    strengths.push(`Product description present (${productSchema.description.length} chars)`);
  } else if (productSchema.description) {
    score += 5;
    issues.push(`Description too short (${productSchema.description.length} chars)`);
  } else {
    issues.push('Missing product description');
  }

  if (productSchema.image) {
    const imageCount = Array.isArray(productSchema.image) ? productSchema.image.length : 1;
    score += 10;
    strengths.push(`Product images present (${imageCount})`);
  } else {
    issues.push('Missing product images');
  }

  if (productSchema.sku || productSchema.productID) {
    score += 5;
    strengths.push('SKU/Product ID present');
  } else {
    issues.push('Missing SKU/Product ID');
  }

  if (productSchema.mpn) {
    score += 3;
    strengths.push('MPN present');
  }

  if (productSchema.gtin || productSchema.gtin13 || productSchema.gtin14 || productSchema.isbn) {
    score += 2;
    strengths.push('GTIN/barcode present');
  }

  // Brand (10 points max)
  if (productSchema.brand) {
    if (typeof productSchema.brand === 'object' && productSchema.brand['@type'] === 'Brand') {
      score += 10;
      strengths.push('Brand schema properly structured');
    } else if (typeof productSchema.brand === 'string' || productSchema.brand.name) {
      score += 5;
      issues.push('Brand present but not fully structured');
    }
  } else {
    issues.push('Missing brand information');
  }

  // Offer/Pricing (15 points max)
  if (productSchema.offers) {
    const offer = Array.isArray(productSchema.offers) ? productSchema.offers[0] : productSchema.offers;

    if (offer['@type'] === 'Offer' || offer['@type'] === 'AggregateOffer') {
      score += 5;
      strengths.push('Offer schema present');
    }

    if (offer.price && offer.priceCurrency) {
      score += 5;
      strengths.push('Price and currency present');
    } else if (offer.price) {
      score += 2;
      issues.push('Price present but missing currency');
    } else {
      issues.push('Missing price in offer');
    }

    if (offer.availability) {
      score += 5;
      strengths.push('Availability status present');
    } else {
      issues.push('Missing availability status');
    }
  } else {
    issues.push('Missing offer/pricing information');
  }

  // Reviews & Ratings (20 points max)
  if (productSchema.aggregateRating) {
    const rating = productSchema.aggregateRating;
    if (rating.ratingValue && rating.reviewCount) {
      score += 15;
      strengths.push(`AggregateRating present (${rating.ratingValue}/5, ${rating.reviewCount} reviews)`);
    } else if (rating.ratingValue) {
      score += 10;
      issues.push('AggregateRating missing review count');
    }
  } else {
    issues.push('Missing AggregateRating - critical for AI recommendations');
  }

  if (productSchema.review) {
    const reviewCount = Array.isArray(productSchema.review) ? productSchema.review.length : 1;
    score += 5;
    strengths.push(`Individual reviews in schema (${reviewCount})`);
  }

  // Additional valuable fields (15 points max)
  if (productSchema.category) {
    score += 3;
    strengths.push('Product category present');
  }

  if (productSchema.color) {
    score += 2;
    strengths.push('Color attribute present');
  }

  if (productSchema.material) {
    score += 2;
    strengths.push('Material attribute present');
  }

  if (productSchema.additionalProperty || productSchema.size) {
    score += 3;
    strengths.push('Additional properties present');
  }

  // Determine grade
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

async function getProductUrls(page: Page, brand: typeof BRANDS_TO_ANALYZE[0], maxProducts: number = 50): Promise<string[]> {
  const urls: string[] = [];

  console.log(`  Discovering products for ${brand.brand}...`);

  // Try sitemap first
  try {
    await page.goto(brand.sitemapUrl, { waitUntil: 'networkidle', timeout: 30000 });
    const content = await page.content();

    // Extract URLs from sitemap
    const urlMatches = content.match(/<loc>([^<]+)<\/loc>/g);
    if (urlMatches) {
      for (const match of urlMatches) {
        const url = match.replace(/<\/?loc>/g, '');
        if (brand.productUrlPattern.test(url)) {
          urls.push(url);
          if (urls.length >= maxProducts) break;
        }
      }
    }
  } catch (e) {
    console.log(`  Sitemap failed, trying category pages...`);
  }

  // If sitemap didn't work, try category pages
  if (urls.length < 10) {
    const categoryPages: Record<string, string[]> = {
      'HOKA': [
        'https://www.hoka.com/en/us/mens-road/',
        'https://www.hoka.com/en/us/womens-road/',
        'https://www.hoka.com/en/us/mens-trail/',
        'https://www.hoka.com/en/us/womens-trail/'
      ],
      'UGG': [
        'https://www.ugg.com/women-boots/',
        'https://www.ugg.com/men-boots/',
        'https://www.ugg.com/women-slippers/',
        'https://www.ugg.com/men-slippers/'
      ],
      'Teva': [
        'https://www.teva.com/women-sandals/',
        'https://www.teva.com/men-sandals/',
        'https://www.teva.com/women-shoes/',
        'https://www.teva.com/men-shoes/'
      ],
      'Brooks': [
        'https://www.brooksrunning.com/en_us/mens-running-shoes/',
        'https://www.brooksrunning.com/en_us/womens-running-shoes/'
      ],
      'Sorel': [
        'https://www.sorel.com/c/women/boots/',
        'https://www.sorel.com/c/men/boots/'
      ],
      'Keen': [
        'https://www.keenfootwear.com/c/women/sandals/',
        'https://www.keenfootwear.com/c/men/sandals/'
      ]
    };

    const pages = categoryPages[brand.brand] || [];
    for (const categoryUrl of pages) {
      if (urls.length >= maxProducts) break;

      try {
        await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Get all product links
        const links = await page.$$eval('a[href*=".html"]', (anchors) =>
          anchors.map(a => a.href).filter(href => /\/\d+\.html/.test(href))
        );

        for (const link of links) {
          if (!urls.includes(link) && urls.length < maxProducts) {
            urls.push(link);
          }
        }
      } catch (e) {
        console.log(`  Failed to load ${categoryUrl}`);
      }
    }
  }

  console.log(`  Found ${urls.length} products for ${brand.brand}`);
  return [...new Set(urls)].slice(0, maxProducts);
}

async function analyzeProduct(page: Page, url: string): Promise<ProductAnalysis | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Extract JSON-LD
    const jsonLdScripts = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
      scripts.map(s => {
        try {
          return JSON.parse(s.textContent || '');
        } catch {
          return null;
        }
      }).filter(Boolean)
    );

    // Flatten @graph structures
    const flatJsonLd: any[] = [];
    for (const item of jsonLdScripts) {
      if (item['@graph']) {
        flatJsonLd.push(...item['@graph']);
      } else {
        flatJsonLd.push(item);
      }
    }

    const productSchema = flatJsonLd.find((item: any) => item['@type'] === 'Product');
    const quality = evaluateJsonLdQuality(flatJsonLd);

    // Extract meta
    const meta = await page.evaluate(() => {
      const getMeta = (name: string) =>
        document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
        document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') || '';

      return {
        title: document.title,
        description: getMeta('description'),
        ogTitle: getMeta('og:title'),
        ogDescription: getMeta('og:description'),
        ogImage: getMeta('og:image'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
      };
    });

    // Get product name from page
    const productName = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1?.textContent?.trim() || '';
    });

    const jsonLdAnalysis: JsonLdAnalysis = {
      found: flatJsonLd.length > 0,
      count: flatJsonLd.length,
      types: flatJsonLd.map((item: any) => item['@type']).filter(Boolean),
      hasProduct: !!productSchema,
      hasBrand: !!(productSchema?.brand),
      hasOffer: !!(productSchema?.offers),
      hasPriceInOffer: !!(productSchema?.offers?.price || productSchema?.offers?.[0]?.price),
      hasAvailability: !!(productSchema?.offers?.availability || productSchema?.offers?.[0]?.availability),
      hasReview: !!(productSchema?.review),
      hasAggregateRating: !!(productSchema?.aggregateRating),
      hasDescription: !!(productSchema?.description),
      descriptionLength: productSchema?.description?.length || 0,
      hasImages: !!(productSchema?.image),
      imageCount: Array.isArray(productSchema?.image) ? productSchema.image.length : (productSchema?.image ? 1 : 0),
      hasSku: !!(productSchema?.sku || productSchema?.productID),
      hasMpn: !!(productSchema?.mpn),
      hasGtin: !!(productSchema?.gtin || productSchema?.gtin13),
      raw: flatJsonLd,
      quality
    };

    return {
      url,
      productName,
      timestamp: new Date().toISOString(),
      jsonLd: jsonLdAnalysis,
      meta: {
        ...meta,
        descriptionLength: meta.description.length
      }
    };
  } catch (e) {
    console.log(`    Error analyzing ${url}: ${e}`);
    return null;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  FULL PRODUCT CATALOG ANALYSIS - JSON-LD QUALITY');
  console.log('======================================================================\n');

  let browser: Browser;

  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('Connected to Chrome via CDP\n');
  } catch (e) {
    console.error('Failed to connect to Chrome. Please ensure Chrome is running with:');
    console.error('/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile --no-first-run &');
    process.exit(1);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  const brandSummaries: BrandSummary[] = [];
  const MAX_PRODUCTS_PER_BRAND = 25; // Analyze up to 25 products per brand

  for (const brandConfig of BRANDS_TO_ANALYZE) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ${brandConfig.brand} ${brandConfig.competitor ? '(COMPETITOR)' : '(DECKERS)'}`);
    console.log('='.repeat(70));

    // Get product URLs
    const productUrls = await getProductUrls(page, brandConfig, MAX_PRODUCTS_PER_BRAND);

    if (productUrls.length === 0) {
      console.log(`  No products found for ${brandConfig.brand}`);
      continue;
    }

    const products: ProductAnalysis[] = [];
    const issueCounter: Record<string, number> = {};
    const strengthCounter: Record<string, number> = {};

    for (let i = 0; i < productUrls.length; i++) {
      const url = productUrls[i];
      process.stdout.write(`  [${i + 1}/${productUrls.length}] Analyzing...`);

      const analysis = await analyzeProduct(page, url);
      if (analysis) {
        products.push(analysis);

        // Count issues and strengths
        for (const issue of analysis.jsonLd.quality.issues) {
          issueCounter[issue] = (issueCounter[issue] || 0) + 1;
        }
        for (const strength of analysis.jsonLd.quality.strengths) {
          strengthCounter[strength] = (strengthCounter[strength] || 0) + 1;
        }

        const grade = analysis.jsonLd.quality.grade;
        const score = analysis.jsonLd.quality.score;
        console.log(` ${analysis.productName.substring(0, 30).padEnd(30)} | Grade: ${grade} (${score})`);
      } else {
        console.log(' FAILED');
      }
    }

    // Calculate summary stats
    const analyzedCount = products.length;
    const avgScore = products.reduce((sum, p) => sum + p.jsonLd.quality.score, 0) / analyzedCount;
    const jsonLdPresent = products.filter(p => p.jsonLd.found).length;
    const productSchemaPresent = products.filter(p => p.jsonLd.hasProduct).length;
    const aggregateRatingPresent = products.filter(p => p.jsonLd.hasAggregateRating).length;
    const reviewsPresent = products.filter(p => p.jsonLd.hasReview).length;
    const avgDescLength = products.reduce((sum, p) => sum + p.jsonLd.descriptionLength, 0) / analyzedCount;

    // Sort issues and strengths by frequency
    const sortedIssues = Object.entries(issueCounter)
      .sort((a, b) => b[1] - a[1])
      .map(([issue, count]) => ({ issue, count }));

    const sortedStrengths = Object.entries(strengthCounter)
      .sort((a, b) => b[1] - a[1])
      .map(([strength, count]) => ({ strength, count }));

    // Determine average grade
    let avgGrade: string;
    if (avgScore >= 90) avgGrade = 'A+';
    else if (avgScore >= 80) avgGrade = 'A';
    else if (avgScore >= 70) avgGrade = 'B+';
    else if (avgScore >= 60) avgGrade = 'B';
    else if (avgScore >= 50) avgGrade = 'C';
    else if (avgScore >= 40) avgGrade = 'D';
    else avgGrade = 'F';

    const summary: BrandSummary = {
      brand: brandConfig.brand,
      competitor: brandConfig.competitor,
      totalProducts: productUrls.length,
      productsAnalyzed: analyzedCount,
      avgJsonLdScore: Math.round(avgScore),
      avgJsonLdGrade: avgGrade,
      jsonLdPresent,
      productSchemaPresent,
      aggregateRatingPresent,
      reviewsPresent,
      avgDescriptionLength: Math.round(avgDescLength),
      commonIssues: sortedIssues.slice(0, 5),
      commonStrengths: sortedStrengths.slice(0, 5),
      sampleProducts: products.slice(0, 5) // Keep first 5 as samples
    };

    brandSummaries.push(summary);

    // Print summary for this brand
    console.log(`\n  ${brandConfig.brand} SUMMARY:`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  Average Score: ${summary.avgJsonLdScore}/100 (Grade: ${summary.avgJsonLdGrade})`);
    console.log(`  JSON-LD Present: ${jsonLdPresent}/${analyzedCount} (${Math.round(jsonLdPresent/analyzedCount*100)}%)`);
    console.log(`  Product Schema: ${productSchemaPresent}/${analyzedCount} (${Math.round(productSchemaPresent/analyzedCount*100)}%)`);
    console.log(`  AggregateRating: ${aggregateRatingPresent}/${analyzedCount} (${Math.round(aggregateRatingPresent/analyzedCount*100)}%)`);
    console.log(`  Reviews in Schema: ${reviewsPresent}/${analyzedCount} (${Math.round(reviewsPresent/analyzedCount*100)}%)`);
    console.log(`  Avg Description: ${summary.avgDescriptionLength} chars`);

    if (sortedIssues.length > 0) {
      console.log(`\n  Top Issues:`);
      for (const { issue, count } of sortedIssues.slice(0, 3)) {
        console.log(`    ⚠️  ${issue} (${count}/${analyzedCount})`);
      }
    }
  }

  // Print comparison summary
  console.log('\n\n' + '='.repeat(70));
  console.log('  BRAND COMPARISON SUMMARY');
  console.log('='.repeat(70));

  // Sort by score
  const sorted = [...brandSummaries].sort((a, b) => b.avgJsonLdScore - a.avgJsonLdScore);

  console.log('\n  OVERALL RANKINGS:');
  console.log('  ' + '─'.repeat(68));
  console.log('  Rank  Brand          Score   Grade   JSON-LD   Product   Ratings   Reviews');
  console.log('  ' + '─'.repeat(68));

  sorted.forEach((s, i) => {
    const tag = s.competitor ? '⚪' : '🔵';
    const name = s.brand.padEnd(12);
    const score = String(s.avgJsonLdScore).padStart(3);
    const grade = s.avgJsonLdGrade.padEnd(5);
    const jsonLd = `${Math.round(s.jsonLdPresent/s.productsAnalyzed*100)}%`.padStart(5);
    const product = `${Math.round(s.productSchemaPresent/s.productsAnalyzed*100)}%`.padStart(7);
    const ratings = `${Math.round(s.aggregateRatingPresent/s.productsAnalyzed*100)}%`.padStart(7);
    const reviews = `${Math.round(s.reviewsPresent/s.productsAnalyzed*100)}%`.padStart(7);

    console.log(`  ${i + 1}.    ${tag} ${name} ${score}     ${grade}   ${jsonLd}     ${product}   ${ratings}   ${reviews}`);
  });

  // Category comparisons
  console.log('\n  CATEGORY MATCHUPS:');
  console.log('  ' + '─'.repeat(68));

  const hoka = brandSummaries.find(b => b.brand === 'HOKA');
  const brooks = brandSummaries.find(b => b.brand === 'Brooks');
  const ugg = brandSummaries.find(b => b.brand === 'UGG');
  const sorel = brandSummaries.find(b => b.brand === 'Sorel');
  const teva = brandSummaries.find(b => b.brand === 'Teva');
  const keen = brandSummaries.find(b => b.brand === 'Keen');

  if (hoka && brooks) {
    const diff = hoka.avgJsonLdScore - brooks.avgJsonLdScore;
    const winner = diff >= 0 ? 'HOKA' : 'Brooks';
    const indicator = diff >= 0 ? '✅' : '❌';
    console.log(`  RUNNING:  HOKA (${hoka.avgJsonLdScore}) vs Brooks (${brooks.avgJsonLdScore}) → ${indicator} ${winner} (${diff >= 0 ? '+' : ''}${diff})`);
  }

  if (ugg && sorel) {
    const diff = ugg.avgJsonLdScore - sorel.avgJsonLdScore;
    const winner = diff >= 0 ? 'UGG' : 'Sorel';
    const indicator = diff >= 0 ? '✅' : '❌';
    console.log(`  BOOTS:    UGG (${ugg.avgJsonLdScore}) vs Sorel (${sorel.avgJsonLdScore}) → ${indicator} ${winner} (${diff >= 0 ? '+' : ''}${diff})`);
  }

  if (teva && keen) {
    const diff = teva.avgJsonLdScore - keen.avgJsonLdScore;
    const winner = diff >= 0 ? 'Teva' : 'Keen';
    const indicator = diff >= 0 ? '✅' : '❌';
    console.log(`  SANDALS:  Teva (${teva.avgJsonLdScore}) vs Keen (${keen.avgJsonLdScore}) → ${indicator} ${winner} (${diff >= 0 ? '+' : ''}${diff})`);
  }

  // Save detailed results
  const outputPath = '/Users/edf/bentham/repository/results/glu/deckers-us-visibility/full-catalog-jsonld-analysis.json';
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify({
    studyName: 'Full Product Catalog JSON-LD Analysis',
    timestamp: new Date().toISOString(),
    brandSummaries,
    rankings: sorted.map((s, i) => ({
      rank: i + 1,
      brand: s.brand,
      competitor: s.competitor,
      score: s.avgJsonLdScore,
      grade: s.avgJsonLdGrade
    }))
  }, null, 2));

  console.log(`\n💾 Results saved to: ${outputPath}`);

  await page.close();
}

main().catch(console.error);
