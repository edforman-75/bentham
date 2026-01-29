/**
 * Trend Analysis
 *
 * Tracks visibility changes over time across multiple study runs:
 * - Visibility score trends
 * - Position changes
 * - Competitor movement
 * - Surface-specific trends
 *
 * Usage:
 *   npx ts-node analyze-trends.ts --brand "Brand Name" results-jan.json results-feb.json results-mar.json
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface StudyResults {
  results: QueryResult[];
  metadata?: {
    brand?: string;
    timestamp?: string;
    studyId?: string;
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

interface StudySnapshot {
  timestamp: Date;
  studyId: string;
  filePath: string;
  metrics: SnapshotMetrics;
}

interface SnapshotMetrics {
  overallVisibility: number; // 0-100
  mentionRate: number; // % of responses with brand
  avgPosition: number;
  totalResponses: number;
  bySurface: Record<string, SurfaceMetrics>;
  byCategory: Record<string, CategoryMetrics>;
  topCompetitors: { brand: string; mentionRate: number }[];
}

interface SurfaceMetrics {
  mentionRate: number;
  avgPosition: number;
  responseCount: number;
}

interface CategoryMetrics {
  mentionRate: number;
  avgPosition: number;
  queryCount: number;
}

interface TrendPoint {
  timestamp: Date;
  value: number;
  change: number; // vs previous
  changePercent: number;
}

interface TrendAnalysis {
  metric: string;
  direction: 'improving' | 'declining' | 'stable';
  points: TrendPoint[];
  changeOverPeriod: number;
  changePercentOverPeriod: number;
  volatility: number; // Standard deviation
}

interface TrendReport {
  brand: string;
  timestamp: string;
  studyCount: number;
  periodStart: Date;
  periodEnd: Date;

  // Overall trends
  overallTrends: {
    visibility: TrendAnalysis;
    mentionRate: TrendAnalysis;
    avgPosition: TrendAnalysis;
  };

  // Surface trends
  surfaceTrends: Record<string, {
    mentionRate: TrendAnalysis;
    avgPosition: TrendAnalysis;
  }>;

  // Category trends
  categoryTrends: Record<string, {
    mentionRate: TrendAnalysis;
  }>;

  // Competitor trends
  competitorTrends: {
    brand: string;
    mentionRateTrend: TrendAnalysis;
    relativePosition: 'gaining' | 'losing' | 'stable';
  }[];

  // Key insights
  insights: {
    type: 'positive' | 'negative' | 'neutral';
    category: string;
    description: string;
    recommendation?: string;
  }[];

  // Alerts
  alerts: {
    severity: 'high' | 'medium' | 'low';
    message: string;
    metric: string;
    change: number;
  }[];

  // Raw snapshots
  snapshots: StudySnapshot[];
}

// Helper functions
function extractTimestamp(filePath: string, data: StudyResults): Date {
  // Try metadata timestamp
  if (data.metadata?.timestamp) {
    return new Date(data.metadata.timestamp);
  }

  // Try to extract from filename
  const dateMatch = filePath.match(/(\d{4}[-_]?\d{2}[-_]?\d{2})/);
  if (dateMatch) {
    return new Date(dateMatch[1].replace(/_/g, '-'));
  }

  // Try file modification time
  const stats = fs.statSync(filePath);
  return stats.mtime;
}

function calcVisibilityScore(mentionRate: number, avgPosition: number): number {
  // Composite score: mention rate weighted by position quality
  // Position 1 = 100%, Position 5+ = 50%
  const positionMultiplier = avgPosition > 0
    ? Math.max(0.5, 1 - (avgPosition - 1) * 0.1)
    : 0.5;

  return mentionRate * 100 * positionMultiplier;
}

function analyzeStudy(results: QueryResult[], brand: string): SnapshotMetrics {
  const brandLower = brand.toLowerCase();
  const totalResponses = results.length;

  // Overall metrics
  let mentionCount = 0;
  let totalPosition = 0;
  let positionCount = 0;

  const surfaceStats: Record<string, { mentions: number; positions: number[]; total: number }> = {};
  const categoryStats: Record<string, { mentions: number; positions: number[]; total: number }> = {};
  const competitorCounts: Record<string, number> = {};

  const competitorPattern = /\b(Nike|Adidas|Lululemon|Under Armour|Patagonia|Amazon|Walmart|Target|REI|Puma|Reebok|New Balance|Brooks|ASICS|Saucony|On Running|Hoka|Allbirds)\b/gi;

  for (const result of results) {
    const surface = result.surface || 'unknown';
    const category = result.category || 'general';
    const responseLower = result.response.toLowerCase();

    // Initialize stats
    if (!surfaceStats[surface]) {
      surfaceStats[surface] = { mentions: 0, positions: [], total: 0 };
    }
    if (!categoryStats[category]) {
      categoryStats[category] = { mentions: 0, positions: [], total: 0 };
    }

    surfaceStats[surface].total++;
    categoryStats[category].total++;

    // Check brand mention
    if (responseLower.includes(brandLower)) {
      mentionCount++;
      surfaceStats[surface].mentions++;
      categoryStats[category].mentions++;

      // Find position
      const segments = result.response.split(/[,\n•\-\d\.]+/).filter(s => s.trim());
      let pos = 1;
      for (const segment of segments) {
        if (segment.toLowerCase().includes(brandLower)) {
          totalPosition += pos;
          positionCount++;
          surfaceStats[surface].positions.push(pos);
          categoryStats[category].positions.push(pos);
          break;
        }
        if (segment.match(/[A-Z][a-z]+/) && segment.trim().length > 2) {
          pos++;
        }
      }
    }

    // Track competitors
    const competitors = result.response.match(competitorPattern) || [];
    for (const comp of competitors) {
      const compNorm = comp.charAt(0).toUpperCase() + comp.slice(1).toLowerCase();
      if (compNorm.toLowerCase() !== brandLower) {
        competitorCounts[compNorm] = (competitorCounts[compNorm] || 0) + 1;
      }
    }
  }

  const mentionRate = mentionCount / totalResponses;
  const avgPosition = positionCount > 0 ? totalPosition / positionCount : 0;

  // Build surface metrics
  const bySurface: Record<string, SurfaceMetrics> = {};
  for (const [surface, stats] of Object.entries(surfaceStats)) {
    bySurface[surface] = {
      mentionRate: stats.mentions / stats.total,
      avgPosition: stats.positions.length > 0
        ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length
        : 0,
      responseCount: stats.total,
    };
  }

  // Build category metrics
  const byCategory: Record<string, CategoryMetrics> = {};
  for (const [category, stats] of Object.entries(categoryStats)) {
    byCategory[category] = {
      mentionRate: stats.mentions / stats.total,
      avgPosition: stats.positions.length > 0
        ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length
        : 0,
      queryCount: stats.total,
    };
  }

  // Top competitors
  const topCompetitors = Object.entries(competitorCounts)
    .map(([brand, count]) => ({ brand, mentionRate: count / totalResponses }))
    .sort((a, b) => b.mentionRate - a.mentionRate)
    .slice(0, 10);

  return {
    overallVisibility: calcVisibilityScore(mentionRate, avgPosition),
    mentionRate,
    avgPosition,
    totalResponses,
    bySurface,
    byCategory,
    topCompetitors,
  };
}

function analyzeTrend(points: { timestamp: Date; value: number }[]): TrendAnalysis {
  if (points.length < 2) {
    return {
      metric: '',
      direction: 'stable',
      points: points.map(p => ({ timestamp: p.timestamp, value: p.value, change: 0, changePercent: 0 })),
      changeOverPeriod: 0,
      changePercentOverPeriod: 0,
      volatility: 0,
    };
  }

  // Sort by timestamp
  const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Calculate changes
  const trendPoints: TrendPoint[] = sorted.map((p, i) => {
    if (i === 0) {
      return { timestamp: p.timestamp, value: p.value, change: 0, changePercent: 0 };
    }
    const prev = sorted[i - 1];
    const change = p.value - prev.value;
    const changePercent = prev.value !== 0 ? (change / prev.value) * 100 : 0;
    return { timestamp: p.timestamp, value: p.value, change, changePercent };
  });

  // Overall change
  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;
  const changeOverPeriod = last - first;
  const changePercentOverPeriod = first !== 0 ? (changeOverPeriod / first) * 100 : 0;

  // Calculate volatility (standard deviation)
  const values = sorted.map(p => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const volatility = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);

  // Determine direction
  let direction: TrendAnalysis['direction'] = 'stable';
  if (changePercentOverPeriod > 5) direction = 'improving';
  else if (changePercentOverPeriod < -5) direction = 'declining';

  return {
    metric: '',
    direction,
    points: trendPoints,
    changeOverPeriod,
    changePercentOverPeriod,
    volatility,
  };
}

function generateInsights(
  overallTrends: TrendReport['overallTrends'],
  surfaceTrends: TrendReport['surfaceTrends'],
  competitorTrends: TrendReport['competitorTrends']
): TrendReport['insights'] {
  const insights: TrendReport['insights'] = [];

  // Overall visibility trend
  if (overallTrends.visibility.direction === 'improving') {
    insights.push({
      type: 'positive',
      category: 'visibility',
      description: `Overall visibility improved by ${overallTrends.visibility.changePercentOverPeriod.toFixed(1)}%`,
    });
  } else if (overallTrends.visibility.direction === 'declining') {
    insights.push({
      type: 'negative',
      category: 'visibility',
      description: `Overall visibility declined by ${Math.abs(overallTrends.visibility.changePercentOverPeriod).toFixed(1)}%`,
      recommendation: 'Investigate content changes and competitor activity',
    });
  }

  // Position trend
  if (overallTrends.avgPosition.changeOverPeriod < -0.5) {
    insights.push({
      type: 'positive',
      category: 'position',
      description: `Average position improved from ${(overallTrends.avgPosition.points[0]?.value || 0).toFixed(1)} to ${(overallTrends.avgPosition.points[overallTrends.avgPosition.points.length - 1]?.value || 0).toFixed(1)}`,
    });
  } else if (overallTrends.avgPosition.changeOverPeriod > 0.5) {
    insights.push({
      type: 'negative',
      category: 'position',
      description: `Average position declined (higher number = worse)`,
      recommendation: 'Focus on authority building and content quality',
    });
  }

  // Surface-specific insights
  for (const [surface, trends] of Object.entries(surfaceTrends)) {
    if (trends.mentionRate.changePercentOverPeriod > 20) {
      insights.push({
        type: 'positive',
        category: 'surface',
        description: `Strong improvement on ${surface}: +${trends.mentionRate.changePercentOverPeriod.toFixed(1)}% mention rate`,
      });
    } else if (trends.mentionRate.changePercentOverPeriod < -20) {
      insights.push({
        type: 'negative',
        category: 'surface',
        description: `Declining presence on ${surface}: ${trends.mentionRate.changePercentOverPeriod.toFixed(1)}% mention rate`,
        recommendation: `Review ${surface}-specific content optimization`,
      });
    }
  }

  // Competitor insights
  const gainingCompetitors = competitorTrends.filter(c => c.relativePosition === 'gaining');
  if (gainingCompetitors.length > 0) {
    insights.push({
      type: 'negative',
      category: 'competition',
      description: `${gainingCompetitors.map(c => c.brand).join(', ')} gaining visibility`,
      recommendation: 'Analyze their content strategy and respond',
    });
  }

  return insights;
}

function generateAlerts(
  overallTrends: TrendReport['overallTrends'],
  surfaceTrends: TrendReport['surfaceTrends']
): TrendReport['alerts'] {
  const alerts: TrendReport['alerts'] = [];

  // Major visibility drop
  if (overallTrends.visibility.changePercentOverPeriod < -15) {
    alerts.push({
      severity: 'high',
      message: 'Significant visibility drop detected',
      metric: 'visibility',
      change: overallTrends.visibility.changePercentOverPeriod,
    });
  }

  // Position drop
  if (overallTrends.avgPosition.changeOverPeriod > 1) {
    alerts.push({
      severity: 'medium',
      message: 'Brand position declining in AI responses',
      metric: 'position',
      change: overallTrends.avgPosition.changeOverPeriod,
    });
  }

  // Surface-specific drops
  for (const [surface, trends] of Object.entries(surfaceTrends)) {
    if (trends.mentionRate.changePercentOverPeriod < -30) {
      alerts.push({
        severity: 'high',
        message: `Major drop on ${surface}`,
        metric: `${surface}_mentionRate`,
        change: trends.mentionRate.changePercentOverPeriod,
      });
    }
  }

  // High volatility
  if (overallTrends.visibility.volatility > 15) {
    alerts.push({
      severity: 'medium',
      message: 'High visibility volatility - results may be inconsistent',
      metric: 'volatility',
      change: overallTrends.visibility.volatility,
    });
  }

  return alerts;
}

// Main analysis function
function analyzeTrends(
  studyFiles: string[],
  brand: string
): TrendReport {
  const timestamp = new Date().toISOString();

  // Load and analyze all studies
  const snapshots: StudySnapshot[] = [];

  for (const filePath of studyFiles) {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const data: StudyResults = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const results = data.results || [];

    if (results.length === 0) {
      console.warn(`No results in: ${filePath}`);
      continue;
    }

    const snapshotTimestamp = extractTimestamp(filePath, data);
    const metrics = analyzeStudy(results, brand);

    snapshots.push({
      timestamp: snapshotTimestamp,
      studyId: data.metadata?.studyId || path.basename(filePath, '.json'),
      filePath,
      metrics,
    });
  }

  // Sort by timestamp
  snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (snapshots.length < 2) {
    throw new Error('Need at least 2 studies for trend analysis');
  }

  const periodStart = snapshots[0].timestamp;
  const periodEnd = snapshots[snapshots.length - 1].timestamp;

  // Analyze overall trends
  const visibilityTrend = analyzeTrend(
    snapshots.map(s => ({ timestamp: s.timestamp, value: s.metrics.overallVisibility }))
  );
  visibilityTrend.metric = 'visibility';

  const mentionRateTrend = analyzeTrend(
    snapshots.map(s => ({ timestamp: s.timestamp, value: s.metrics.mentionRate * 100 }))
  );
  mentionRateTrend.metric = 'mentionRate';

  const positionTrend = analyzeTrend(
    snapshots.map(s => ({ timestamp: s.timestamp, value: s.metrics.avgPosition }))
  );
  positionTrend.metric = 'avgPosition';
  // Invert direction for position (lower is better)
  if (positionTrend.changeOverPeriod < -0.5) positionTrend.direction = 'improving';
  else if (positionTrend.changeOverPeriod > 0.5) positionTrend.direction = 'declining';
  else positionTrend.direction = 'stable';

  // Analyze surface trends
  const allSurfaces = new Set<string>();
  for (const snapshot of snapshots) {
    for (const surface of Object.keys(snapshot.metrics.bySurface)) {
      allSurfaces.add(surface);
    }
  }

  const surfaceTrends: TrendReport['surfaceTrends'] = {};
  for (const surface of allSurfaces) {
    const mentionPoints = snapshots
      .filter(s => s.metrics.bySurface[surface])
      .map(s => ({
        timestamp: s.timestamp,
        value: (s.metrics.bySurface[surface]?.mentionRate || 0) * 100,
      }));

    const positionPoints = snapshots
      .filter(s => s.metrics.bySurface[surface]?.avgPosition)
      .map(s => ({
        timestamp: s.timestamp,
        value: s.metrics.bySurface[surface]?.avgPosition || 0,
      }));

    if (mentionPoints.length >= 2) {
      const mentionTrend = analyzeTrend(mentionPoints);
      mentionTrend.metric = `${surface}_mentionRate`;

      const posTrend = analyzeTrend(positionPoints);
      posTrend.metric = `${surface}_position`;
      if (posTrend.changeOverPeriod < -0.5) posTrend.direction = 'improving';
      else if (posTrend.changeOverPeriod > 0.5) posTrend.direction = 'declining';

      surfaceTrends[surface] = {
        mentionRate: mentionTrend,
        avgPosition: posTrend,
      };
    }
  }

  // Analyze category trends
  const allCategories = new Set<string>();
  for (const snapshot of snapshots) {
    for (const category of Object.keys(snapshot.metrics.byCategory)) {
      allCategories.add(category);
    }
  }

  const categoryTrends: TrendReport['categoryTrends'] = {};
  for (const category of allCategories) {
    const points = snapshots
      .filter(s => s.metrics.byCategory[category])
      .map(s => ({
        timestamp: s.timestamp,
        value: (s.metrics.byCategory[category]?.mentionRate || 0) * 100,
      }));

    if (points.length >= 2) {
      const trend = analyzeTrend(points);
      trend.metric = `${category}_mentionRate`;
      categoryTrends[category] = { mentionRate: trend };
    }
  }

  // Analyze competitor trends
  const allCompetitors = new Set<string>();
  for (const snapshot of snapshots) {
    for (const comp of snapshot.metrics.topCompetitors) {
      allCompetitors.add(comp.brand);
    }
  }

  const competitorTrends: TrendReport['competitorTrends'] = [];
  for (const competitor of allCompetitors) {
    const points = snapshots.map(s => {
      const compData = s.metrics.topCompetitors.find(c => c.brand === competitor);
      return {
        timestamp: s.timestamp,
        value: compData ? compData.mentionRate * 100 : 0,
      };
    });

    if (points.length >= 2) {
      const trend = analyzeTrend(points);
      trend.metric = `${competitor}_mentionRate`;

      // Compare to brand trend
      let relativePosition: 'gaining' | 'losing' | 'stable' = 'stable';
      if (trend.changePercentOverPeriod > mentionRateTrend.changePercentOverPeriod + 5) {
        relativePosition = 'gaining';
      } else if (trend.changePercentOverPeriod < mentionRateTrend.changePercentOverPeriod - 5) {
        relativePosition = 'losing';
      }

      competitorTrends.push({
        brand: competitor,
        mentionRateTrend: trend,
        relativePosition,
      });
    }
  }

  // Generate insights and alerts
  const overallTrends = {
    visibility: visibilityTrend,
    mentionRate: mentionRateTrend,
    avgPosition: positionTrend,
  };

  const insights = generateInsights(overallTrends, surfaceTrends, competitorTrends);
  const alerts = generateAlerts(overallTrends, surfaceTrends);

  return {
    brand,
    timestamp,
    studyCount: snapshots.length,
    periodStart,
    periodEnd,
    overallTrends,
    surfaceTrends,
    categoryTrends,
    competitorTrends,
    insights,
    alerts,
    snapshots,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Trend Analysis');
    console.log('\nUsage: npx ts-node analyze-trends.ts --brand "Brand Name" study1.json study2.json [study3.json ...]');
    console.log('\nExample:');
    console.log('  npx ts-node analyze-trends.ts --brand "Nike" results-jan.json results-feb.json results-mar.json');
    console.log('\nNote: Files should be in chronological order or contain timestamp metadata.');
    process.exit(1);
  }

  let brand = 'Unknown';
  const brandIndex = args.indexOf('--brand');
  if (brandIndex !== -1 && args[brandIndex + 1]) {
    brand = args[brandIndex + 1];
    args.splice(brandIndex, 2);
  }

  const studyFiles = args.filter(a => a.endsWith('.json'));

  if (studyFiles.length < 2) {
    console.error('Need at least 2 study files for trend analysis');
    process.exit(1);
  }

  console.log('\n TREND ANALYSIS');
  console.log(`Brand: ${brand}`);
  console.log(`Studies: ${studyFiles.length}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  const report = analyzeTrends(studyFiles, brand);

  // Print summary
  console.log(` PERIOD: ${report.periodStart.toDateString()} to ${report.periodEnd.toDateString()}`);

  console.log('\n OVERALL TRENDS');
  const visTrend = report.overallTrends.visibility;
  const dirIcon = { improving: '[UP]', declining: '[DOWN]', stable: '[--]' };
  console.log(`  Visibility: ${dirIcon[visTrend.direction]} ${visTrend.changePercentOverPeriod.toFixed(1)}% change`);
  console.log(`    Start: ${visTrend.points[0]?.value.toFixed(1)} | End: ${visTrend.points[visTrend.points.length - 1]?.value.toFixed(1)}`);

  const mentionTrend = report.overallTrends.mentionRate;
  console.log(`  Mention Rate: ${dirIcon[mentionTrend.direction]} ${mentionTrend.changePercentOverPeriod.toFixed(1)}% change`);

  const posTrend = report.overallTrends.avgPosition;
  console.log(`  Position: ${dirIcon[posTrend.direction]} ${posTrend.changeOverPeriod > 0 ? '+' : ''}${posTrend.changeOverPeriod.toFixed(2)}`);

  if (Object.keys(report.surfaceTrends).length > 0) {
    console.log('\n SURFACE TRENDS');
    for (const [surface, trends] of Object.entries(report.surfaceTrends)) {
      const dir = dirIcon[trends.mentionRate.direction];
      console.log(`  ${surface}: ${dir} ${trends.mentionRate.changePercentOverPeriod.toFixed(1)}%`);
    }
  }

  if (report.competitorTrends.length > 0) {
    console.log('\n COMPETITOR MOVEMENT');
    const sorted = [...report.competitorTrends].sort((a, b) =>
      b.mentionRateTrend.changePercentOverPeriod - a.mentionRateTrend.changePercentOverPeriod
    );
    for (const comp of sorted.slice(0, 5)) {
      const rel = { gaining: '[GAINING]', losing: '[LOSING]', stable: '[STABLE]' }[comp.relativePosition];
      console.log(`  ${comp.brand}: ${comp.mentionRateTrend.changePercentOverPeriod.toFixed(1)}% ${rel}`);
    }
  }

  if (report.alerts.length > 0) {
    console.log('\n ALERTS');
    for (const alert of report.alerts) {
      const sev = { high: '[HIGH]', medium: '[MED]', low: '[LOW]' }[alert.severity];
      console.log(`  ${sev} ${alert.message}`);
    }
  }

  if (report.insights.length > 0) {
    console.log('\n INSIGHTS');
    for (const insight of report.insights) {
      const type = { positive: '[+]', negative: '[-]', neutral: '[=]' }[insight.type];
      console.log(`  ${type} ${insight.description}`);
      if (insight.recommendation) {
        console.log(`      Action: ${insight.recommendation}`);
      }
    }
  }

  // Save report
  const outputPath = `trend-analysis-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n Report saved to: ${outputPath}`);
}

main().catch(console.error);

export { analyzeTrends, TrendReport, TrendAnalysis, StudySnapshot };
