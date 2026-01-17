/**
 * Health Routes
 *
 * GET /v1/health - Health check
 * GET /health - Simple health check (no auth)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { HealthResponse } from '../types.js';

/**
 * Health check service interface
 */
export interface HealthService {
  checkDatabase(): Promise<boolean>;
  checkRedis(): Promise<boolean>;
  checkOrchestrator(): Promise<boolean>;
}

/**
 * Health routes options
 */
export interface HealthRoutesOptions {
  healthService: HealthService;
  version: string;
  startTime: Date;
}

/**
 * Register health routes
 */
export async function healthRoutes(
  fastify: FastifyInstance,
  options: HealthRoutesOptions
): Promise<void> {
  const { healthService, version, startTime } = options;

  /**
   * GET /health - Simple health check (for load balancers)
   */
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: 'ok' });
  });

  /**
   * GET /v1/health - Detailed health check
   */
  fastify.get('/v1/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const [dbOk, redisOk, orchestratorOk] = await Promise.all([
      healthService.checkDatabase().catch(() => false),
      healthService.checkRedis().catch(() => false),
      healthService.checkOrchestrator().catch(() => false),
    ]);

    const allOk = dbOk && redisOk && orchestratorOk;
    const someOk = dbOk || redisOk || orchestratorOk;

    const response: HealthResponse = {
      status: allOk ? 'healthy' : someOk ? 'degraded' : 'unhealthy',
      version,
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
      checks: {
        database: dbOk ? 'ok' : 'error',
        redis: redisOk ? 'ok' : 'error',
        orchestrator: orchestratorOk ? 'ok' : 'error',
      },
    };

    const statusCode = allOk ? 200 : someOk ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
}
