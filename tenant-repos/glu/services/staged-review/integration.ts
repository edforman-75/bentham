/**
 * Staged Review Integration Example
 *
 * Shows how to integrate the Staged Review Service with:
 * - Bentham orchestrator (for automated content updates)
 * - Glu analysis scripts (for visibility scoring)
 * - Webhooks (for external notifications)
 *
 * Usage:
 *   npx ts-node integration.ts --mode demo
 */

import { StagedReviewService, ReviewItem, User } from './index';
import { highlightChanges, ContentVersion } from '../../scripts/highlight-changes';

// ============================================================================
// Integration Hooks
// ============================================================================

/**
 * Hook to connect review service to Bentham orchestrator
 * Automatically creates review items when content changes are detected
 */
export function createBenthamIntegration(service: StagedReviewService) {
  return {
    /**
     * Called when Bentham detects content changes during a study
     */
    async onContentChangeDetected(params: {
      url: string;
      previousContent: ContentVersion;
      currentContent: ContentVersion;
      studyId: string;
      detectedAt: string;
    }): Promise<ReviewItem | null> {
      // Compute diff to assess significance
      const diff = highlightChanges(params.previousContent, params.currentContent);

      // Only create review item if there are high-impact changes
      if (diff.summary.highImpact > 0 || diff.impactAssessment.riskLevel !== 'low') {
        const item = await service.createReviewItem({
          url: params.url,
          title: `Content change detected: ${params.url}`,
          content: params.currentContent,
          authorId: 'system',
          priority: diff.impactAssessment.riskLevel === 'high' ? 'critical' : 'high',
          category: 'auto-detected',
          tags: ['bentham-detected', `study-${params.studyId}`],
          changeDescription: `Automated detection from study ${params.studyId}. ${diff.summary.totalChanges} changes found (${diff.summary.highImpact} high impact).`,
        });

        console.log(`[Bentham Integration] Created review item ${item.id} for ${params.url}`);
        return item;
      }

      return null;
    },

    /**
     * Called when a review item is published
     * Can trigger re-crawl or visibility re-assessment
     */
    async onContentPublished(item: ReviewItem): Promise<void> {
      console.log(`[Bentham Integration] Content published: ${item.url}`);

      // In production, this would trigger:
      // 1. Re-crawl of the URL to verify changes
      // 2. Immediate visibility check on AI surfaces
      // 3. Update to entity coherence tracking
    },
  };
}

/**
 * Hook to connect review service to Glu visibility scoring
 */
export function createVisibilityIntegration(service: StagedReviewService) {
  return {
    /**
     * Enrich review item with visibility context
     */
    async enrichWithVisibilityData(
      itemId: string,
      visibilityData: {
        currentScore: number;
        competitorAvg: number;
        trend: 'improving' | 'declining' | 'stable';
        topCompetitors: Array<{ name: string; score: number }>;
      }
    ): Promise<void> {
      const item = service.getItem(itemId);
      if (!item) return;

      // Add visibility context as a system comment
      await service.addComment(
        itemId,
        'system',
        `**Visibility Context**\n` +
        `- Current Score: ${visibilityData.currentScore.toFixed(1)}%\n` +
        `- Competitor Average: ${visibilityData.competitorAvg.toFixed(1)}%\n` +
        `- Trend: ${visibilityData.trend}\n` +
        `- Top Competitors: ${visibilityData.topCompetitors.map(c => `${c.name} (${c.score.toFixed(1)}%)`).join(', ')}`
      );
    },

    /**
     * Calculate priority based on visibility gap
     */
    calculatePriority(
      visibilityGap: number, // Negative = below competitors
      trend: 'improving' | 'declining' | 'stable'
    ): ReviewItem['priority'] {
      if (visibilityGap < -20 && trend === 'declining') return 'critical';
      if (visibilityGap < -10 || trend === 'declining') return 'high';
      if (visibilityGap < 0) return 'medium';
      return 'low';
    },
  };
}

/**
 * Webhook dispatcher for external integrations
 */
export function createWebhookDispatcher(webhookUrl: string) {
  return {
    async dispatch(event: string, payload: any): Promise<void> {
      try {
        // In production, use actual HTTP client
        console.log(`[Webhook] ${event}:`, JSON.stringify(payload, null, 2));

        // await fetch(webhookUrl, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
        // });
      } catch (error) {
        console.error(`[Webhook] Failed to dispatch ${event}:`, error);
      }
    },
  };
}

// ============================================================================
// Demo / Example
// ============================================================================

async function runDemo() {
  console.log('\n📝 STAGED REVIEW SERVICE DEMO\n');
  console.log('='.repeat(60));

  // Initialize service
  const service = new StagedReviewService({
    storePath: '/tmp/glu-review-demo',
    workflowConfig: {
      requireApproval: true,
      minApprovers: 1,
      autoPublishOnApproval: false,
    },
    onStatusChange: (item, prevStatus) => {
      console.log(`\n[Event] Status changed: ${prevStatus} → ${item.status} for "${item.title}"`);
    },
  });

  await service.initialize();

  // Create integrations
  const benthamIntegration = createBenthamIntegration(service);
  const visibilityIntegration = createVisibilityIntegration(service);
  const webhook = createWebhookDispatcher('https://example.com/webhook');

  // Set up event listeners
  service.on('item:created', (item) => webhook.dispatch('item:created', { id: item.id, title: item.title }));
  service.on('item:published', (item) => benthamIntegration.onContentPublished(item));

  // Register demo users
  console.log('\n1. Registering users...');

  const users: User[] = [
    { id: 'author1', name: 'Content Author', email: 'author@example.com', roles: ['author'] },
    { id: 'reviewer1', name: 'SEO Reviewer', email: 'reviewer@example.com', roles: ['reviewer'] },
    { id: 'approver1', name: 'Content Manager', email: 'manager@example.com', roles: ['approver'] },
  ];

  for (const user of users) {
    await service.registerUser(user);
    console.log(`   Registered: ${user.name} (${user.roles.join(', ')})`);
  }

  // Create review item
  console.log('\n2. Creating review item...');

  const contentBefore: ContentVersion = {
    url: 'https://example.com/product/blue-widget',
    timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    title: 'Blue Widget | Example Store',
    description: 'Buy our blue widget',
  };

  const contentAfter: ContentVersion = {
    url: 'https://example.com/product/blue-widget',
    timestamp: new Date().toISOString(),
    title: 'Premium Blue Widget - Best Quality | Example Store',
    description: 'Buy our premium blue widget - rated #1 in customer satisfaction with free shipping and 30-day returns',
    jsonLd: {
      '@type': 'Product',
      name: 'Premium Blue Widget',
      brand: { '@type': 'Brand', name: 'Example Brand' },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 156 },
    },
  };

  const item = await service.createReviewItem({
    url: contentAfter.url,
    title: 'Update Blue Widget PDP with structured data',
    content: contentAfter,
    authorId: 'author1',
    priority: 'high',
    category: 'pdp-optimization',
    tags: ['structured-data', 'product-page'],
    changeDescription: 'Added Product schema markup and improved title/description for AI visibility',
  });

  console.log(`   Created: ${item.id}`);
  console.log(`   Title: ${item.title}`);
  console.log(`   Priority: ${item.priority}`);

  // Add visibility context
  console.log('\n3. Adding visibility context...');

  await visibilityIntegration.enrichWithVisibilityData(item.id, {
    currentScore: 23.5,
    competitorAvg: 45.2,
    trend: 'declining',
    topCompetitors: [
      { name: 'Competitor A', score: 67.3 },
      { name: 'Competitor B', score: 52.1 },
      { name: 'Competitor C', score: 41.8 },
    ],
  });

  console.log('   Added visibility context as comment');

  // Submit for review
  console.log('\n4. Submitting for review...');

  await service.submitForReview(item.id, 'author1');
  console.log(`   Status: ${service.getItem(item.id)!.status}`);

  // Assign reviewer
  console.log('\n5. Assigning reviewers...');

  await service.assignReviewers(item.id, ['reviewer1'], 'approver1');
  await service.assignApprovers(item.id, ['approver1'], 'approver1');
  console.log('   Assigned reviewer1 and approver1');

  // Start review
  console.log('\n6. Starting review...');

  await service.startReview(item.id, 'reviewer1');
  console.log(`   Status: ${service.getItem(item.id)!.status}`);

  // Add review comment
  console.log('\n7. Adding review comments...');

  await service.addComment(
    item.id,
    'reviewer1',
    'Looks good! The structured data follows schema.org best practices. One suggestion: consider adding offers schema for pricing.',
    'jsonLd'
  );
  console.log('   Added comment from reviewer');

  // Approve
  console.log('\n8. Submitting approval...');

  await service.submitApproval(item.id, 'approver1', 'approve', 'Approved - great improvements to AI visibility signals');
  console.log(`   Status: ${service.getItem(item.id)!.status}`);

  // Publish
  console.log('\n9. Publishing...');

  await service.publish(item.id, 'approver1');
  const finalItem = service.getItem(item.id)!;
  console.log(`   Status: ${finalItem.status}`);
  console.log(`   Published at: ${finalItem.publishedAt}`);
  console.log(`   Published version: ${finalItem.publishedVersion}`);

  // Show stats
  console.log('\n10. Queue Statistics:');
  const stats = service.getQueueStats();
  console.log(`   Total items: ${stats.total}`);
  console.log(`   By status:`, stats.byStatus);

  // Show version history
  console.log('\n11. Version History:');
  const versions = service.getVersionHistory(item.id);
  for (const v of versions) {
    console.log(`   v${v.version}: ${v.timestamp} by ${v.authorName}`);
    if (v.changeDescription) console.log(`      "${v.changeDescription}"`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Demo complete!\n');
}

// CLI
const args = process.argv.slice(2);
if (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'demo') {
  runDemo().catch(console.error);
} else {
  console.log('Staged Review Integration Module');
  console.log('\nRun demo: npx ts-node integration.ts --mode demo');
  console.log('\nExports:');
  console.log('  createBenthamIntegration(service) - Connect to Bentham orchestrator');
  console.log('  createVisibilityIntegration(service) - Connect to visibility scoring');
  console.log('  createWebhookDispatcher(url) - Set up webhook notifications');
}

export { createBenthamIntegration, createVisibilityIntegration, createWebhookDispatcher };
