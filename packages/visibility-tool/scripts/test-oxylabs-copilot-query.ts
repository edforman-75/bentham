#!/usr/bin/env npx tsx
/**
 * Test Oxylabs browser instructions to query Copilot
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

async function testOxylabsBrowserInstructions() {
  const username = process.env.OXYLABS_USERNAME;
  const password = process.env.OXYLABS_PASSWORD;

  if (!username || !password) {
    console.log('Missing OXYLABS credentials');
    return;
  }

  console.log('Testing Oxylabs with browser instructions for Copilot...\n');

  // Use browser instructions to interact with Copilot
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
      browser_instructions: [
        // Wait for page to load
        { type: 'wait', wait_time_s: 5 },
        // Try to find and fill the input
        {
          type: 'input',
          selector: { type: 'css', value: 'textarea' },
          value: 'What is TASC Performance?'
        },
        // Click submit button
        {
          type: 'click',
          selector: { type: 'css', value: 'button[type="submit"], button[aria-label*="Submit"], button[aria-label*="Send"]' }
        },
        // Wait for response
        { type: 'wait', wait_time_s: 45 },
      ],
    }),
  });

  const data = await response.json();
  console.log('Status:', response.status);

  // Check for results
  if (data.results && data.results[0] && data.results[0].content) {
    const content = data.results[0].content;
    console.log('Content length:', content.length);
    // Look for response text
    if (content.includes('TASC') || content.includes('bamboo')) {
      console.log('\n✓ Found TASC-related content!');
      // Extract a snippet
      const start = content.indexOf('TASC');
      if (start > -1) {
        console.log('Snippet:', content.slice(Math.max(0, start - 100), start + 500));
      }
    } else {
      console.log('\n✗ No TASC content found');
      console.log('Preview:', content.slice(0, 1000));
    }
  } else {
    console.log('Response:', JSON.stringify(data).slice(0, 2000));
  }
}

testOxylabsBrowserInstructions().catch(console.error);
