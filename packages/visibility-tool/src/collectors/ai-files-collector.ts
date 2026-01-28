/**
 * AI Files Collector
 * Discovers and parses llms.txt and robots.txt AI bot rules from websites
 */

export interface AIBotRule {
  bot: string;
  directive: 'allow' | 'disallow';
  path: string;
}

export interface LlmsTxtContent {
  exists: boolean;
  url: string;
  content: string | null;
  error?: string;
  /** Parsed sections from llms.txt */
  sections?: {
    title?: string;
    description?: string;
    contact?: string;
    /** URLs or content blocks */
    urls?: string[];
  };
}

export interface RobotsTxtContent {
  exists: boolean;
  url: string;
  content: string | null;
  error?: string;
  /** AI-specific bot rules extracted from robots.txt */
  aiBotRules: AIBotRule[];
  /** Summary of AI bot access */
  aiAccess: {
    gptBot: 'allowed' | 'blocked' | 'partial' | 'not-specified';
    claudeBot: 'allowed' | 'blocked' | 'partial' | 'not-specified';
    googleExtended: 'allowed' | 'blocked' | 'partial' | 'not-specified';
    bingBot: 'allowed' | 'blocked' | 'partial' | 'not-specified';
    perplexityBot: 'allowed' | 'blocked' | 'partial' | 'not-specified';
  };
}

export interface AIFilesResult {
  domain: string;
  timestamp: string;
  llmsTxt: LlmsTxtContent;
  llmsFullTxt: LlmsTxtContent;
  robotsTxt: RobotsTxtContent;
  /** Overall AI optimization score (0-100) */
  aiReadinessScore: number;
  /** Quick assessment */
  assessment: {
    hasLlmsTxt: boolean;
    hasLlmsFullTxt: boolean;
    blocksAIBots: boolean;
    partialAIAccess: boolean;
    recommendation: string;
  };
}

/** Known AI crawler bot names */
const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'Anthropic-AI',
  'Google-Extended',
  'Bingbot',
  'PerplexityBot',
  'Amazonbot',
  'cohere-ai',
  'Meta-ExternalAgent',
  'FacebookBot',
] as const;

/**
 * Normalize domain to base URL
 */
function normalizeUrl(domain: string): string {
  let url = domain.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  // Remove trailing slash
  return url.replace(/\/$/, '');
}

/**
 * Fetch a file with timeout and error handling
 */
async function fetchFile(url: string, timeoutMs = 10000): Promise<{ content: string | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BenthamBot/1.0; +https://bentham.ai)',
      },
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      return { content: null };
    }

    if (!response.ok) {
      return { content: null, error: `HTTP ${response.status}` };
    }

    const content = await response.text();
    return { content };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      return { content: null, error: 'Timeout' };
    }
    return { content: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Parse llms.txt content into sections
 */
function parseLlmsTxt(content: string): LlmsTxtContent['sections'] {
  const sections: LlmsTxtContent['sections'] = {
    urls: [],
  };

  const lines = content.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Check for section headers (markdown style: "# " with space)
    if (trimmed.startsWith('# ')) {
      sections.title = trimmed.slice(2).trim();
      continue;
    }

    // Skip comments (# without space after, or ## etc)
    if (trimmed.startsWith('#')) continue;

    // Check for description (usually after title)
    if (trimmed.startsWith('> ')) {
      sections.description = (sections.description || '') + trimmed.slice(2).trim() + ' ';
      continue;
    }

    // Check for contact info
    if (trimmed.toLowerCase().includes('contact:') || trimmed.toLowerCase().includes('email:')) {
      sections.contact = trimmed;
      continue;
    }

    // URLs
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
      sections.urls!.push(trimmed);
    }
  }

  if (sections.description) {
    sections.description = sections.description.trim();
  }

  return sections;
}

/**
 * Parse robots.txt and extract AI bot rules
 */
function parseRobotsTxt(content: string): { rules: AIBotRule[]; aiAccess: RobotsTxtContent['aiAccess'] } {
  const rules: AIBotRule[] = [];
  const lines = content.split('\n');
  let currentUserAgent: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse User-agent directive
    if (trimmed.startsWith('user-agent:')) {
      currentUserAgent = trimmed.slice('user-agent:'.length).trim();
      continue;
    }

    // Parse Allow/Disallow directives
    if (currentUserAgent && (trimmed.startsWith('allow:') || trimmed.startsWith('disallow:'))) {
      const isAllow = trimmed.startsWith('allow:');
      const path = trimmed.slice(isAllow ? 'allow:'.length : 'disallow:'.length).trim() || '/';

      // Check if this applies to an AI bot (case-insensitive)
      const matchingBot = AI_BOTS.find(bot =>
        currentUserAgent === '*' ||
        currentUserAgent!.toLowerCase() === bot.toLowerCase()
      );

      if (matchingBot || currentUserAgent === '*') {
        rules.push({
          bot: currentUserAgent === '*' ? '*' : matchingBot || currentUserAgent,
          directive: isAllow ? 'allow' : 'disallow',
          path,
        });
      }
    }
  }

  // Determine access status for each major AI bot
  const getAccessStatus = (botName: string): 'allowed' | 'blocked' | 'partial' | 'not-specified' => {
    // First check for specific bot rules (higher priority)
    const specificRules = rules.filter(r =>
      r.bot.toLowerCase() === botName.toLowerCase()
    );

    // Fall back to wildcard rules only if no specific rules exist
    const wildcardRules = rules.filter(r => r.bot === '*');
    const botRules = specificRules.length > 0 ? specificRules : wildcardRules;

    if (botRules.length === 0) return 'not-specified';

    const hasDisallowAll = botRules.some(r => r.directive === 'disallow' && r.path === '/');
    const hasAllowRoot = botRules.some(r => r.directive === 'allow' && r.path === '/');
    const hasPartialDisallow = botRules.some(r => r.directive === 'disallow' && r.path !== '/');

    if (hasDisallowAll && !hasAllowRoot) return 'blocked';
    if (hasPartialDisallow) return 'partial';
    if (hasAllowRoot) return 'allowed';

    return 'not-specified';
  };

  const aiAccess: RobotsTxtContent['aiAccess'] = {
    gptBot: getAccessStatus('GPTBot'),
    claudeBot: getAccessStatus('ClaudeBot'),
    googleExtended: getAccessStatus('Google-Extended'),
    bingBot: getAccessStatus('Bingbot'),
    perplexityBot: getAccessStatus('PerplexityBot'),
  };

  return { rules, aiAccess };
}

/**
 * Calculate AI readiness score
 */
function calculateAIReadinessScore(result: Partial<AIFilesResult>): number {
  let score = 0;

  // llms.txt exists: +40 points
  if (result.llmsTxt?.exists) {
    score += 40;
    // Bonus for having content sections
    if (result.llmsTxt.sections?.title) score += 5;
    if (result.llmsTxt.sections?.description) score += 5;
    if (result.llmsTxt.sections?.urls && result.llmsTxt.sections.urls.length > 0) score += 5;
  }

  // llms-full.txt exists: +10 points
  if (result.llmsFullTxt?.exists) {
    score += 10;
  }

  // AI bot access in robots.txt
  if (result.robotsTxt?.exists) {
    const access = result.robotsTxt.aiAccess;
    const statuses = [access.gptBot, access.claudeBot, access.googleExtended, access.perplexityBot];

    // Points for allowing AI bots
    const allowedCount = statuses.filter(s => s === 'allowed' || s === 'not-specified').length;
    const blockedCount = statuses.filter(s => s === 'blocked').length;

    // Full access: +35 points, partial: scaled
    score += Math.round((allowedCount / statuses.length) * 35);

    // Penalty for blocking
    if (blockedCount > 0) {
      score -= blockedCount * 5;
    }
  } else {
    // No robots.txt means default allow: +20 points
    score += 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Collect AI-related files from a domain
 */
export async function collectAIFiles(domain: string): Promise<AIFilesResult> {
  const baseUrl = normalizeUrl(domain);
  const timestamp = new Date().toISOString();

  // Fetch all three files in parallel
  const [llmsResult, llmsFullResult, robotsResult] = await Promise.all([
    fetchFile(`${baseUrl}/llms.txt`),
    fetchFile(`${baseUrl}/llms-full.txt`),
    fetchFile(`${baseUrl}/robots.txt`),
  ]);

  // Parse llms.txt
  const llmsTxt: LlmsTxtContent = {
    exists: llmsResult.content !== null,
    url: `${baseUrl}/llms.txt`,
    content: llmsResult.content,
    error: llmsResult.error,
    sections: llmsResult.content ? parseLlmsTxt(llmsResult.content) : undefined,
  };

  // Parse llms-full.txt
  const llmsFullTxt: LlmsTxtContent = {
    exists: llmsFullResult.content !== null,
    url: `${baseUrl}/llms-full.txt`,
    content: llmsFullResult.content,
    error: llmsFullResult.error,
    sections: llmsFullResult.content ? parseLlmsTxt(llmsFullResult.content) : undefined,
  };

  // Parse robots.txt
  const robotsParsed = robotsResult.content ? parseRobotsTxt(robotsResult.content) : null;
  const robotsTxt: RobotsTxtContent = {
    exists: robotsResult.content !== null,
    url: `${baseUrl}/robots.txt`,
    content: robotsResult.content,
    error: robotsResult.error,
    aiBotRules: robotsParsed?.rules || [],
    aiAccess: robotsParsed?.aiAccess || {
      gptBot: 'not-specified',
      claudeBot: 'not-specified',
      googleExtended: 'not-specified',
      bingBot: 'not-specified',
      perplexityBot: 'not-specified',
    },
  };

  // Build partial result for scoring
  const partialResult = { llmsTxt, llmsFullTxt, robotsTxt };
  const aiReadinessScore = calculateAIReadinessScore(partialResult);

  // Generate assessment
  const blocksAIBots = Object.values(robotsTxt.aiAccess).some(s => s === 'blocked');
  const partialAIAccess = Object.values(robotsTxt.aiAccess).some(s => s === 'partial');

  let recommendation: string;
  if (!llmsTxt.exists && !blocksAIBots) {
    recommendation = 'Add llms.txt to provide AI crawlers with structured content guidance';
  } else if (blocksAIBots) {
    recommendation = 'Consider allowing AI bots in robots.txt to improve AI visibility';
  } else if (llmsTxt.exists && !llmsFullTxt.exists) {
    recommendation = 'Consider adding llms-full.txt for more detailed AI crawler guidance';
  } else if (aiReadinessScore >= 80) {
    recommendation = 'Good AI optimization. Monitor AI citations and update llms.txt regularly.';
  } else {
    recommendation = 'Review llms.txt content and ensure AI bots have appropriate access';
  }

  return {
    domain: baseUrl,
    timestamp,
    llmsTxt,
    llmsFullTxt,
    robotsTxt,
    aiReadinessScore,
    assessment: {
      hasLlmsTxt: llmsTxt.exists,
      hasLlmsFullTxt: llmsFullTxt.exists,
      blocksAIBots,
      partialAIAccess,
      recommendation,
    },
  };
}

/**
 * Collect AI files from multiple domains
 */
export async function collectAIFilesFromDomains(
  domains: string[],
  onProgress?: (completed: number, total: number, result: AIFilesResult) => void
): Promise<AIFilesResult[]> {
  const results: AIFilesResult[] = [];

  for (let i = 0; i < domains.length; i++) {
    const result = await collectAIFiles(domains[i]);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, domains.length, result);
    }

    // Small delay between domains to be polite
    if (i < domains.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Compare AI readiness across multiple domains
 */
export function compareAIReadiness(results: AIFilesResult[]): {
  rankings: Array<{ domain: string; score: number; hasLlmsTxt: boolean; blocksAI: boolean }>;
  insights: string[];
} {
  const rankings = results
    .map(r => ({
      domain: r.domain,
      score: r.aiReadinessScore,
      hasLlmsTxt: r.llmsTxt.exists,
      blocksAI: r.assessment.blocksAIBots,
    }))
    .sort((a, b) => b.score - a.score);

  const insights: string[] = [];

  const withLlms = results.filter(r => r.llmsTxt.exists);
  const blocking = results.filter(r => r.assessment.blocksAIBots);

  if (withLlms.length === 0) {
    insights.push('None of the analyzed sites have llms.txt - opportunity to lead in AI optimization');
  } else {
    insights.push(`${withLlms.length} of ${results.length} sites have llms.txt`);
  }

  if (blocking.length > 0) {
    insights.push(`${blocking.length} sites block AI bots in robots.txt`);
  }

  const avgScore = Math.round(results.reduce((s, r) => s + r.aiReadinessScore, 0) / results.length);
  insights.push(`Average AI readiness score: ${avgScore}/100`);

  return { rankings, insights };
}
