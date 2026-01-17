/**
 * Costs Routes
 *
 * GET /v1/costs/:studyId - Get study costs
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { StudyCostResponse } from '../types.js';

/**
 * Cost service interface
 */
export interface CostService {
  getStudyCosts(tenantId: string, studyId: string): Promise<StudyCostResponse | null>;
}

/**
 * Request schemas
 */
const StudyIdParamsSchema = z.object({
  studyId: z.string().min(1),
});

/**
 * Costs routes options
 */
export interface CostsRoutesOptions {
  costService: CostService;
}

/**
 * Register costs routes
 */
export async function costsRoutes(
  fastify: FastifyInstance,
  options: CostsRoutesOptions
): Promise<void> {
  const { costService } = options;

  /**
   * GET /v1/costs/:studyId - Get study costs
   */
  fastify.get<{
    Params: z.infer<typeof StudyIdParamsSchema>;
  }>('/costs/:studyId', {
    schema: {
      params: {
        type: 'object',
        required: ['studyId'],
        properties: {
          studyId: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { studyId: string } }>, reply: FastifyReply) => {
    const { studyId } = request.params;

    const costs = await costService.getStudyCosts(request.requestContext.tenantId, studyId);

    if (!costs) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'STUDY_NOT_FOUND',
          message: `Study ${studyId} not found`,
          requestId: request.requestContext.requestId,
        },
      });
    }

    return reply.send({
      success: true,
      data: costs,
      requestId: request.requestContext.requestId,
    });
  });
}
