/**
 * Prompt Analysis
 *
 * Analyzes query patterns and AI responses to identify:
 * - Coverage gaps (queries where brand doesn't appear)
 * - High-value queries (where brand performs well)
 * - Query intent patterns
 * - Surface-specific behaviors
 *
 * Usage:
 *   npx ts-node analyze-prompts.ts <results-file.json> --brand "Brand Name"
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface StudyResults {
  results: QueryResult[];
  metadata?: {
    brand?: string;
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

interface QueryAnalysis {
  query: string;
  intent: QueryIntent;
  category: string;
  surfaces: SurfaceResult[];
  brandMentioned: boolean;
  brandPosition: number | null;
  competitorsMentioned: string[];
  coverage: number; // % of surfaces where brand appeared
  avgPosition: number;
  recommendation: string | null;
}

interface SurfaceResult {
  surface: string;
  brandMentioned: boolean;
  brandPosition: number | null;
  responseLength: number;
  citationCount: number;
  competitorsMentioned: string[];
}

type QueryIntent =
  | 'informational'
  | 'transactional'
  | 'navigational'
  | 'comparison'
  | 'review'
  | 'best-of'
  | 'how-to';

interface PromptAnalysisReport {
  brand: string;
  timestamp: string;
  totalQueries: number;
  totalResponses: number;

  // Coverage analysis
  coverage: {
    overallRate: number; // % of responses mentioning brand
    bySurface: Record<string, { total: number; mentioned: number; rate: number }>;
    byIntent: Record<string, { total: number; mentioned: number; rate: number }>;
    byCategory: Record<string, { total: number; mentioned: number; rate: number }>;
  };

  // Gap analysis
  gaps: {
    query: string;
    intent: QueryIntent;
    category: string;
    surfaces: string[];
    competitorsAppearing: string[];
    priority: 'high' | 'medium' | 'low';
    recommendation: string;
  }[];

  // High-value queries
  highValue: {
    query: string;
    coverage: number;
    avgPosition: number;
    surfaces: string[];
  }[];

  // Intent patterns
  intentPatterns: {
    intent: QueryIntent;
    queryCount: number;
    avgBrandCoverage: number;
    avgPosition: number;
    topCompetitors: string[];
    examples: string[];
  }[];

  // Surface comparison
  surfaceComparison: {
    surface: string;
    avgResponseLength: number;
    avgCitationCount: number;
    brandMentionRate: number;
    avgBrandPosition: number;
    competitorDominance: string[]; // Competitors that appear more than brand
  }[];

  // Query recommendations
  recommendations: {
    type: 'optimize' | 'monitor' | 'target' | 'defend';
    query: string;
    reason: string;
    action: string;
  }[];
}

// Intent classification patterns
const INTENT_PATTERNS: Record<QueryIntent, RegExp[]> = {
  'best-of': [/^best\s/i, /top\s\d+/i, /top\srated/i, /highest\srated/i],
  comparison: [/\svs\s/i, /\sversus\s/i, /compare/i, /difference\sbetween/i, /or\s.*which/i],
  review: [/review/i, /rating/i, /opinion/i, /worth\sit/i, /good\sor\sbad/i],
  transactional: [/buy/i, /price/i, /discount/i, /coupon/i, /where\sto\s(get|buy|purchase)/i, /sale/i],
  'how-to': [/how\sto/i, /how\sdo\s(i|you)/i, /guide/i, /tutorial/i, /steps\sto/i],
  navigational: [/official/i, /website/i, /contact/i, /login/i, /sign\s(up|in)/i],
  informational: [/.*/], // Default fallback
};

// Common competitors for auto-detection
const COMMON_BRAND_PATTERNS = /\b(Nike|Adidas|Lululemon|Under Armour|Patagonia|Amazon|Walmart|Target|REI|Apple|Google|Microsoft|Samsung|Sony|LG|Dell|HP|Lenovo|ASUS|Acer)\b/gi;

// Helper functions
function classifyIntent(query: string): QueryIntent {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'informational') continue; // Skip default
    if (patterns.some(p => p.test(query))) {
      return intent as QueryIntent;
    }
  }
  return 'informational';
}

function extractCategory(query: string, result: QueryResult): string {
  // Use category from result if available
  if (result.category) return result.category;

  // Simple category extraction
  const queryLower = query.toLowerCase();
  if (queryLower.includes('best')) return 'best';
  if (queryLower.includes('vs') || queryLower.includes('compare')) return 'comparison';
  if (queryLower.includes('review')) return 'review';
  if (queryLower.includes('buy') || queryLower.includes('price')) return 'purchase';
  if (queryLower.includes('how')) return 'how-to';
  return 'general';
}

function findBrandPosition(text: string, brand: string): number | null {
  const textLower = text.toLowerCase();
  const brandLower = brand.toLowerCase();

  if (!textLower.includes(brandLower)) return null;

  // Find position among other brand-like entities
  const segments = text.split(/[,\n•\-\d\.]+/).filter(s => s.trim());
  let position = 1;

  for (const segment of segments) {
    if (segment.toLowerCase().includes(brandLower)) {
      return position;
    }
    // Count as a position if it looks like a brand/product mention
    if (segment.match(/[A-Z][a-z]+/) && segment.trim().length > 2) {
      position++;
    }
  }

  return position;
}

function extractCompetitors(text: string, brand: string): string[] {
  const matches = text.match(COMMON_BRAND_PATTERNS) || [];
  return [...new Set(matches)]
    .filter(m => m.toLowerCase() !== brand.toLowerCase());
}

function generateRecommendation(
  analysis: QueryAnalysis,
  brand: string
): string | null {
  if (!analysis.brandMentioned && analysis.competitorsMentioned.length > 0) {
    return `Brand absent but ${analysis.competitorsMentioned.slice(0, 2).join(', ')} appear. Create content targeting this query.`;
  }

  if (analysis.brandMentioned && analysis.avgPosition > 3) {
    return `Brand appears but in position ${analysis.avgPosition.toFixed(1)}. Improve authority signals.`;
  }

  if (analysis.coverage < 0.5 && analysis.brandMentioned) {
    return `Brand only appears on ${(analysis.coverage * 100).toFixed(0)}% of surfaces. Expand cross-platform presence.`;
  }

  return null;
}

function prioritizeGap(
  query: string,
  intent: QueryIntent,
  competitorCount: number
): 'high' | 'medium' | 'low' {
  // High priority: transactional or best-of queries with competitors
  if ((intent === 'transactional' || intent === 'best-of') && competitorCount > 0) {
    return 'high';
  }

  // Medium priority: comparison or review queries
  if (intent === 'comparison' || intent === 'review') {
    return 'medium';
  }

  // Low priority: informational or how-to
  return 'low';
}

// Main analysis function
function analyzePrompts(
  results: QueryResult[],
  brand: string
): PromptAnalysisReport {
  const timestamp = new Date().toISOString();

  // Group results by query
  const queryMap = new Map<string, QueryResult[]>();
  for (const result of results) {
    const query = result.query || result.originalQuery || result.submittedQuery || '';
    if (!queryMap.has(query)) {
      queryMap.set(query, []);
    }
    queryMap.get(query)!.push(result);
  }

  const queryAnalyses: QueryAnalysis[] = [];

  // Analyze each query
  for (const [query, queryResults] of queryMap.entries()) {
    const intent = classifyIntent(query);
    const category = extractCategory(query, queryResults[0]);

    const surfaces: SurfaceResult[] = queryResults.map(r => {
      const surface = r.surface || 'unknown';
      const brandMentioned = r.response.toLowerCase().includes(brand.toLowerCase());
      const brandPosition = findBrandPosition(r.response, brand);
      const competitors = extractCompetitors(r.response, brand);

      return {
        surface,
        brandMentioned,
        brandPosition,
        responseLength: r.response.length,
        citationCount: r.sources?.length || 0,
        competitorsMentioned: competitors,
      };
    });

    const brandMentionedSurfaces = surfaces.filter(s => s.brandMentioned);
    const allCompetitors = [...new Set(surfaces.flatMap(s => s.competitorsMentioned))];

    const analysis: QueryAnalysis = {
      query,
      intent,
      category,
      surfaces,
      brandMentioned: brandMentionedSurfaces.length > 0,
      brandPosition: brandMentionedSurfaces.length > 0
        ? brandMentionedSurfaces.reduce((sum, s) => sum + (s.brandPosition || 0), 0) / brandMentionedSurfaces.length
        : null,
      competitorsMentioned: allCompetitors,
      coverage: brandMentionedSurfaces.length / surfaces.length,
      avgPosition: brandMentionedSurfaces.length > 0
        ? brandMentionedSurfaces.reduce((sum, s) => sum + (s.brandPosition || 0), 0) / brandMentionedSurfaces.length
        : 0,
      recommendation: null,
    };

    analysis.recommendation = generateRecommendation(analysis, brand);
    queryAnalyses.push(analysis);
  }

  // Calculate coverage metrics
  const totalResponses = results.length;
  const brandMentionedResponses = results.filter(r =>
    r.response.toLowerCase().includes(brand.toLowerCase())
  ).length;

  // Coverage by surface
  const surfaceStats: Record<string, { total: number; mentioned: number }> = {};
  for (const result of results) {
    const surface = result.surface || 'unknown';
    if (!surfaceStats[surface]) {
      surfaceStats[surface] = { total: 0, mentioned: 0 };
    }
    surfaceStats[surface].total++;
    if (result.response.toLowerCase().includes(brand.toLowerCase())) {
      surfaceStats[surface].mentioned++;
    }
  }

  const bySurface: PromptAnalysisReport['coverage']['bySurface'] = {};
  for (const [surface, stats] of Object.entries(surfaceStats)) {
    bySurface[surface] = {
      total: stats.total,
      mentioned: stats.mentioned,
      rate: stats.mentioned / stats.total,
    };
  }

  // Coverage by intent
  const intentStats: Record<string, { total: number; mentioned: number }> = {};
  for (const analysis of queryAnalyses) {
    if (!intentStats[analysis.intent]) {
      intentStats[analysis.intent] = { total: 0, mentioned: 0 };
    }
    intentStats[analysis.intent].total += analysis.surfaces.length;
    intentStats[analysis.intent].mentioned += analysis.surfaces.filter(s => s.brandMentioned).length;
  }

  const byIntent: PromptAnalysisReport['coverage']['byIntent'] = {};
  for (const [intent, stats] of Object.entries(intentStats)) {
    byIntent[intent] = {
      total: stats.total,
      mentioned: stats.mentioned,
      rate: stats.mentioned / stats.total,
    };
  }

  // Coverage by category
  const categoryStats: Record<string, { total: number; mentioned: number }> = {};
  for (const analysis of queryAnalyses) {
    if (!categoryStats[analysis.category]) {
      categoryStats[analysis.category] = { total: 0, mentioned: 0 };
    }
    categoryStats[analysis.category].total += analysis.surfaces.length;
    categoryStats[analysis.category].mentioned += analysis.surfaces.filter(s => s.brandMentioned).length;
  }

  const byCategory: PromptAnalysisReport['coverage']['byCategory'] = {};
  for (const [category, stats] of Object.entries(categoryStats)) {
    byCategory[category] = {
      total: stats.total,
      mentioned: stats.mentioned,
      rate: stats.mentioned / stats.total,
    };
  }

  // Identify gaps
  const gaps = queryAnalyses
    .filter(a => !a.brandMentioned || a.coverage < 0.5)
    .map(a => ({
      query: a.query,
      intent: a.intent,
      category: a.category,
      surfaces: a.surfaces.filter(s => !s.brandMentioned).map(s => s.surface),
      competitorsAppearing: a.competitorsMentioned,
      priority: prioritizeGap(a.query, a.intent, a.competitorsMentioned.length),
      recommendation: a.recommendation || 'Create targeted content for this query',
    }))
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  // Identify high-value queries
  const highValue = queryAnalyses
    .filter(a => a.brandMentioned && a.coverage > 0.7 && a.avgPosition <= 3)
    .map(a => ({
      query: a.query,
      coverage: a.coverage,
      avgPosition: a.avgPosition,
      surfaces: a.surfaces.filter(s => s.brandMentioned).map(s => s.surface),
    }))
    .sort((a, b) => a.avgPosition - b.avgPosition)
    .slice(0, 10);

  // Intent patterns
  const intentGroups = new Map<QueryIntent, QueryAnalysis[]>();
  for (const analysis of queryAnalyses) {
    if (!intentGroups.has(analysis.intent)) {
      intentGroups.set(analysis.intent, []);
    }
    intentGroups.get(analysis.intent)!.push(analysis);
  }

  const intentPatterns = Array.from(intentGroups.entries()).map(([intent, analyses]) => {
    const avgCoverage = analyses.reduce((sum, a) => sum + a.coverage, 0) / analyses.length;
    const mentionedAnalyses = analyses.filter(a => a.brandMentioned);
    const avgPosition = mentionedAnalyses.length > 0
      ? mentionedAnalyses.reduce((sum, a) => sum + a.avgPosition, 0) / mentionedAnalyses.length
      : 0;

    const competitorCounts: Record<string, number> = {};
    for (const a of analyses) {
      for (const comp of a.competitorsMentioned) {
        competitorCounts[comp] = (competitorCounts[comp] || 0) + 1;
      }
    }
    const topCompetitors = Object.entries(competitorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([comp]) => comp);

    return {
      intent,
      queryCount: analyses.length,
      avgBrandCoverage: avgCoverage,
      avgPosition,
      topCompetitors,
      examples: analyses.slice(0, 3).map(a => a.query),
    };
  });

  // Surface comparison
  const surfaceGroups = new Map<string, SurfaceResult[]>();
  for (const analysis of queryAnalyses) {
    for (const surface of analysis.surfaces) {
      if (!surfaceGroups.has(surface.surface)) {
        surfaceGroups.set(surface.surface, []);
      }
      surfaceGroups.get(surface.surface)!.push(surface);
    }
  }

  const surfaceComparison = Array.from(surfaceGroups.entries()).map(([surface, surfaces]) => {
    const avgResponseLength = surfaces.reduce((sum, s) => sum + s.responseLength, 0) / surfaces.length;
    const avgCitationCount = surfaces.reduce((sum, s) => sum + s.citationCount, 0) / surfaces.length;
    const brandMentions = surfaces.filter(s => s.brandMentioned);
    const brandMentionRate = brandMentions.length / surfaces.length;
    const avgBrandPosition = brandMentions.length > 0
      ? brandMentions.reduce((sum, s) => sum + (s.brandPosition || 0), 0) / brandMentions.length
      : 0;

    // Find competitors that appear more than brand
    const competitorCounts: Record<string, number> = {};
    for (const s of surfaces) {
      for (const comp of s.competitorsMentioned) {
        competitorCounts[comp] = (competitorCounts[comp] || 0) + 1;
      }
    }
    const competitorDominance = Object.entries(competitorCounts)
      .filter(([_, count]) => count > brandMentions.length)
      .map(([comp]) => comp);

    return {
      surface,
      avgResponseLength,
      avgCitationCount,
      brandMentionRate,
      avgBrandPosition,
      competitorDominance,
    };
  });

  // Generate recommendations
  const recommendations: PromptAnalysisReport['recommendations'] = [];

  // High-priority gaps
  const highPriorityGaps = gaps.filter(g => g.priority === 'high').slice(0, 5);
  for (const gap of highPriorityGaps) {
    recommendations.push({
      type: 'target',
      query: gap.query,
      reason: `High-value ${gap.intent} query where brand is absent but competitors appear`,
      action: `Create content optimized for "${gap.query}"`,
    });
  }

  // Defend high-value positions
  for (const hv of highValue.slice(0, 3)) {
    recommendations.push({
      type: 'monitor',
      query: hv.query,
      reason: `Strong position (${hv.avgPosition.toFixed(1)}) with ${(hv.coverage * 100).toFixed(0)}% coverage`,
      action: 'Monitor and maintain content freshness',
    });
  }

  // Surface-specific issues
  for (const sc of surfaceComparison) {
    if (sc.brandMentionRate < 0.3 && sc.competitorDominance.length > 0) {
      recommendations.push({
        type: 'optimize',
        query: `[${sc.surface}]`,
        reason: `Low brand visibility (${(sc.brandMentionRate * 100).toFixed(0)}%) on ${sc.surface}`,
        action: `Improve content signals for ${sc.surface} algorithm`,
      });
    }
  }

  return {
    brand,
    timestamp,
    totalQueries: queryMap.size,
    totalResponses,
    coverage: {
      overallRate: brandMentionedResponses / totalResponses,
      bySurface,
      byIntent,
      byCategory,
    },
    gaps,
    highValue,
    intentPatterns,
    surfaceComparison,
    recommendations,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Prompt Analysis');
    console.log('\nUsage: npx ts-node analyze-prompts.ts <results-file.json> --brand "Brand Name"');
    console.log('\nExample:');
    console.log('  npx ts-node analyze-prompts.ts study-results.json --brand "Nike"');
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

  console.log('\n PROMPT ANALYSIS');
  console.log(`Brand: ${brand}`);
  console.log(`Results file: ${resultsFile}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  const report = analyzePrompts(results, brand);

  // Print summary
  console.log(' COVERAGE OVERVIEW');
  console.log(`  Overall: ${(report.coverage.overallRate * 100).toFixed(1)}% of responses mention ${brand}`);

  console.log('\n  By Surface:');
  for (const [surface, stats] of Object.entries(report.coverage.bySurface)) {
    console.log(`    ${surface}: ${(stats.rate * 100).toFixed(1)}% (${stats.mentioned}/${stats.total})`);
  }

  console.log('\n  By Intent:');
  for (const [intent, stats] of Object.entries(report.coverage.byIntent)) {
    console.log(`    ${intent}: ${(stats.rate * 100).toFixed(1)}%`);
  }

  if (report.gaps.length > 0) {
    console.log('\n COVERAGE GAPS (Top 10)');
    for (const gap of report.gaps.slice(0, 10)) {
      const priority = { high: '[HIGH]', medium: '[MED]', low: '[LOW]' }[gap.priority];
      console.log(`\n  ${priority} "${gap.query}"`);
      console.log(`    Intent: ${gap.intent} | Missing on: ${gap.surfaces.join(', ')}`);
      if (gap.competitorsAppearing.length > 0) {
        console.log(`    Competitors: ${gap.competitorsAppearing.slice(0, 3).join(', ')}`);
      }
    }
  }

  if (report.highValue.length > 0) {
    console.log('\n HIGH-VALUE QUERIES (Brand Performing Well)');
    for (const hv of report.highValue.slice(0, 5)) {
      console.log(`  "${hv.query}"`);
      console.log(`    Position: ${hv.avgPosition.toFixed(1)} | Coverage: ${(hv.coverage * 100).toFixed(0)}%`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log('\n RECOMMENDATIONS');
    for (const rec of report.recommendations) {
      const type = { optimize: '[OPT]', monitor: '[MON]', target: '[TGT]', defend: '[DEF]' }[rec.type];
      console.log(`\n  ${type} ${rec.query}`);
      console.log(`    Why: ${rec.reason}`);
      console.log(`    Action: ${rec.action}`);
    }
  }

  // Save report
  const outputPath = resultsFile.replace('.json', '-prompt-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n Report saved to: ${outputPath}`);
}

main().catch(console.error);

export { analyzePrompts, PromptAnalysisReport, QueryAnalysis };
