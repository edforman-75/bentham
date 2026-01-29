/**
 * Highlight Change (Diff Algorithm)
 *
 * Compares content versions and highlights changes:
 * - Text diff visualization
 * - Structured data diff (JSON-LD, meta tags)
 * - Impact assessment of changes
 * - Change categorization
 *
 * Usage:
 *   npx ts-node highlight-changes.ts --before content-v1.json --after content-v2.json
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface ContentVersion {
  url: string;
  timestamp: string;
  title?: string;
  description?: string;
  content?: string;
  jsonLd?: Record<string, any>;
  metaTags?: Record<string, string>;
  headings?: string[];
  structuredData?: any;
}

interface DiffSegment {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  before?: string;
  after?: string;
  value?: string;
}

interface FieldChange {
  field: string;
  path: string;
  changeType: 'added' | 'removed' | 'modified';
  before: any;
  after: any;
  impact: 'high' | 'medium' | 'low';
  category: ChangeCategory;
}

type ChangeCategory =
  | 'seo-critical' // Title, description, H1
  | 'structured-data' // JSON-LD, schema
  | 'content' // Body text
  | 'metadata' // Meta tags
  | 'technical'; // URLs, canonicals

interface ChangeHighlight {
  id: string;
  field: string;
  category: ChangeCategory;
  impact: 'high' | 'medium' | 'low';
  summary: string;
  diff: DiffSegment[];
  recommendation?: string;
}

interface DiffReport {
  url: string;
  timestamp: string;
  beforeTimestamp: string;
  afterTimestamp: string;

  // Summary
  summary: {
    totalChanges: number;
    highImpact: number;
    mediumImpact: number;
    lowImpact: number;
    byCategory: Record<ChangeCategory, number>;
  };

  // All changes
  changes: FieldChange[];

  // Highlighted changes (with diff visualization)
  highlights: ChangeHighlight[];

  // Impact assessment
  impactAssessment: {
    aiVisibilityImpact: 'positive' | 'negative' | 'neutral' | 'unknown';
    seoImpact: 'positive' | 'negative' | 'neutral' | 'unknown';
    riskLevel: 'high' | 'medium' | 'low';
    recommendations: string[];
  };

  // Change timeline
  timeline: {
    field: string;
    timestamp: string;
    change: string;
  }[];
}

// Impact scoring for different fields
const FIELD_IMPACT: Record<string, { impact: FieldChange['impact']; category: ChangeCategory }> = {
  'title': { impact: 'high', category: 'seo-critical' },
  'description': { impact: 'high', category: 'seo-critical' },
  'h1': { impact: 'high', category: 'seo-critical' },
  'jsonLd.name': { impact: 'high', category: 'structured-data' },
  'jsonLd.description': { impact: 'high', category: 'structured-data' },
  'jsonLd.brand': { impact: 'high', category: 'structured-data' },
  'jsonLd.@type': { impact: 'medium', category: 'structured-data' },
  'jsonLd.offers': { impact: 'medium', category: 'structured-data' },
  'jsonLd.aggregateRating': { impact: 'medium', category: 'structured-data' },
  'jsonLd.review': { impact: 'medium', category: 'structured-data' },
  'metaTags.og:title': { impact: 'medium', category: 'metadata' },
  'metaTags.og:description': { impact: 'medium', category: 'metadata' },
  'metaTags.robots': { impact: 'high', category: 'technical' },
  'metaTags.canonical': { impact: 'high', category: 'technical' },
  'content': { impact: 'medium', category: 'content' },
  'headings': { impact: 'low', category: 'content' },
};

// Simple diff algorithm (line-based)
function computeLineDiff(before: string, after: string): DiffSegment[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const segments: DiffSegment[] = [];

  // LCS-based diff (simplified)
  const lcs = computeLCS(beforeLines, afterLines);

  let beforeIdx = 0;
  let afterIdx = 0;
  let lcsIdx = 0;

  while (beforeIdx < beforeLines.length || afterIdx < afterLines.length) {
    if (lcsIdx < lcs.length && beforeIdx < beforeLines.length && beforeLines[beforeIdx] === lcs[lcsIdx]) {
      if (afterIdx < afterLines.length && afterLines[afterIdx] === lcs[lcsIdx]) {
        // Unchanged
        segments.push({ type: 'unchanged', value: lcs[lcsIdx] });
        beforeIdx++;
        afterIdx++;
        lcsIdx++;
      } else {
        // Added in after
        segments.push({ type: 'added', after: afterLines[afterIdx] });
        afterIdx++;
      }
    } else if (beforeIdx < beforeLines.length) {
      // Removed from before
      segments.push({ type: 'removed', before: beforeLines[beforeIdx] });
      beforeIdx++;
    } else if (afterIdx < afterLines.length) {
      // Added in after
      segments.push({ type: 'added', after: afterLines[afterIdx] });
      afterIdx++;
    }
  }

  return segments;
}

// Compute Longest Common Subsequence
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

// Simple word-level diff for short strings
function computeWordDiff(before: string, after: string): DiffSegment[] {
  const beforeWords = before.split(/\s+/);
  const afterWords = after.split(/\s+/);

  if (beforeWords.length < 20 && afterWords.length < 20) {
    const lcs = computeLCS(beforeWords, afterWords);
    const segments: DiffSegment[] = [];

    let beforeIdx = 0;
    let afterIdx = 0;
    let lcsIdx = 0;

    while (beforeIdx < beforeWords.length || afterIdx < afterWords.length) {
      if (lcsIdx < lcs.length && beforeIdx < beforeWords.length && beforeWords[beforeIdx] === lcs[lcsIdx]) {
        if (afterIdx < afterWords.length && afterWords[afterIdx] === lcs[lcsIdx]) {
          segments.push({ type: 'unchanged', value: lcs[lcsIdx] });
          beforeIdx++;
          afterIdx++;
          lcsIdx++;
        } else {
          segments.push({ type: 'added', after: afterWords[afterIdx] });
          afterIdx++;
        }
      } else if (beforeIdx < beforeWords.length) {
        segments.push({ type: 'removed', before: beforeWords[beforeIdx] });
        beforeIdx++;
      } else if (afterIdx < afterWords.length) {
        segments.push({ type: 'added', after: afterWords[afterIdx] });
        afterIdx++;
      }
    }

    return segments;
  }

  // Fall back to simple before/after for long strings
  return [
    { type: 'removed', before },
    { type: 'added', after },
  ];
}

// Compare two values and return change info
function compareValues(
  path: string,
  before: any,
  after: any
): FieldChange | null {
  const beforeStr = JSON.stringify(before);
  const afterStr = JSON.stringify(after);

  if (beforeStr === afterStr) {
    return null;
  }

  const fieldInfo = FIELD_IMPACT[path] || { impact: 'low' as const, category: 'content' as const };

  let changeType: FieldChange['changeType'] = 'modified';
  if (before === undefined || before === null || before === '') {
    changeType = 'added';
  } else if (after === undefined || after === null || after === '') {
    changeType = 'removed';
  }

  return {
    field: path.split('.').pop() || path,
    path,
    changeType,
    before,
    after,
    impact: fieldInfo.impact,
    category: fieldInfo.category,
  };
}

// Recursively compare objects
function compareObjects(
  before: Record<string, any>,
  after: Record<string, any>,
  prefix: string = ''
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const beforeVal = before?.[key];
    const afterVal = after?.[key];

    if (typeof beforeVal === 'object' && typeof afterVal === 'object' &&
        beforeVal !== null && afterVal !== null &&
        !Array.isArray(beforeVal) && !Array.isArray(afterVal)) {
      // Recurse into nested objects
      changes.push(...compareObjects(beforeVal, afterVal, path));
    } else {
      const change = compareValues(path, beforeVal, afterVal);
      if (change) {
        changes.push(change);
      }
    }
  }

  return changes;
}

// Create highlight from change
function createHighlight(change: FieldChange, index: number): ChangeHighlight {
  let diff: DiffSegment[] = [];
  let summary = '';

  const beforeStr = typeof change.before === 'string' ? change.before : JSON.stringify(change.before);
  const afterStr = typeof change.after === 'string' ? change.after : JSON.stringify(change.after);

  switch (change.changeType) {
    case 'added':
      summary = `Added ${change.field}`;
      diff = [{ type: 'added', after: afterStr }];
      break;
    case 'removed':
      summary = `Removed ${change.field}`;
      diff = [{ type: 'removed', before: beforeStr }];
      break;
    case 'modified':
      summary = `Modified ${change.field}`;
      if (typeof change.before === 'string' && typeof change.after === 'string') {
        diff = computeWordDiff(change.before, change.after);
      } else {
        diff = [
          { type: 'removed', before: beforeStr },
          { type: 'added', after: afterStr },
        ];
      }
      break;
  }

  // Generate recommendation
  let recommendation: string | undefined;
  if (change.category === 'seo-critical') {
    if (change.changeType === 'removed') {
      recommendation = `Critical: ${change.field} was removed. This may negatively impact visibility.`;
    } else if (change.changeType === 'modified') {
      recommendation = `Review the ${change.field} change for AI visibility impact.`;
    }
  } else if (change.category === 'structured-data') {
    recommendation = `Verify JSON-LD changes validate correctly at schema.org validator.`;
  }

  return {
    id: `change-${index}`,
    field: change.field,
    category: change.category,
    impact: change.impact,
    summary,
    diff,
    recommendation,
  };
}

// Assess overall impact
function assessImpact(changes: FieldChange[]): DiffReport['impactAssessment'] {
  const recommendations: string[] = [];

  // Count by impact
  const highImpactChanges = changes.filter(c => c.impact === 'high');
  const criticalRemovals = changes.filter(c =>
    c.impact === 'high' && c.changeType === 'removed'
  );

  // AI visibility impact
  let aiVisibilityImpact: 'positive' | 'negative' | 'neutral' | 'unknown' = 'neutral';

  // Check for positive signals
  const addedStructuredData = changes.some(c =>
    c.category === 'structured-data' && c.changeType === 'added'
  );
  const improvedDescription = changes.some(c =>
    c.field === 'description' && c.changeType === 'modified' &&
    (c.after?.length || 0) > (c.before?.length || 0)
  );

  if (addedStructuredData || improvedDescription) {
    aiVisibilityImpact = 'positive';
    recommendations.push('Added structured data or improved descriptions can improve AI visibility.');
  }

  // Check for negative signals
  if (criticalRemovals.length > 0) {
    aiVisibilityImpact = 'negative';
    recommendations.push(`${criticalRemovals.length} critical field(s) were removed. Review immediately.`);
  }

  // SEO impact
  let seoImpact: 'positive' | 'negative' | 'neutral' | 'unknown' = 'neutral';
  const titleChanged = changes.some(c => c.field === 'title');
  const descriptionChanged = changes.some(c => c.field === 'description');
  const robotsChanged = changes.some(c => c.path.includes('robots'));

  if (robotsChanged) {
    seoImpact = 'unknown';
    recommendations.push('Robots meta tag changed - verify indexability.');
  } else if (titleChanged || descriptionChanged) {
    seoImpact = 'unknown';
    recommendations.push('Title/description changed - monitor search rankings.');
  }

  // Risk level
  let riskLevel: 'high' | 'medium' | 'low' = 'low';
  if (criticalRemovals.length > 0 || robotsChanged) {
    riskLevel = 'high';
  } else if (highImpactChanges.length > 2) {
    riskLevel = 'medium';
  }

  if (riskLevel === 'high') {
    recommendations.unshift('HIGH RISK: Review changes before publishing.');
  }

  return {
    aiVisibilityImpact,
    seoImpact,
    riskLevel,
    recommendations,
  };
}

// Main diff function
function highlightChanges(
  before: ContentVersion,
  after: ContentVersion
): DiffReport {
  const timestamp = new Date().toISOString();

  // Compare all fields
  const changes: FieldChange[] = [];

  // Simple fields
  const simpleFields = ['title', 'description', 'content'];
  for (const field of simpleFields) {
    const change = compareValues(field, (before as any)[field], (after as any)[field]);
    if (change) changes.push(change);
  }

  // Headings
  if (before.headings || after.headings) {
    const h1Before = before.headings?.[0];
    const h1After = after.headings?.[0];
    const change = compareValues('h1', h1Before, h1After);
    if (change) changes.push(change);
  }

  // JSON-LD
  if (before.jsonLd || after.jsonLd) {
    changes.push(...compareObjects(before.jsonLd || {}, after.jsonLd || {}, 'jsonLd'));
  }

  // Meta tags
  if (before.metaTags || after.metaTags) {
    changes.push(...compareObjects(before.metaTags || {}, after.metaTags || {}, 'metaTags'));
  }

  // Create highlights
  const highlights = changes.map((change, index) => createHighlight(change, index));

  // Summary
  const summary = {
    totalChanges: changes.length,
    highImpact: changes.filter(c => c.impact === 'high').length,
    mediumImpact: changes.filter(c => c.impact === 'medium').length,
    lowImpact: changes.filter(c => c.impact === 'low').length,
    byCategory: {
      'seo-critical': changes.filter(c => c.category === 'seo-critical').length,
      'structured-data': changes.filter(c => c.category === 'structured-data').length,
      'content': changes.filter(c => c.category === 'content').length,
      'metadata': changes.filter(c => c.category === 'metadata').length,
      'technical': changes.filter(c => c.category === 'technical').length,
    } as Record<ChangeCategory, number>,
  };

  // Impact assessment
  const impactAssessment = assessImpact(changes);

  // Timeline
  const timeline = changes.map(c => ({
    field: c.field,
    timestamp: after.timestamp,
    change: c.changeType,
  }));

  return {
    url: after.url || before.url,
    timestamp,
    beforeTimestamp: before.timestamp,
    afterTimestamp: after.timestamp,
    summary,
    changes,
    highlights,
    impactAssessment,
    timeline,
  };
}

// Format diff for console output
function formatDiffForConsole(highlights: ChangeHighlight[]): void {
  for (const h of highlights) {
    const impactIcon = { high: '[!!!]', medium: '[!!]', low: '[!]' }[h.impact];
    console.log(`\n${impactIcon} ${h.summary} (${h.category})`);

    for (const seg of h.diff) {
      if (seg.type === 'removed' && seg.before) {
        console.log(`  - ${seg.before}`);
      } else if (seg.type === 'added' && seg.after) {
        console.log(`  + ${seg.after}`);
      } else if (seg.type === 'unchanged' && seg.value) {
        console.log(`    ${seg.value}`);
      }
    }

    if (h.recommendation) {
      console.log(`  >> ${h.recommendation}`);
    }
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.log('Highlight Changes (Diff)');
    console.log('\nUsage: npx ts-node highlight-changes.ts --before <file1.json> --after <file2.json>');
    console.log('\nExample:');
    console.log('  npx ts-node highlight-changes.ts --before content-v1.json --after content-v2.json');
    console.log('\nContent file format:');
    console.log('  {');
    console.log('    "url": "https://example.com/product",');
    console.log('    "timestamp": "2024-01-15T10:00:00Z",');
    console.log('    "title": "Product Title",');
    console.log('    "description": "Product description...",');
    console.log('    "jsonLd": { "@type": "Product", "name": "...", ... },');
    console.log('    "metaTags": { "og:title": "...", ... }');
    console.log('  }');
    process.exit(1);
  }

  const beforeIndex = args.indexOf('--before');
  const afterIndex = args.indexOf('--after');

  if (beforeIndex === -1 || afterIndex === -1) {
    console.error('Both --before and --after flags are required');
    process.exit(1);
  }

  const beforeFile = args[beforeIndex + 1];
  const afterFile = args[afterIndex + 1];

  if (!fs.existsSync(beforeFile)) {
    console.error(`File not found: ${beforeFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(afterFile)) {
    console.error(`File not found: ${afterFile}`);
    process.exit(1);
  }

  const before: ContentVersion = JSON.parse(fs.readFileSync(beforeFile, 'utf-8'));
  const after: ContentVersion = JSON.parse(fs.readFileSync(afterFile, 'utf-8'));

  console.log('\n CONTENT DIFF');
  console.log(`Before: ${beforeFile}`);
  console.log(`After: ${afterFile}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  const report = highlightChanges(before, after);

  // Print summary
  console.log(' SUMMARY');
  console.log(`  Total Changes: ${report.summary.totalChanges}`);
  console.log(`  High Impact: ${report.summary.highImpact}`);
  console.log(`  Medium Impact: ${report.summary.mediumImpact}`);
  console.log(`  Low Impact: ${report.summary.lowImpact}`);

  console.log('\n By Category:');
  for (const [cat, count] of Object.entries(report.summary.byCategory)) {
    if (count > 0) {
      console.log(`  ${cat}: ${count}`);
    }
  }

  console.log('\n IMPACT ASSESSMENT');
  console.log(`  AI Visibility: ${report.impactAssessment.aiVisibilityImpact}`);
  console.log(`  SEO Impact: ${report.impactAssessment.seoImpact}`);
  console.log(`  Risk Level: ${report.impactAssessment.riskLevel}`);

  if (report.impactAssessment.recommendations.length > 0) {
    console.log('\n Recommendations:');
    for (const rec of report.impactAssessment.recommendations) {
      console.log(`  - ${rec}`);
    }
  }

  console.log('\n CHANGES');
  formatDiffForConsole(report.highlights);

  // Save report
  const outputPath = `diff-report-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n Report saved to: ${outputPath}`);
}

main().catch(console.error);

export { highlightChanges, DiffReport, ChangeHighlight, ContentVersion };
