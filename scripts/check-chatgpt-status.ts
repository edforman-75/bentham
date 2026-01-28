#!/usr/bin/env npx tsx
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];

  const pages = context.pages();
  console.log('Open tabs:', pages.length);

  let chatgptPage = null;
  for (const page of pages) {
    const url = page.url();
    console.log('  -', url.slice(0, 60));
    if (url.includes('chatgpt.com')) {
      chatgptPage = page;
    }
  }

  if (chatgptPage === null) {
    console.log('\nOpening ChatGPT...');
    chatgptPage = await context.newPage();
    await chatgptPage.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
  }

  const loginStatus = await chatgptPage.evaluate(() => {
    const loginBtn = document.querySelector('[data-testid="login-button"]');
    const signupBtn = document.querySelector('[data-testid="signup-button"]');
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasLoginText = buttons.some(b => b.textContent?.toLowerCase().includes('log in'));
    const hasInput = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]');
    return {
      hasLoginButton: Boolean(loginBtn || signupBtn || hasLoginText),
      hasInputField: Boolean(hasInput),
      url: window.location.href
    };
  });

  console.log('\nChatGPT Status:');
  console.log('  URL:', loginStatus.url);
  console.log('  Login required:', loginStatus.hasLoginButton);
  console.log('  Input field visible:', loginStatus.hasInputField);

  if (loginStatus.hasLoginButton && loginStatus.hasInputField === false) {
    console.log('\n⚠️  Please log in to ChatGPT in the Chrome window');
  } else if (loginStatus.hasInputField) {
    console.log('\n✅ ChatGPT is ready - logged in');
  }

  await browser.close();
}

main().catch(console.error);
