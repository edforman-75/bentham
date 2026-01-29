#!/usr/bin/env npx tsx
/**
 * Multi-Source Social Media Scraper
 *
 * Free social listening using public APIs:
 * - Reddit (public JSON API)
 * - Hacker News (Algolia API)
 * - News via Google News RSS
 *
 * No API keys required!
 *
 * Usage:
 *   npx tsx social-scraper.ts search "TASC Performance"
 *   npx tsx social-scraper.ts tasc-scan
 *   npx tsx social-scraper.ts tasc-scan --output json
 */

interface SocialMention {
  id: string;
  platform: string;
  author: string;
  authorUrl?: string;
  title?: string;
  content: string;
  url: string;
  timestamp: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  score?: number;
  comments?: number;
  subreddit?: string;
}

interface SearchResult {
  query: string;
  timestamp: string;
  sources: string[];
  totalResults: number;
  mentions: SocialMention[];
}

const USER_AGENT = 'BenthamBot/1.0 (social listening research)';

// ============ Reddit ============

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    author: string;
    subreddit: string;
    permalink: string;
    url: string;
    created_utc: number;
    score: number;
    num_comments: number;
  };
}

async function searchReddit(query: string, limit = 25): Promise<SocialMention[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=new`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    console.error(`Reddit API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const posts: RedditPost[] = data?.data?.children || [];

  return posts.map(post => ({
    id: `reddit-${post.data.id}`,
    platform: 'reddit',
    author: post.data.author,
    authorUrl: `https://reddit.com/u/${post.data.author}`,
    title: post.data.title,
    content: post.data.selftext || post.data.title,
    url: `https://reddit.com${post.data.permalink}`,
    timestamp: new Date(post.data.created_utc * 1000).toISOString(),
    score: post.data.score,
    comments: post.data.num_comments,
    subreddit: post.data.subreddit,
  }));
}

// ============ Hacker News ============

interface HNHit {
  objectID: string;
  title?: string;
  story_text?: string;
  comment_text?: string;
  author: string;
  url?: string;
  story_url?: string;
  created_at: string;
  points?: number;
  num_comments?: number;
}

async function searchHackerNews(query: string, limit = 25): Promise<SocialMention[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${limit}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    console.error(`HN API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const hits: HNHit[] = data?.hits || [];

  return hits.map(hit => ({
    id: `hn-${hit.objectID}`,
    platform: 'hackernews',
    author: hit.author,
    authorUrl: `https://news.ycombinator.com/user?id=${hit.author}`,
    title: hit.title,
    content: hit.story_text || hit.comment_text || hit.title || '',
    url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    timestamp: hit.created_at,
    score: hit.points,
    comments: hit.num_comments,
  }));
}

// ============ Google News RSS ============

async function searchGoogleNews(query: string): Promise<SocialMention[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    console.error(`Google News error: ${response.status}`);
    return [];
  }

  const xml = await response.text();
  return parseRSSFeed(xml, 'news');
}

function parseRSSFeed(xml: string, platform: string): SocialMention[] {
  const mentions: SocialMention[] = [];

  // Simple XML parsing for RSS items
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  const items = xml.match(itemPattern) || [];

  for (const item of items) {
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link');
    const pubDate = extractTag(item, 'pubDate');
    const description = extractTag(item, 'description');
    const source = extractTag(item, 'source');

    if (title && link) {
      mentions.push({
        id: `${platform}-${hashString(link)}`,
        platform,
        author: source || 'news',
        title,
        content: cleanHtml(description || title),
        url: link,
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }
  }

  return mentions;
}

function extractTag(xml: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const match = xml.match(pattern);
  return match ? (match[1] || match[2] || '').trim() : '';
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============ Sentiment Analysis ============

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const lowerText = text.toLowerCase();

  const positiveWords = [
    'love', 'great', 'amazing', 'awesome', 'excellent', 'best', 'fantastic',
    'wonderful', 'perfect', 'recommend', 'comfortable', 'quality', 'favorite',
    'happy', 'thanks', 'beautiful', 'soft', 'durable', 'worth', 'impressed'
  ];
  const negativeWords = [
    'hate', 'terrible', 'awful', 'worst', 'bad', 'poor', 'disappointed',
    'disappointing', 'horrible', 'waste', 'broken', 'uncomfortable', 'cheap',
    'refund', 'return', 'overpriced', 'shrink', 'ripped', 'flimsy', 'avoid'
  ];

  let score = 0;
  for (const word of positiveWords) {
    if (lowerText.includes(word)) score++;
  }
  for (const word of negativeWords) {
    if (lowerText.includes(word)) score--;
  }

  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}

// ============ Main Search ============

async function searchAll(query: string): Promise<SearchResult> {
  console.error(`\nSearching for: "${query}"\n`);

  const [reddit, hn, news] = await Promise.all([
    searchReddit(query).catch(e => { console.error('Reddit error:', e.message); return []; }),
    searchHackerNews(query).catch(e => { console.error('HN error:', e.message); return []; }),
    searchGoogleNews(query).catch(e => { console.error('News error:', e.message); return []; }),
  ]);

  console.error(`  Reddit: ${reddit.length} results`);
  console.error(`  Hacker News: ${hn.length} results`);
  console.error(`  Google News: ${news.length} results`);

  const allMentions = [...reddit, ...hn, ...news].map(m => ({
    ...m,
    sentiment: analyzeSentiment(m.content),
  }));

  // Sort by timestamp (newest first)
  allMentions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    query,
    timestamp: new Date().toISOString(),
    sources: ['reddit', 'hackernews', 'news'],
    totalResults: allMentions.length,
    mentions: allMentions,
  };
}

// ============ TASC Presets ============

const TASC_BRAND_KEYWORDS = [
  'TASC Performance',
  'tasc bamboo',
  'BamCo fabric',
  'tascperformance',
];

const TASC_COMPETITOR_KEYWORDS = [
  'lululemon bamboo',
  'vuori clothing',
  'rhone apparel',
  'free fly apparel',
  'cariloha clothing',
];

const CATEGORY_KEYWORDS = [
  'bamboo athletic wear',
  'sustainable activewear',
  'anti-odor workout clothes',
];

async function runTascScan(outputFormat: 'table' | 'json' = 'table'): Promise<void> {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   TASC Performance Social Listening Scan  ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const allResults: SearchResult[] = [];
  const allMentions: SocialMention[] = [];

  // Brand keywords
  console.log('📍 TASC Brand Keywords\n');
  for (const keyword of TASC_BRAND_KEYWORDS) {
    const result = await searchAll(keyword);
    allResults.push(result);
    allMentions.push(...result.mentions);
    await sleep(1000);
  }

  // Competitor keywords
  console.log('\n📍 Competitor Keywords\n');
  for (const keyword of TASC_COMPETITOR_KEYWORDS) {
    const result = await searchAll(keyword);
    allResults.push(result);
    await sleep(1000);
  }

  // Category keywords
  console.log('\n📍 Category Keywords\n');
  for (const keyword of CATEGORY_KEYWORDS) {
    const result = await searchAll(keyword);
    allResults.push(result);
    await sleep(1000);
  }

  // Deduplicate TASC mentions
  const seen = new Set<string>();
  const uniqueMentions = allMentions.filter(m => {
    if (seen.has(m.url)) return false;
    seen.add(m.url);
    return true;
  });

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('                    SUMMARY');
  console.log('═'.repeat(50) + '\n');

  const positive = uniqueMentions.filter(m => m.sentiment === 'positive').length;
  const negative = uniqueMentions.filter(m => m.sentiment === 'negative').length;
  const neutral = uniqueMentions.filter(m => m.sentiment === 'neutral').length;

  console.log(`Total TASC mentions found: ${uniqueMentions.length}`);
  console.log(`Sentiment: ✓ ${positive} positive | ✗ ${negative} negative | ○ ${neutral} neutral`);

  // Platform breakdown
  const platforms = new Map<string, number>();
  for (const m of uniqueMentions) {
    platforms.set(m.platform, (platforms.get(m.platform) || 0) + 1);
  }

  console.log('\nBy platform:');
  for (const [platform, count] of platforms) {
    const icon = platform === 'reddit' ? '🔴' : platform === 'hackernews' ? '🟠' : '📰';
    console.log(`  ${icon} ${platform}: ${count}`);
  }

  // Recent mentions
  if (uniqueMentions.length > 0) {
    console.log('\n' + '─'.repeat(50));
    console.log('Recent TASC Mentions:');
    console.log('─'.repeat(50) + '\n');

    for (const mention of uniqueMentions.slice(0, 10)) {
      const sentimentIcon = mention.sentiment === 'positive' ? '✓' : mention.sentiment === 'negative' ? '✗' : '○';
      const date = new Date(mention.timestamp).toLocaleDateString();

      console.log(`[${mention.platform}] ${sentimentIcon} ${date}`);
      if (mention.title) {
        console.log(`  ${mention.title.substring(0, 70)}${mention.title.length > 70 ? '...' : ''}`);
      }
      console.log(`  ${mention.url}`);
      if (mention.subreddit) console.log(`  r/${mention.subreddit} | ↑${mention.score || 0} | 💬${mention.comments || 0}`);
      console.log();
    }
  }

  // JSON output
  if (outputFormat === 'json') {
    console.log('\n' + '─'.repeat(50));
    console.log('JSON Output:');
    console.log('─'.repeat(50) + '\n');
    console.log(JSON.stringify({
      scanDate: new Date().toISOString(),
      summary: {
        totalMentions: uniqueMentions.length,
        sentiment: { positive, negative, neutral },
        platforms: Object.fromEntries(platforms),
      },
      mentions: uniqueMentions,
    }, null, 2));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ CLI ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Social Media Scraper - Free Multi-Source Social Listening

Usage:
  social-scraper <command> [options]

Commands:
  search <query>     Search across all sources
  tasc-scan          Run full TASC Performance scan

Options:
  --output, -o       Output format: table, json (default: table)

Sources:
  • Reddit (public API)
  • Hacker News (Algolia API)
  • Google News (RSS)

Examples:
  social-scraper search "bamboo activewear"
  social-scraper search "TASC Performance" --output json
  social-scraper tasc-scan
  social-scraper tasc-scan --output json

No API keys required!
`);
    return;
  }

  const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
  const outputFormat = (outputIdx >= 0 ? args[outputIdx + 1] : 'table') as 'table' | 'json';

  switch (command) {
    case 'search': {
      const query = args[1];
      if (!query) {
        console.error('Error: Search query required');
        process.exit(1);
      }

      const result = await searchAll(query);

      if (outputFormat === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nFound ${result.totalResults} results for "${query}"\n`);

        for (const mention of result.mentions.slice(0, 20)) {
          const sentimentIcon = mention.sentiment === 'positive' ? '✓' : mention.sentiment === 'negative' ? '✗' : '○';
          console.log(`[${mention.platform}] ${sentimentIcon} ${mention.author}`);
          if (mention.title) console.log(`  ${mention.title.substring(0, 80)}`);
          console.log(`  ${mention.url}\n`);
        }
      }
      break;
    }

    case 'tasc-scan':
      await runTascScan(outputFormat);
      break;

    default:
      // Treat unknown command as search query
      const result = await searchAll(command);
      console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

export {
  searchAll,
  searchReddit,
  searchHackerNews,
  searchGoogleNews,
  analyzeSentiment,
  type SocialMention,
  type SearchResult,
};
