/**
 * Social Listening Type Tests
 */

import { describe, it, expect } from 'vitest';
import type {
  Brand24Mention,
  SocialMention,
  KeywordConfig,
  MentionStats,
  CompetitorComparison,
} from '../../types.js';
import { BRAND24_CSV_COLUMNS } from '../../types.js';

describe('Social Listening Types', () => {
  describe('Brand24Mention', () => {
    it('should accept valid mention data', () => {
      const mention: Brand24Mention = {
        date: '2026-01-29',
        text: 'TASC Performance bamboo shirts are amazing!',
        url: 'https://twitter.com/user/status/123',
        source: 'Twitter',
        sourceType: 'twitter',
        sentiment: 'positive',
        reach: 1500,
        likes: 25,
        shares: 5,
      };
      expect(mention.sentiment).toBe('positive');
      expect(mention.sourceType).toBe('twitter');
    });

    it('should support all source types', () => {
      const sourceTypes: Brand24Mention['sourceType'][] = [
        'twitter',
        'facebook',
        'instagram',
        'linkedin',
        'reddit',
        'youtube',
        'tiktok',
        'news',
        'blog',
        'forum',
        'review',
        'podcast',
        'other',
      ];
      expect(sourceTypes).toHaveLength(13);
    });
  });

  describe('SocialMention', () => {
    it('should accept normalized mention data', () => {
      const mention: SocialMention = {
        source: 'Twitter',
        sourceType: 'twitter',
        content: 'Great product!',
        url: 'https://twitter.com/user/123',
        sentiment: 'positive',
        publishedAt: new Date(),
      };
      expect(mention.source).toBe('Twitter');
    });
  });

  describe('KeywordConfig', () => {
    it('should accept keyword configuration', () => {
      const keyword: KeywordConfig = {
        keyword: 'TASC Performance',
        brand: 'TASC',
        category: 'brand',
        isCompetitor: false,
      };
      expect(keyword.isCompetitor).toBe(false);
    });

    it('should accept competitor keyword', () => {
      const competitor: KeywordConfig = {
        keyword: 'Lululemon',
        brand: 'Lululemon',
        category: 'competitor',
        isCompetitor: true,
      };
      expect(competitor.isCompetitor).toBe(true);
    });
  });

  describe('MentionStats', () => {
    it('should accept mention statistics', () => {
      const stats: MentionStats = {
        totalMentions: 100,
        positive: 60,
        negative: 10,
        neutral: 30,
        totalReach: 50000,
        topSources: [
          { source: 'twitter', count: 50 },
          { source: 'reddit', count: 30 },
        ],
        topAuthors: [
          { author: '@influencer', followers: 10000, mentions: 5 },
        ],
        mentionsByDay: [
          { date: '2026-01-29', count: 15 },
        ],
      };
      expect(stats.positive + stats.negative + stats.neutral).toBe(stats.totalMentions);
    });
  });

  describe('CompetitorComparison', () => {
    it('should accept competitor comparison data', () => {
      const comparison: CompetitorComparison = {
        brand: 'TASC',
        mentionCount: 100,
        shareOfVoice: 25.5,
        sentiment: {
          positive: 60,
          negative: 10,
          neutral: 30,
        },
        reach: 50000,
        engagement: 1500,
      };
      expect(comparison.shareOfVoice).toBe(25.5);
    });
  });

  describe('BRAND24_CSV_COLUMNS', () => {
    it('should define expected column mappings', () => {
      expect(BRAND24_CSV_COLUMNS.date).toBe('date');
      expect(BRAND24_CSV_COLUMNS.text).toBe('text');
      expect(BRAND24_CSV_COLUMNS.sentiment).toBe('sentiment');
      expect(BRAND24_CSV_COLUMNS.reach).toBe('reach');
    });
  });
});
