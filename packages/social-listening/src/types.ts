/**
 * Social Listening Types
 *
 * Type definitions for Brand24 and social listening integrations.
 */

/**
 * Brand24 mention from CSV/API export
 */
export interface Brand24Mention {
  id?: string;
  date: string;
  time?: string;
  title?: string;
  text: string;
  author?: string;
  authorFollowers?: number;
  url: string;
  source: string;
  sourceType?: 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'reddit' | 'youtube' | 'tiktok' | 'news' | 'blog' | 'forum' | 'review' | 'podcast' | 'other';
  country?: string;
  language?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentimentScore?: number;
  reach?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  influencerScore?: number;
  avatar?: string;
  rawTags?: string; // Comma-separated tags from Brand24 Excel export
}

/**
 * Brand24 project/keyword configuration
 */
export interface Brand24Project {
  id: string;
  name: string;
  keywords: string[];
  excludedKeywords?: string[];
  language?: string;
  sources?: string[];
  createdAt: string;
}

/**
 * Normalized social mention for database storage
 */
export interface SocialMention {
  id?: string;
  keywordId?: number;
  source: string;
  sourceType?: string;
  author?: string;
  authorFollowers?: number;
  title?: string;
  content: string;
  url: string;
  country?: string;
  language?: string;
  sentiment?: string;
  sentimentScore?: number;
  reach?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  influencerScore?: number;
  publishedAt?: Date;
  collectedAt?: Date;
  rawData?: Record<string, unknown>;
}

/**
 * Keyword tracking configuration
 */
export interface KeywordConfig {
  id?: number;
  keyword: string;
  brand: string;
  category?: 'brand' | 'product' | 'competitor' | 'category';
  isCompetitor?: boolean;
}

/**
 * Social listening study configuration
 */
export interface SocialStudyConfig {
  studyId: string;
  studyName: string;
  brand: string;
  keywords: KeywordConfig[];
  competitors: KeywordConfig[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  sources?: string[];
}

/**
 * Brand24 CSV export columns mapping
 */
export const BRAND24_CSV_COLUMNS = {
  id: 'id',
  date: 'date',
  time: 'time',
  title: 'title',
  text: 'text',
  author: 'author',
  url: 'url',
  source: 'source',
  category: 'category',
  country: 'country',
  sentiment: 'sentiment',
  followers: 'followers',
  reach: 'reach',
  likes: 'likes',
  dislikes: 'dislikes',
  shares: 'shares',
  comments: 'comments',
  language: 'language',
  influencerScore: 'influencer_score',
  avatar: 'avatar',
} as const;

/**
 * Mention statistics summary
 */
export interface MentionStats {
  totalMentions: number;
  positive: number;
  negative: number;
  neutral: number;
  totalReach: number;
  avgSentimentScore?: number;
  topSources: Array<{ source: string; count: number }>;
  topAuthors: Array<{ author: string; followers: number; mentions: number }>;
  mentionsByDay: Array<{ date: string; count: number }>;
}

/**
 * Competitor comparison data
 */
export interface CompetitorComparison {
  brand: string;
  mentionCount: number;
  shareOfVoice: number;
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
  reach: number;
  engagement: number;
}

/**
 * Social listening report
 */
export interface SocialListeningReport {
  studyId: string;
  studyName: string;
  generatedAt: string;
  dateRange: {
    start: string;
    end: string;
  };
  brand: {
    name: string;
    stats: MentionStats;
  };
  competitors: CompetitorComparison[];
  insights: string[];
  recommendations: string[];
}
