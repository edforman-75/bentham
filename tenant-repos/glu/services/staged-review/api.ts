/**
 * Staged Content Review API
 *
 * REST API layer for the Staged Review Service.
 * Can be mounted as Express middleware or used standalone.
 *
 * Usage:
 *   import { createReviewApi } from './services/staged-review/api';
 *   const api = await createReviewApi({ storePath: './data/review-queue' });
 *   app.use('/api/review', api.router);
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  StagedReviewService,
  ServiceConfig,
  ReviewStatus,
  ReviewItem,
  QueueFilter,
  User,
  UserRole,
} from './index';

// ============================================================================
// Types
// ============================================================================

interface AuthenticatedRequest extends Request {
  user?: User;
  userId?: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

interface ApiConfig extends ServiceConfig {
  authenticateUser?: (req: Request) => Promise<User | null>;
  requireAuth?: boolean;
}

// ============================================================================
// API Factory
// ============================================================================

export async function createReviewApi(config: ApiConfig): Promise<{
  router: Router;
  service: StagedReviewService;
}> {
  const service = new StagedReviewService(config);
  await service.initialize();

  const router = Router();

  // --------------------------------------------------------------------------
  // Middleware
  // --------------------------------------------------------------------------

  // Authentication middleware
  const authenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (config.authenticateUser) {
      const user = await config.authenticateUser(req);
      if (!user && config.requireAuth) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        } as ApiResponse);
      }
      req.user = user || undefined;
      req.userId = user?.id;
    } else {
      // Default to header-based user ID for simple setups
      req.userId = req.headers['x-user-id'] as string;
      if (req.userId) {
        req.user = service.getUser(req.userId);
      }
    }
    next();
  };

  // Role check middleware factory
  const requireRole = (...roles: UserRole[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        } as ApiResponse);
      }

      const hasRole = roles.some(role =>
        req.user!.roles.includes(role) || req.user!.roles.includes('admin')
      );

      if (!hasRole) {
        return res.status(403).json({
          success: false,
          error: `Required role: ${roles.join(' or ')}`,
        } as ApiResponse);
      }

      next();
    };
  };

  // Error handler
  const handleError = (res: Response, error: any) => {
    console.error('API Error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'An error occurred',
    } as ApiResponse);
  };

  // Apply auth middleware to all routes
  router.use(authenticate);

  // --------------------------------------------------------------------------
  // User Routes
  // --------------------------------------------------------------------------

  // Register user
  router.post('/users', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user: User = req.body;
      await service.registerUser(user);
      res.json({ success: true, data: user } as ApiResponse<User>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get current user
  router.get('/users/me', (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      } as ApiResponse);
    }
    res.json({ success: true, data: req.user } as ApiResponse<User>);
  });

  // Get user by ID
  router.get('/users/:userId', (req: AuthenticatedRequest, res: Response) => {
    const user = service.getUser(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
    }
    res.json({ success: true, data: user } as ApiResponse<User>);
  });

  // --------------------------------------------------------------------------
  // Queue Routes
  // --------------------------------------------------------------------------

  // Get queue stats
  router.get('/stats', (req: AuthenticatedRequest, res: Response) => {
    const stats = service.getQueueStats();
    res.json({ success: true, data: stats } as ApiResponse);
  });

  // Get queue items
  router.get('/queue', (req: AuthenticatedRequest, res: Response) => {
    const filter: QueueFilter = {};

    if (req.query.status) {
      const statuses = (req.query.status as string).split(',') as ReviewStatus[];
      filter.status = statuses.length === 1 ? statuses[0] : statuses;
    }
    if (req.query.priority) {
      const priorities = (req.query.priority as string).split(',') as ReviewItem['priority'][];
      filter.priority = priorities.length === 1 ? priorities[0] : priorities;
    }
    if (req.query.assignedTo) {
      filter.assignedTo = req.query.assignedTo as string;
    }
    if (req.query.createdBy) {
      filter.createdBy = req.query.createdBy as string;
    }
    if (req.query.category) {
      filter.category = req.query.category as string;
    }
    if (req.query.tags) {
      filter.tags = (req.query.tags as string).split(',');
    }

    const items = service.getQueue(filter);
    res.json({
      success: true,
      data: items,
      meta: { total: items.length },
    } as ApiResponse<ReviewItem[]>);
  });

  // Get my queue (items relevant to current user)
  router.get('/queue/mine', (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID required',
      } as ApiResponse);
    }

    const myQueue = service.getMyQueue(req.userId);
    res.json({ success: true, data: myQueue } as ApiResponse);
  });

  // --------------------------------------------------------------------------
  // Item Routes
  // --------------------------------------------------------------------------

  // Create review item
  router.post('/items', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: 'User ID required',
        } as ApiResponse);
      }

      const item = await service.createReviewItem({
        ...req.body,
        authorId: req.userId,
      });

      res.status(201).json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get single item
  router.get('/items/:itemId', (req: AuthenticatedRequest, res: Response) => {
    const item = service.getItem(req.params.itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      } as ApiResponse);
    }
    res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
  });

  // Update content
  router.put('/items/:itemId/content', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: 'User ID required',
        } as ApiResponse);
      }

      const item = await service.updateContent(
        req.params.itemId,
        req.userId,
        req.body.content,
        req.body.changeDescription
      );

      res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Delete item
  router.delete('/items/:itemId', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      await service.deleteItem(req.params.itemId);
      res.json({ success: true } as ApiResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Archive item
  router.post('/items/:itemId/archive', requireRole('admin', 'approver'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      await service.archiveItem(req.params.itemId);
      res.json({ success: true } as ApiResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  // --------------------------------------------------------------------------
  // Workflow Routes
  // --------------------------------------------------------------------------

  // Submit for review
  router.post('/items/:itemId/submit', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: 'User ID required',
        } as ApiResponse);
      }

      const item = await service.submitForReview(req.params.itemId, req.userId);
      res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Assign reviewers
  router.post('/items/:itemId/assign-reviewers', requireRole('admin', 'approver'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await service.assignReviewers(
        req.params.itemId,
        req.body.reviewerIds,
        req.userId!
      );
      res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Assign approvers
  router.post('/items/:itemId/assign-approvers', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await service.assignApprovers(
        req.params.itemId,
        req.body.approverIds,
        req.userId!
      );
      res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Start review
  router.post('/items/:itemId/start-review', requireRole('reviewer', 'approver'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await service.startReview(req.params.itemId, req.userId!);
      res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Submit approval/rejection
  router.post('/items/:itemId/approval', requireRole('approver'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { action, comment } = req.body;
      const item = await service.submitApproval(
        req.params.itemId,
        req.userId!,
        action,
        comment
      );
      res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Publish
  router.post('/items/:itemId/publish', requireRole('approver', 'admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await service.publish(req.params.itemId, req.userId!);
      res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // --------------------------------------------------------------------------
  // Comment Routes
  // --------------------------------------------------------------------------

  // Add comment
  router.post('/items/:itemId/comments', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: 'User ID required',
        } as ApiResponse);
      }

      const comment = await service.addComment(
        req.params.itemId,
        req.userId,
        req.body.content,
        req.body.lineRef
      );
      res.status(201).json({ success: true, data: comment } as ApiResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Resolve comment
  router.post('/items/:itemId/comments/:commentId/resolve', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: 'User ID required',
        } as ApiResponse);
      }

      await service.resolveComment(req.params.itemId, req.params.commentId, req.userId);
      res.json({ success: true } as ApiResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  // --------------------------------------------------------------------------
  // Version Routes
  // --------------------------------------------------------------------------

  // Get version history
  router.get('/items/:itemId/versions', (req: AuthenticatedRequest, res: Response) => {
    try {
      const versions = service.getVersionHistory(req.params.itemId);
      res.json({ success: true, data: versions } as ApiResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get diff between versions
  router.get('/items/:itemId/versions/diff', (req: AuthenticatedRequest, res: Response) => {
    try {
      const fromVersion = parseInt(req.query.from as string, 10);
      const toVersion = parseInt(req.query.to as string, 10);

      if (isNaN(fromVersion) || isNaN(toVersion)) {
        return res.status(400).json({
          success: false,
          error: 'Both from and to version numbers are required',
        } as ApiResponse);
      }

      const diff = service.getVersionDiff(req.params.itemId, fromVersion, toVersion);
      res.json({ success: true, data: diff } as ApiResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Revert to version
  router.post('/items/:itemId/versions/:version/revert', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: 'User ID required',
        } as ApiResponse);
      }

      const version = parseInt(req.params.version, 10);
      const item = await service.revertToVersion(req.params.itemId, req.userId, version);
      res.json({ success: true, data: item } as ApiResponse<ReviewItem>);
    } catch (error) {
      handleError(res, error);
    }
  });

  // --------------------------------------------------------------------------
  // Bulk Operations
  // --------------------------------------------------------------------------

  // Bulk assign reviewers
  router.post('/bulk/assign', requireRole('admin', 'approver'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      await service.bulkAssign(req.body.itemIds, req.body.reviewerIds, req.userId!);
      res.json({ success: true } as ApiResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Bulk update priority
  router.post('/bulk/priority', requireRole('admin', 'approver'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      await service.bulkUpdatePriority(req.body.itemIds, req.body.priority, req.userId!);
      res.json({ success: true } as ApiResponse);
    } catch (error) {
      handleError(res, error);
    }
  });

  return { router, service };
}

export default createReviewApi;
