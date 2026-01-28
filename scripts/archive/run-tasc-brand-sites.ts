#!/usr/bin/env npx tsx
/**
 * TASC Performance Visibility Study - Brand Site Analysis
 * Crawls TASC Performance and competitor brand websites for JSON-LD, metadata, and content
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';

const OUTPUT_DIR = 'packages/visibility-tool/results/tasc-visibility-study';
const OUTPUT_FILE = `${OUTPUT_DIR}/brand-sites-results.json`;

// Brand websites to analyze
const BRAND_SITES = [
  // Primary Client
  { brand: 'TASC Performance', url: 'https://www.tascperformance.com', isClient: true },
  { brand: 'TASC Performance - Men', url: 'https://www.tascperformance.com/collections/men', isClient: true },
  { brand: 'TASC Performance - Bamboo', url: 'https://www.tascperformance.com/pages/bamboo', isClient: true },

  // Premium Athletic Competitors
  { brand: 'Lululemon', url: 'https://shop.lululemon.com', isClient: false },
  { brand: 'Vuori', url: 'https://www.vuoriclothing.com', isClient: false },
  { brand: 'Rhone', url: 'https://www.rhone.com', isClient: false },

  // Bamboo/Sustainable Competitors
  { brand: 'Free Fly', url: 'https://www.freeflyapparel.com', isClient: false },
  { brand: 'Cariloha', url: 'https://www.cariloha.com', isClient: false },
  { brand: 'BAM', url: 'https://bambooclothing.co.uk', isClient: false },

  // Major Athletic Brands
  { brand: 'Nike', url: 'https://www.nike.com', isClient: false },
  { brand: 'Under Armour', url: 'https://www.underarmour.com', isClient: false },

  // Sustainable/Eco Brands
  { brand: 'Allbirds', url: 'https://www.allbirds.com', isClient: false },
  { brand: 'Patagonia', url: 'https://www.patagonia.com', isClient: false },
  { brand: 'Cotopaxi', url: 'https://www.cotopaxi.com', isClient: false },
];

interface BrandAnalysis {
  brand: string;
  url: string;
  isClient: boolean;
  timestamp: string;
  success: boolean;
  responseTimeMs: number;
  error?: string;

  // Page analysis
  title?: string;
  metaDescription?: string;
  h1?: string;

  // JSON-LD structured data
  jsonLd?: any[];
  hasOrganization?: boolean;
  hasProduct?: boolean;
  hasBreadcrumb?: boolean;
  hasWebSite?: boolean;

  // Open Graph
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;

  // Content signals
  wordCount?: number;
  hasAboutPage?: boolean;
  hasSustainabilityPage?: boolean;
}

async function analyzeBrandSite(site: { brand: string; url: string; isClient: boolean }): Promise<BrandAnalysis> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(site.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        brand: site.brand,
        url: site.url,
        isClient: site.isClient,
        timestamp,
        success: false,
        responseTimeMs: Date.now() - startTime,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    // Extract meta description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : undefined;

    // Extract H1
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const h1 = h1Match ? h1Match[1].trim() : undefined;

    // Extract JSON-LD
    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    const jsonLd: any[] = [];
    for (const match of jsonLdMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        jsonLd.push(parsed);
      } catch {
        // Invalid JSON-LD
      }
    }

    // Check JSON-LD types
    const hasOrganization = jsonLd.some(j =>
      j['@type'] === 'Organization' ||
      (Array.isArray(j['@graph']) && j['@graph'].some((g: any) => g['@type'] === 'Organization'))
    );
    const hasProduct = jsonLd.some(j =>
      j['@type'] === 'Product' ||
      (Array.isArray(j['@graph']) && j['@graph'].some((g: any) => g['@type'] === 'Product'))
    );
    const hasBreadcrumb = jsonLd.some(j =>
      j['@type'] === 'BreadcrumbList' ||
      (Array.isArray(j['@graph']) && j['@graph'].some((g: any) => g['@type'] === 'BreadcrumbList'))
    );
    const hasWebSite = jsonLd.some(j =>
      j['@type'] === 'WebSite' ||
      (Array.isArray(j['@graph']) && j['@graph'].some((g: any) => g['@type'] === 'WebSite'))
    );

    // Extract Open Graph
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    // Word count (rough estimate)
    const textContent = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                            .replace(/<style[\s\S]*?<\/style>/gi, '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ');
    const wordCount = textContent.split(' ').filter(w => w.length > 0).length;

    // Check for key pages
    const hasAboutPage = /href=["'][^"']*about/i.test(html) || /href=["'][^"']*our-story/i.test(html);
    const hasSustainabilityPage = /href=["'][^"']*sustainab/i.test(html) || /href=["'][^"']*eco/i.test(html) || /href=["'][^"']*environment/i.test(html);

    return {
      brand: site.brand,
      url: site.url,
      isClient: site.isClient,
      timestamp,
      success: true,
      responseTimeMs: Date.now() - startTime,
      title,
      metaDescription,
      h1,
      jsonLd: jsonLd.length > 0 ? jsonLd : undefined,
      hasOrganization,
      hasProduct,
      hasBreadcrumb,
      hasWebSite,
      ogTitle: ogTitleMatch ? ogTitleMatch[1] : undefined,
      ogDescription: ogDescMatch ? ogDescMatch[1] : undefined,
      ogImage: ogImageMatch ? ogImageMatch[1] : undefined,
      wordCount,
      hasAboutPage,
      hasSustainabilityPage,
    };

  } catch (error) {
    return {
      brand: site.brand,
      url: site.url,
      isClient: site.isClient,
      timestamp,
      success: false,
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  TASC VISIBILITY STUDY - BRAND SITE ANALYSIS');
  console.log('='.repeat(70));
  console.log(`\nAnalyzing ${BRAND_SITES.length} brand websites...\n`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: BrandAnalysis[] = [];

  for (const site of BRAND_SITES) {
    process.stdout.write(`  ${site.brand.padEnd(25)} `);

    const result = await analyzeBrandSite(site);
    results.push(result);

    if (result.success) {
      const jsonLdCount = result.jsonLd?.length || 0;
      console.log(`✓ (${(result.responseTimeMs/1000).toFixed(1)}s) JSON-LD: ${jsonLdCount}, Org: ${result.hasOrganization ? 'Y' : 'N'}`);
    } else {
      console.log(`✗ ${result.error}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  // Generate summary
  const summary = {
    totalSites: BRAND_SITES.length,
    successful: results.filter(r => r.success).length,
    withJsonLd: results.filter(r => r.jsonLd && r.jsonLd.length > 0).length,
    withOrganization: results.filter(r => r.hasOrganization).length,
    withProduct: results.filter(r => r.hasProduct).length,
    withSustainability: results.filter(r => r.hasSustainabilityPage).length,
  };

  const output = {
    timestamp: new Date().toISOString(),
    studyName: 'TASC Performance Visibility Study - Brand Sites',
    surface: 'brand-sites',
    summary,
    results,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('  BRAND SITE ANALYSIS COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  Total: ${summary.totalSites}`);
  console.log(`  Successful: ${summary.successful}`);
  console.log(`  With JSON-LD: ${summary.withJsonLd}`);
  console.log(`  With Organization schema: ${summary.withOrganization}`);
  console.log(`  Results saved to: ${OUTPUT_FILE}`);
}

main().catch(console.error);
