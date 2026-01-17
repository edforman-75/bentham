/**
 * API Gateway
 *
 * Main Fastify application setup with all middleware and routes.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';

import { authPlugin, type ApiKeyStore, InMemoryApiKeyStore } from './middleware/auth.js';
import { errorHandlerPlugin } from './middleware/error-handler.js';
import { studiesRoutes, type StudyService } from './routes/studies.js';
import { healthRoutes, type HealthService } from './routes/health.js';
import { costsRoutes, type CostService } from './routes/costs.js';
import { type GatewayConfig, DEFAULT_GATEWAY_CONFIG } from './types.js';

/**
 * Gateway dependencies
 */
export interface GatewayDependencies {
  studyService: StudyService;
  healthService: HealthService;
  costService: CostService;
  apiKeyStore?: ApiKeyStore;
}

/**
 * Create and configure the API gateway
 */
export async function createGateway(
  config: Partial<GatewayConfig> = {},
  dependencies: GatewayDependencies
): Promise<FastifyInstance> {
  const finalConfig: GatewayConfig = {
    ...DEFAULT_GATEWAY_CONFIG,
    ...config,
  };

  const fastify = Fastify({
    logger: {
      level: finalConfig.logging.level,
      transport: finalConfig.logging.pretty
        ? { target: 'pino-pretty' }
        : undefined,
    },
    trustProxy: finalConfig.trustProxy,
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // API doesn't serve HTML
  });

  // CORS
  if (finalConfig.cors.enabled) {
    await fastify.register(cors, {
      origin: finalConfig.cors.origins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true,
    });
  }

  // Rate limiting
  if (finalConfig.rateLimit.enabled) {
    await fastify.register(rateLimit, {
      max: finalConfig.rateLimit.max,
      timeWindow: finalConfig.rateLimit.windowMs,
      keyGenerator: (request) => {
        // Use API key or IP for rate limiting
        return request.requestContext?.tenantId ?? request.ip;
      },
    });
  }

  // Error handling
  await fastify.register(errorHandlerPlugin);

  // Authentication
  await fastify.register(authPlugin, {
    keyStore: dependencies.apiKeyStore ?? new InMemoryApiKeyStore(),
    excludePaths: ['/', '/health', '/v1/health'],
  });

  // Routes - health routes (no auth required)
  await fastify.register(healthRoutes, {
    healthService: dependencies.healthService,
    version: '0.0.1',
    startTime: new Date(),
  });

  // V1 API routes with prefix
  await fastify.register(studiesRoutes, {
    prefix: '/v1',
    studyService: dependencies.studyService,
  });

  await fastify.register(costsRoutes, {
    prefix: '/v1',
    costService: dependencies.costService,
  });

  // Root route
  fastify.get('/', async () => {
    return {
      name: 'Bentham API Gateway',
      version: '0.0.1',
      docs: '/v1/docs',
    };
  });

  return fastify;
}

/**
 * Gateway class for managing the application lifecycle
 */
export class Gateway {
  private fastify: FastifyInstance | null = null;
  private config: GatewayConfig;
  private dependencies: GatewayDependencies;

  constructor(
    config: Partial<GatewayConfig> = {},
    dependencies: GatewayDependencies
  ) {
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config };
    this.dependencies = dependencies;
  }

  /**
   * Start the gateway
   */
  async start(): Promise<void> {
    this.fastify = await createGateway(this.config, this.dependencies);

    await this.fastify.listen({
      port: this.config.port,
      host: this.config.host,
    });

    this.fastify.log.info(
      `Gateway listening on ${this.config.host}:${this.config.port}`
    );
  }

  /**
   * Stop the gateway
   */
  async stop(): Promise<void> {
    if (this.fastify) {
      await this.fastify.close();
      this.fastify = null;
    }
  }

  /**
   * Get the Fastify instance (for testing)
   */
  getInstance(): FastifyInstance | null {
    return this.fastify;
  }
}
