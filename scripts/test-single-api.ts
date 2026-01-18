#!/usr/bin/env npx tsx
/**
 * Quick test of a single API surface
 */

import { createOpenAIAdapter } from '../packages/surface-adapters/src/index.js';

async function test() {
  console.log('Creating OpenAI adapter...');

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set');
    process.exit(1);
  }

  const adapter = createOpenAIAdapter({
    apiConfig: { apiKey: process.env.OPENAI_API_KEY },
    defaultModel: 'gpt-4o-mini'
  });

  console.log('Querying...');
  const start = Date.now();

  try {
    const response = await adapter.query({
      query: 'What is 2+2? Answer in one word.',
    });

    const elapsed = Date.now() - start;
    console.log(`Response (${elapsed}ms):`, response.success ? response.responseText : response.error);
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
