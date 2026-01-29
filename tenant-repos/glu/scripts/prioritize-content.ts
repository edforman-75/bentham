/**
 * Prioritization Framework
 *
 * Ranks content items by potential impact on AI visibility:
 * - Visibility gap score (where brand is missing but competitors appear)
 * - Traffic potential (query volume indicators)
 * - Competitive pressure (competitor dominance)
 * - Content quality score (current state)
 * - Ease of improvement
 *
 * Usage:
 *   npx ts-node prioritize-content.ts <results-file.json> --brand "Brand Name"
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
  category?: string;
  sources?: { title: string; url: string }[];
}

interface ContentItem {
  id: string;
  type: 'query' | 'page' | 'topic';
  name: string;
  url?: string;

  // Scores (0-100)
  visibilityGapScore: number;
  trafficPotentialScore: number;
  competitivePressureScore: number;
  currentPerformanceScore: number;
  easeOfImprovementScore: number;

  // Composite
  priorityScore: number;
  priorityTier: 'critical' | 'high' | 'medium' | 'low';

  // Details
  details: {
    surfacesCovered: string[];
    surfacesMissing: string[];
    competitorsAppearing: string[];
    brandPosition: number | null;
    queryIntent: string;
    category: string;
  };

  // Recommendations
  recommendations: string[];
}

interface PrioritizationReport {
  brand: string;
  timestamp: string;
  totalItems: number;

  // Priority breakdown
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  // Ranked items
  rankedItems: ContentItem[];

  // Top priorities by category
  topByCategory: Record<string, ContentItem[]>;

  // Quick wins (high impact, easy to fix)
  quickWins: ContentItem[];

  // Strategic priorities (high impact, harder to fix)
  strategicPriorities: ContentItem[];

  // Scoring weights used
  weights: {
    visibilityGap: number;
    trafficPotential: number;
    competitivePressure: number;
    currentPerformance: number;
    easeOfImprovement: number;
  };
}

// Scoring weights (can be customized)
const DEFAULT_WEIGHTS = {
  visibilityGap: 0.30,        // How much brand is missing
  trafficPotential: 0.25,     // Query importance
  competitivePressure: 0.20,  // Competitor activity
  currentPerformance: 0.15,   // Current brand state
  easeOfImprovement: 0.10,    // How easy to fix
};

// Traffic potential indicators (proxy for actual traffic data)
const HIGH_TRAFFIC_PATTERNS = [
  /^best\s/i, /top\s\d+/i, /review/i, /vs\s/i, /compare/i,
  /how\sto/i, /what\sis/i, /buy/i, /price/i, /near\sme/i
];

const TRANSACTIONAL_PATTERNS = [
  /buy/i, /price/i, /discount/i, /coupon/i, /sale/i,
  /where\sto/i, /shop/i, /order/i, /purchase/i
];

// Intent classification
function classifyIntent(query: string): string {
  const q = query.toLowerCase();
  if (/^best\s|top\s\d+|top\srated/i.test(q)) return 'best-of';
  if (/\svs\s|\sversus\s|compare/i.test(q)) return 'comparison';
  if (/review|rating|worth\sit/i.test(q)) return 'review';
  if (/buy|price|discount|where\sto/i.test(q)) return 'transactional';
  if (/how\sto|guide|tutorial/i.test(q)) return 'how-to';
  return 'informational';
}

// Calculate visibility gap score
function calcVisibilityGapScore(
  brandMentioned: boolean,
  brandPosition: number | null,
  surfacesCovered: number,
  totalSurfaces: number,
  competitorCount: number
): number {
  let score = 0;

  // Not mentioned at all = high gap
  if (!brandMentioned) {
    score += 50;
  } else if (brandPosition && brandPosition > 3) {
    // Mentioned but poor position
    score += Math.min(30, (brandPosition - 3) * 10);
  }

  // Coverage gap
  const coverageGap = 1 - (surfacesCovered / totalSurfaces);
  score += coverageGap * 30;

  // Competitors present without brand
  if (!brandMentioned && competitorCount > 0) {
    score += Math.min(20, competitorCount * 5);
  }

  return Math.min(100, score);
}

// Calculate traffic potential score
function calcTrafficPotentialScore(query: string, intent: string): number {
  let score = 50; // Base score

  // High-traffic patterns
  const highTrafficMatch = HIGH_TRAFFIC_PATTERNS.filter(p => p.test(query)).length;
  score += highTrafficMatch * 10;

  // Transactional queries have higher value
  if (TRANSACTIONAL_PATTERNS.some(p => p.test(query))) {
    score += 20;
  }

  // Intent-based adjustment
  const intentScores: Record<string, number> = {
    'transactional': 20,
    'best-of': 15,
    'comparison': 15,
    'review': 10,
    'how-to': 5,
    'informational': 0,
  };
  score += intentScores[intent] || 0;

  return Math.min(100, score);
}

// Calculate competitive pressure score
function calcCompetitivePressureScore(
  competitorCount: number,
  brandMentioned: boolean,
  brandPosition: number | null
): number {
  let score = 0;

  // More competitors = more pressure
  score += Math.min(40, competitorCount * 10);

  // Competitor appears but brand doesn't
  if (!brandMentioned && competitorCount > 0) {
    score += 30;
  }

  // Competitors outrank brand
  if (brandMentioned && brandPosition && brandPosition > 1 && competitorCount > 0) {
    score += Math.min(30, (brandPosition - 1) * 10);
  }

  return Math.min(100, score);
}

// Calculate current performance score (inverted - lower performance = higher priority)
function calcCurrentPerformanceScore(
  brandMentioned: boolean,
  brandPosition: number | null,
  coverage: number
): number {
  // This is inverted - poor performance = high score (high priority)
  let score = 0;

  if (!brandMentioned) {
    score = 100;
  } else {
    // Position penalty
    if (brandPosition) {
      score += Math.min(50, (brandPosition - 1) * 15);
    }
    // Coverage penalty
    score += (1 - coverage) * 50;
  }

  return Math.min(100, score);
}

// Calculate ease of improvement score
function calcEaseOfImprovementScore(
  intent: string,
  hasCitations: boolean,
  category: string
): number {
  let score = 50; // Base

  // Easier to improve content-driven queries
  if (intent === 'informational' || intent === 'how-to') {
    score += 20;
  }

  // If AI is citing sources, easier to get brand cited
  if (hasCitations) {
    score += 15;
  }

  // Product queries easier if you have products
  if (category === 'product' || intent === 'transactional') {
    score += 15;
  }

  // Comparison queries harder (need to beat competitor)
  if (intent === 'comparison') {
    score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

// Calculate composite priority score
function calcPriorityScore(
  item: Partial<ContentItem>,
  weights: typeof DEFAULT_WEIGHTS
): number {
  return (
    (item.visibilityGapScore || 0) * weights.visibilityGap +
    (item.trafficPotentialScore || 0) * weights.trafficPotential +
    (item.competitivePressureScore || 0) * weights.competitivePressure +
    (item.currentPerformanceScore || 0) * weights.currentPerformance +
    (item.easeOfImprovementScore || 0) * weights.easeOfImprovement
  );
}

// Assign priority tier
function assignPriorityTier(score: number): ContentItem['priorityTier'] {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

// Generate recommendations
function generateRecommendations(item: ContentItem): string[] {
  const recs: string[] = [];

  if (!item.details.surfacesCovered.length) {
    recs.push('Brand not appearing on any surface - create targeted content');
  } else if (item.details.surfacesMissing.length > 0) {
    recs.push(`Expand presence to: ${item.details.surfacesMissing.join(', ')}`);
  }

  if (item.details.brandPosition && item.details.brandPosition > 3) {
    recs.push(`Improve ranking from position ${item.details.brandPosition} to top 3`);
  }

  if (item.details.competitorsAppearing.length > 0 && !item.details.surfacesCovered.length) {
    recs.push(`Counter ${item.details.competitorsAppearing.slice(0, 2).join(', ')} presence`);
  }

  if (item.details.queryIntent === 'transactional') {
    recs.push('High-value transactional query - prioritize product content optimization');
  }

  if (item.details.queryIntent === 'best-of') {
    recs.push('Best-of query - ensure brand appears in authoritative lists and reviews');
  }

  return recs;
}

// Main prioritization function
function prioritizeContent(
  results: QueryResult[],
  brand: string,
  weights: typeof DEFAULT_WEIGHTS = DEFAULT_WEIGHTS
): PrioritizationReport {
  const timestamp = new Date().toISOString();
  const brandLower = brand.toLowerCase();

  // Group results by query
  const queryMap = new Map<string, QueryResult[]>();
  for (const result of results) {
    const query = result.query || result.originalQuery || result.submittedQuery || '';
    if (!queryMap.has(query)) {
      queryMap.set(query, []);
    }
    queryMap.get(query)!.push(result);
  }

  const items: ContentItem[] = [];

  // Analyze each query
  for (const [query, queryResults] of queryMap.entries()) {
    const surfaces = queryResults.map(r => r.surface || 'unknown');
    const uniqueSurfaces = [...new Set(surfaces)];

    // Check brand presence
    const brandMentionedResults = queryResults.filter(r =>
      r.response.toLowerCase().includes(brandLower)
    );
    const brandMentioned = brandMentionedResults.length > 0;
    const surfacesCovered = [...new Set(brandMentionedResults.map(r => r.surface || 'unknown'))];
    const surfacesMissing = uniqueSurfaces.filter(s => !surfacesCovered.includes(s));

    // Extract competitors (simple pattern matching)
    const allText = queryResults.map(r => r.response).join(' ');
    const competitorPattern = /\b(Nike|Adidas|Lululemon|Under Armour|Patagonia|Amazon|Walmart|Target|REI|Puma|Reebok|New Balance|Brooks|ASICS|Saucony)\b/gi;
    const competitorMatches = allText.match(competitorPattern) || [];
    const competitorsAppearing = [...new Set(competitorMatches)]
      .filter(c => c.toLowerCase() !== brandLower);

    // Find brand position
    let brandPosition: number | null = null;
    for (const result of brandMentionedResults) {
      const response = result.response;
      const segments = response.split(/[,\n•\-\d\.]+/).filter(s => s.trim());
      let pos = 1;
      for (const segment of segments) {
        if (segment.toLowerCase().includes(brandLower)) {
          brandPosition = brandPosition ? Math.min(brandPosition, pos) : pos;
          break;
        }
        if (segment.match(/[A-Z][a-z]+/) && segment.trim().length > 2) {
          pos++;
        }
      }
    }

    // Check for citations
    const hasCitations = queryResults.some(r => r.sources && r.sources.length > 0);

    // Classify intent and category
    const intent = classifyIntent(query);
    const category = queryResults[0]?.category || 'general';

    // Calculate scores
    const visibilityGapScore = calcVisibilityGapScore(
      brandMentioned,
      brandPosition,
      surfacesCovered.length,
      uniqueSurfaces.length,
      competitorsAppearing.length
    );

    const trafficPotentialScore = calcTrafficPotentialScore(query, intent);

    const competitivePressureScore = calcCompetitivePressureScore(
      competitorsAppearing.length,
      brandMentioned,
      brandPosition
    );

    const currentPerformanceScore = calcCurrentPerformanceScore(
      brandMentioned,
      brandPosition,
      surfacesCovered.length / uniqueSurfaces.length
    );

    const easeOfImprovementScore = calcEaseOfImprovementScore(
      intent,
      hasCitations,
      category
    );

    const item: ContentItem = {
      id: `query-${items.length + 1}`,
      type: 'query',
      name: query,
      visibilityGapScore,
      trafficPotentialScore,
      competitivePressureScore,
      currentPerformanceScore,
      easeOfImprovementScore,
      priorityScore: 0,
      priorityTier: 'low',
      details: {
        surfacesCovered,
        surfacesMissing,
        competitorsAppearing,
        brandPosition,
        queryIntent: intent,
        category,
      },
      recommendations: [],
    };

    item.priorityScore = calcPriorityScore(item, weights);
    item.priorityTier = assignPriorityTier(item.priorityScore);
    item.recommendations = generateRecommendations(item);

    items.push(item);
  }

  // Sort by priority score
  const rankedItems = items.sort((a, b) => b.priorityScore - a.priorityScore);

  // Summary
  const summary = {
    critical: items.filter(i => i.priorityTier === 'critical').length,
    high: items.filter(i => i.priorityTier === 'high').length,
    medium: items.filter(i => i.priorityTier === 'medium').length,
    low: items.filter(i => i.priorityTier === 'low').length,
  };

  // Group by category
  const topByCategory: Record<string, ContentItem[]> = {};
  for (const item of rankedItems) {
    const cat = item.details.category;
    if (!topByCategory[cat]) {
      topByCategory[cat] = [];
    }
    if (topByCategory[cat].length < 5) {
      topByCategory[cat].push(item);
    }
  }

  // Quick wins: high impact + easy to improve
  const quickWins = rankedItems
    .filter(i => i.priorityScore >= 50 && i.easeOfImprovementScore >= 60)
    .slice(0, 10);

  // Strategic priorities: high impact + harder to improve
  const strategicPriorities = rankedItems
    .filter(i => i.priorityScore >= 60 && i.easeOfImprovementScore < 50)
    .slice(0, 10);

  return {
    brand,
    timestamp,
    totalItems: items.length,
    summary,
    rankedItems,
    topByCategory,
    quickWins,
    strategicPriorities,
    weights,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Content Prioritization Framework');
    console.log('\nUsage: npx ts-node prioritize-content.ts <results-file.json> --brand "Brand Name"');
    console.log('\nExample:');
    console.log('  npx ts-node prioritize-content.ts study-results.json --brand "Nike"');
    process.exit(1);
  }

  const resultsFile = args[0];

  let brand = 'Unknown';
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

  if (data.metadata?.brand && brand === 'Unknown') {
    brand = data.metadata.brand;
  }

  console.log('\n CONTENT PRIORITIZATION');
  console.log(`Brand: ${brand}`);
  console.log(`Results file: ${resultsFile}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  const report = prioritizeContent(results, brand);

  // Print summary
  console.log(' PRIORITY SUMMARY');
  console.log(`  Critical: ${report.summary.critical}`);
  console.log(`  High: ${report.summary.high}`);
  console.log(`  Medium: ${report.summary.medium}`);
  console.log(`  Low: ${report.summary.low}`);

  console.log('\n TOP 10 PRIORITIES');
  for (const item of report.rankedItems.slice(0, 10)) {
    const tier = { critical: '[CRIT]', high: '[HIGH]', medium: '[MED]', low: '[LOW]' }[item.priorityTier];
    console.log(`\n  ${tier} Score: ${item.priorityScore.toFixed(0)} - "${item.name}"`);
    console.log(`    Gap: ${item.visibilityGapScore.toFixed(0)} | Traffic: ${item.trafficPotentialScore.toFixed(0)} | Competition: ${item.competitivePressureScore.toFixed(0)}`);
    if (item.details.competitorsAppearing.length > 0) {
      console.log(`    Competitors: ${item.details.competitorsAppearing.slice(0, 3).join(', ')}`);
    }
    if (item.recommendations.length > 0) {
      console.log(`    Action: ${item.recommendations[0]}`);
    }
  }

  if (report.quickWins.length > 0) {
    console.log('\n QUICK WINS (High Impact, Easy Fix)');
    for (const item of report.quickWins.slice(0, 5)) {
      console.log(`  - "${item.name}" (Score: ${item.priorityScore.toFixed(0)}, Ease: ${item.easeOfImprovementScore.toFixed(0)})`);
    }
  }

  if (report.strategicPriorities.length > 0) {
    console.log('\n STRATEGIC PRIORITIES (High Impact, Requires Investment)');
    for (const item of report.strategicPriorities.slice(0, 5)) {
      console.log(`  - "${item.name}" (Score: ${item.priorityScore.toFixed(0)})`);
    }
  }

  // Save report
  const outputPath = resultsFile.replace('.json', '-prioritization.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n Report saved to: ${outputPath}`);
}

main().catch(console.error);

export { prioritizeContent, PrioritizationReport, ContentItem };
