#!/usr/bin/env npx tsx
/**
 * Analyze Deckers Brand PDP Pages for AI Visibility
 * Checks what SSOT (Single Source of Truth) content is visible to AI crawlers
 */

import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';

// Sample PDPs from Deckers brands and key competitors
const PDPS_TO_CHECK = [
  // HOKA - top products
  { brand: 'HOKA', product: 'Bondi 8', url: 'https://www.hoka.com/en/us/mens-road/bondi-8/1123202.html', competitor: false },
  { brand: 'HOKA', product: 'Clifton 9', url: 'https://www.hoka.com/en/us/mens-road/clifton-9/1127895.html', competitor: false },
  { brand: 'HOKA', product: 'Arahi 7', url: 'https://www.hoka.com/en/us/mens-road/arahi-7/1147850.html', competitor: false },

  // Brooks - HOKA competitor
  { brand: 'Brooks', product: 'Ghost 16', url: 'https://www.brooksrunning.com/en_us/ghost-16-mens-road-running-shoe/110418.html', competitor: true },
  { brand: 'Brooks', product: 'Glycerin 21', url: 'https://www.brooksrunning.com/en_us/glycerin-21-mens-road-running-shoe/110419.html', competitor: true },
  { brand: 'Brooks', product: 'Adrenaline GTS 24', url: 'https://www.brooksrunning.com/en_us/adrenaline-gts-24-mens-road-running-shoe/110420.html', competitor: true },

  // UGG - top products
  { brand: 'UGG', product: 'Classic Short II', url: 'https://www.ugg.com/women-boots-classic-boots/classic-short-ii-boot/1016223.html', competitor: false },
  { brand: 'UGG', product: 'Tasman', url: 'https://www.ugg.com/men-slippers/tasman-slipper/5950.html', competitor: false },
  { brand: 'UGG', product: 'Scuffette II', url: 'https://www.ugg.com/women-slippers/scuffette-ii-slipper/1106872.html', competitor: false },

  // Sorel - UGG competitor
  { brand: 'Sorel', product: 'Caribou Boot', url: 'https://www.sorel.com/p/mens-caribou-boot-NM1000.html', competitor: true },
  { brand: 'Sorel', product: 'Joan of Arctic', url: 'https://www.sorel.com/p/womens-joan-of-arctic-boot-1855131.html', competitor: true },
  { brand: 'Sorel', product: 'Kinetic Impact', url: 'https://www.sorel.com/p/womens-kinetic-impact-conquest-sneaker-boot-2058691.html', competitor: true },

  // Teva - top products
  { brand: 'Teva', product: 'Hurricane XLT2', url: 'https://www.teva.com/women-sandals/hurricane-xlt2/1019235.html', competitor: false },
  { brand: 'Teva', product: 'Original Universal', url: 'https://www.teva.com/women-sandals/original-universal/1003987.html', competitor: false },
  { brand: 'Teva', product: 'Tirra', url: 'https://www.teva.com/women-sandals/tirra/4266.html', competitor: false },

  // Keen - Teva competitor
  { brand: 'Keen', product: 'Newport H2', url: 'https://www.keenfootwear.com/p/M-NEWPORT-H2.html', competitor: true },
  { brand: 'Keen', product: 'Clearwater CNX', url: 'https://www.keenfootwear.com/p/W-CLEARWATER-CNX.html', competitor: true },
  { brand: 'Keen', product: 'Whisper', url: 'https://www.keenfootwear.com/p/W-WHISPER.html', competitor: true },
];

interface PDPAnalysis {
  brand: string;
  product: string;
  url: string;
  timestamp: string;

  // JSON-LD Structured Data
  jsonLd: {
    found: boolean;
    types: string[];
    hasProduct: boolean;
    hasBrand: boolean;
    hasOffer: boolean;
    hasReview: boolean;
    hasAggregateRating: boolean;
    raw?: any;
  };

  // Meta Tags
  meta: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    canonical: string;
  };

  // Content Visibility (what's in initial HTML vs JS-loaded)
  content: {
    productName: string;
    productDescription: string;
    price: string;
    features: string[];
    materials: string[];
    isContentInInitialHtml: boolean;
    wordCount: number;
  };

  // AI Crawlability Score
  crawlability: {
    score: number; // 0-100
    issues: string[];
    recommendations: string[];
  };
}

async function analyzePDP(page: any, brand: string, product: string, url: string): Promise<PDPAnalysis> {
  const timestamp = new Date().toISOString();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000); // Let JS render

    const analysis = await page.evaluate(() => {
      const result = {
        jsonLd: {
          found: false,
          types: [] as string[],
          hasProduct: false,
          hasBrand: false,
          hasOffer: false,
          hasReview: false,
          hasAggregateRating: false,
          raw: null as any,
        },
        meta: {
          title: document.title || '',
          description: '',
          ogTitle: '',
          ogDescription: '',
          ogImage: '',
          canonical: '',
        },
        content: {
          productName: '',
          productDescription: '',
          price: '',
          features: [] as string[],
          materials: [] as string[],
          isContentInInitialHtml: true,
          wordCount: 0,
        },
      };

      // Extract JSON-LD
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      if (jsonLdScripts.length > 0) {
        result.jsonLd.found = true;
        const allJsonLd: any[] = [];

        jsonLdScripts.forEach(script => {
          try {
            const data = JSON.parse(script.textContent || '');
            allJsonLd.push(data);

            // Handle @graph arrays
            const items = data['@graph'] || [data];
            items.forEach((item: any) => {
              const type = item['@type'];
              if (type) {
                const types = Array.isArray(type) ? type : [type];
                result.jsonLd.types.push(...types);

                if (types.includes('Product')) result.jsonLd.hasProduct = true;
                if (types.includes('Brand') || item.brand) result.jsonLd.hasBrand = true;
                if (types.includes('Offer') || item.offers) result.jsonLd.hasOffer = true;
                if (types.includes('Review') || item.review) result.jsonLd.hasReview = true;
                if (types.includes('AggregateRating') || item.aggregateRating) result.jsonLd.hasAggregateRating = true;
              }
            });
          } catch (e) {
            // Invalid JSON-LD
          }
        });

        result.jsonLd.raw = allJsonLd;
        result.jsonLd.types = [...new Set(result.jsonLd.types)];
      }

      // Extract Meta Tags
      const metaDesc = document.querySelector('meta[name="description"]');
      result.meta.description = metaDesc?.getAttribute('content') || '';

      const ogTitle = document.querySelector('meta[property="og:title"]');
      result.meta.ogTitle = ogTitle?.getAttribute('content') || '';

      const ogDesc = document.querySelector('meta[property="og:description"]');
      result.meta.ogDescription = ogDesc?.getAttribute('content') || '';

      const ogImage = document.querySelector('meta[property="og:image"]');
      result.meta.ogImage = ogImage?.getAttribute('content') || '';

      const canonical = document.querySelector('link[rel="canonical"]');
      result.meta.canonical = canonical?.getAttribute('href') || '';

      // Extract Product Content
      // Try common product name selectors
      const nameSelectors = ['h1', '[class*="product-name"]', '[class*="productName"]', '[data-testid="product-name"]', '.pdp-title'];
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          result.content.productName = el.textContent.trim();
          break;
        }
      }

      // Try common description selectors
      const descSelectors = ['[class*="product-description"]', '[class*="productDescription"]', '[class*="description"]', '.pdp-description'];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          result.content.productDescription = el.textContent.trim().substring(0, 500);
          break;
        }
      }

      // Try to find price
      const priceSelectors = ['[class*="price"]', '[data-testid*="price"]', '.product-price'];
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.match(/\$[\d,.]+/)) {
          result.content.price = el.textContent.trim();
          break;
        }
      }

      // Try to find features/benefits
      const featureSelectors = ['[class*="feature"]', '[class*="benefit"]', 'ul[class*="product"] li'];
      document.querySelectorAll(featureSelectors.join(', ')).forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 10 && text.length < 200) {
          result.content.features.push(text);
        }
      });
      result.content.features = result.content.features.slice(0, 10);

      // Word count of main content
      const mainContent = document.querySelector('main') || document.body;
      result.content.wordCount = (mainContent.textContent || '').split(/\s+/).filter(w => w.length > 0).length;

      return result;
    });

    // Calculate crawlability score
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // JSON-LD checks (40 points)
    if (!analysis.jsonLd.found) {
      score -= 20;
      issues.push('No JSON-LD structured data found');
      recommendations.push('Add Schema.org/Product JSON-LD markup');
    } else {
      if (!analysis.jsonLd.hasProduct) {
        score -= 10;
        issues.push('No Product schema in JSON-LD');
        recommendations.push('Add @type: Product to JSON-LD');
      }
      if (!analysis.jsonLd.hasBrand) {
        score -= 5;
        issues.push('No Brand information in JSON-LD');
        recommendations.push('Add brand property to Product schema');
      }
      if (!analysis.jsonLd.hasAggregateRating) {
        score -= 5;
        issues.push('No AggregateRating in JSON-LD');
        recommendations.push('Add aggregateRating to surface review signals');
      }
    }

    // Meta tag checks (20 points)
    if (!analysis.meta.description || analysis.meta.description.length < 50) {
      score -= 10;
      issues.push('Missing or short meta description');
      recommendations.push('Add detailed meta description (150+ chars)');
    }
    if (!analysis.meta.ogTitle || !analysis.meta.ogDescription) {
      score -= 5;
      issues.push('Missing Open Graph tags');
      recommendations.push('Add og:title and og:description for social/AI sharing');
    }
    if (!analysis.meta.canonical) {
      score -= 5;
      issues.push('No canonical URL specified');
      recommendations.push('Add canonical link to prevent duplicate content issues');
    }

    // Content checks (40 points)
    if (!analysis.content.productName) {
      score -= 15;
      issues.push('Product name not found in HTML');
      recommendations.push('Ensure product name is in accessible HTML (not just JS-rendered)');
    }
    if (!analysis.content.productDescription || analysis.content.productDescription.length < 100) {
      score -= 15;
      issues.push('Product description missing or very short');
      recommendations.push('Add detailed product description visible to crawlers');
    }
    if (analysis.content.features.length === 0) {
      score -= 5;
      issues.push('No product features/benefits found');
      recommendations.push('Add structured feature list for AI to extract');
    }
    if (analysis.content.wordCount < 200) {
      score -= 5;
      issues.push('Very low content word count');
      recommendations.push('Add more descriptive content about product use cases');
    }

    return {
      brand,
      product,
      url,
      timestamp,
      jsonLd: analysis.jsonLd,
      meta: analysis.meta,
      content: analysis.content,
      crawlability: {
        score: Math.max(0, score),
        issues,
        recommendations,
      },
    };

  } catch (error) {
    return {
      brand,
      product,
      url,
      timestamp,
      jsonLd: { found: false, types: [], hasProduct: false, hasBrand: false, hasOffer: false, hasReview: false, hasAggregateRating: false },
      meta: { title: '', description: '', ogTitle: '', ogDescription: '', ogImage: '', canonical: '' },
      content: { productName: '', productDescription: '', price: '', features: [], materials: [], isContentInInitialHtml: false, wordCount: 0 },
      crawlability: { score: 0, issues: [`Error loading page: ${error}`], recommendations: [] },
    };
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  DECKERS BRANDS - PDP SSOT ANALYSIS FOR AI VISIBILITY');
  console.log('======================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  const results: PDPAnalysis[] = [];

  for (let i = 0; i < PDPS_TO_CHECK.length; i++) {
    const { brand, product, url } = PDPS_TO_CHECK[i];
    process.stdout.write(`[${i + 1}/${PDPS_TO_CHECK.length}] ${brand} - ${product}... `);

    const result = await analyzePDP(page, brand, product, url);
    results.push(result);

    const scoreColor = result.crawlability.score >= 70 ? '✅' : result.crawlability.score >= 40 ? '⚠️' : '❌';
    console.log(`${scoreColor} Score: ${result.crawlability.score}/100`);

    if (result.crawlability.issues.length > 0) {
      result.crawlability.issues.forEach(issue => console.log(`     - ${issue}`));
    }

    await page.waitForTimeout(2000);
  }

  await page.close();

  // Summary by brand with competitor comparison
  console.log('\n======================================================================');
  console.log('  DECKERS vs COMPETITORS - SSOT COMPARISON');
  console.log('======================================================================\n');

  const comparisons = [
    { deckers: 'HOKA', competitor: 'Brooks', category: 'Running' },
    { deckers: 'UGG', competitor: 'Sorel', category: 'Boots' },
    { deckers: 'Teva', competitor: 'Keen', category: 'Sandals' },
  ];

  for (const comp of comparisons) {
    const deckersResults = results.filter(r => r.brand === comp.deckers);
    const compResults = results.filter(r => r.brand === comp.competitor);

    const deckersAvg = Math.round(deckersResults.reduce((sum, r) => sum + r.crawlability.score, 0) / deckersResults.length);
    const compAvg = Math.round(compResults.reduce((sum, r) => sum + r.crawlability.score, 0) / compResults.length);

    const deckersJsonLd = deckersResults.filter(r => r.jsonLd.found).length;
    const compJsonLd = compResults.filter(r => r.jsonLd.found).length;

    const deckersRating = deckersResults.filter(r => r.jsonLd.hasAggregateRating).length;
    const compRating = compResults.filter(r => r.jsonLd.hasAggregateRating).length;

    const diff = deckersAvg - compAvg;
    const winner = diff > 0 ? comp.deckers : diff < 0 ? comp.competitor : 'TIE';
    const emoji = diff > 0 ? '✅' : diff < 0 ? '❌' : '➖';

    console.log(`${comp.category.toUpperCase()}: ${comp.deckers} vs ${comp.competitor}`);
    console.log('─'.repeat(50));
    console.log(`  ${comp.deckers.padEnd(12)} ${comp.competitor.padEnd(12)} Winner`);
    console.log(`  ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`);
    console.log(`  Score:       ${deckersAvg.toString().padEnd(10)} ${compAvg.toString().padEnd(10)} ${emoji} ${winner} (${diff > 0 ? '+' : ''}${diff})`);
    console.log(`  JSON-LD:     ${deckersJsonLd}/${deckersResults.length}        ${compJsonLd}/${compResults.length}`);
    console.log(`  Ratings:     ${deckersRating}/${deckersResults.length}        ${compRating}/${compResults.length}`);
    console.log();

    // Show key differences
    const deckersIssues = new Set(deckersResults.flatMap(r => r.crawlability.issues));
    const compIssues = new Set(compResults.flatMap(r => r.crawlability.issues));

    if (diff < 0) {
      console.log(`  ${comp.deckers} gaps vs ${comp.competitor}:`);
      deckersIssues.forEach(issue => {
        if (!compIssues.has(issue)) {
          console.log(`    ⚠️  ${issue}`);
        }
      });
    }
    console.log();
  }

  // Overall summary
  console.log('======================================================================');
  console.log('  OVERALL BRAND SCORES');
  console.log('======================================================================\n');

  const allBrands = ['HOKA', 'Brooks', 'UGG', 'Sorel', 'Teva', 'Keen'];
  const brandScores = allBrands.map(brand => {
    const brandResults = results.filter(r => r.brand === brand);
    return {
      brand,
      avgScore: Math.round(brandResults.reduce((sum, r) => sum + r.crawlability.score, 0) / brandResults.length),
      jsonLd: brandResults.filter(r => r.jsonLd.found).length,
      total: brandResults.length,
      isDeckers: ['HOKA', 'UGG', 'Teva'].includes(brand),
    };
  }).sort((a, b) => b.avgScore - a.avgScore);

  brandScores.forEach((b, i) => {
    const marker = b.isDeckers ? '🔵' : '⚪';
    console.log(`  ${i + 1}. ${marker} ${b.brand.padEnd(10)} ${b.avgScore}/100  (JSON-LD: ${b.jsonLd}/${b.total})`);
  });

  // Save results
  const { writeFileSync } = await import('fs');
  const outputPath = 'repository/results/glu/deckers-us-visibility/pdp-ssot-analysis.json';
  writeFileSync(outputPath, JSON.stringify({
    studyName: 'Deckers PDP SSOT Analysis for AI Visibility',
    timestamp: new Date().toISOString(),
    totalPages: results.length,
    results,
    summary: {
      byBrand: brands.map(brand => {
        const brandResults = results.filter(r => r.brand === brand);
        return {
          brand,
          avgScore: Math.round(brandResults.reduce((sum, r) => sum + r.crawlability.score, 0) / brandResults.length),
          jsonLdPresent: brandResults.filter(r => r.jsonLd.found).length,
          productSchema: brandResults.filter(r => r.jsonLd.hasProduct).length,
          total: brandResults.length,
        };
      }),
    },
  }, null, 2));

  console.log(`💾 Results saved to: ${outputPath}`);
}

main().catch(console.error);
