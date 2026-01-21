/**
 * Cloudflare Turnstile Solver using 2Captcha
 *
 * Solves Cloudflare Turnstile challenges that block automated browsers.
 * Uses 2Captcha's API to get valid tokens.
 *
 * @see https://2captcha.com/2captcha-api#turnstile
 */

import type { Page } from 'playwright';

export interface TurnstileSolverConfig {
  /** 2Captcha API key */
  apiKey: string;
  /** Polling interval in ms (default: 5000) */
  pollingInterval?: number;
  /** Maximum wait time in ms (default: 120000) */
  maxWaitTime?: number;
}

export interface TurnstileChallenge {
  /** The sitekey from the Turnstile widget */
  sitekey: string;
  /** The page URL */
  pageUrl: string;
  /** Optional action parameter */
  action?: string;
  /** Optional cData parameter */
  cData?: string;
}

export interface TurnstileSolution {
  /** Whether solving was successful */
  success: boolean;
  /** The token to submit */
  token?: string;
  /** Error message if failed */
  error?: string;
  /** Time taken to solve in ms */
  solveTimeMs?: number;
}

/**
 * Cloudflare Turnstile Solver
 */
export class TurnstileSolver {
  private apiKey: string;
  private pollingInterval: number;
  private maxWaitTime: number;

  constructor(config: TurnstileSolverConfig) {
    this.apiKey = config.apiKey;
    this.pollingInterval = config.pollingInterval ?? 5000;
    this.maxWaitTime = config.maxWaitTime ?? 120000;
  }

  /**
   * Detect if a page has a Cloudflare Turnstile challenge
   */
  async detectChallenge(page: Page): Promise<TurnstileChallenge | null> {
    try {
      const challenge = await page.evaluate(() => {
        // Look for Turnstile widget
        const turnstileFrame = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
        const turnstileDiv = document.querySelector('[data-sitekey]') ||
                            document.querySelector('.cf-turnstile') ||
                            document.querySelector('#cf-turnstile-response');

        // Check for "Just a moment" or "Verify you are human" text
        const bodyText = document.body.innerText.toLowerCase();
        const hasCloudflareText = bodyText.includes('just a moment') ||
                                  bodyText.includes('verify you are human') ||
                                  bodyText.includes('checking your browser');

        if (!turnstileFrame && !turnstileDiv && !hasCloudflareText) {
          return null;
        }

        // Extract sitekey
        let sitekey = '';

        // Try data-sitekey attribute
        if (turnstileDiv) {
          sitekey = (turnstileDiv as HTMLElement).dataset.sitekey || '';
        }

        // Try to find in page scripts
        if (!sitekey) {
          const scripts = Array.from(document.querySelectorAll('script'));
          for (const script of scripts) {
            const match = script.textContent?.match(/sitekey['":\s]+(['"]?)([0-9a-zA-Z_-]+)\1/);
            if (match) {
              sitekey = match[2];
              break;
            }
          }
        }

        // Try iframe src
        if (!sitekey && turnstileFrame) {
          const src = turnstileFrame.getAttribute('src') || '';
          const match = src.match(/sitekey=([^&]+)/);
          if (match) {
            sitekey = match[1];
          }
        }

        // Try window.__CF$sitekey
        if (!sitekey && (window as any).__CF$cv$params) {
          sitekey = (window as any).__CF$cv$params.sitekey || '';
        }

        return {
          sitekey,
          pageUrl: window.location.href,
          hasChallenge: true,
        };
      });

      if (!challenge || !challenge.sitekey) {
        // If we detected Cloudflare but couldn't get sitekey, still return info
        if (challenge?.hasChallenge) {
          return {
            sitekey: '',
            pageUrl: await page.url(),
          };
        }
        return null;
      }

      return {
        sitekey: challenge.sitekey,
        pageUrl: challenge.pageUrl,
      };
    } catch (error) {
      console.error('Error detecting Turnstile challenge:', error);
      return null;
    }
  }

  /**
   * Solve a Turnstile challenge using 2Captcha
   */
  async solveChallenge(challenge: TurnstileChallenge): Promise<TurnstileSolution> {
    const startTime = Date.now();

    if (!challenge.sitekey) {
      return {
        success: false,
        error: 'No sitekey found in challenge',
      };
    }

    try {
      // Step 1: Submit challenge to 2Captcha
      const submitUrl = new URL('https://2captcha.com/in.php');
      submitUrl.searchParams.set('key', this.apiKey);
      submitUrl.searchParams.set('method', 'turnstile');
      submitUrl.searchParams.set('sitekey', challenge.sitekey);
      submitUrl.searchParams.set('pageurl', challenge.pageUrl);
      submitUrl.searchParams.set('json', '1');

      if (challenge.action) {
        submitUrl.searchParams.set('action', challenge.action);
      }
      if (challenge.cData) {
        submitUrl.searchParams.set('data', challenge.cData);
      }

      console.log(`Submitting Turnstile challenge to 2Captcha...`);
      const submitResponse = await fetch(submitUrl.toString());
      const submitData = await submitResponse.json();

      if (submitData.status !== 1) {
        return {
          success: false,
          error: `2Captcha submit error: ${submitData.request || submitData.error_text}`,
          solveTimeMs: Date.now() - startTime,
        };
      }

      const taskId = submitData.request;
      console.log(`Task submitted, ID: ${taskId}`);

      // Step 2: Poll for result
      const resultUrl = new URL('https://2captcha.com/res.php');
      resultUrl.searchParams.set('key', this.apiKey);
      resultUrl.searchParams.set('action', 'get');
      resultUrl.searchParams.set('id', taskId);
      resultUrl.searchParams.set('json', '1');

      const deadline = Date.now() + this.maxWaitTime;

      while (Date.now() < deadline) {
        await this.delay(this.pollingInterval);

        console.log(`Polling for result...`);
        const resultResponse = await fetch(resultUrl.toString());
        const resultData = await resultResponse.json();

        if (resultData.status === 1) {
          // Success!
          const solveTimeMs = Date.now() - startTime;
          console.log(`Challenge solved in ${solveTimeMs}ms`);
          return {
            success: true,
            token: resultData.request,
            solveTimeMs,
          };
        }

        if (resultData.request !== 'CAPCHA_NOT_READY') {
          // Error
          return {
            success: false,
            error: `2Captcha result error: ${resultData.request}`,
            solveTimeMs: Date.now() - startTime,
          };
        }

        // Still processing, continue polling
      }

      return {
        success: false,
        error: 'Timeout waiting for 2Captcha solution',
        solveTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: `Exception: ${error instanceof Error ? error.message : error}`,
        solveTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Apply a solved token to bypass the Turnstile challenge
   */
  async applyToken(page: Page, token: string): Promise<boolean> {
    try {
      await page.evaluate((tkn) => {
        // Try to find and fill the response input
        const responseInput = document.querySelector('[name="cf-turnstile-response"]') ||
                              document.querySelector('#cf-turnstile-response') ||
                              document.querySelector('input[name="cf-turnstile-response"]');

        if (responseInput) {
          (responseInput as HTMLInputElement).value = tkn;
        }

        // Try to set window callback
        if ((window as any).turnstileCallback) {
          (window as any).turnstileCallback(tkn);
        }

        // Try to trigger form submission
        const form = document.querySelector('form');
        if (form) {
          // Create and dispatch event
          const event = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
        }

        // Try Turnstile callback
        if ((window as any).turnstile) {
          try {
            (window as any).turnstile.execute();
          } catch {}
        }
      }, token);

      // Wait for navigation or page update
      await page.waitForTimeout(2000);

      // Check if challenge is gone
      const stillHasChallenge = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('just a moment') ||
               bodyText.includes('verify you are human') ||
               bodyText.includes('checking your browser');
      });

      return !stillHasChallenge;
    } catch (error) {
      console.error('Error applying token:', error);
      return false;
    }
  }

  /**
   * Full flow: detect, solve, and apply
   */
  async bypass(page: Page): Promise<TurnstileSolution> {
    // Detect challenge
    const challenge = await this.detectChallenge(page);

    if (!challenge) {
      return {
        success: true,
        solveTimeMs: 0,
      };
    }

    if (!challenge.sitekey) {
      return {
        success: false,
        error: 'Cloudflare challenge detected but could not extract sitekey',
      };
    }

    console.log(`Turnstile challenge detected. Sitekey: ${challenge.sitekey.slice(0, 20)}...`);

    // Solve challenge
    const solution = await this.solveChallenge(challenge);

    if (!solution.success || !solution.token) {
      return solution;
    }

    // Apply token
    const applied = await this.applyToken(page, solution.token);

    if (!applied) {
      return {
        success: false,
        error: 'Failed to apply token to bypass challenge',
        token: solution.token,
        solveTimeMs: solution.solveTimeMs,
      };
    }

    return solution;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a Turnstile solver instance
 */
export function createTurnstileSolver(config: TurnstileSolverConfig): TurnstileSolver {
  return new TurnstileSolver(config);
}
