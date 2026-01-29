/**
 * Brand24 Data Importer
 *
 * Imports Brand24 CSV/Excel exports into the database.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
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
 * Parse Brand24 Excel (.xlsx) export file
 *
 * Brand24 Excel structure:
 * - Sheet: "Mentions"
 * - Headers (row 1): '', ID, Date, Hrs, Title, Content, Source, Domain, Category, Sentiment, Tags
 * - Data starts row 2
 */
export function parseBrand24Excel(filePath: string): Brand24Mention[] {
  const workbook = XLSX.readFile(filePath);

  // Get the Mentions sheet (primary data)
  const sheetName = workbook.SheetNames.find(s => s.toLowerCase() === 'mentions') || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    console.error(`No sheet found in ${filePath}`);
    return [];
  }

  // Convert to JSON with raw array format
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
  }) as unknown[][];

  if (rows.length < 3) {
    console.error(`No data rows in ${filePath}`);
    return [];
  }

  // Brand24 Excel format: row 0 is empty, row 1 has headers, data starts at row 2
  // Find the header row (first non-empty row with "ID" or "Date")
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i] as unknown[];
    if (row && row.some(cell => cell === 'ID' || cell === 'Date')) {
      headerRowIdx = i;
      break;
    }
  }

  const headerRow = rows[headerRowIdx] as (string | null)[];
  const headers = headerRow.map((h, i) => {
    if (!h || h === '') return `col_${i}`;
    return String(h).toLowerCase().trim();
  });

  // Map data rows (starting after header row)
  const mentions: Brand24Mention[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.length === 0) continue;

    // Create row object with headers
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const value = row[j];
      rowObj[headers[j]] = value != null ? String(value) : '';
    }

    // Skip empty rows
    if (!rowObj.id && !rowObj.source && !rowObj.content) continue;

    const mention = normalizeExcelRow(rowObj);
    if (mention.url || mention.text) {
      mentions.push(mention);
    }
  }

  console.log(`  Parsed ${mentions.length} mentions from ${sheetName} sheet`);
  return mentions;
}

/**
 * Normalize a Brand24 Excel row to standard format
 * Maps Brand24 Excel columns: ID, Date, Hrs, Title, Content, Source, Domain, Category, Sentiment, Tags
 */
function normalizeExcelRow(row: Record<string, string>): Brand24Mention {
  const getSourceType = (source: string, domain: string): Brand24Mention['sourceType'] => {
    const combined = `${source} ${domain}`.toLowerCase();
    if (combined.includes('twitter') || combined.includes('x.com')) return 'twitter';
    if (combined.includes('facebook') || combined.includes('fb.com')) return 'facebook';
    if (combined.includes('instagram')) return 'instagram';
    if (combined.includes('linkedin')) return 'linkedin';
    if (combined.includes('reddit')) return 'reddit';
    if (combined.includes('youtube')) return 'youtube';
    if (combined.includes('tiktok')) return 'tiktok';
    if (combined.includes('news') || combined.includes('cnn') || combined.includes('bbc')) return 'news';
    if (combined.includes('blog') || combined.includes('medium') || combined.includes('wordpress')) return 'blog';
    if (combined.includes('forum') || combined.includes('quora')) return 'forum';
    if (combined.includes('review') || combined.includes('yelp') || combined.includes('trustpilot')) return 'review';
    if (combined.includes('podcast')) return 'podcast';
    // Check common retail/brand sites
    if (combined.includes('rei.com') || combined.includes('amazon') || combined.includes('shop')) return 'review';
    return 'other';
  };

  const getSentiment = (value: string): Brand24Mention['sentiment'] => {
    const v = value?.toLowerCase?.() || '';
    if (v === '1' || v === 'positive' || v === 'pos') return 'positive';
    if (v === '-1' || v === 'negative' || v === 'neg') return 'negative';
    return 'neutral';
  };

  const source = row.source || row.domain || 'unknown';
  const domain = row.domain || '';

  return {
    id: row.id,
    date: row.date || '',
    time: row.hrs || row.time || '',
    title: row.title,
    text: row.content || row.text || '',
    author: row.author,
    url: row.source || '', // Brand24 puts URL in "Source" column
    source: domain || source,
    sourceType: getSourceType(source, domain),
    country: row.country,
    language: row.language,
    sentiment: getSentiment(row.sentiment),
    // Tags are comma-separated in Brand24
    rawTags: row.tags,
  };
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
 * Import Brand24 file (CSV or Excel) to database-ready format
 */
export function importBrand24File(
  filePath: string,
  keywordId?: number
): SocialMention[] {
  const ext = path.extname(filePath).toLowerCase();
  let mentions: Brand24Mention[];

  if (ext === '.xlsx' || ext === '.xls') {
    mentions = parseBrand24Excel(filePath);
  } else {
    mentions = parseBrand24Csv(filePath);
  }

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
