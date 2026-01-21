import playwright from 'playwright';

async function main() {
  const browser = await playwright.chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('perplexity.ai'));

  if (!page) {
    console.log('No Perplexity tab found');
    await browser.close();
    return;
  }

  console.log('URL:', page.url());

  // Find all interactive elements
  const elements = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll('input, textarea, [contenteditable], [role="textbox"], [data-placeholder], [class*="input"], [class*="search"]').forEach(el => {
      const tag = el.tagName;
      const cls = el.className.toString().slice(0, 60);
      const role = el.getAttribute('role') || '';
      const placeholder = (el as HTMLInputElement).placeholder || el.getAttribute('data-placeholder') || '';
      results.push(`${tag} | class: ${cls} | role: ${role} | placeholder: ${placeholder}`);
    });
    return results;
  });

  console.log('Interactive elements:', elements.length);
  elements.slice(0, 15).forEach(e => console.log(' ', e));

  // Also check for the search/query area by looking for common patterns
  const searchArea = await page.evaluate(() => {
    // Look for elements that might be the query input
    const candidates = document.querySelectorAll('[class*="query"], [class*="ask"], [class*="prompt"], [class*="chat"]');
    return Array.from(candidates).slice(0, 5).map(el =>
      `${el.tagName}.${el.className.toString().slice(0, 50)}`
    );
  });

  console.log('\nSearch-related elements:');
  searchArea.forEach(s => console.log(' ', s));

  await browser.close();
}

main();
