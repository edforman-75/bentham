/**
 * Staged Content Review Service
 *
 * Manages content review workflow for AI visibility optimization:
 * - Review queue management
 * - Approval workflow (draft → review → approved → published)
 * - Version history integration
 * - Multi-user support with role-based access
 *
 * Usage:
 *   import { StagedReviewService } from './services/staged-review';
 *   const service = new StagedReviewService({ storePath: './data/review-queue' });
 *   await service.initialize();
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// Import highlight-changes for diff functionality
// Note: In production, this would be a proper package import
import { highlightChanges, DiffReport, ContentVersion } from '../../scripts/highlight-changes';

// ============================================================================
// Types
// ============================================================================

export type ReviewStatus = 'draft' | 'pending_review' | 'in_review' | 'approved' | 'rejected' | 'published';

export type UserRole = 'author' | 'reviewer' | 'approver' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
}

export interface ReviewComment {
  id: string;
  userId: string;
  userName: string;
  timestamp: string;
  content: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  lineRef?: string; // Reference to specific field/line
}

export interface ApprovalRecord {
  userId: string;
  userName: string;
  timestamp: string;
  action: 'approve' | 'reject' | 'request_changes';
  comment?: string;
}

export interface ContentVersionRecord {
  version: number;
  timestamp: string;
  authorId: string;
  authorName: string;
  content: ContentVersion;
  changeDescription?: string;
  diffFromPrevious?: DiffReport;
}

export interface ReviewItem {
  id: string;
  url: string;
  title: string;
  status: ReviewStatus;
  priority: 'critical' | 'high' | 'medium' | 'low';

  // Content
  currentVersion: number;
  versions: ContentVersionRecord[];

  // Workflow
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;

  // Review info
  assignedReviewers: string[];
  assignedApprovers: string[];
  comments: ReviewComment[];
  approvals: ApprovalRecord[];

  // Metadata
  category?: string;
  tags?: string[];
  dueDate?: string;

  // Publishing
  publishedAt?: string;
  publishedBy?: string;
  publishedVersion?: number;
}

export interface QueueFilter {
  status?: ReviewStatus | ReviewStatus[];
  priority?: ReviewItem['priority'] | ReviewItem['priority'][];
  assignedTo?: string;
  createdBy?: string;
  category?: string;
  tags?: string[];
  dueBefore?: string;
  dueAfter?: string;
}

export interface QueueStats {
  total: number;
  byStatus: Record<ReviewStatus, number>;
  byPriority: Record<ReviewItem['priority'], number>;
  overdue: number;
  avgTimeInReview: number; // ms
  pendingApproval: number;
}

export interface WorkflowConfig {
  requireApproval: boolean;
  minApprovers: number;
  autoPublishOnApproval: boolean;
  notifyOnStatusChange: boolean;
  allowSelfApproval: boolean;
  maxReviewDays: number;
}

export interface ServiceConfig {
  storePath: string;
  workflowConfig?: Partial<WorkflowConfig>;
  onStatusChange?: (item: ReviewItem, previousStatus: ReviewStatus) => void;
  onPublish?: (item: ReviewItem) => Promise<void>;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class StagedReviewService extends EventEmitter {
  private storePath: string;
  private items: Map<string, ReviewItem> = new Map();
  private users: Map<string, User> = new Map();
  private workflowConfig: WorkflowConfig;
  private initialized: boolean = false;

  private defaultWorkflowConfig: WorkflowConfig = {
    requireApproval: true,
    minApprovers: 1,
    autoPublishOnApproval: false,
    notifyOnStatusChange: true,
    allowSelfApproval: false,
    maxReviewDays: 7,
  };

  constructor(private config: ServiceConfig) {
    super();
    this.storePath = config.storePath;
    this.workflowConfig = { ...this.defaultWorkflowConfig, ...config.workflowConfig };
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    // Create store directory
    await fs.promises.mkdir(this.storePath, { recursive: true });
    await fs.promises.mkdir(path.join(this.storePath, 'items'), { recursive: true });
    await fs.promises.mkdir(path.join(this.storePath, 'users'), { recursive: true });

    // Load existing data
    await this.loadItems();
    await this.loadUsers();

    this.initialized = true;
    this.emit('initialized');
  }

  private async loadItems(): Promise<void> {
    const itemsDir = path.join(this.storePath, 'items');
    try {
      const files = await fs.promises.readdir(itemsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.promises.readFile(path.join(itemsDir, file), 'utf-8');
          const item: ReviewItem = JSON.parse(data);
          this.items.set(item.id, item);
        }
      }
    } catch (e) {
      // Directory might not exist yet
    }
  }

  private async loadUsers(): Promise<void> {
    const usersFile = path.join(this.storePath, 'users', 'users.json');
    try {
      const data = await fs.promises.readFile(usersFile, 'utf-8');
      const users: User[] = JSON.parse(data);
      for (const user of users) {
        this.users.set(user.id, user);
      }
    } catch (e) {
      // File might not exist yet
    }
  }

  private async saveItem(item: ReviewItem): Promise<void> {
    const itemPath = path.join(this.storePath, 'items', `${item.id}.json`);
    await fs.promises.writeFile(itemPath, JSON.stringify(item, null, 2));
  }

  private async saveUsers(): Promise<void> {
    const usersFile = path.join(this.storePath, 'users', 'users.json');
    await fs.promises.writeFile(usersFile, JSON.stringify(Array.from(this.users.values()), null, 2));
  }

  // --------------------------------------------------------------------------
  // User Management
  // --------------------------------------------------------------------------

  async registerUser(user: User): Promise<void> {
    this.users.set(user.id, user);
    await this.saveUsers();
    this.emit('user:registered', user);
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  hasRole(userId: string, role: UserRole): boolean {
    const user = this.users.get(userId);
    return user?.roles.includes(role) || user?.roles.includes('admin') || false;
  }

  // --------------------------------------------------------------------------
  // Queue Management
  // --------------------------------------------------------------------------

  async createReviewItem(params: {
    url: string;
    title: string;
    content: ContentVersion;
    authorId: string;
    priority?: ReviewItem['priority'];
    category?: string;
    tags?: string[];
    changeDescription?: string;
  }): Promise<ReviewItem> {
    const author = this.users.get(params.authorId);
    if (!author) {
      throw new Error(`User not found: ${params.authorId}`);
    }

    const now = new Date().toISOString();
    const id = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const item: ReviewItem = {
      id,
      url: params.url,
      title: params.title,
      status: 'draft',
      priority: params.priority || 'medium',
      currentVersion: 1,
      versions: [{
        version: 1,
        timestamp: now,
        authorId: params.authorId,
        authorName: author.name,
        content: params.content,
        changeDescription: params.changeDescription,
      }],
      createdAt: now,
      createdBy: params.authorId,
      updatedAt: now,
      updatedBy: params.authorId,
      assignedReviewers: [],
      assignedApprovers: [],
      comments: [],
      approvals: [],
      category: params.category,
      tags: params.tags,
    };

    this.items.set(id, item);
    await this.saveItem(item);
    this.emit('item:created', item);

    return item;
  }

  async updateContent(
    itemId: string,
    userId: string,
    content: ContentVersion,
    changeDescription?: string
  ): Promise<ReviewItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Only allow updates in draft or rejected status
    if (!['draft', 'rejected'].includes(item.status)) {
      throw new Error(`Cannot update content in status: ${item.status}`);
    }

    const now = new Date().toISOString();
    const previousVersion = item.versions[item.versions.length - 1];

    // Compute diff from previous version
    const diffFromPrevious = highlightChanges(previousVersion.content, content);

    const newVersion: ContentVersionRecord = {
      version: item.currentVersion + 1,
      timestamp: now,
      authorId: userId,
      authorName: user.name,
      content,
      changeDescription,
      diffFromPrevious,
    };

    item.currentVersion = newVersion.version;
    item.versions.push(newVersion);
    item.updatedAt = now;
    item.updatedBy = userId;

    await this.saveItem(item);
    this.emit('item:updated', item);

    return item;
  }

  getItem(itemId: string): ReviewItem | undefined {
    return this.items.get(itemId);
  }

  getQueue(filter?: QueueFilter): ReviewItem[] {
    let items = Array.from(this.items.values());

    if (filter) {
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        items = items.filter(i => statuses.includes(i.status));
      }
      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
        items = items.filter(i => priorities.includes(i.priority));
      }
      if (filter.assignedTo) {
        items = items.filter(i =>
          i.assignedReviewers.includes(filter.assignedTo!) ||
          i.assignedApprovers.includes(filter.assignedTo!)
        );
      }
      if (filter.createdBy) {
        items = items.filter(i => i.createdBy === filter.createdBy);
      }
      if (filter.category) {
        items = items.filter(i => i.category === filter.category);
      }
      if (filter.tags && filter.tags.length > 0) {
        items = items.filter(i =>
          filter.tags!.some(tag => i.tags?.includes(tag))
        );
      }
      if (filter.dueBefore) {
        items = items.filter(i => i.dueDate && i.dueDate < filter.dueBefore!);
      }
      if (filter.dueAfter) {
        items = items.filter(i => i.dueDate && i.dueDate > filter.dueAfter!);
      }
    }

    // Sort by priority, then by creation date
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    items.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return items;
  }

  getQueueStats(): QueueStats {
    const items = Array.from(this.items.values());
    const now = new Date();

    const byStatus: Record<ReviewStatus, number> = {
      draft: 0,
      pending_review: 0,
      in_review: 0,
      approved: 0,
      rejected: 0,
      published: 0,
    };

    const byPriority: Record<ReviewItem['priority'], number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    let overdue = 0;
    let pendingApproval = 0;
    let totalReviewTime = 0;
    let reviewedCount = 0;

    for (const item of items) {
      byStatus[item.status]++;
      byPriority[item.priority]++;

      if (item.dueDate && new Date(item.dueDate) < now && !['published', 'approved'].includes(item.status)) {
        overdue++;
      }

      if (item.status === 'in_review') {
        pendingApproval++;
      }

      // Calculate time in review for completed items
      if (item.publishedAt) {
        const start = new Date(item.createdAt).getTime();
        const end = new Date(item.publishedAt).getTime();
        totalReviewTime += (end - start);
        reviewedCount++;
      }
    }

    return {
      total: items.length,
      byStatus,
      byPriority,
      overdue,
      avgTimeInReview: reviewedCount > 0 ? totalReviewTime / reviewedCount : 0,
      pendingApproval,
    };
  }

  // --------------------------------------------------------------------------
  // Workflow Actions
  // --------------------------------------------------------------------------

  async submitForReview(itemId: string, userId: string): Promise<ReviewItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    if (item.status !== 'draft' && item.status !== 'rejected') {
      throw new Error(`Cannot submit for review from status: ${item.status}`);
    }

    const previousStatus = item.status;
    item.status = 'pending_review';
    item.updatedAt = new Date().toISOString();
    item.updatedBy = userId;
    item.approvals = []; // Reset approvals on resubmission

    await this.saveItem(item);
    this.emitStatusChange(item, previousStatus);

    return item;
  }

  async assignReviewers(itemId: string, reviewerIds: string[], assignedBy: string): Promise<ReviewItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    // Validate reviewers exist and have reviewer role
    for (const reviewerId of reviewerIds) {
      if (!this.hasRole(reviewerId, 'reviewer') && !this.hasRole(reviewerId, 'approver')) {
        throw new Error(`User ${reviewerId} is not a reviewer`);
      }
    }

    item.assignedReviewers = reviewerIds;
    item.updatedAt = new Date().toISOString();
    item.updatedBy = assignedBy;

    await this.saveItem(item);
    this.emit('item:reviewers_assigned', item, reviewerIds);

    return item;
  }

  async assignApprovers(itemId: string, approverIds: string[], assignedBy: string): Promise<ReviewItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    // Validate approvers exist and have approver role
    for (const approverId of approverIds) {
      if (!this.hasRole(approverId, 'approver')) {
        throw new Error(`User ${approverId} is not an approver`);
      }
    }

    item.assignedApprovers = approverIds;
    item.updatedAt = new Date().toISOString();
    item.updatedBy = assignedBy;

    await this.saveItem(item);
    this.emit('item:approvers_assigned', item, approverIds);

    return item;
  }

  async startReview(itemId: string, reviewerId: string): Promise<ReviewItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    if (item.status !== 'pending_review') {
      throw new Error(`Cannot start review from status: ${item.status}`);
    }

    if (!this.hasRole(reviewerId, 'reviewer') && !this.hasRole(reviewerId, 'approver')) {
      throw new Error('User does not have reviewer permissions');
    }

    const previousStatus = item.status;
    item.status = 'in_review';
    item.updatedAt = new Date().toISOString();
    item.updatedBy = reviewerId;

    // Auto-assign if not already assigned
    if (!item.assignedReviewers.includes(reviewerId)) {
      item.assignedReviewers.push(reviewerId);
    }

    await this.saveItem(item);
    this.emitStatusChange(item, previousStatus);

    return item;
  }

  async addComment(
    itemId: string,
    userId: string,
    content: string,
    lineRef?: string
  ): Promise<ReviewComment> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const comment: ReviewComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      userName: user.name,
      timestamp: new Date().toISOString(),
      content,
      resolved: false,
      lineRef,
    };

    item.comments.push(comment);
    item.updatedAt = new Date().toISOString();
    item.updatedBy = userId;

    await this.saveItem(item);
    this.emit('item:comment_added', item, comment);

    return comment;
  }

  async resolveComment(itemId: string, commentId: string, userId: string): Promise<void> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    const comment = item.comments.find(c => c.id === commentId);
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    comment.resolved = true;
    comment.resolvedBy = userId;
    comment.resolvedAt = new Date().toISOString();

    await this.saveItem(item);
    this.emit('item:comment_resolved', item, comment);
  }

  async submitApproval(
    itemId: string,
    userId: string,
    action: 'approve' | 'reject' | 'request_changes',
    comment?: string
  ): Promise<ReviewItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    if (item.status !== 'in_review') {
      throw new Error(`Cannot approve/reject from status: ${item.status}`);
    }

    if (!this.hasRole(userId, 'approver')) {
      throw new Error('User does not have approver permissions');
    }

    // Check self-approval
    if (!this.workflowConfig.allowSelfApproval && item.createdBy === userId) {
      throw new Error('Self-approval is not allowed');
    }

    const user = this.users.get(userId)!;
    const approval: ApprovalRecord = {
      userId,
      userName: user.name,
      timestamp: new Date().toISOString(),
      action,
      comment,
    };

    item.approvals.push(approval);
    item.updatedAt = new Date().toISOString();
    item.updatedBy = userId;

    const previousStatus = item.status;

    if (action === 'reject' || action === 'request_changes') {
      item.status = 'rejected';
    } else if (action === 'approve') {
      // Check if we have enough approvals
      const approveCount = item.approvals.filter(a => a.action === 'approve').length;
      if (approveCount >= this.workflowConfig.minApprovers) {
        item.status = 'approved';

        // Auto-publish if configured
        if (this.workflowConfig.autoPublishOnApproval) {
          await this.publish(itemId, userId);
        }
      }
    }

    await this.saveItem(item);
    if (item.status !== previousStatus) {
      this.emitStatusChange(item, previousStatus);
    }
    this.emit('item:approval_submitted', item, approval);

    return item;
  }

  async publish(itemId: string, publisherId: string): Promise<ReviewItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    if (this.workflowConfig.requireApproval && item.status !== 'approved') {
      throw new Error('Item must be approved before publishing');
    }

    if (!this.hasRole(publisherId, 'approver') && !this.hasRole(publisherId, 'admin')) {
      throw new Error('User does not have publish permissions');
    }

    const previousStatus = item.status;
    item.status = 'published';
    item.publishedAt = new Date().toISOString();
    item.publishedBy = publisherId;
    item.publishedVersion = item.currentVersion;
    item.updatedAt = item.publishedAt;
    item.updatedBy = publisherId;

    await this.saveItem(item);
    this.emitStatusChange(item, previousStatus);

    // Call publish handler if configured
    if (this.config.onPublish) {
      await this.config.onPublish(item);
    }

    return item;
  }

  // --------------------------------------------------------------------------
  // Version History
  // --------------------------------------------------------------------------

  getVersionHistory(itemId: string): ContentVersionRecord[] {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }
    return item.versions;
  }

  getVersionDiff(itemId: string, fromVersion: number, toVersion: number): DiffReport {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    const from = item.versions.find(v => v.version === fromVersion);
    const to = item.versions.find(v => v.version === toVersion);

    if (!from || !to) {
      throw new Error('Version not found');
    }

    return highlightChanges(from.content, to.content);
  }

  async revertToVersion(itemId: string, userId: string, version: number): Promise<ReviewItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    const targetVersion = item.versions.find(v => v.version === version);
    if (!targetVersion) {
      throw new Error(`Version not found: ${version}`);
    }

    // Only allow revert in draft or rejected status
    if (!['draft', 'rejected'].includes(item.status)) {
      throw new Error(`Cannot revert in status: ${item.status}`);
    }

    return this.updateContent(
      itemId,
      userId,
      targetVersion.content,
      `Reverted to version ${version}`
    );
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private emitStatusChange(item: ReviewItem, previousStatus: ReviewStatus): void {
    this.emit('item:status_changed', item, previousStatus);
    if (this.config.onStatusChange) {
      this.config.onStatusChange(item, previousStatus);
    }
  }

  // --------------------------------------------------------------------------
  // My Queue (User-specific)
  // --------------------------------------------------------------------------

  getMyQueue(userId: string): {
    authored: ReviewItem[];
    toReview: ReviewItem[];
    toApprove: ReviewItem[];
  } {
    const items = Array.from(this.items.values());

    return {
      authored: items.filter(i => i.createdBy === userId && i.status !== 'published'),
      toReview: items.filter(i =>
        i.assignedReviewers.includes(userId) &&
        ['pending_review', 'in_review'].includes(i.status)
      ),
      toApprove: items.filter(i =>
        i.assignedApprovers.includes(userId) &&
        i.status === 'in_review' &&
        !i.approvals.some(a => a.userId === userId)
      ),
    };
  }

  // --------------------------------------------------------------------------
  // Bulk Operations
  // --------------------------------------------------------------------------

  async bulkAssign(itemIds: string[], reviewerIds: string[], assignedBy: string): Promise<void> {
    for (const itemId of itemIds) {
      await this.assignReviewers(itemId, reviewerIds, assignedBy);
    }
  }

  async bulkUpdatePriority(
    itemIds: string[],
    priority: ReviewItem['priority'],
    updatedBy: string
  ): Promise<void> {
    for (const itemId of itemIds) {
      const item = this.items.get(itemId);
      if (item) {
        item.priority = priority;
        item.updatedAt = new Date().toISOString();
        item.updatedBy = updatedBy;
        await this.saveItem(item);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup / Archive
  // --------------------------------------------------------------------------

  async archiveItem(itemId: string): Promise<void> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    // Move to archive directory
    const archivePath = path.join(this.storePath, 'archive');
    await fs.promises.mkdir(archivePath, { recursive: true });
    await fs.promises.rename(
      path.join(this.storePath, 'items', `${itemId}.json`),
      path.join(archivePath, `${itemId}.json`)
    );

    this.items.delete(itemId);
    this.emit('item:archived', item);
  }

  async deleteItem(itemId: string): Promise<void> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    await fs.promises.unlink(path.join(this.storePath, 'items', `${itemId}.json`));
    this.items.delete(itemId);
    this.emit('item:deleted', item);
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const service = new StagedReviewService({
    storePath: process.env.REVIEW_STORE_PATH || './data/review-queue',
  });

  await service.initialize();

  switch (command) {
    case 'stats':
      const stats = service.getQueueStats();
      console.log('\n📊 REVIEW QUEUE STATS\n');
      console.log(`Total Items: ${stats.total}`);
      console.log(`\nBy Status:`);
      for (const [status, count] of Object.entries(stats.byStatus)) {
        if (count > 0) console.log(`  ${status}: ${count}`);
      }
      console.log(`\nBy Priority:`);
      for (const [priority, count] of Object.entries(stats.byPriority)) {
        if (count > 0) console.log(`  ${priority}: ${count}`);
      }
      console.log(`\nOverdue: ${stats.overdue}`);
      console.log(`Pending Approval: ${stats.pendingApproval}`);
      if (stats.avgTimeInReview > 0) {
        console.log(`Avg Time in Review: ${(stats.avgTimeInReview / 1000 / 60 / 60).toFixed(1)} hours`);
      }
      break;

    case 'queue':
      const filter: QueueFilter = {};
      if (args.includes('--status')) {
        filter.status = args[args.indexOf('--status') + 1] as ReviewStatus;
      }
      if (args.includes('--priority')) {
        filter.priority = args[args.indexOf('--priority') + 1] as ReviewItem['priority'];
      }

      const items = service.getQueue(filter);
      console.log('\n📋 REVIEW QUEUE\n');
      if (items.length === 0) {
        console.log('No items in queue matching filter.');
      } else {
        for (const item of items) {
          const priorityIcon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[item.priority];
          console.log(`${priorityIcon} [${item.status}] ${item.title}`);
          console.log(`   ID: ${item.id}`);
          console.log(`   URL: ${item.url}`);
          console.log(`   Version: ${item.currentVersion} | Comments: ${item.comments.length}`);
          console.log('');
        }
      }
      break;

    case 'help':
    default:
      console.log('\n📝 STAGED CONTENT REVIEW SERVICE\n');
      console.log('Commands:');
      console.log('  stats              Show queue statistics');
      console.log('  queue              List items in queue');
      console.log('    --status <s>     Filter by status');
      console.log('    --priority <p>   Filter by priority');
      console.log('\nEnvironment:');
      console.log('  REVIEW_STORE_PATH  Path to store data (default: ./data/review-queue)');
      console.log('\nFor programmatic use, import the StagedReviewService class.');
      break;
  }
}

main().catch(console.error);

export default StagedReviewService;
