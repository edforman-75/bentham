#!/usr/bin/env npx tsx
import { chromium } from 'playwright';

async function debug() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

  // Find Amazon page
  let page = null;
  for (const p of context.pages()) {
    if (p.url().includes('amazon')) {
      page = p;
      break;
    }
  }

  if (page === null) {
    console.log('No Amazon page found');
    await browser.close();
    return;
  }

  console.log('URL:', page.url());

  // Take screenshot
  await page.screenshot({ path: '/tmp/rufus-debug.png', fullPage: false });
  console.log('Screenshot saved to /tmp/rufus-debug.png');

  // Look for Rufus-related elements
  const rufusElements = await page.evaluate(() => {
    const results: any[] = [];

    // Find anything with rufus in class, id, or data attributes
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const id = el.id || '';
      const className = el.className || '';
      const dataAttrs = Array.from(el.attributes)
        .filter(a => a.name.startsWith('data-'))
        .map(a => `${a.name}=${a.value}`)
        .join(', ');

      if (id.toLowerCase().includes('rufus') ||
          className.toString().toLowerCase().includes('rufus') ||
          dataAttrs.toLowerCase().includes('rufus')) {
        results.push({
          tag: el.tagName,
          id,
          class: className.toString().slice(0, 100),
          data: dataAttrs.slice(0, 100),
          text: (el.textContent || '').slice(0, 50)
        });
      }
    }

    // Also look for textareas and inputs that might be chat inputs
    const inputs = document.querySelectorAll('textarea, input[type="text"]');
    for (const el of inputs) {
      const placeholder = el.getAttribute('placeholder') || '';
      if (placeholder.toLowerCase().includes('ask') || placeholder.toLowerCase().includes('search')) {
        results.push({
          tag: el.tagName,
          id: el.id,
          class: (el.className || '').toString().slice(0, 100),
          placeholder,
          visible: (el as HTMLElement).offsetParent !== null
        });
      }
    }

    return results.slice(0, 30);
  });

  console.log('\nElements found:', rufusElements.length);
  for (const el of rufusElements) {
    console.log(JSON.stringify(el));
  }

  // Get page HTML snippet around any visible chat/input area
  const bodyText = await page.evaluate(() => {
    return document.body.innerText.slice(0, 2000);
  });

  console.log('\nPage text preview:');
  console.log(bodyText.slice(0, 500));

  await browser.close();
}

debug().catch(console.error);
