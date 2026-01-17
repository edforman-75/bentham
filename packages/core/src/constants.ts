/**
 * Constants for the Bentham system
 */

/**
 * Default timeout values in milliseconds
 */
export const DEFAULT_TIMEOUTS = {
  /** HTTP request timeout */
  HTTP_REQUEST: 30_000, // 30 seconds

  /** Surface query timeout */
  SURFACE_QUERY: 60_000, // 60 seconds

  /** Page load timeout */
  PAGE_LOAD: 30_000, // 30 seconds

  /** Navigation timeout */
  NAVIGATION: 30_000, // 30 seconds

  /** CAPTCHA solving timeout */
  CAPTCHA_SOLVE: 120_000, // 2 minutes

  /** Session validation timeout */
  SESSION_VALIDATION: 10_000, // 10 seconds

  /** Proxy connection timeout */
  PROXY_CONNECTION: 15_000, // 15 seconds

  /** Evidence capture timeout */
  EVIDENCE_CAPTURE: 30_000, // 30 seconds

  /** Job execution timeout (total) */
  JOB_EXECUTION: 180_000, // 3 minutes

  /** Study checkpoint interval */
  CHECKPOINT_INTERVAL: 60_000, // 1 minute
} as const;

/**
 * Maximum retry values
 */
export const MAX_RETRIES = {
  /** Maximum retries per job */
  JOB: 3,

  /** Maximum retries for session acquisition */
  SESSION_ACQUIRE: 5,

  /** Maximum retries for proxy acquisition */
  PROXY_ACQUIRE: 3,

  /** Maximum retries for CAPTCHA solving */
  CAPTCHA_SOLVE: 2,

  /** Maximum retries for evidence capture */
  EVIDENCE_CAPTURE: 2,

  /** Maximum retries for database operations */
  DATABASE: 3,

  /** Maximum retries for external API calls */
  EXTERNAL_API: 3,
} as const;

/**
 * Delay values for retries (exponential backoff base)
 */
export const RETRY_DELAYS = {
  /** Base delay for exponential backoff */
  BASE_DELAY: 1000, // 1 second

  /** Maximum delay between retries */
  MAX_DELAY: 30_000, // 30 seconds

  /** Jitter factor (0-1) for randomization */
  JITTER_FACTOR: 0.2,
} as const;

/**
 * Session pool configuration
 */
export const SESSION_POOL = {
  /** Maximum sessions per surface */
  MAX_SESSIONS_PER_SURFACE: 10,

  /** Session idle timeout before recycling */
  IDLE_TIMEOUT: 300_000, // 5 minutes

  /** Session max age before forced rotation */
  MAX_AGE: 3_600_000, // 1 hour

  /** Cooldown period after session error */
  ERROR_COOLDOWN: 60_000, // 1 minute

  /** Warm-up sessions to keep ready */
  WARMUP_COUNT: 2,
} as const;

/**
 * Human behavior simulation defaults
 */
export const HUMAN_BEHAVIOR = {
  /** Typing speed range (words per minute) */
  TYPING_WPM_MIN: 40,
  TYPING_WPM_MAX: 80,

  /** Typo rate (0-1) */
  TYPO_RATE: 0.02,

  /** Pause probability during typing (0-1) */
  TYPING_PAUSE_PROBABILITY: 0.1,

  /** Click delay range (ms) */
  CLICK_DELAY_MIN: 50,
  CLICK_DELAY_MAX: 200,

  /** Reading delay range (ms) */
  READING_DELAY_MIN: 1000,
  READING_DELAY_MAX: 5000,

  /** Navigation delay range (ms) */
  NAVIGATION_DELAY_MIN: 500,
  NAVIGATION_DELAY_MAX: 2000,
} as const;

/**
 * Evidence capture settings
 */
export const EVIDENCE = {
  /** Screenshot quality (0-100) */
  SCREENSHOT_QUALITY: 90,

  /** Screenshot format */
  SCREENSHOT_FORMAT: 'png' as const,

  /** Maximum HTML archive size (bytes) */
  MAX_HTML_ARCHIVE_SIZE: 10_485_760, // 10 MB

  /** Maximum HAR file size (bytes) */
  MAX_HAR_SIZE: 52_428_800, // 50 MB

  /** Maximum video duration (ms) */
  MAX_VIDEO_DURATION: 300_000, // 5 minutes
} as const;

/**
 * Queue configuration
 */
export const QUEUE = {
  /** Default visibility timeout */
  VISIBILITY_TIMEOUT: 300, // 5 minutes (seconds)

  /** Maximum messages per batch */
  MAX_BATCH_SIZE: 10,

  /** Long polling wait time */
  WAIT_TIME_SECONDS: 20,

  /** Dead letter queue threshold */
  MAX_RECEIVE_COUNT: 5,
} as const;

/**
 * Manifest version
 */
export const MANIFEST_VERSION = '1.0';

/**
 * API version
 */
export const API_VERSION = 'v1';
