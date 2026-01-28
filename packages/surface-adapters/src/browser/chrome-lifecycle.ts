/**
 * Chrome Lifecycle Manager
 *
 * Manages Chrome browser processes for surfaces that require browser automation.
 * Handles launching, monitoring, and graceful shutdown of Chrome instances.
 *
 * NOTE: Google Search should use SerpAPI, not browser automation.
 * This manager is for Cloudflare-protected surfaces like ChatGPT, Perplexity Web, etc.
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Chrome instance configuration
 */
export interface ChromeInstanceConfig {
  /** CDP port for DevTools Protocol connection */
  cdpPort: number;
  /** User data directory (isolated profile) */
  userDataDir?: string;
  /** Run in headless mode */
  headless?: boolean;
  /** Proxy server URL */
  proxyServer?: string;
  /** Additional Chrome flags */
  additionalFlags?: string[];
  /** Instance label for identification */
  label?: string;
}

/**
 * Chrome instance state
 */
export interface ChromeInstance {
  /** Process ID */
  pid: number;
  /** CDP port */
  cdpPort: number;
  /** User data directory */
  userDataDir: string;
  /** Instance label */
  label: string;
  /** Start time */
  startedAt: Date;
  /** Child process reference */
  process: ChildProcess;
  /** Current status */
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';
}

/**
 * Chrome lifecycle manager configuration
 */
export interface ChromeLifecycleConfig {
  /** Base CDP port (instances use sequential ports from this) */
  baseCdpPort: number;
  /** Maximum concurrent Chrome instances */
  maxInstances: number;
  /** Startup timeout in ms */
  startupTimeoutMs: number;
  /** Shutdown timeout in ms */
  shutdownTimeoutMs: number;
  /** Health check interval in ms */
  healthCheckIntervalMs: number;
  /** Base directory for user data profiles */
  profileBaseDir: string;
  /** Clean up profiles on shutdown */
  cleanupProfiles: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_CHROME_LIFECYCLE_CONFIG: ChromeLifecycleConfig = {
  baseCdpPort: 9222,
  maxInstances: 3,
  startupTimeoutMs: 30000,
  shutdownTimeoutMs: 10000,
  healthCheckIntervalMs: 30000,
  profileBaseDir: join(tmpdir(), 'bentham-chrome-profiles'),
  cleanupProfiles: true,
};

/**
 * Detect Chrome binary path based on platform
 */
export function detectChromePath(): string | null {
  const platform = process.platform;

  const paths: Record<string, string[]> = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ],
  };

  const candidates = paths[platform] || paths.linux;

  for (const path of candidates) {
    if (path && existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Check if a CDP port is available
 */
export async function isCdpPortAvailable(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    // If we get a response, Chrome is already running on this port
    return !response.ok;
  } catch {
    // Connection refused = port is available
    return true;
  }
}

/**
 * Wait for Chrome CDP to become available
 */
export async function waitForCdp(port: number, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return false;
}

/**
 * Chrome Lifecycle Manager
 *
 * Manages multiple Chrome instances for browser automation.
 */
export class ChromeLifecycleManager {
  private config: ChromeLifecycleConfig;
  private instances: Map<number, ChromeInstance> = new Map();
  private chromePath: string | null = null;
  private healthCheckInterval?: NodeJS.Timeout;
  private nextInstanceId = 0;

  constructor(config: Partial<ChromeLifecycleConfig> = {}) {
    this.config = { ...DEFAULT_CHROME_LIFECYCLE_CONFIG, ...config };
    this.chromePath = detectChromePath();

    // Ensure profile directory exists
    if (!existsSync(this.config.profileBaseDir)) {
      mkdirSync(this.config.profileBaseDir, { recursive: true });
    }
  }

  /**
   * Check if Chrome is available on this system
   */
  isAvailable(): boolean {
    return this.chromePath !== null;
  }

  /**
   * Get Chrome binary path
   */
  getChromePath(): string | null {
    return this.chromePath;
  }

  /**
   * Get number of running instances
   */
  getInstanceCount(): number {
    return Array.from(this.instances.values()).filter(
      i => i.status === 'running'
    ).length;
  }

  /**
   * Get all instances
   */
  getInstances(): ChromeInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get instance by CDP port
   */
  getInstanceByPort(port: number): ChromeInstance | undefined {
    return Array.from(this.instances.values()).find(i => i.cdpPort === port);
  }

  /**
   * Find an available CDP port
   */
  private async findAvailablePort(): Promise<number> {
    for (let i = 0; i < this.config.maxInstances; i++) {
      const port = this.config.baseCdpPort + i;
      if (await isCdpPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No available CDP ports (checked ${this.config.baseCdpPort}-${this.config.baseCdpPort + this.config.maxInstances - 1})`);
  }

  /**
   * Launch a new Chrome instance
   */
  async launch(config: Partial<ChromeInstanceConfig> = {}): Promise<ChromeInstance> {
    if (!this.chromePath) {
      throw new Error('Chrome not found. Please install Google Chrome.');
    }

    if (this.getInstanceCount() >= this.config.maxInstances) {
      throw new Error(`Maximum Chrome instances (${this.config.maxInstances}) reached`);
    }

    // Find available port
    const cdpPort = config.cdpPort ?? await this.findAvailablePort();

    // Check if port is actually available
    if (!(await isCdpPortAvailable(cdpPort))) {
      throw new Error(`CDP port ${cdpPort} is already in use`);
    }

    // Create user data directory
    const instanceId = this.nextInstanceId++;
    const label = config.label ?? `instance-${instanceId}`;
    const userDataDir = config.userDataDir ?? join(
      this.config.profileBaseDir,
      `chrome-${label}-${Date.now()}`
    );

    if (!existsSync(userDataDir)) {
      mkdirSync(userDataDir, { recursive: true });
    }

    // Build Chrome flags
    const flags = [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--safebrowsing-disable-auto-update',
    ];

    if (config.headless) {
      flags.push('--headless=new');
    }

    if (config.proxyServer) {
      flags.push(`--proxy-server=${config.proxyServer}`);
    }

    if (config.additionalFlags) {
      flags.push(...config.additionalFlags);
    }

    // Launch Chrome
    const chromeProcess = spawn(this.chromePath, flags, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const instance: ChromeInstance = {
      pid: chromeProcess.pid!,
      cdpPort,
      userDataDir,
      label,
      startedAt: new Date(),
      process: chromeProcess,
      status: 'starting',
    };

    this.instances.set(instance.pid, instance);

    // Handle process exit
    chromeProcess.on('exit', (code, signal) => {
      const inst = this.instances.get(instance.pid);
      if (inst) {
        inst.status = code === 0 || signal === 'SIGTERM' ? 'stopped' : 'crashed';
      }
    });

    chromeProcess.on('error', (err) => {
      console.error(`Chrome process error (${label}):`, err.message);
      const inst = this.instances.get(instance.pid);
      if (inst) {
        inst.status = 'crashed';
      }
    });

    // Wait for CDP to become available
    const cdpReady = await waitForCdp(cdpPort, this.config.startupTimeoutMs);

    if (!cdpReady) {
      // Kill the process if CDP didn't start
      await this.stop(instance.pid);
      throw new Error(`Chrome failed to start CDP on port ${cdpPort} within ${this.config.startupTimeoutMs}ms`);
    }

    instance.status = 'running';
    return instance;
  }

  /**
   * Stop a Chrome instance
   */
  async stop(pid: number): Promise<void> {
    const instance = this.instances.get(pid);
    if (!instance) {
      return;
    }

    if (instance.status === 'stopped' || instance.status === 'crashed') {
      this.instances.delete(pid);
      return;
    }

    instance.status = 'stopping';

    // Try graceful shutdown first
    instance.process.kill('SIGTERM');

    // Wait for process to exit
    const exitPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if still running
        if (instance.status === 'stopping') {
          instance.process.kill('SIGKILL');
        }
        resolve();
      }, this.config.shutdownTimeoutMs);

      instance.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    await exitPromise;

    // Clean up profile if configured
    if (this.config.cleanupProfiles && existsSync(instance.userDataDir)) {
      try {
        rmSync(instance.userDataDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    this.instances.delete(pid);
  }

  /**
   * Stop all Chrome instances
   */
  async stopAll(): Promise<void> {
    const pids = Array.from(this.instances.keys());
    await Promise.all(pids.map(pid => this.stop(pid)));
  }

  /**
   * Start health check monitoring
   */
  startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const instance of this.instances.values()) {
        if (instance.status !== 'running') continue;

        try {
          const response = await fetch(
            `http://localhost:${instance.cdpPort}/json/version`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (!response.ok) {
            instance.status = 'crashed';
          }
        } catch {
          instance.status = 'crashed';
        }
      }
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Shutdown manager and all instances
   */
  async shutdown(): Promise<void> {
    this.stopHealthCheck();
    await this.stopAll();
  }

  /**
   * Get or launch an instance for a specific purpose
   * Reuses existing instance if available, launches new one if needed
   */
  async getOrLaunch(config: Partial<ChromeInstanceConfig> = {}): Promise<ChromeInstance> {
    // Check for existing running instance with matching label
    if (config.label) {
      const existing = Array.from(this.instances.values()).find(
        i => i.label === config.label && i.status === 'running'
      );
      if (existing) {
        return existing;
      }
    }

    // Check for any running instance if no specific label requested
    if (!config.label && !config.cdpPort) {
      const running = Array.from(this.instances.values()).find(
        i => i.status === 'running'
      );
      if (running) {
        return running;
      }
    }

    // Launch new instance
    return this.launch(config);
  }

  /**
   * Connect to an existing Chrome instance (launched externally)
   */
  async connectToExisting(cdpPort: number, label?: string): Promise<ChromeInstance | null> {
    // Check if CDP is available
    try {
      const response = await fetch(`http://localhost:${cdpPort}/json/version`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return null;
      }
    } catch {
      return null;
    }

    // Create a virtual instance for tracking
    const instance: ChromeInstance = {
      pid: -1, // External process, PID unknown
      cdpPort,
      userDataDir: 'external',
      label: label ?? `external-${cdpPort}`,
      startedAt: new Date(),
      process: null as unknown as ChildProcess, // No process reference for external
      status: 'running',
    };

    this.instances.set(cdpPort * -1, instance); // Use negative port as key for external
    return instance;
  }
}

/**
 * Singleton instance for global Chrome management
 */
let globalManager: ChromeLifecycleManager | null = null;

/**
 * Get or create the global Chrome lifecycle manager
 */
export function getChromeManager(config?: Partial<ChromeLifecycleConfig>): ChromeLifecycleManager {
  if (!globalManager) {
    globalManager = new ChromeLifecycleManager(config);
  }
  return globalManager;
}

/**
 * Shutdown the global Chrome manager
 */
export async function shutdownChromeManager(): Promise<void> {
  if (globalManager) {
    await globalManager.shutdown();
    globalManager = null;
  }
}
