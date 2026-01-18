/**
 * Chrome Session Manager
 *
 * Manages authenticated browser sessions for web scraping.
 * Human operators create sessions by logging into services manually,
 * then sessions are persisted and reused for automated queries.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Stored session data
 */
export interface StoredSession {
  /** Session ID */
  id: string;
  /** Surface this session is for */
  surfaceId: string;
  /** When the session was created */
  createdAt: Date;
  /** When the session was last validated */
  lastValidatedAt: Date;
  /** When the session expires (if known) */
  expiresAt?: Date;
  /** Cookies */
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  /** Local storage items */
  localStorage?: Record<string, string>;
  /** Session storage items */
  sessionStorage?: Record<string, string>;
  /** User agent used */
  userAgent?: string;
  /** Notes from operator */
  notes?: string;
}

/**
 * Session manager configuration
 */
export interface SessionManagerConfig {
  /** Directory to store session data */
  sessionDir: string;
  /** Chrome executable path (optional, uses system Chrome if not specified) */
  chromePath?: string;
  /** Debug port for Chrome DevTools Protocol */
  debugPort?: number;
  /** User data directory for Chrome profile */
  userDataDir?: string;
}

/**
 * Default configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionManagerConfig = {
  sessionDir: '.bentham-sessions',
  debugPort: 9222,
};

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  lastChecked: Date;
}

/**
 * Chrome Session Manager
 *
 * Workflow for human operators:
 * 1. Call `launchForLogin(surfaceId)` to open Chrome with debug port
 * 2. Manually log into the service (ChatGPT, Perplexity, etc.)
 * 3. Solve any captchas that appear
 * 4. Call `saveSession(surfaceId)` to capture and store the session
 * 5. Sessions can then be loaded for automated queries
 */
export class ChromeSessionManager {
  private config: SessionManagerConfig;
  private sessions: Map<string, StoredSession> = new Map();

  constructor(config: Partial<SessionManagerConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.ensureSessionDir();
    this.loadSessions();
  }

  /**
   * Ensure session directory exists
   */
  private ensureSessionDir(): void {
    if (!existsSync(this.config.sessionDir)) {
      mkdirSync(this.config.sessionDir, { recursive: true });
    }
  }

  /**
   * Load existing sessions from disk
   */
  private loadSessions(): void {
    const indexPath = join(this.config.sessionDir, 'sessions.json');
    if (existsSync(indexPath)) {
      try {
        const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
        for (const session of data.sessions) {
          this.sessions.set(session.surfaceId, {
            ...session,
            createdAt: new Date(session.createdAt),
            lastValidatedAt: new Date(session.lastValidatedAt),
            expiresAt: session.expiresAt ? new Date(session.expiresAt) : undefined,
          });
        }
      } catch (error) {
        console.warn('Failed to load sessions:', error);
      }
    }
  }

  /**
   * Save sessions to disk
   */
  private saveSessions(): void {
    const indexPath = join(this.config.sessionDir, 'sessions.json');
    const data = {
      lastUpdated: new Date().toISOString(),
      sessions: Array.from(this.sessions.values()),
    };
    writeFileSync(indexPath, JSON.stringify(data, null, 2));
  }

  /**
   * Get Chrome launch command for manual login
   *
   * This returns a command the operator can run to start Chrome
   * with the remote debugging port enabled.
   */
  getLaunchCommand(surfaceId: string): string {
    const userDataDir = this.config.userDataDir ||
      join(this.config.sessionDir, 'chrome-profiles', surfaceId);

    // Detect platform
    const platform = process.platform;

    let chromePath: string;
    if (this.config.chromePath) {
      chromePath = this.config.chromePath;
    } else if (platform === 'darwin') {
      chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else if (platform === 'win32') {
      chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    } else {
      chromePath = 'google-chrome';
    }

    // Build command with proper quoting
    const args = [
      `--remote-debugging-port=${this.config.debugPort}`,
      `--user-data-dir="${userDataDir}"`,
      '--no-first-run',
      '--disable-default-apps',
    ];

    return `"${chromePath}" ${args.join(' ')}`;
  }

  /**
   * Get the URL to open for a surface
   */
  getLoginUrl(surfaceId: string): string {
    const urls: Record<string, string> = {
      // AI Chatbots
      'chatgpt-web': 'https://chatgpt.com',
      'perplexity-web': 'https://www.perplexity.ai',
      'claude-web': 'https://claude.ai',
      'bing-chat': 'https://www.bing.com/chat',
      'x-grok-web': 'https://x.com/i/grok',
      'meta-ai-web': 'https://www.meta.ai',
      'copilot-web': 'https://copilot.microsoft.com',
      // Search
      'google-search': 'https://www.google.com',
      'bing-search': 'https://www.bing.com',
      // E-commerce / Shopping AI
      'amazon-web': 'https://www.amazon.com',
      'amazon-rufus': 'https://www.amazon.com', // Rufus is accessed via Amazon
      'zappos-web': 'https://www.zappos.com',
    };
    return urls[surfaceId] || 'about:blank';
  }

  /**
   * Instructions for human operator
   */
  getOperatorInstructions(surfaceId: string): string {
    const launchCmd = this.getLaunchCommand(surfaceId);
    const loginUrl = this.getLoginUrl(surfaceId);

    return `
=== Session Creation for ${surfaceId} ===

1. Close any existing Chrome windows

2. Open a terminal and run this command:
   ${launchCmd}

3. In the Chrome window that opens, navigate to:
   ${loginUrl}

4. Log in to the service manually:
   - Enter your credentials
   - Complete any 2FA if required
   - Solve any CAPTCHAs that appear

5. Once logged in, verify you can:
   - See the main chat/query interface
   - Submit a test query successfully

6. Keep Chrome open and run the session capture script:
   npx tsx scripts/capture-session.ts ${surfaceId}

7. The session will be saved and can be used for automated queries.

Notes:
- Sessions typically last 2-4 weeks before re-authentication is needed
- Some services may require periodic re-validation
- Keep your Chrome profile clean (don't install extensions)
`;
  }

  /**
   * Connect to running Chrome and extract session
   *
   * This connects to Chrome running with --remote-debugging-port
   * and extracts cookies and storage.
   */
  async captureSession(
    surfaceId: string,
    playwright: typeof import('playwright')
  ): Promise<StoredSession> {
    // Connect to Chrome DevTools Protocol
    const browser = await playwright.chromium.connectOverCDP(
      `http://localhost:${this.config.debugPort}`
    );

    try {
      // Get the first context (should be the one with the logged-in session)
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        throw new Error('No browser contexts found. Make sure Chrome is running with the debug port.');
      }

      const context = contexts[0];
      const pages = context.pages();

      if (pages.length === 0) {
        throw new Error('No pages found. Navigate to the service and log in first.');
      }

      // Get cookies
      const cookies = await context.cookies();

      // Get storage from the main page
      let localStorage: Record<string, string> = {};
      let sessionStorage: Record<string, string> = {};

      for (const page of pages) {
        const url = page.url();
        if (url.includes(this.getLoginUrl(surfaceId).replace('https://', ''))) {
          // Extract localStorage
          localStorage = await page.evaluate(() => {
            const items: Record<string, string> = {};
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              if (key) {
                items[key] = window.localStorage.getItem(key) || '';
              }
            }
            return items;
          });

          // Extract sessionStorage
          sessionStorage = await page.evaluate(() => {
            const items: Record<string, string> = {};
            for (let i = 0; i < window.sessionStorage.length; i++) {
              const key = window.sessionStorage.key(i);
              if (key) {
                items[key] = window.sessionStorage.getItem(key) || '';
              }
            }
            return items;
          });

          break;
        }
      }

      // Create session object
      const session: StoredSession = {
        id: `${surfaceId}-${Date.now()}`,
        surfaceId,
        createdAt: new Date(),
        lastValidatedAt: new Date(),
        cookies: cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
        })),
        localStorage,
        sessionStorage,
      };

      // Save session
      this.sessions.set(surfaceId, session);
      this.saveSessions();

      // Also save individual session file for backup
      const sessionFile = join(this.config.sessionDir, `${surfaceId}.json`);
      writeFileSync(sessionFile, JSON.stringify(session, null, 2));

      return session;
    } finally {
      // Disconnect (don't close - operator's Chrome should stay open)
      await browser.close();
    }
  }

  /**
   * Get a stored session
   */
  getSession(surfaceId: string): StoredSession | undefined {
    return this.sessions.get(surfaceId);
  }

  /**
   * Check if a session exists and is not expired
   */
  hasValidSession(surfaceId: string): boolean {
    const session = this.sessions.get(surfaceId);
    if (!session) return false;

    // Check if explicitly expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      return false;
    }

    // Check cookie expiration
    const now = Date.now() / 1000;
    const hasValidCookies = session.cookies.some(c =>
      !c.expires || c.expires > now
    );

    return hasValidCookies;
  }

  /**
   * List all available sessions
   */
  listSessions(): Array<{
    surfaceId: string;
    createdAt: Date;
    lastValidatedAt: Date;
    isValid: boolean;
  }> {
    return Array.from(this.sessions.values()).map(s => ({
      surfaceId: s.surfaceId,
      createdAt: s.createdAt,
      lastValidatedAt: s.lastValidatedAt,
      isValid: this.hasValidSession(s.surfaceId),
    }));
  }

  /**
   * Delete a session
   */
  deleteSession(surfaceId: string): boolean {
    const deleted = this.sessions.delete(surfaceId);
    if (deleted) {
      this.saveSessions();
    }
    return deleted;
  }

  /**
   * Mark a session as validated
   */
  markSessionValidated(surfaceId: string): void {
    const session = this.sessions.get(surfaceId);
    if (session) {
      session.lastValidatedAt = new Date();
      this.saveSessions();
    }
  }

  /**
   * Mark a session as expired
   */
  markSessionExpired(surfaceId: string): void {
    const session = this.sessions.get(surfaceId);
    if (session) {
      session.expiresAt = new Date();
      this.saveSessions();
    }
  }
}

/**
 * Create a session manager
 */
export function createSessionManager(
  config?: Partial<SessionManagerConfig>
): ChromeSessionManager {
  return new ChromeSessionManager(config);
}
