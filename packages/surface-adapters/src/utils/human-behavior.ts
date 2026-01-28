/**
 * Human-Like Behavior Utilities
 *
 * Provides natural, human-like interaction patterns for browser automation
 * to avoid bot detection. Default for all Bentham browser interactions.
 */

import type { Page } from 'playwright';

/**
 * Configuration for human-like behavior
 */
export interface HumanBehaviorConfig {
  /** Minimum delay between keystrokes in ms (default: 40) */
  minTypingDelayMs: number;
  /** Maximum delay between keystrokes in ms (default: 120) */
  maxTypingDelayMs: number;
  /** Chance of a longer pause while typing (default: 0.08 = 8%) */
  pauseChance: number;
  /** Minimum pause duration in ms (default: 150) */
  minPauseMs: number;
  /** Maximum pause duration in ms (default: 400) */
  maxPauseMs: number;
  /** Chance of making a typo and correcting it (default: 0.02 = 2%) */
  typoChance: number;
  /** Enable mouse movements (default: true) */
  enableMouseMovement: boolean;
  /** Enable random scrolling (default: true) */
  enableScrolling: boolean;
}

/**
 * Default human behavior configuration
 */
export const DEFAULT_HUMAN_BEHAVIOR: HumanBehaviorConfig = {
  minTypingDelayMs: 40,
  maxTypingDelayMs: 120,
  pauseChance: 0.08,
  minPauseMs: 150,
  maxPauseMs: 400,
  typoChance: 0.02,
  enableMouseMovement: true,
  enableScrolling: true,
};

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sleep for a random duration between min and max
 */
export function randomSleep(min: number, max: number): Promise<void> {
  return sleep(randomDelay(min, max));
}

/**
 * Type text in a human-like manner with variable delays and occasional pauses
 */
export async function humanType(
  page: Page,
  text: string,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_HUMAN_BEHAVIOR, ...config };

  // Characters that might cause a slight hesitation
  const hesitationChars = new Set([' ', '.', ',', '?', '!', "'", '"']);

  // Common typo pairs (original -> typo)
  const typoPairs: Record<string, string> = {
    'a': 's', 's': 'a', 'd': 'f', 'f': 'd',
    'e': 'r', 'r': 'e', 't': 'y', 'y': 't',
    'i': 'o', 'o': 'i', 'n': 'm', 'm': 'n',
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Simulate occasional typo + correction
    if (cfg.typoChance > 0 && Math.random() < cfg.typoChance && typoPairs[char.toLowerCase()]) {
      const typo = char === char.toUpperCase()
        ? typoPairs[char.toLowerCase()].toUpperCase()
        : typoPairs[char.toLowerCase()];

      // Type the typo
      await page.keyboard.type(typo, { delay: randomDelay(cfg.minTypingDelayMs, cfg.maxTypingDelayMs) });

      // Brief pause (noticing the mistake)
      await sleep(randomDelay(100, 250));

      // Delete the typo
      await page.keyboard.press('Backspace');
      await sleep(randomDelay(50, 150));

      // Type the correct character
      await page.keyboard.type(char, { delay: randomDelay(cfg.minTypingDelayMs, cfg.maxTypingDelayMs) });
    } else {
      // Normal character typing
      await page.keyboard.type(char, { delay: randomDelay(cfg.minTypingDelayMs, cfg.maxTypingDelayMs) });
    }

    // Occasional longer pause (thinking, looking at keyboard, etc.)
    if (Math.random() < cfg.pauseChance) {
      await sleep(randomDelay(cfg.minPauseMs, cfg.maxPauseMs));
    }

    // Extra slight pause after certain characters
    if (hesitationChars.has(char) && Math.random() < 0.3) {
      await sleep(randomDelay(50, 150));
    }
  }
}

/**
 * Move mouse in a natural curved path
 */
export async function humanMouseMove(
  page: Page,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_HUMAN_BEHAVIOR, ...config };
  if (!cfg.enableMouseMovement) return;

  const viewport = page.viewportSize() || { width: 1200, height: 800 };

  // Random target position (avoiding edges)
  const targetX = randomDelay(100, viewport.width - 100);
  const targetY = randomDelay(100, viewport.height - 100);

  // Move with variable steps (more steps = smoother, more human)
  const steps = randomDelay(8, 20);

  await page.mouse.move(targetX, targetY, { steps });
  await sleep(randomDelay(50, 200));
}

/**
 * Scroll the page in a human-like manner
 */
export async function humanScroll(
  page: Page,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_HUMAN_BEHAVIOR, ...config };
  if (!cfg.enableScrolling) return;

  const scrollAmount = randomDelay(80, 300);
  const direction = Math.random() < 0.85 ? 1 : -1; // 85% scroll down

  await page.mouse.wheel(0, scrollAmount * direction);
  await sleep(randomDelay(300, 800));
}

/**
 * Perform random idle behavior (mouse movement or scrolling)
 * Call this during wait periods to appear more human
 */
export async function humanIdle(
  page: Page,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const roll = Math.random();

  if (roll < 0.25) {
    await humanMouseMove(page, config);
  } else if (roll < 0.4) {
    await humanScroll(page, config);
  }
  // 60% of the time, do nothing (humans don't constantly move)
}

/**
 * Click an element with human-like behavior
 * - Move mouse to element first
 * - Small delay before clicking
 * - Variable click timing
 */
export async function humanClick(
  page: Page,
  selector: string,
  _config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const element = page.locator(selector).first();

  // Get element bounding box
  const box = await element.boundingBox();
  if (box) {
    // Move to element with slight randomization (don't always click center)
    const offsetX = randomDelay(-5, 5);
    const offsetY = randomDelay(-3, 3);
    const targetX = box.x + box.width / 2 + offsetX;
    const targetY = box.y + box.height / 2 + offsetY;

    await page.mouse.move(targetX, targetY, { steps: randomDelay(5, 12) });
    await sleep(randomDelay(50, 150)); // Brief pause before click
  }

  await element.click();
  await sleep(randomDelay(100, 250)); // Brief pause after click
}

/**
 * Fill an input field with human-like typing
 * - Click the field first
 * - Clear existing content naturally
 * - Type with human-like delays
 */
export async function humanFill(
  page: Page,
  selector: string,
  text: string,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  // Click the input field
  await humanClick(page, selector, config);

  // Small pause after clicking (human would look at the field)
  await sleep(randomDelay(100, 300));

  // Select all existing content (like Cmd+A)
  await page.keyboard.press('Meta+a');
  await sleep(randomDelay(50, 150));

  // Type the new text
  await humanType(page, text, config);
}

/**
 * Wait with occasional idle behavior to appear human
 */
export async function humanWait(
  page: Page,
  minMs: number,
  maxMs: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const totalWait = randomDelay(minMs, maxMs);
  const intervals = Math.floor(totalWait / 2000); // Check every ~2 seconds

  for (let i = 0; i < intervals; i++) {
    await sleep(2000);
    await humanIdle(page, config);
  }

  // Wait remaining time
  const remaining = totalWait - (intervals * 2000);
  if (remaining > 0) {
    await sleep(remaining);
  }
}

/**
 * Pre-interaction delay (simulates human looking at the page)
 */
export async function preInteractionDelay(): Promise<void> {
  await sleep(randomDelay(200, 500));
}

/**
 * Post-interaction delay (simulates human reviewing their action)
 */
export async function postInteractionDelay(): Promise<void> {
  await sleep(randomDelay(150, 400));
}

/**
 * Delay between queries in a study (longer, more natural gaps)
 */
export async function betweenQueryDelay(
  page: Page,
  minSeconds: number = 3,
  maxSeconds: number = 8,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  await humanWait(page, minSeconds * 1000, maxSeconds * 1000, config);
}
