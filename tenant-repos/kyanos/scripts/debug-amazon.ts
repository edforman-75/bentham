#!/usr/bin/env npx tsx
import { chromium } from 'playwright';

async function checkAmazon() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find(p => /amazon\.com/.test(p.url()));

  if (!page) {
    console.log('No Amazon tab');
    await browser.close();
    return;
  }

  console.log('URL:', page.url());
  await page.bringToFront();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // Check page structure
  const info = await page.evaluate(() => ({
    htmlLen: document.documentElement.outerHTML.length,
    bodyLen: document.body?.innerHTML.length || 0,
    iframes: document.querySelectorAll('iframe').length,
    inputs: document.querySelectorAll('input').length,
    searchBox: document.querySelector('#twotabsearchtextbox') ? 'found' : 'not found',
    navSearch: document.querySelector('#nav-search') ? 'found' : 'not found',
    title: document.title,
  }));

  console.log('Page info:', info);

  // List all inputs
  const inputDetails = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).slice(0, 5).map(i => ({
      id: i.id,
      name: i.name,
      type: i.type,
    }));
  });
  console.log('Inputs:', inputDetails);

  await browser.close();
}

checkAmazon();
