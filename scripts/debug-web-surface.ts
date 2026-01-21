#!/usr/bin/env npx tsx
/**
 * Debug Web Surface
 *
 * Opens a web surface with session injection and takes a screenshot
 * to see what the adapter actually sees.
 */

import { createSessionManager, createProviderWithSession } from '../packages/surface-adapters/src/index.js';
import { writeFileSync } from 'fs';

async function main() {
  const surfaceId = process.argv[2] || 'chatgpt-web';
  const headless = process.argv[3] !== '--headful';

  console.log(`Debugging ${surfaceId} (headless: ${headless})...`);

  const sessionManager = createSessionManager({ sessionDir: '.bentham-sessions' });
  const session = sessionManager.getSession(surfaceId);

  if (!session) {
    console.error(`No session for ${surfaceId}`);
    process.exit(1);
  }

  console.log(`Session has ${session.cookies.length} cookies`);
  console.log(`LocalStorage items: ${Object.keys(session.localStorage || {}).length}`);

  // Count domain-specific cookies
  const urls: Record<string, string> = {
    'chatgpt-web': 'chatgpt.com',
    'perplexity-web': 'perplexity.ai',
    'x-grok-web': 'x.com',
    'meta-ai-web': 'meta.ai',
    'copilot-web': 'copilot.microsoft.com',
    'bing-search': 'bing.com',
    'amazon-web': 'amazon.com',
    'zappos-web': 'zappos.com',
  };

  const targetDomain = urls[surfaceId] || '';
  const domainCookies = session.cookies.filter(c =>
    c.domain.includes(targetDomain.split('.')[0])
  );
  console.log(`Domain-specific cookies (${targetDomain}): ${domainCookies.length}`);

  const provider = createProviderWithSession(session, { headless });
  const browser = await provider.getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const targetUrl = {
    'chatgpt-web': 'https://chatgpt.com',
    'perplexity-web': 'https://www.perplexity.ai/search?q=What+is+the+capital+of+France',
    'x-grok-web': 'https://x.com/i/grok',
    'meta-ai-web': 'https://www.meta.ai',
    'copilot-web': 'https://copilot.microsoft.com',
    'bing-search': 'https://www.bing.com/search?q=test',
    'amazon-web': 'https://www.amazon.com/s?k=test',
    'zappos-web': 'https://www.zappos.com/search?term=shoes',
  }[surfaceId] || 'https://example.com';

  console.log(`Navigating to ${targetUrl}...`);

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('Navigation timeout, taking screenshot anyway...');
  }

  // Wait a bit for any JS to settle
  await page.waitForTimeout(2000);

  const finalUrl = page.url();
  console.log(`Final URL: ${finalUrl}`);

  // Take screenshot
  const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
  const filename = `debug-${surfaceId}.png`;
  writeFileSync(filename, screenshot);
  console.log(`Screenshot saved to ${filename}`);

  // Get page content summary
  const title = await page.evaluate(() => document.title);
  console.log(`Page title: ${title}`);

  // Check for login indicators
  const hasLoginButton = await page.isVisible('[data-testid="login-button"], [href*="login"], [href*="signin"], button:has-text("Log in"), button:has-text("Sign in")');
  console.log(`Has login button visible: ${hasLoginButton}`);

  // Check specific selectors
  const selectors = [
    '[class*="prose"]',
    '[class*="answer"]',
    '[class*="response"]',
    '[class*="markdown"]',
    'textarea',
  ];

  console.log('\n--- Selector check ---');
  for (const sel of selectors) {
    try {
      const count = await page.evaluate((s: string) => document.querySelectorAll(s).length, sel);
      console.log(`${sel}: ${count} matches`);
    } catch {
      console.log(`${sel}: error`);
    }
  }

  // Get some class names to see what's on the page
  const classes = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const matches: string[] = [];
    all.forEach(el => {
      const cls = el.className;
      if (typeof cls === 'string' && cls.length > 0) {
        const relevant = cls.split(' ').filter((c: string) =>
          c.includes('prose') || c.includes('answer') || c.includes('response') ||
          c.includes('markdown') || c.includes('content') || c.includes('text')
        );
        if (relevant.length > 0) {
          matches.push(el.tagName + ': ' + relevant.join(', '));
        }
      }
    });
    return [...new Set(matches)].slice(0, 15);
  });

  if (classes.length > 0) {
    console.log('\n--- Relevant classes ---');
    classes.forEach(c => console.log(`  ${c}`));
  }

  await provider.closeAll();
}

main().catch(console.error);
