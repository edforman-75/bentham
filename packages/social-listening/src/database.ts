/**
 * Social Listening Database Operations
 *
 * Stores and retrieves social listening data from Neon database.
 */

import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import type { SocialMention, KeywordConfig, MentionStats, CompetitorComparison } from './types.js';

export interface DatabaseConfig {
  connectionString: string;
}

export class SocialListeningDatabase {
  private sql: NeonQueryFunction<false, false>;

  constructor(config: DatabaseConfig) {
    this.sql = neon(config.connectionString);
  }

  /**
   * Get or create a keyword entry
   */
  async getOrCreateKeyword(config: KeywordConfig): Promise<number> {
    const result = await this.sql`
      INSERT INTO keywords (keyword, brand, category, is_competitor)
      VALUES (${config.keyword}, ${config.brand}, ${config.category || null}, ${config.isCompetitor || false})
      ON CONFLICT (keyword, brand) DO UPDATE SET
        category = COALESCE(EXCLUDED.category, keywords.category),
        is_competitor = COALESCE(EXCLUDED.is_competitor, keywords.is_competitor)
      RETURNING id
    `;
    return result[0].id;
  }

  /**
   * Insert social mentions in batch
   */
  async insertMentions(mentions: SocialMention[]): Promise<number> {
    let inserted = 0;

    for (const mention of mentions) {
      try {
        await this.sql`
          INSERT INTO social_mentions (
            keyword_id, source, source_type, author, author_followers,
            title, content, url, country, language, sentiment,
            sentiment_score, reach, likes, shares, comments,
            influencer_score, published_at, raw_data
          )
          VALUES (
            ${mention.keywordId || null},
            ${mention.source},
            ${mention.sourceType || null},
            ${mention.author || null},
            ${mention.authorFollowers || null},
            ${mention.title || null},
            ${mention.content},
            ${mention.url},
            ${mention.country || null},
            ${mention.language || null},
            ${mention.sentiment || null},
            ${mention.sentimentScore || null},
            ${mention.reach || null},
            ${mention.likes || 0},
            ${mention.shares || 0},
            ${mention.comments || 0},
            ${mention.influencerScore || null},
            ${mention.publishedAt || null}::timestamptz,
            ${mention.rawData ? JSON.stringify(mention.rawData) : null}::jsonb
          )
          ON CONFLICT (url, keyword_id) DO NOTHING
        `;
        inserted++;
      } catch (error) {
        // Skip duplicates and continue
        console.warn(`Failed to insert mention: ${mention.url}`, error);
      }
    }

    return inserted;
  }

  /**
   * Insert AI visibility result
   */
  async insertVisibilityResult(result: {
    studyId: string;
    studyName?: string;
    queryText: string;
    queryCategory?: string;
    surfaceId: string;
    locationId?: string;
    success: boolean;
    responseText?: string;
    aiOverview?: string;
    brandMentioned?: boolean;
    mentionContext?: string;
    competitorMentions?: Array<{ brand: string; count: number }>;
    organicResults?: unknown[];
    responseTimeMs?: number;
    rawResponse?: unknown;
  }): Promise<void> {
    await this.sql`
      INSERT INTO ai_visibility_results (
        study_id, study_name, query_text, query_category, surface_id,
        location_id, success, response_text, ai_overview, brand_mentioned,
        mention_context, competitor_mentions, organic_results, response_time_ms, raw_response
      )
      VALUES (
        ${result.studyId},
        ${result.studyName || null},
        ${result.queryText},
        ${result.queryCategory || null},
        ${result.surfaceId},
        ${result.locationId || null},
        ${result.success},
        ${result.responseText || null},
        ${result.aiOverview || null},
        ${result.brandMentioned || false},
        ${result.mentionContext || null},
        ${result.competitorMentions ? JSON.stringify(result.competitorMentions) : null}::jsonb,
        ${result.organicResults ? JSON.stringify(result.organicResults) : null}::jsonb,
        ${result.responseTimeMs || null},
        ${result.rawResponse ? JSON.stringify(result.rawResponse) : null}::jsonb
      )
    `;
  }

  /**
   * Get mention statistics for a brand
   */
  async getMentionStats(brand: string): Promise<MentionStats> {
    const stats = await this.sql`
      SELECT
        COUNT(*) as total_mentions,
        COUNT(*) FILTER (WHERE m.sentiment = 'positive') as positive,
        COUNT(*) FILTER (WHERE m.sentiment = 'negative') as negative,
        COUNT(*) FILTER (WHERE m.sentiment = 'neutral') as neutral,
        COALESCE(SUM(m.reach), 0) as total_reach,
        ROUND(AVG(m.sentiment_score)::numeric, 2) as avg_sentiment_score
      FROM keywords k
      JOIN social_mentions m ON k.id = m.keyword_id
      WHERE k.brand = ${brand}
    `;

    const topSources = await this.sql`
      SELECT m.source_type as source, COUNT(*) as count
      FROM keywords k
      JOIN social_mentions m ON k.id = m.keyword_id
      WHERE k.brand = ${brand}
      GROUP BY m.source_type
      ORDER BY count DESC
      LIMIT 10
    `;

    const topAuthors = await this.sql`
      SELECT m.author, m.author_followers as followers, COUNT(*) as mentions
      FROM keywords k
      JOIN social_mentions m ON k.id = m.keyword_id
      WHERE k.brand = ${brand} AND m.author IS NOT NULL
      GROUP BY m.author, m.author_followers
      ORDER BY mentions DESC, followers DESC
      LIMIT 10
    `;

    const mentionsByDay = await this.sql`
      SELECT DATE(m.published_at) as date, COUNT(*) as count
      FROM keywords k
      JOIN social_mentions m ON k.id = m.keyword_id
      WHERE k.brand = ${brand} AND m.published_at IS NOT NULL
      GROUP BY DATE(m.published_at)
      ORDER BY date DESC
      LIMIT 30
    `;

    const row = stats[0];
    return {
      totalMentions: parseInt(row.total_mentions) || 0,
      positive: parseInt(row.positive) || 0,
      negative: parseInt(row.negative) || 0,
      neutral: parseInt(row.neutral) || 0,
      totalReach: parseInt(row.total_reach) || 0,
      avgSentimentScore: parseFloat(row.avg_sentiment_score) || undefined,
      topSources: topSources.map(r => ({ source: r.source || 'unknown', count: parseInt(r.count) })),
      topAuthors: topAuthors.map(r => ({
        author: r.author,
        followers: parseInt(r.followers) || 0,
        mentions: parseInt(r.mentions),
      })),
      mentionsByDay: mentionsByDay.map(r => ({
        date: r.date?.toISOString?.() || String(r.date),
        count: parseInt(r.count),
      })),
    };
  }

  /**
   * Get competitor comparison
   */
  async getCompetitorComparison(): Promise<CompetitorComparison[]> {
    const results = await this.sql`
      SELECT
        k.brand,
        COUNT(m.id) as mention_count,
        COUNT(*) FILTER (WHERE m.sentiment = 'positive') as positive,
        COUNT(*) FILTER (WHERE m.sentiment = 'negative') as negative,
        COUNT(*) FILTER (WHERE m.sentiment = 'neutral') as neutral,
        COALESCE(SUM(m.reach), 0) as reach,
        COALESCE(SUM(m.likes + m.shares + m.comments), 0) as engagement
      FROM keywords k
      LEFT JOIN social_mentions m ON k.id = m.keyword_id
      GROUP BY k.brand
      ORDER BY mention_count DESC
    `;

    const totalMentions = results.reduce((sum, r) => sum + parseInt(r.mention_count), 0);

    return results.map(r => ({
      brand: r.brand,
      mentionCount: parseInt(r.mention_count),
      shareOfVoice: totalMentions > 0 ? (parseInt(r.mention_count) / totalMentions) * 100 : 0,
      sentiment: {
        positive: parseInt(r.positive) || 0,
        negative: parseInt(r.negative) || 0,
        neutral: parseInt(r.neutral) || 0,
      },
      reach: parseInt(r.reach) || 0,
      engagement: parseInt(r.engagement) || 0,
    }));
  }

  /**
   * Get visibility stats by surface
   */
  async getVisibilityBySurface(studyId?: string): Promise<Array<{
    surfaceId: string;
    totalQueries: number;
    successful: number;
    brandMentions: number;
    visibilityRate: number;
    avgResponseTime: number;
  }>> {
    const whereClause = studyId ? this.sql`WHERE study_id = ${studyId}` : this.sql``;

    const results = await this.sql`
      SELECT
        surface_id,
        COUNT(*) as total_queries,
        COUNT(*) FILTER (WHERE success) as successful,
        COUNT(*) FILTER (WHERE brand_mentioned) as brand_mentions,
        ROUND(100.0 * COUNT(*) FILTER (WHERE brand_mentioned) / NULLIF(COUNT(*), 0), 1) as visibility_rate,
        ROUND(AVG(response_time_ms)::numeric, 0) as avg_response_time
      FROM ai_visibility_results
      ${whereClause}
      GROUP BY surface_id
      ORDER BY visibility_rate DESC
    `;

    return results.map(r => ({
      surfaceId: r.surface_id,
      totalQueries: parseInt(r.total_queries),
      successful: parseInt(r.successful),
      brandMentions: parseInt(r.brand_mentions),
      visibilityRate: parseFloat(r.visibility_rate) || 0,
      avgResponseTime: parseInt(r.avg_response_time) || 0,
    }));
  }

  /**
   * Get summary statistics
   */
  async getSummary(): Promise<{
    totalMentions: number;
    totalKeywords: number;
    totalVisibilityResults: number;
    dateRange: { start: string; end: string } | null;
  }> {
    const mentionCount = await this.sql`SELECT COUNT(*) as count FROM social_mentions`;
    const keywordCount = await this.sql`SELECT COUNT(*) as count FROM keywords`;
    const visibilityCount = await this.sql`SELECT COUNT(*) as count FROM ai_visibility_results`;
    const dateRange = await this.sql`
      SELECT MIN(published_at) as start_date, MAX(published_at) as end_date
      FROM social_mentions
      WHERE published_at IS NOT NULL
    `;

    return {
      totalMentions: parseInt(mentionCount[0].count),
      totalKeywords: parseInt(keywordCount[0].count),
      totalVisibilityResults: parseInt(visibilityCount[0].count),
      dateRange: dateRange[0].start_date ? {
        start: dateRange[0].start_date.toISOString(),
        end: dateRange[0].end_date.toISOString(),
      } : null,
    };
  }
}

/**
 * Create database instance for glu tenant (includes TASC data)
 */
export function createGluDatabase(): SocialListeningDatabase {
  const connectionString = process.env.GLU_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('GLU_DATABASE_URL or DATABASE_URL environment variable is required');
  }
  return new SocialListeningDatabase({ connectionString });
}

/**
 * @deprecated Use createGluDatabase() instead - TASC data is now in glu-analytics
 */
export const createTascDatabase = createGluDatabase;
