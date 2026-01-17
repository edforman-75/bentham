/**
 * Studies Routes
 *
 * Handles study lifecycle operations:
 * - POST /v1/studies - Submit manifest
 * - GET /v1/studies/:id - Get study status
 * - GET /v1/studies/:id/results - Get study results
 * - DELETE /v1/studies/:id - Cancel study
 * - POST /v1/studies/:id/pause - Pause study
 * - POST /v1/studies/:id/resume - Resume study
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validateManifest, ManifestSchema, type Manifest } from '@bentham/core';
import type {
  CreateStudyRequest,
  CreateStudyResponse,
  StudyStatusResponse,
  StudyResultsResponse,
} from '../types.js';

/**
 * Study service interface
 */
export interface StudyService {
  createStudy(
    tenantId: string,
    request: CreateStudyRequest
  ): Promise<CreateStudyResponse>;

  getStudyStatus(
    tenantId: string,
    studyId: string
  ): Promise<StudyStatusResponse | null>;

  getStudyResults(
    tenantId: string,
    studyId: string,
    options?: { page?: number; pageSize?: number }
  ): Promise<StudyResultsResponse | null>;

  cancelStudy(tenantId: string, studyId: string): Promise<boolean>;
  pauseStudy(tenantId: string, studyId: string): Promise<boolean>;
  resumeStudy(tenantId: string, studyId: string): Promise<boolean>;
}

/**
 * Request schemas
 */
const CreateStudySchema = z.object({
  manifest: ManifestSchema,
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
  callbackUrl: z.string().url().optional(),
});

const StudyIdParamsSchema = z.object({
  id: z.string().min(1),
});

const ResultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/**
 * Studies routes options
 */
export interface StudiesRoutesOptions {
  prefix?: string;
  studyService: StudyService;
}

/**
 * Register studies routes
 */
export async function studiesRoutes(
  fastify: FastifyInstance,
  options: StudiesRoutesOptions
): Promise<void> {
  const { studyService } = options;

  /**
   * POST /v1/studies - Create a new study
   */
  fastify.post<{
    Body: z.infer<typeof CreateStudySchema>;
  }>('/studies', {
    schema: {
      body: {
        type: 'object',
        required: ['manifest'],
        properties: {
          manifest: { type: 'object' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'] },
          callbackUrl: { type: 'string', format: 'uri' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parseResult = CreateStudySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
          requestId: request.requestContext.requestId,
        },
      });
    }

    const { manifest, priority, callbackUrl } = parseResult.data;

    // Validate manifest (Zod already validated, but this adds business rule checks)
    const manifestValidation = validateManifest(manifest);
    if (!manifestValidation.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Manifest validation failed',
          details: { errors: manifestValidation.errors },
          requestId: request.requestContext.requestId,
        },
      });
    }

    // Cast the validated manifest to Manifest type
    // The Zod schema ensures all required fields are present
    const result = await studyService.createStudy(request.requestContext.tenantId, {
      manifest: manifest as unknown as Manifest,
      priority,
      callbackUrl,
    });

    return reply.status(201).send({
      success: true,
      data: result,
      requestId: request.requestContext.requestId,
    });
  });

  /**
   * GET /v1/studies/:id - Get study status
   */
  fastify.get<{
    Params: z.infer<typeof StudyIdParamsSchema>;
  }>('/studies/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const status = await studyService.getStudyStatus(request.requestContext.tenantId, id);

    if (!status) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'STUDY_NOT_FOUND',
          message: 'Study not found',
          requestId: request.requestContext.requestId,
        },
      });
    }

    return reply.send({
      success: true,
      data: status,
      requestId: request.requestContext.requestId,
    });
  });

  /**
   * GET /v1/studies/:id/results - Get study results
   */
  fastify.get<{
    Params: z.infer<typeof StudyIdParamsSchema>;
    Querystring: z.infer<typeof ResultsQuerySchema>;
  }>('/studies/:id/results', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: number; pageSize?: number } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const queryParse = ResultsQuerySchema.safeParse(request.query);
    const { page, pageSize } = queryParse.success ? queryParse.data : { page: 1, pageSize: 50 };

    const results = await studyService.getStudyResults(
      request.requestContext.tenantId,
      id,
      { page, pageSize }
    );

    if (!results) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'STUDY_NOT_FOUND',
          message: 'Study not found',
          requestId: request.requestContext.requestId,
        },
      });
    }

    return reply.send({
      success: true,
      data: results,
      requestId: request.requestContext.requestId,
    });
  });

  /**
   * DELETE /v1/studies/:id - Cancel study
   */
  fastify.delete<{
    Params: z.infer<typeof StudyIdParamsSchema>;
  }>('/studies/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const cancelled = await studyService.cancelStudy(request.requestContext.tenantId, id);

    if (!cancelled) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'STUDY_NOT_FOUND',
          message: 'Study not found or cannot be cancelled',
          requestId: request.requestContext.requestId,
        },
      });
    }

    return reply.send({
      success: true,
      data: { studyId: id, status: 'cancelled' },
      requestId: request.requestContext.requestId,
    });
  });

  /**
   * POST /v1/studies/:id/pause - Pause study
   */
  fastify.post<{
    Params: z.infer<typeof StudyIdParamsSchema>;
  }>('/studies/:id/pause', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const paused = await studyService.pauseStudy(request.requestContext.tenantId, id);

    if (!paused) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'STUDY_NOT_FOUND',
          message: 'Study not found or cannot be paused',
          requestId: request.requestContext.requestId,
        },
      });
    }

    return reply.send({
      success: true,
      data: { studyId: id, status: 'paused' },
      requestId: request.requestContext.requestId,
    });
  });

  /**
   * POST /v1/studies/:id/resume - Resume study
   */
  fastify.post<{
    Params: z.infer<typeof StudyIdParamsSchema>;
  }>('/studies/:id/resume', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const resumed = await studyService.resumeStudy(request.requestContext.tenantId, id);

    if (!resumed) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'STUDY_NOT_FOUND',
          message: 'Study not found or cannot be resumed',
          requestId: request.requestContext.requestId,
        },
      });
    }

    return reply.send({
      success: true,
      data: { studyId: id, status: 'running' },
      requestId: request.requestContext.requestId,
    });
  });
}
