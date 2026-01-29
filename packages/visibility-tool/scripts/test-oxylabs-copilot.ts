#!/usr/bin/env npx tsx
/**
 * Test if Oxylabs can scrape Copilot
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

async function testOxylabs() {
  const username = process.env.OXYLABS_USERNAME;
  const password = process.env.OXYLABS_PASSWORD;

  if (!username || !password) {
    console.log('Missing OXYLABS credentials');
    return;
  }

  console.log('Testing Oxylabs universal scraper with Copilot...\n');

  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
    },
    body: JSON.stringify({
      source: 'universal',
      url: 'https://copilot.microsoft.com/',
      render: 'html',
    }),
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Response preview:', JSON.stringify(data).slice(0, 2000));
}

testOxylabs().catch(console.error);
