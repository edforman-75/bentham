#!/usr/bin/env npx tsx
/**
 * Capture Session Script
 *
 * Used by human operators to capture an authenticated browser session.
 *
 * Usage:
 *   npx tsx scripts/capture-session.ts <surfaceId>
 *
 * Prerequisites:
 *   1. Chrome must be running with --remote-debugging-port=9222
 *   2. You must be logged into the service
 *
 * Supported surfaces:
 *   - chatgpt-web
 *   - perplexity-web
 *   - google-search
 *   - claude-web
 */

import { createSessionManager } from '../packages/surface-adapters/src/browser/chrome-session-manager.js';

const SUPPORTED_SURFACES = [
  'chatgpt-web',
  'perplexity-web',
  'google-search',
  'claude-web',
  'bing-chat',
];

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Bentham Session Capture Tool
============================

Usage:
  npx tsx scripts/capture-session.ts <surfaceId>
  npx tsx scripts/capture-session.ts --list
  npx tsx scripts/capture-session.ts --launch <surfaceId>
  npx tsx scripts/capture-session.ts --instructions <surfaceId>

Supported surfaces:
  ${SUPPORTED_SURFACES.join('\n  ')}

Examples:
  # Get instructions for creating a ChatGPT session
  npx tsx scripts/capture-session.ts --instructions chatgpt-web

  # Launch Chrome for login
  npx tsx scripts/capture-session.ts --launch chatgpt-web

  # Capture session after logging in
  npx tsx scripts/capture-session.ts chatgpt-web

  # List existing sessions
  npx tsx scripts/capture-session.ts --list
`);
    process.exit(0);
  }

  const sessionManager = createSessionManager({
    sessionDir: '.bentham-sessions',
  });

  // Handle --list flag
  if (args[0] === '--list') {
    const sessions = sessionManager.listSessions();

    if (sessions.length === 0) {
      console.log('No sessions found.');
      console.log('\nTo create a session, run:');
      console.log('  npx tsx scripts/capture-session.ts --instructions <surfaceId>');
    } else {
      console.log('Stored Sessions:');
      console.log('================\n');

      for (const session of sessions) {
        const status = session.isValid ? '✅ Valid' : '❌ Expired';
        console.log(`Surface: ${session.surfaceId}`);
        console.log(`  Status: ${status}`);
        console.log(`  Created: ${session.createdAt.toLocaleString()}`);
        console.log(`  Last Validated: ${session.lastValidatedAt.toLocaleString()}`);
        console.log('');
      }
    }
    return;
  }

  // Handle --instructions flag
  if (args[0] === '--instructions') {
    const surfaceId = args[1];

    if (!surfaceId) {
      console.error('Error: Please specify a surface ID');
      console.error(`Supported: ${SUPPORTED_SURFACES.join(', ')}`);
      process.exit(1);
    }

    if (!SUPPORTED_SURFACES.includes(surfaceId)) {
      console.error(`Error: Unknown surface "${surfaceId}"`);
      console.error(`Supported: ${SUPPORTED_SURFACES.join(', ')}`);
      process.exit(1);
    }

    console.log(sessionManager.getOperatorInstructions(surfaceId));
    return;
  }

  // Handle --launch flag
  if (args[0] === '--launch') {
    const surfaceId = args[1];

    if (!surfaceId) {
      console.error('Error: Please specify a surface ID');
      console.error(`Supported: ${SUPPORTED_SURFACES.join(', ')}`);
      process.exit(1);
    }

    if (!SUPPORTED_SURFACES.includes(surfaceId)) {
      console.error(`Error: Unknown surface "${surfaceId}"`);
      console.error(`Supported: ${SUPPORTED_SURFACES.join(', ')}`);
      process.exit(1);
    }

    const cmd = sessionManager.getLaunchCommand(surfaceId);
    console.log('Run this command to launch Chrome:\n');
    console.log(cmd);
    console.log('\nThen navigate to:', sessionManager.getLoginUrl(surfaceId));
    console.log('\nAfter logging in, run:');
    console.log(`  npx tsx scripts/capture-session.ts ${surfaceId}`);
    return;
  }

  // Capture session
  const surfaceId = args[0];

  if (!SUPPORTED_SURFACES.includes(surfaceId)) {
    console.error(`Error: Unknown surface "${surfaceId}"`);
    console.error(`Supported: ${SUPPORTED_SURFACES.join(', ')}`);
    process.exit(1);
  }

  console.log(`Capturing session for ${surfaceId}...`);
  console.log('Connecting to Chrome on port 9222...\n');

  try {
    // Dynamic import of playwright
    const playwright = await import('playwright');

    const session = await sessionManager.captureSession(surfaceId, playwright);

    console.log('✅ Session captured successfully!\n');
    console.log('Session Details:');
    console.log(`  ID: ${session.id}`);
    console.log(`  Surface: ${session.surfaceId}`);
    console.log(`  Cookies: ${session.cookies.length}`);
    console.log(`  LocalStorage items: ${Object.keys(session.localStorage || {}).length}`);
    console.log(`  SessionStorage items: ${Object.keys(session.sessionStorage || {}).length}`);
    console.log(`\nSession saved to: .bentham-sessions/${surfaceId}.json`);

    console.log('\nYou can now close the Chrome window.');
    console.log('The session will be used automatically for automated queries.');
  } catch (error) {
    console.error('❌ Failed to capture session:\n');

    if (error instanceof Error) {
      if (error.message.includes('connect')) {
        console.error('Could not connect to Chrome. Make sure Chrome is running with:');
        console.error(`  ${sessionManager.getLaunchCommand(surfaceId)}`);
      } else if (error.message.includes('No browser contexts')) {
        console.error('Chrome is running but no pages are open.');
        console.error(`Navigate to ${sessionManager.getLoginUrl(surfaceId)} and log in first.`);
      } else {
        console.error(error.message);
      }
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

main().catch(console.error);
