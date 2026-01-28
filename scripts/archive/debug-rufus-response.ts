#!/usr/bin/env npx tsx
import { chromium } from 'playwright';

async function debug() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

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

  // Look at conversation container content
  const conversationContent = await page.evaluate(() => {
    const container = document.querySelector('#rufus-conversation-container');
    if (!container) return { error: 'No conversation container' };

    // Get all divs with content
    const divs: any[] = [];
    container.querySelectorAll('div').forEach(el => {
      const text = el.textContent?.trim() || '';
      if (text.length > 20 && text.length < 2000) {
        divs.push({
          id: el.id,
          class: el.className,
          text: text.slice(0, 200)
        });
      }
    });

    // Get inner HTML
    return {
      html: container.innerHTML.slice(0, 5000),
      divs: divs.slice(0, 15)
    };
  });

  console.log('=== Conversation Container ===');
  console.log('\nDivs with content:');
  for (const div of conversationContent.divs || []) {
    console.log(`\nID: ${div.id}`);
    console.log(`Class: ${div.class}`);
    console.log(`Text: ${div.text.slice(0, 150)}...`);
  }

  await browser.close();
}

debug().catch(console.error);
