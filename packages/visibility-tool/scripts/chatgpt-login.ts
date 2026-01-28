#!/usr/bin/env npx tsx
/**
 * ChatGPT Login Script
 *
 * Run this once to log in to ChatGPT and save the session.
 * The session will be reused for subsequent queries.
 *
 * Usage:
 *   npx tsx scripts/chatgpt-login.ts
 *   # or
 *   npm run chatgpt:login
 */

import { interactiveLogin, hasValidSession, verifySession } from '../src/collectors/chatgpt-collector.js';

const SESSION_PATH = '.chatgpt-session.json';

async function main() {
  console.log('=== ChatGPT Session Manager ===\n');

  // Check existing session
  if (hasValidSession(SESSION_PATH)) {
    console.log('Existing session found. Verifying...');
    const status = await verifySession(SESSION_PATH);

    if (status.valid) {
      console.log('✓ Session is valid and working!');
      console.log('\nYou can now use queryChatGPT() without manual login.');
      return;
    } else {
      console.log(`✗ Session invalid: ${status.error}`);
      console.log('Starting fresh login...\n');
    }
  } else {
    console.log('No existing session found.');
    console.log('Starting login process...\n');
  }

  // Interactive login
  const success = await interactiveLogin(SESSION_PATH);

  if (success) {
    console.log('\n✓ Login successful!');
    console.log(`Session saved to: ${SESSION_PATH}`);
    console.log('\nYou can now use queryChatGPT() to query ChatGPT.');
    console.log('\nExample:');
    console.log('  const result = await queryChatGPT("What is the best running shoe?");');
  } else {
    console.log('\n✗ Login failed or timed out.');
    console.log('Please try again.');
    process.exit(1);
  }
}

main().catch(console.error);
