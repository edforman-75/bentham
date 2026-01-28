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

  // Look inside rufus-container for input and message elements
  const rufusDetails = await page.evaluate(() => {
    const container = document.querySelector('#rufus-container');
    if (!container) return { error: 'No rufus-container found' };

    const results: any = {
      containerHTML: container.innerHTML.slice(0, 3000),
      inputs: [],
      textareas: [],
      buttons: [],
      messageAreas: []
    };

    // Find all inputs/textareas in container
    container.querySelectorAll('input, textarea').forEach(el => {
      results.inputs.push({
        tag: el.tagName,
        id: el.id,
        class: el.className,
        placeholder: el.getAttribute('placeholder'),
        type: el.getAttribute('type'),
        name: el.getAttribute('name')
      });
    });

    // Find buttons
    container.querySelectorAll('button').forEach(el => {
      results.buttons.push({
        id: el.id,
        class: el.className,
        ariaLabel: el.getAttribute('aria-label'),
        text: (el.textContent || '').slice(0, 30)
      });
    });

    // Find message/response areas
    container.querySelectorAll('[class*="message"], [class*="response"], [class*="answer"], [role="log"]').forEach(el => {
      results.messageAreas.push({
        tag: el.tagName,
        id: el.id,
        class: el.className,
        text: (el.textContent || '').slice(0, 100)
      });
    });

    return results;
  });

  console.log('=== Rufus Container Details ===');
  console.log('\nInputs:', JSON.stringify(rufusDetails.inputs, null, 2));
  console.log('\nButtons:', JSON.stringify(rufusDetails.buttons, null, 2));
  console.log('\nMessage Areas:', JSON.stringify(rufusDetails.messageAreas, null, 2));
  console.log('\nContainer HTML snippet:');
  console.log(rufusDetails.containerHTML?.slice(0, 1500));

  await browser.close();
}

debug().catch(console.error);
