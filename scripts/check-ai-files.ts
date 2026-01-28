#!/usr/bin/env tsx
/**
 * Check AI Files (llms.txt, robots.txt) for one or more domains
 *
 * Usage:
 *   pnpm tsx scripts/check-ai-files.ts example.com
 *   pnpm tsx scripts/check-ai-files.ts example.com competitor.com another.com
 */

import {
  collectAIFiles,
  collectAIFilesFromDomains,
  compareAIReadiness,
} from '../packages/visibility-tool/src/collectors/ai-files-collector.js';

async function main() {
  const domains = process.argv.slice(2);

  if (domains.length === 0) {
    console.log('Usage: pnpm tsx scripts/check-ai-files.ts <domain> [domain2] [domain3] ...');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm tsx scripts/check-ai-files.ts anthropic.com');
    console.log('  pnpm tsx scripts/check-ai-files.ts openai.com anthropic.com google.com');
    process.exit(1);
  }

  console.log(`\nChecking AI files for ${domains.length} domain(s)...\n`);

  if (domains.length === 1) {
    // Single domain - detailed output
    const result = await collectAIFiles(domains[0]);

    console.log('═'.repeat(60));
    console.log(`Domain: ${result.domain}`);
    console.log('═'.repeat(60));

    console.log('\n📄 llms.txt');
    console.log('─'.repeat(40));
    if (result.llmsTxt.exists) {
      console.log('  Status: ✅ Found');
      if (result.llmsTxt.sections?.title) {
        console.log(`  Title: ${result.llmsTxt.sections.title}`);
      }
      if (result.llmsTxt.sections?.description) {
        console.log(`  Description: ${result.llmsTxt.sections.description}`);
      }
      if (result.llmsTxt.sections?.urls && result.llmsTxt.sections.urls.length > 0) {
        console.log(`  URLs: ${result.llmsTxt.sections.urls.length} found`);
      }
    } else {
      console.log('  Status: ❌ Not found');
    }

    console.log('\n📄 llms-full.txt');
    console.log('─'.repeat(40));
    console.log(`  Status: ${result.llmsFullTxt.exists ? '✅ Found' : '❌ Not found'}`);

    console.log('\n🤖 robots.txt AI Bot Rules');
    console.log('─'.repeat(40));
    if (result.robotsTxt.exists) {
      console.log('  Status: ✅ Found');
      const access = result.robotsTxt.aiAccess;
      const statusIcon = (s: string) => {
        if (s === 'allowed' || s === 'not-specified') return '✅';
        if (s === 'blocked') return '🚫';
        return '⚠️';
      };
      console.log(`  GPTBot:          ${statusIcon(access.gptBot)} ${access.gptBot}`);
      console.log(`  ClaudeBot:       ${statusIcon(access.claudeBot)} ${access.claudeBot}`);
      console.log(`  Google-Extended: ${statusIcon(access.googleExtended)} ${access.googleExtended}`);
      console.log(`  PerplexityBot:   ${statusIcon(access.perplexityBot)} ${access.perplexityBot}`);
      console.log(`  Bingbot:         ${statusIcon(access.bingBot)} ${access.bingBot}`);
    } else {
      console.log('  Status: ❌ Not found (default: all bots allowed)');
    }

    console.log('\n📊 AI Readiness Score');
    console.log('─'.repeat(40));
    console.log(`  Score: ${result.aiReadinessScore}/100`);
    console.log(`  Recommendation: ${result.assessment.recommendation}`);

  } else {
    // Multiple domains - comparison view
    const results = await collectAIFilesFromDomains(domains, (completed, total, result) => {
      console.log(`  [${completed}/${total}] ${result.domain} - Score: ${result.aiReadinessScore}`);
    });

    const comparison = compareAIReadiness(results);

    console.log('\n═'.repeat(60));
    console.log('AI READINESS COMPARISON');
    console.log('═'.repeat(60));

    console.log('\nRankings:');
    console.log('─'.repeat(40));
    comparison.rankings.forEach((r, i) => {
      const icons = [];
      if (r.hasLlmsTxt) icons.push('📄');
      if (r.blocksAI) icons.push('🚫');
      console.log(`  ${i + 1}. ${r.domain}`);
      console.log(`     Score: ${r.score}/100 ${icons.join(' ')}`);
    });

    console.log('\nInsights:');
    console.log('─'.repeat(40));
    comparison.insights.forEach(insight => {
      console.log(`  • ${insight}`);
    });
  }

  console.log('\n');
}

main().catch(console.error);
