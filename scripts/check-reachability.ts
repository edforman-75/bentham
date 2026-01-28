#!/usr/bin/env tsx
/**
 * Check LLM Reachability for URLs
 *
 * Compares what AI crawlers see (raw HTML) vs what humans see (rendered with JS)
 *
 * Usage:
 *   pnpm tsx scripts/check-reachability.ts https://example.com/products/test
 */

// Note: Import from compiled output
const { analyzeReachability, analyzeReachabilityBatch, summarizeReachability } = await import(
  '../packages/visibility-tool/dist/index.js'
);

async function main() {
  const urls = process.argv.slice(2);

  if (urls.length === 0) {
    console.log('Usage: pnpm tsx scripts/check-reachability.ts <url> [url2] [url3] ...');
    console.log('');
    console.log('Checks if AI crawlers can actually see your page content.');
    console.log('Compares raw HTML (no JavaScript) vs fully rendered page.');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm tsx scripts/check-reachability.ts https://example.com/products/test');
    console.log('  pnpm tsx scripts/check-reachability.ts https://site1.com https://site2.com');
    process.exit(1);
  }

  console.log(`\nAnalyzing LLM reachability for ${urls.length} URL(s)...\n`);

  if (urls.length === 1) {
    // Single URL - detailed output
    const result = await analyzeReachability(urls[0]);

    console.log('═'.repeat(60));
    console.log('LLM REACHABILITY ANALYSIS');
    console.log('═'.repeat(60));

    console.log(`\nURL: ${result.url}`);
    console.log(`Status: ${result.success ? '✅ Success' : '❌ Failed'}`);

    if (!result.success) {
      console.log(`Error: ${result.error}`);
      process.exit(1);
    }

    console.log('\n📊 Reachability Score');
    console.log('─'.repeat(40));
    const scoreBar = '█'.repeat(Math.floor(result.reachabilityScore / 5)) +
                     '░'.repeat(20 - Math.floor(result.reachabilityScore / 5));
    console.log(`  [${scoreBar}] ${result.reachabilityScore}/100`);

    if (result.isDarkToAI) {
      console.log('\n  ⚠️  WARNING: This page is effectively DARK to AI crawlers');
      console.log('     Most content is only visible after JavaScript execution.');
    } else {
      console.log('\n  ✅ Good - AI crawlers can see most of your content');
    }

    console.log('\n📄 Content Comparison (Raw HTML vs Rendered)');
    console.log('─'.repeat(40));

    for (const comp of result.comparisons) {
      const icon = comp.severity === 'ok' ? '✅' :
                   comp.severity === 'warning' ? '⚠️' : '❌';
      console.log(`  ${icon} ${comp.field}`);
      if (typeof comp.rawValue === 'number' && typeof comp.renderedValue === 'number') {
        console.log(`     Raw: ${comp.rawValue} | Rendered: ${comp.renderedValue}`);
      } else if (comp.rawValue !== comp.renderedValue) {
        console.log(`     ${comp.message}`);
      }
    }

    console.log('\n📈 Word Count Analysis');
    console.log('─'.repeat(40));
    const raw = result.rawContent.wordCount;
    const rendered = result.renderedContent.wordCount;
    const ratio = Math.round((raw / Math.max(rendered, 1)) * 100);
    console.log(`  Raw HTML:     ${raw.toLocaleString()} words`);
    console.log(`  After JS:     ${rendered.toLocaleString()} words`);
    console.log(`  Visible to AI: ${ratio}%`);

    if (result.rawContent.jsonLdTypes.length > 0) {
      console.log('\n📊 Structured Data (in raw HTML)');
      console.log('─'.repeat(40));
      result.rawContent.jsonLdTypes.forEach(type => {
        console.log(`  ✅ ${type}`);
      });
    } else if (result.renderedContent.jsonLdTypes.length > 0) {
      console.log('\n📊 Structured Data');
      console.log('─'.repeat(40));
      console.log('  ⚠️  JSON-LD only available after JavaScript');
      result.renderedContent.jsonLdTypes.forEach(type => {
        console.log(`     - ${type}`);
      });
    }

    if (result.issues.length > 0) {
      console.log('\n⚠️  Issues Found');
      console.log('─'.repeat(40));
      result.issues.forEach(issue => {
        console.log(`  • ${issue}`);
      });
    }

    if (result.recommendations.length > 0) {
      console.log('\n💡 Recommendations');
      console.log('─'.repeat(40));
      result.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }

  } else {
    // Multiple URLs - summary view
    const results = await analyzeReachabilityBatch(urls, (completed, total, result) => {
      const icon = result.isDarkToAI ? '⚫' : (result.reachabilityScore >= 70 ? '🟢' : '🟡');
      console.log(`  [${completed}/${total}] ${icon} ${result.url} - Score: ${result.reachabilityScore}`);
    });

    const summary = summarizeReachability(results);

    console.log('\n═'.repeat(60));
    console.log('REACHABILITY SUMMARY');
    console.log('═'.repeat(60));

    console.log(`\nTotal Pages: ${summary.totalPages}`);
    console.log(`Successfully Analyzed: ${summary.successfulAnalysis}`);
    console.log(`Dark to AI: ${summary.darkToAI} (${Math.round(summary.darkToAI / summary.successfulAnalysis * 100)}%)`);
    console.log(`Average Score: ${summary.averageScore}/100`);

    if (summary.commonIssues.length > 0) {
      console.log('\nCommon Issues:');
      summary.commonIssues.forEach(({ issue, count }) => {
        console.log(`  • ${issue} (${count} pages)`);
      });
    }

    console.log('\nDetailed Results:');
    console.log('─'.repeat(40));
    results.forEach(r => {
      if (r.success) {
        const icon = r.isDarkToAI ? '⚫ DARK' : (r.reachabilityScore >= 70 ? '🟢 Good' : '🟡 Partial');
        console.log(`  ${icon} [${r.reachabilityScore}] ${r.url}`);
        if (r.issues.length > 0) {
          console.log(`       Issues: ${r.issues.slice(0, 2).join(', ')}`);
        }
      } else {
        console.log(`  ❌ Failed: ${r.url} - ${r.error}`);
      }
    });
  }

  console.log('\n');
}

main().catch(console.error);
