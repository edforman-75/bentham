/**
 * Brand24 Data Importer
 *
 * Imports Brand24 CSV/Excel exports into the database.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import type { Brand24Mention, SocialMention, KeywordConfig } from './types.js';

/**
 * Parse Brand24 CSV export file
 */
export function parseBrand24Csv(filePath: string): Brand24Mention[] {
  const content = fs.readFileSync(filePath, 'utf-8');

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row: Record<string, string>) => normalizeBrand24Row(row));
}

/**
 * Normalize a Brand24 CSV row to standard format
 */
function normalizeBrand24Row(row: Record<string, string>): Brand24Mention {
  // Handle various column name formats (Brand24 may use different formats)
  const getText = (keys: string[]): string | undefined => {
    for (const key of keys) {
      if (row[key]) return row[key];
      if (row[key.toLowerCase()]) return row[key.toLowerCase()];
      if (row[key.toUpperCase()]) return row[key.toUpperCase()];
    }
    return undefined;
  };

  const getNumber = (keys: string[]): number | undefined => {
    const val = getText(keys);
    if (!val) return undefined;
    const num = parseInt(val, 10);
    return isNaN(num) ? undefined : num;
  };

  const getSentiment = (keys: string[]): Brand24Mention['sentiment'] => {
    const val = getText(keys)?.toLowerCase();
    if (val === 'positive' || val === '1' || val === 'pos') return 'positive';
    if (val === 'negative' || val === '-1' || val === 'neg') return 'negative';
    return 'neutral';
  };

  const getSourceType = (source: string): Brand24Mention['sourceType'] => {
    const s = source.toLowerCase();
    if (s.includes('twitter') || s.includes('x.com')) return 'twitter';
    if (s.includes('facebook')) return 'facebook';
    if (s.includes('instagram')) return 'instagram';
    if (s.includes('linkedin')) return 'linkedin';
    if (s.includes('reddit')) return 'reddit';
    if (s.includes('youtube')) return 'youtube';
    if (s.includes('tiktok')) return 'tiktok';
    if (s.includes('news') || s.includes('bbc') || s.includes('cnn')) return 'news';
    if (s.includes('blog') || s.includes('medium') || s.includes('wordpress')) return 'blog';
    if (s.includes('forum') || s.includes('quora')) return 'forum';
    if (s.includes('review') || s.includes('yelp') || s.includes('trustpilot')) return 'review';
    if (s.includes('podcast') || s.includes('spotify') || s.includes('apple')) return 'podcast';
    return 'other';
  };

  const source = getText(['source', 'Source', 'platform', 'Platform']) || 'unknown';

  return {
    id: getText(['id', 'Id', 'ID', 'mention_id']),
    date: getText(['date', 'Date', 'created_at', 'timestamp']) || '',
    time: getText(['time', 'Time']),
    title: getText(['title', 'Title', 'headline']),
    text: getText(['text', 'Text', 'content', 'Content', 'description']) || '',
    author: getText(['author', 'Author', 'user', 'username']),
    authorFollowers: getNumber(['followers', 'Followers', 'author_followers']),
    url: getText(['url', 'URL', 'link', 'Link']) || '',
    source,
    sourceType: getSourceType(source),
    country: getText(['country', 'Country', 'location']),
    language: getText(['language', 'Language', 'lang']),
    sentiment: getSentiment(['sentiment', 'Sentiment']),
    sentimentScore: getNumber(['sentiment_score', 'sentimentScore']),
    reach: getNumber(['reach', 'Reach', 'impressions']),
    likes: getNumber(['likes', 'Likes', 'favorites']),
    shares: getNumber(['shares', 'Shares', 'retweets', 'reposts']),
    comments: getNumber(['comments', 'Comments', 'replies']),
    influencerScore: getNumber(['influencer_score', 'influencerScore', 'influence']),
    avatar: getText(['avatar', 'Avatar', 'profile_image']),
  };
}

/**
 * Convert Brand24 mention to database format
 */
export function toSocialMention(
  mention: Brand24Mention,
  keywordId?: number
): SocialMention {
  // Parse date
  let publishedAt: Date | undefined;
  if (mention.date) {
    const dateStr = mention.time
      ? `${mention.date} ${mention.time}`
      : mention.date;
    publishedAt = new Date(dateStr);
    if (isNaN(publishedAt.getTime())) {
      publishedAt = undefined;
    }
  }

  return {
    keywordId,
    source: mention.source,
    sourceType: mention.sourceType,
    author: mention.author,
    authorFollowers: mention.authorFollowers,
    title: mention.title,
    content: mention.text,
    url: mention.url,
    country: mention.country,
    language: mention.language,
    sentiment: mention.sentiment,
    sentimentScore: mention.sentimentScore,
    reach: mention.reach,
    likes: mention.likes,
    shares: mention.shares,
    comments: mention.comments,
    influencerScore: mention.influencerScore,
    publishedAt,
    collectedAt: new Date(),
    rawData: mention as unknown as Record<string, unknown>,
  };
}

/**
 * Import Brand24 CSV file to database-ready format
 */
export function importBrand24File(
  filePath: string,
  keywordId?: number
): SocialMention[] {
  const mentions = parseBrand24Csv(filePath);
  return mentions.map(m => toSocialMention(m, keywordId));
}

/**
 * Find all Brand24 export files in a directory
 */
export function findBrand24Exports(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory);
  return files
    .filter(f => f.endsWith('.csv') || f.endsWith('.xlsx'))
    .map(f => path.join(directory, f));
}

/**
 * Calculate mention statistics from a list of mentions
 */
export function calculateMentionStats(mentions: SocialMention[]): {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  totalReach: number;
  avgEngagement: number;
  topSources: Array<{ source: string; count: number }>;
} {
  const sourceCount = new Map<string, number>();
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  let totalReach = 0;
  let totalEngagement = 0;

  for (const mention of mentions) {
    // Sentiment
    if (mention.sentiment === 'positive') positive++;
    else if (mention.sentiment === 'negative') negative++;
    else neutral++;

    // Reach
    totalReach += mention.reach || 0;

    // Engagement
    totalEngagement += (mention.likes || 0) + (mention.shares || 0) + (mention.comments || 0);

    // Sources
    const source = mention.sourceType || mention.source || 'unknown';
    sourceCount.set(source, (sourceCount.get(source) || 0) + 1);
  }

  const topSources = Array.from(sourceCount.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: mentions.length,
    positive,
    negative,
    neutral,
    totalReach,
    avgEngagement: mentions.length > 0 ? totalEngagement / mentions.length : 0,
    topSources,
  };
}
