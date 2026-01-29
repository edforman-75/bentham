#!/usr/bin/env npx tsx
/**
 * Copilot Login Script
 *
 * Run this once to log in to Microsoft Copilot and save the session.
 * The session will be reused for subsequent queries.
 *
 * Usage:
 *   npx tsx scripts/copilot-login.ts
 *   # or
 *   npm run copilot:login
 */

import { interactiveCopilotLogin, hasValidCopilotSession, verifyCopilotSession } from '../src/collectors/copilot-collector.js';

const SESSION_PATH = '.copilot-session.json';

async function main() {
  console.log('=== Microsoft Copilot Session Manager ===\n');

  // Check existing session
  if (hasValidCopilotSession(SESSION_PATH)) {
    console.log('Existing session found. Verifying...');
    const status = await verifyCopilotSession(SESSION_PATH);

    if (status.valid) {
      console.log('✓ Session is valid and working!');
      console.log('\nYou can now use queryCopilot() without manual login.');
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
  const success = await interactiveCopilotLogin(SESSION_PATH);

  if (success) {
    console.log('\n✓ Login successful!');
    console.log(`Session saved to: ${SESSION_PATH}`);
    console.log('\nYou can now use queryCopilot() to query Microsoft Copilot.');
    console.log('\nExample:');
    console.log('  const result = await queryCopilot("What is the best running shoe?");');
  } else {
    console.log('\n✗ Login failed or timed out.');
    console.log('Please try again.');
    process.exit(1);
  }
}

main().catch(console.error);
