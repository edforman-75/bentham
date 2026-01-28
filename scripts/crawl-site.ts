#!/usr/bin/env tsx
/**
 * Site Crawler CLI
 *
 * Discovers all pages on a site with type classification
 *
 * Usage:
 *   pnpm tsx scripts/crawl-site.ts https://example.com
 *   pnpm tsx scripts/crawl-site.ts https://example.com --type=product,article
 *   pnpm tsx scripts/crawl-site.ts https://example.com --max=100
 */

import { chromium } from 'playwright';

// Note: Import from compiled output
const { crawlSite, summarizeDiscoveredPages, type PageType } = await import(
  '../packages/visibility-tool/dist/index.js'
);

async function main() {
  const args = process.argv.slice(2);
  const url = args.find(a => a.startsWith('http'));
  const typeArg = args.find(a => a.startsWith('--type='));
  const maxArg = args.find(a => a.startsWith('--max='));
  const noSitemapArg = args.includes('--no-sitemap');
  const noLinksArg = args.includes('--no-links');

  if (!url) {
    console.log('Usage: pnpm tsx scripts/crawl-site.ts <url> [options]');
    console.log('');
    console.log('Discovers all pages on a site with type classification.');
    console.log('');
    console.log('Options:');
    console.log('  --type=<types>   Filter by page types (comma-separated)');
    console.log('                   Types: product, collection, article, blog-index,');
    console.log('                          faq, landing, homepage, policy, contact, about, other');
    console.log('  --max=<number>   Maximum pages to discover (default: 500)');
    console.log('  --no-sitemap     Skip sitemap.xml parsing');
    console.log('  --no-links       Don\'t follow links (sitemap only)');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm tsx scripts/crawl-site.ts https://example.com');
    console.log('  pnpm tsx scripts/crawl-site.ts https://example.com --type=product,article');
    console.log('  pnpm tsx scripts/crawl-site.ts https://example.com --max=100 --no-links');
    process.exit(1);
  }

  // Parse options
  const includeTypes = typeArg
    ? typeArg.replace('--type=', '').split(',') as PageType[]
    : null;
  const maxPages = maxArg ? parseInt(maxArg.replace('--max=', ''), 10) : 500;

  console.log(`\nCrawling ${url}...`);
  console.log(`Options: max=${maxPages}, sitemap=${!noSitemapArg}, links=${!noLinksArg}`);
  if (includeTypes) {
    console.log(`Filtering for types: ${includeTypes.join(', ')}`);
  }
  console.log('');

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; BenthamBot/1.0; +https://gluhq.com/bentham)',
    });
    const page = await context.newPage();

    const pages = await crawlSite(page, url, {
      maxPages,
      useSitemap: !noSitemapArg,
      followLinks: !noLinksArg,
      includeTypes,
      onProgress: (discovered, crawled, current) => {
        process.stdout.write(`\r  Discovered: ${discovered} | Crawled: ${crawled} | ${current.slice(0, 60)}...`);
      },
    });

    console.log('\n');

    // Show summary
    const summary = summarizeDiscoveredPages(pages);

    console.log('═'.repeat(60));
    console.log('SITE CRAWL SUMMARY');
    console.log('═'.repeat(60));
    console.log(`\nTotal pages discovered: ${summary.total}`);

    console.log('\nBy Page Type:');
    console.log('─'.repeat(40));
    const sortedTypes = Object.entries(summary.byType)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    for (const [type, count] of sortedTypes) {
      const pct = Math.round((count / summary.total) * 100);
      const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
      console.log(`  ${type.padEnd(12)} [${bar}] ${count} (${pct}%)`);
    }

    console.log('\nBy Discovery Source:');
    console.log('─'.repeat(40));
    for (const [source, count] of Object.entries(summary.bySource).filter(([, c]) => c > 0)) {
      console.log(`  ${source.padEnd(10)} ${count}`);
    }

    // Show sample URLs by type
    console.log('\nSample URLs by Type:');
    console.log('─'.repeat(40));

    for (const [type] of sortedTypes.slice(0, 5)) {
      const typePages = pages.filter(p => p.pageType === type).slice(0, 3);
      console.log(`\n  ${type.toUpperCase()}:`);
      for (const p of typePages) {
        console.log(`    • ${p.url}`);
        if (p.title) {
          console.log(`      "${p.title.slice(0, 50)}${p.title.length > 50 ? '...' : ''}"`);
        }
      }
    }

    console.log('\n');

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
