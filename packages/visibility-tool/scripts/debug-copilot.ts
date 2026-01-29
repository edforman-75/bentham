#!/usr/bin/env npx tsx
/**
 * Debug Copilot - run with visible browser to see what's happening
 */

import { queryCopilot, hasValidCopilotSession } from '../src/collectors/copilot-collector.js';

async function main() {
  console.log('=== Copilot Debug ===\n');

  if (!hasValidCopilotSession()) {
    console.log('No session found. Run copilot-login.ts first.');
    process.exit(1);
  }

  console.log('Testing with visible browser (headless: false)...\n');

  const result = await queryCopilot('What is TASC Performance?', {
    headless: false,  // Visible browser for debugging
    timeout: 120000,  // 2 minutes
  });

  console.log('\n=== Result ===');
  console.log('Success:', result.success);
  console.log('Session valid:', result.session_valid);
  console.log('Response length:', result.response_text.length);
  console.log('Citations:', result.citations.length);
  if (result.error) {
    console.log('Error:', result.error);
  }
  if (result.response_text) {
    console.log('\nResponse preview:', result.response_text.slice(0, 500));
  }
}

main().catch(console.error);
