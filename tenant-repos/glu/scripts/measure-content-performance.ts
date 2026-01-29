/**
 * Content Performance Metrics
 *
 * Measures how brand content performs in AI responses:
 * - Citation frequency from brand URLs
 * - Content type effectiveness (PDP, blog, category pages)
 * - Domain authority in AI responses
 * - Competitor content comparison
 *
 * Usage:
 *   npx ts-node measure-content-performance.ts <results-file.json> --domain "brand.com"
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface StudyResults {
  results: QueryResult[];
  metadata?: {
    brand?: string;
    domain?: string;
  };
}

interface QueryResult {
  query?: string;
  originalQuery?: string;
  submittedQuery?: string;
  response: string;
  surface?: string;
  sources?: { title: string; url: string }[];
}

interface ContentCitation {
  url: string;
  domain: string;
  contentType: ContentType;
  title?: string;
  query: string;
  surface: string;
  position: number; // Position in citation list
}

type ContentType =
  | 'pdp' // Product detail page
  | 'category' // Category/collection page
  | 'blog' // Blog/article
  | 'homepage' // Main homepage
  | 'support' // FAQ/support content
  | 'review' // Review page
  | 'other';

interface DomainPerformance {
  domain: string;
  totalCitations: number;
  citationRate: number; // % of responses citing this domain
  avgPosition: number;
  contentTypes: Record<ContentType, number>;
  topPages: { url: string; citations: number; title?: string }[];
  surfaceBreakdown: Record<string, number>;
  queries: string[];
}

interface ContentPerformanceReport {
  timestamp: string;
  brand: string;
  domain: string;
  totalResponses: number;
  totalCitations: number;

  // Brand content performance
  brandPerformance: {
    totalCitations: number;
    citationRate: number;
    avgPosition: number;
    contentTypeEffectiveness: {
      type: ContentType;
      citations: number;
      avgPosition: number;
      topPerformers: string[];
    }[];
    topCitedPages: { url: string; citations: number; avgPosition: number; title?: string }[];
    surfacePerformance: {
      surface: string;
      citations: number;
      rate: number;
      avgPosition: number;
    }[];
  };

  // Competitor comparison
  competitorComparison: DomainPerformance[];

  // Content type analysis
  contentTypeInsights: {
    mostCitedType: ContentType;
    bestPositionedType: ContentType;
    underperformingTypes: ContentType[];
    recommendations: string[];
  };

  // Surface-specific insights
  surfaceInsights: {
    surface: string;
    preferredContentTypes: ContentType[];
    avgCitationsPerResponse: number;
    brandCitationRank: number; // Rank among all domains
    topCitedDomains: string[];
  }[];

  // Gap analysis
  gaps: {
    type: 'missing-content' | 'low-citations' | 'poor-position' | 'competitor-dominance';
    description: string;
    affectedQueries: string[];
    recommendation: string;
  }[];
}

// Content type detection patterns
const CONTENT_TYPE_PATTERNS: Record<ContentType, RegExp[]> = {
  pdp: [/\/products?\//i, /\/p\//i, /\/dp\//i, /\/item\//i, /sku=/i, /product-/i],
  category: [/\/collections?\//i, /\/category\//i, /\/c\//i, /\/shop\//i, /\/browse\//i],
  blog: [/\/blog\//i, /\/article/i, /\/post\//i, /\/news\//i, /\/journal\//i, /\/magazine\//i],
  homepage: [/^https?:\/\/[^\/]+\/?$/i],
  support: [/\/faq/i, /\/help/i, /\/support/i, /\/contact/i, /\/customer-service/i],
  review: [/\/review/i, /\/rating/i, /\/testimonial/i],
  other: [/.*/],
};

// Common competitor domains (will be detected automatically too)
const RETAILER_DOMAINS = [
  'amazon.com', 'walmart.com', 'target.com', 'nordstrom.com', 'macys.com',
  'rei.com', 'dickssportinggoods.com', 'zappos.com', 'footlocker.com',
  'sephora.com', 'ulta.com', 'bestbuy.com', 'homedepot.com', 'lowes.com'
];

const REVIEW_DOMAINS = [
  'trustpilot.com', 'yelp.com', 'bbb.org', 'consumerreports.org',
  'g2.com', 'capterra.com', 'glassdoor.com', 'indeed.com'
];

// Helper functions
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

function classifyContentType(url: string): ContentType {
  for (const [type, patterns] of Object.entries(CONTENT_TYPE_PATTERNS)) {
    if (type === 'other') continue;
    if (patterns.some(p => p.test(url))) {
      return type as ContentType;
    }
  }
  return 'other';
}

function extractAllCitations(results: QueryResult[]): ContentCitation[] {
  const citations: ContentCitation[] = [];

  for (const result of results) {
    const sources = result.sources || [];
    const query = result.query || result.originalQuery || result.submittedQuery || '';
    const surface = result.surface || 'unknown';

    sources.forEach((source, index) => {
      citations.push({
        url: source.url,
        domain: extractDomain(source.url),
        contentType: classifyContentType(source.url),
        title: source.title,
        query,
        surface,
        position: index + 1,
      });
    });
  }

  return citations;
}

function buildDomainPerformance(
  domain: string,
  citations: ContentCitation[],
  totalResponses: number
): DomainPerformance {
  const domainCitations = citations.filter(c => c.domain === domain || c.domain.endsWith('.' + domain));

  const contentTypes: Record<ContentType, number> = {
    pdp: 0, category: 0, blog: 0, homepage: 0, support: 0, review: 0, other: 0
  };
  const surfaceBreakdown: Record<string, number> = {};
  const urlCounts: Record<string, { count: number; title?: string }> = {};
  const queries = new Set<string>();

  for (const citation of domainCitations) {
    contentTypes[citation.contentType]++;
    surfaceBreakdown[citation.surface] = (surfaceBreakdown[citation.surface] || 0) + 1;
    queries.add(citation.query);

    if (!urlCounts[citation.url]) {
      urlCounts[citation.url] = { count: 0, title: citation.title };
    }
    urlCounts[citation.url].count++;
  }

  const topPages = Object.entries(urlCounts)
    .map(([url, data]) => ({ url, citations: data.count, title: data.title }))
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 10);

  const avgPosition = domainCitations.length > 0
    ? domainCitations.reduce((sum, c) => sum + c.position, 0) / domainCitations.length
    : 0;

  // Count unique responses that cite this domain
  const uniqueResponsesWithCitation = new Set(
    domainCitations.map(c => `${c.query}|${c.surface}`)
  ).size;

  return {
    domain,
    totalCitations: domainCitations.length,
    citationRate: uniqueResponsesWithCitation / totalResponses,
    avgPosition,
    contentTypes,
    topPages,
    surfaceBreakdown,
    queries: [...queries],
  };
}

// Main analysis function
function measureContentPerformance(
  results: QueryResult[],
  brand: string,
  domain: string
): ContentPerformanceReport {
  const timestamp = new Date().toISOString();
  const allCitations = extractAllCitations(results);
  const totalResponses = results.length;
  const totalCitations = allCitations.length;

  // Build brand performance
  const brandDomainPerf = buildDomainPerformance(domain, allCitations, totalResponses);

  // Content type effectiveness for brand
  const brandCitations = allCitations.filter(c =>
    c.domain === domain || c.domain.endsWith('.' + domain)
  );

  const contentTypeStats: Record<ContentType, { citations: number; positions: number[]; urls: Set<string> }> = {
    pdp: { citations: 0, positions: [], urls: new Set() },
    category: { citations: 0, positions: [], urls: new Set() },
    blog: { citations: 0, positions: [], urls: new Set() },
    homepage: { citations: 0, positions: [], urls: new Set() },
    support: { citations: 0, positions: [], urls: new Set() },
    review: { citations: 0, positions: [], urls: new Set() },
    other: { citations: 0, positions: [], urls: new Set() },
  };

  for (const citation of brandCitations) {
    contentTypeStats[citation.contentType].citations++;
    contentTypeStats[citation.contentType].positions.push(citation.position);
    contentTypeStats[citation.contentType].urls.add(citation.url);
  }

  const contentTypeEffectiveness = Object.entries(contentTypeStats)
    .filter(([_, stats]) => stats.citations > 0)
    .map(([type, stats]) => ({
      type: type as ContentType,
      citations: stats.citations,
      avgPosition: stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length,
      topPerformers: [...stats.urls].slice(0, 3),
    }))
    .sort((a, b) => b.citations - a.citations);

  // Top cited pages
  const urlCitations: Record<string, { count: number; positions: number[]; title?: string }> = {};
  for (const citation of brandCitations) {
    if (!urlCitations[citation.url]) {
      urlCitations[citation.url] = { count: 0, positions: [], title: citation.title };
    }
    urlCitations[citation.url].count++;
    urlCitations[citation.url].positions.push(citation.position);
  }

  const topCitedPages = Object.entries(urlCitations)
    .map(([url, data]) => ({
      url,
      citations: data.count,
      avgPosition: data.positions.reduce((a, b) => a + b, 0) / data.positions.length,
      title: data.title,
    }))
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 10);

  // Surface performance for brand
  const surfaceCitations: Record<string, { count: number; positions: number[]; total: number }> = {};
  for (const result of results) {
    const surface = result.surface || 'unknown';
    if (!surfaceCitations[surface]) {
      surfaceCitations[surface] = { count: 0, positions: [], total: 0 };
    }
    surfaceCitations[surface].total++;
  }

  for (const citation of brandCitations) {
    if (!surfaceCitations[citation.surface]) {
      surfaceCitations[citation.surface] = { count: 0, positions: [], total: 0 };
    }
    surfaceCitations[citation.surface].count++;
    surfaceCitations[citation.surface].positions.push(citation.position);
  }

  const surfacePerformance = Object.entries(surfaceCitations)
    .map(([surface, data]) => ({
      surface,
      citations: data.count,
      rate: data.count / data.total,
      avgPosition: data.positions.length > 0
        ? data.positions.reduce((a, b) => a + b, 0) / data.positions.length
        : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  // Competitor comparison
  const allDomains = [...new Set(allCitations.map(c => c.domain))];
  const competitorDomains = allDomains
    .filter(d => d !== domain && !d.endsWith('.' + domain))
    .filter(d => !['google.com', 'youtube.com', 'wikipedia.org'].includes(d));

  const competitorComparison = competitorDomains
    .map(d => buildDomainPerformance(d, allCitations, totalResponses))
    .filter(p => p.totalCitations >= 2)
    .sort((a, b) => b.citationRate - a.citationRate)
    .slice(0, 15);

  // Content type insights
  const mostCitedType = contentTypeEffectiveness.length > 0
    ? contentTypeEffectiveness[0].type
    : 'other';

  const bestPositionedType = contentTypeEffectiveness.length > 0
    ? [...contentTypeEffectiveness].sort((a, b) => a.avgPosition - b.avgPosition)[0].type
    : 'other';

  const expectedTypes: ContentType[] = ['pdp', 'blog', 'category'];
  const presentTypes = new Set(contentTypeEffectiveness.map(c => c.type));
  const underperformingTypes = expectedTypes.filter(t => !presentTypes.has(t));

  const contentTypeRecommendations: string[] = [];
  if (!presentTypes.has('pdp')) {
    contentTypeRecommendations.push('Product pages not being cited - improve JSON-LD markup and product descriptions');
  }
  if (!presentTypes.has('blog')) {
    contentTypeRecommendations.push('Blog content not being cited - create authoritative guides and how-to content');
  }
  if (presentTypes.has('pdp') && contentTypeStats.pdp.citations < brandCitations.length * 0.3) {
    contentTypeRecommendations.push('Low PDP citation rate - optimize product content for AI discovery');
  }

  // Surface insights
  const surfaceInsights = Object.entries(surfaceCitations).map(([surface, data]) => {
    const surfaceCitationsAll = allCitations.filter(c => c.surface === surface);

    // Content types preferred by this surface
    const typeCount: Record<string, number> = {};
    for (const c of surfaceCitationsAll) {
      typeCount[c.contentType] = (typeCount[c.contentType] || 0) + 1;
    }
    const preferredContentTypes = Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type as ContentType);

    // Domain rankings for this surface
    const domainCounts: Record<string, number> = {};
    for (const c of surfaceCitationsAll) {
      domainCounts[c.domain] = (domainCounts[c.domain] || 0) + 1;
    }
    const sortedDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1]);
    const topCitedDomains = sortedDomains.slice(0, 5).map(([d]) => d);
    const brandRank = sortedDomains.findIndex(([d]) => d === domain || d.endsWith('.' + domain)) + 1;

    return {
      surface,
      preferredContentTypes,
      avgCitationsPerResponse: surfaceCitationsAll.length / data.total,
      brandCitationRank: brandRank || sortedDomains.length + 1,
      topCitedDomains,
    };
  });

  // Gap analysis
  const gaps: ContentPerformanceReport['gaps'] = [];

  // Check for surfaces with no brand citations
  const noCitationSurfaces = surfacePerformance.filter(s => s.citations === 0);
  if (noCitationSurfaces.length > 0) {
    gaps.push({
      type: 'missing-content',
      description: `No brand citations on: ${noCitationSurfaces.map(s => s.surface).join(', ')}`,
      affectedQueries: [],
      recommendation: 'Create content optimized for these platforms',
    });
  }

  // Check for competitor dominance
  const dominantCompetitors = competitorComparison
    .filter(c => c.citationRate > brandDomainPerf.citationRate * 1.5);

  if (dominantCompetitors.length > 0) {
    gaps.push({
      type: 'competitor-dominance',
      description: `${dominantCompetitors.length} competitors have significantly higher citation rates`,
      affectedQueries: dominantCompetitors[0].queries.slice(0, 5),
      recommendation: `Analyze content from ${dominantCompetitors.slice(0, 3).map(c => c.domain).join(', ')}`,
    });
  }

  // Check for poor position
  if (brandDomainPerf.avgPosition > 3) {
    gaps.push({
      type: 'poor-position',
      description: `Average citation position is ${brandDomainPerf.avgPosition.toFixed(1)} (target: top 3)`,
      affectedQueries: brandDomainPerf.queries.slice(0, 5),
      recommendation: 'Improve content authority signals to rank higher in citations',
    });
  }

  return {
    timestamp,
    brand,
    domain,
    totalResponses,
    totalCitations,
    brandPerformance: {
      totalCitations: brandDomainPerf.totalCitations,
      citationRate: brandDomainPerf.citationRate,
      avgPosition: brandDomainPerf.avgPosition,
      contentTypeEffectiveness,
      topCitedPages,
      surfacePerformance,
    },
    competitorComparison,
    contentTypeInsights: {
      mostCitedType,
      bestPositionedType,
      underperformingTypes,
      recommendations: contentTypeRecommendations,
    },
    surfaceInsights,
    gaps,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Content Performance Metrics');
    console.log('\nUsage: npx ts-node measure-content-performance.ts <results-file.json> [options]');
    console.log('\nOptions:');
    console.log('  --domain DOMAIN    Brand domain to track (e.g., "nike.com")');
    console.log('  --brand NAME       Brand name for report');
    console.log('\nExample:');
    console.log('  npx ts-node measure-content-performance.ts study-results.json --domain "tascperformance.com" --brand "TASC"');
    process.exit(1);
  }

  const resultsFile = args[0];

  let domain = '';
  let brand = 'Unknown';

  const domainIndex = args.indexOf('--domain');
  if (domainIndex !== -1 && args[domainIndex + 1]) {
    domain = args[domainIndex + 1];
  }

  const brandIndex = args.indexOf('--brand');
  if (brandIndex !== -1 && args[brandIndex + 1]) {
    brand = args[brandIndex + 1];
  }

  if (!fs.existsSync(resultsFile)) {
    console.error(`File not found: ${resultsFile}`);
    process.exit(1);
  }

  const data: StudyResults = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
  const results = data.results || [];

  if (data.metadata?.domain && !domain) {
    domain = data.metadata.domain;
  }
  if (data.metadata?.brand && brand === 'Unknown') {
    brand = data.metadata.brand;
  }

  if (!domain) {
    console.error('Domain required. Use --domain flag or include in results metadata.');
    process.exit(1);
  }

  console.log('\n CONTENT PERFORMANCE METRICS');
  console.log(`Brand: ${brand}`);
  console.log(`Domain: ${domain}`);
  console.log(`Results file: ${resultsFile}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  const report = measureContentPerformance(results, brand, domain);

  // Print summary
  console.log(' BRAND CONTENT PERFORMANCE');
  console.log(`  Total Citations: ${report.brandPerformance.totalCitations}`);
  console.log(`  Citation Rate: ${(report.brandPerformance.citationRate * 100).toFixed(1)}% of responses`);
  console.log(`  Avg Position: ${report.brandPerformance.avgPosition.toFixed(1)}`);

  console.log('\n CONTENT TYPE EFFECTIVENESS');
  for (const ct of report.brandPerformance.contentTypeEffectiveness.slice(0, 5)) {
    console.log(`  ${ct.type}: ${ct.citations} citations (avg pos: ${ct.avgPosition.toFixed(1)})`);
  }

  console.log('\n TOP CITED PAGES');
  for (const page of report.brandPerformance.topCitedPages.slice(0, 5)) {
    const title = page.title ? ` - ${page.title.slice(0, 40)}...` : '';
    console.log(`  ${page.citations}x: ${page.url.slice(0, 60)}${title}`);
  }

  console.log('\n SURFACE PERFORMANCE');
  for (const sp of report.brandPerformance.surfacePerformance) {
    console.log(`  ${sp.surface}: ${sp.citations} citations (${(sp.rate * 100).toFixed(1)}% rate)`);
  }

  if (report.competitorComparison.length > 0) {
    console.log('\n COMPETITOR COMPARISON (Top 5)');
    for (const comp of report.competitorComparison.slice(0, 5)) {
      const marker = comp.citationRate > report.brandPerformance.citationRate ? '[AHEAD]' : '';
      console.log(`  ${comp.domain}: ${(comp.citationRate * 100).toFixed(1)}% citation rate ${marker}`);
    }
  }

  if (report.gaps.length > 0) {
    console.log('\n GAPS & RECOMMENDATIONS');
    for (const gap of report.gaps) {
      console.log(`\n  [${gap.type.toUpperCase()}]`);
      console.log(`  ${gap.description}`);
      console.log(`  Action: ${gap.recommendation}`);
    }
  }

  // Save report
  const outputPath = resultsFile.replace('.json', '-content-performance.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n Report saved to: ${outputPath}`);
}

main().catch(console.error);

export { measureContentPerformance, ContentPerformanceReport, DomainPerformance };
