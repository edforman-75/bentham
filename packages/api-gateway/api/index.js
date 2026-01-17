// src/types.ts
var DEFAULT_GATEWAY_CONFIG = {
  port: 3e3,
  host: "0.0.0.0",
  trustProxy: true,
  cors: {
    enabled: true,
    origins: ["*"]
  },
  rateLimit: {
    enabled: true,
    max: 100,
    windowMs: 6e4
    // 1 minute
  },
  logging: {
    level: "info",
    pretty: process.env.NODE_ENV !== "production"
  }
};

// src/gateway.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";

// src/middleware/auth.ts
import fp from "fastify-plugin";
import { createHash } from "crypto";
var InMemoryApiKeyStore = class {
  keys = /* @__PURE__ */ new Map();
  addKey(key) {
    this.keys.set(key.keyHash, key);
  }
  async getByHash(keyHash) {
    return this.keys.get(keyHash) ?? null;
  }
  async updateLastUsed(keyId) {
    for (const key of this.keys.values()) {
      if (key.id === keyId) {
        key.lastUsedAt = /* @__PURE__ */ new Date();
        break;
      }
    }
  }
};
function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}
function extractApiKey(request) {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const apiKeyHeader = request.headers["x-api-key"];
  if (typeof apiKeyHeader === "string") {
    return apiKeyHeader;
  }
  return null;
}
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}
async function authPluginImpl(fastify, options) {
  const { keyStore, excludePaths = ["/v1/health", "/health"] } = options;
  fastify.decorateRequest("requestContext", null);
  fastify.addHook("onRequest", async (request, reply) => {
    const requestId = generateRequestId();
    if (excludePaths.some((path) => request.url === path || request.url.startsWith(path + "/"))) {
      request.requestContext = {
        tenantId: "anonymous",
        apiKeyId: "none",
        requestId,
        timestamp: /* @__PURE__ */ new Date()
      };
      return;
    }
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      reply.status(401).send({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "API key required",
          requestId
        }
      });
      return;
    }
    const keyHash = hashApiKey(apiKey);
    const keyRecord = await keyStore.getByHash(keyHash);
    if (!keyRecord) {
      reply.status(401).send({
        success: false,
        error: {
          code: "INVALID_API_KEY",
          message: "Invalid API key",
          requestId
        }
      });
      return;
    }
    if (keyRecord.expiresAt && keyRecord.expiresAt < /* @__PURE__ */ new Date()) {
      reply.status(401).send({
        success: false,
        error: {
          code: "API_KEY_EXPIRED",
          message: "API key has expired",
          requestId
        }
      });
      return;
    }
    keyStore.updateLastUsed(keyRecord.id).catch(() => {
    });
    request.requestContext = {
      tenantId: keyRecord.tenantId,
      apiKeyId: keyRecord.id,
      requestId,
      timestamp: /* @__PURE__ */ new Date()
    };
  });
}
var authPlugin = fp(authPluginImpl, {
  name: "auth-plugin",
  fastify: "4.x"
});

// src/middleware/error-handler.ts
import fp2 from "fastify-plugin";
import { BenthamError } from "@bentham/core";
function formatError(error, requestId) {
  if (error instanceof BenthamError) {
    return {
      statusCode: error.httpStatus,
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId
        }
      }
    };
  }
  if ("validation" in error && Array.isArray(error.validation)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Request validation failed",
          details: {
            errors: error.validation
          },
          requestId
        }
      }
    };
  }
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        error: {
          code: error.code ?? "ERROR",
          message: error.message,
          requestId
        }
      }
    };
  }
  return {
    statusCode: 500,
    body: {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "production" ? "An internal error occurred" : error.message,
        requestId
      }
    }
  };
}
async function errorHandlerPluginImpl(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    const requestId = request.requestContext?.requestId ?? "unknown";
    request.log.error({
      err: error,
      requestId,
      url: request.url,
      method: request.method
    });
    const { statusCode, body } = formatError(error, requestId);
    reply.status(statusCode).send(body);
  });
  fastify.setNotFoundHandler((request, reply) => {
    const requestId = request.requestContext?.requestId ?? "unknown";
    reply.status(404).send({
      success: false,
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
        requestId
      }
    });
  });
}
var errorHandlerPlugin = fp2(errorHandlerPluginImpl, {
  name: "error-handler-plugin",
  fastify: "4.x"
});

// src/routes/studies.ts
import { z } from "zod";
import { validateManifest, ManifestSchema } from "@bentham/core";
var CreateStudySchema = z.object({
  manifest: ManifestSchema,
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  callbackUrl: z.string().url().optional()
});
var StudyIdParamsSchema = z.object({
  id: z.string().min(1)
});
var ResultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50)
});
async function studiesRoutes(fastify, options) {
  const { studyService } = options;
  fastify.post("/studies", {
    schema: {
      body: {
        type: "object",
        required: ["manifest"],
        properties: {
          manifest: { type: "object" },
          priority: { type: "string", enum: ["low", "normal", "high"] },
          callbackUrl: { type: "string", format: "uri" }
        }
      }
    }
  }, async (request, reply) => {
    const parseResult = CreateStudySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.flatten(),
          requestId: request.requestContext.requestId
        }
      });
    }
    const { manifest, priority, callbackUrl } = parseResult.data;
    const manifestValidation = validateManifest(manifest);
    if (!manifestValidation.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "INVALID_MANIFEST",
          message: "Manifest validation failed",
          details: { errors: manifestValidation.errors },
          requestId: request.requestContext.requestId
        }
      });
    }
    const result = await studyService.createStudy(request.requestContext.tenantId, {
      manifest,
      priority,
      callbackUrl
    });
    return reply.status(201).send({
      success: true,
      data: result,
      requestId: request.requestContext.requestId
    });
  });
  fastify.get("/studies/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const status = await studyService.getStudyStatus(request.requestContext.tenantId, id);
    if (!status) {
      return reply.status(404).send({
        success: false,
        error: {
          code: "STUDY_NOT_FOUND",
          message: "Study not found",
          requestId: request.requestContext.requestId
        }
      });
    }
    return reply.send({
      success: true,
      data: status,
      requestId: request.requestContext.requestId
    });
  });
  fastify.get("/studies/:id/results", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" }
        }
      },
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request, reply) => {
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
          code: "STUDY_NOT_FOUND",
          message: "Study not found",
          requestId: request.requestContext.requestId
        }
      });
    }
    return reply.send({
      success: true,
      data: results,
      requestId: request.requestContext.requestId
    });
  });
  fastify.delete("/studies/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const cancelled = await studyService.cancelStudy(request.requestContext.tenantId, id);
    if (!cancelled) {
      return reply.status(404).send({
        success: false,
        error: {
          code: "STUDY_NOT_FOUND",
          message: "Study not found or cannot be cancelled",
          requestId: request.requestContext.requestId
        }
      });
    }
    return reply.send({
      success: true,
      data: { studyId: id, status: "cancelled" },
      requestId: request.requestContext.requestId
    });
  });
  fastify.post("/studies/:id/pause", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const paused = await studyService.pauseStudy(request.requestContext.tenantId, id);
    if (!paused) {
      return reply.status(404).send({
        success: false,
        error: {
          code: "STUDY_NOT_FOUND",
          message: "Study not found or cannot be paused",
          requestId: request.requestContext.requestId
        }
      });
    }
    return reply.send({
      success: true,
      data: { studyId: id, status: "paused" },
      requestId: request.requestContext.requestId
    });
  });
  fastify.post("/studies/:id/resume", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const resumed = await studyService.resumeStudy(request.requestContext.tenantId, id);
    if (!resumed) {
      return reply.status(404).send({
        success: false,
        error: {
          code: "STUDY_NOT_FOUND",
          message: "Study not found or cannot be resumed",
          requestId: request.requestContext.requestId
        }
      });
    }
    return reply.send({
      success: true,
      data: { studyId: id, status: "running" },
      requestId: request.requestContext.requestId
    });
  });
}

// src/routes/health.ts
async function healthRoutes(fastify, options) {
  const { healthService, version, startTime } = options;
  fastify.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok" });
  });
  fastify.get("/v1/health", async (_request, reply) => {
    const [dbOk, redisOk, orchestratorOk] = await Promise.all([
      healthService.checkDatabase().catch(() => false),
      healthService.checkRedis().catch(() => false),
      healthService.checkOrchestrator().catch(() => false)
    ]);
    const allOk = dbOk && redisOk && orchestratorOk;
    const someOk = dbOk || redisOk || orchestratorOk;
    const response = {
      status: allOk ? "healthy" : someOk ? "degraded" : "unhealthy",
      version,
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1e3),
      checks: {
        database: dbOk ? "ok" : "error",
        redis: redisOk ? "ok" : "error",
        orchestrator: orchestratorOk ? "ok" : "error"
      }
    };
    const statusCode = allOk ? 200 : someOk ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
}

// src/routes/costs.ts
import { z as z2 } from "zod";
var StudyIdParamsSchema2 = z2.object({
  studyId: z2.string().min(1)
});
async function costsRoutes(fastify, options) {
  const { costService } = options;
  fastify.get("/costs/:studyId", {
    schema: {
      params: {
        type: "object",
        required: ["studyId"],
        properties: {
          studyId: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const { studyId } = request.params;
    const costs = await costService.getStudyCosts(request.requestContext.tenantId, studyId);
    if (!costs) {
      return reply.status(404).send({
        success: false,
        error: {
          code: "STUDY_NOT_FOUND",
          message: `Study ${studyId} not found`,
          requestId: request.requestContext.requestId
        }
      });
    }
    return reply.send({
      success: true,
      data: costs,
      requestId: request.requestContext.requestId
    });
  });
}

// src/gateway.ts
async function createGateway(config = {}, dependencies) {
  const finalConfig = {
    ...DEFAULT_GATEWAY_CONFIG,
    ...config
  };
  const fastify = Fastify({
    logger: {
      level: finalConfig.logging.level,
      transport: finalConfig.logging.pretty ? { target: "pino-pretty" } : void 0
    },
    trustProxy: finalConfig.trustProxy
  });
  await fastify.register(helmet, {
    contentSecurityPolicy: false
    // API doesn't serve HTML
  });
  if (finalConfig.cors.enabled) {
    await fastify.register(cors, {
      origin: finalConfig.cors.origins,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
      credentials: true
    });
  }
  if (finalConfig.rateLimit.enabled) {
    await fastify.register(rateLimit, {
      max: finalConfig.rateLimit.max,
      timeWindow: finalConfig.rateLimit.windowMs,
      keyGenerator: (request) => {
        return request.requestContext?.tenantId ?? request.ip;
      }
    });
  }
  await fastify.register(errorHandlerPlugin);
  await fastify.register(authPlugin, {
    keyStore: dependencies.apiKeyStore ?? new InMemoryApiKeyStore(),
    excludePaths: ["/", "/health", "/v1/health"]
  });
  await fastify.register(healthRoutes, {
    healthService: dependencies.healthService,
    version: "0.0.1",
    startTime: /* @__PURE__ */ new Date()
  });
  await fastify.register(studiesRoutes, {
    prefix: "/v1",
    studyService: dependencies.studyService
  });
  await fastify.register(costsRoutes, {
    prefix: "/v1",
    costService: dependencies.costService
  });
  fastify.get("/", async () => {
    return {
      name: "Bentham API Gateway",
      version: "0.0.1",
      docs: "/v1/docs"
    };
  });
  return fastify;
}

// api/index.ts
var app = null;
function createMockServices() {
  const studyService = {
    async createStudy(_tenantId, _request) {
      const studyId = `study_${Date.now().toString(36)}`;
      return {
        studyId,
        status: "validating",
        createdAt: /* @__PURE__ */ new Date(),
        estimatedCompletionTime: new Date(Date.now() + 60 * 60 * 1e3)
      };
    },
    async getStudyStatus(_tenantId, studyId) {
      return {
        studyId,
        status: "executing",
        progress: {
          totalJobs: 100,
          completedJobs: 45,
          failedJobs: 2,
          pendingJobs: 53,
          completionPercentage: 45
        },
        surfaces: [
          { surfaceId: "openai-api", completed: 20, failed: 1, pending: 29 },
          { surfaceId: "anthropic-api", completed: 25, failed: 1, pending: 24 }
        ],
        createdAt: new Date(Date.now() - 30 * 60 * 1e3),
        startedAt: new Date(Date.now() - 25 * 60 * 1e3)
      };
    },
    async getStudyResults(_tenantId, studyId) {
      return {
        studyId,
        status: "complete",
        results: [],
        summary: {
          totalQueries: 100,
          successfulQueries: 98,
          failedQueries: 2,
          averageResponseTime: 1250
        },
        completedAt: /* @__PURE__ */ new Date()
      };
    },
    async cancelStudy(_tenantId, _studyId) {
      return true;
    },
    async pauseStudy(_tenantId, _studyId) {
      return true;
    },
    async resumeStudy(_tenantId, _studyId) {
      return true;
    }
  };
  const healthService = {
    async checkDatabase() {
      return true;
    },
    async checkRedis() {
      return true;
    },
    async checkOrchestrator() {
      return true;
    }
  };
  const costService = {
    async getStudyCosts(_tenantId, studyId) {
      return {
        studyId,
        costs: {
          total: 12.5,
          currency: "USD",
          breakdown: {
            apiCalls: 8,
            proxyUsage: 3.5,
            storage: 0.5,
            compute: 0.5
          }
        },
        estimatedFinalCost: 25
      };
    }
  };
  return { studyService, healthService, costService };
}
function createApiKeyStore() {
  const store = new InMemoryApiKeyStore();
  const stagingKey = process.env.STAGING_API_KEY || "btm_staging_test_key";
  store.addKey({
    id: "staging-key-1",
    tenantId: "tenant-staging",
    keyHash: hashApiKey(stagingKey),
    name: "Staging Key",
    permissions: ["*"],
    rateLimit: 1e3,
    createdAt: /* @__PURE__ */ new Date()
  });
  if (process.env.KYANOS_API_KEY) {
    store.addKey({
      id: "kyanos-key",
      tenantId: "tenant-kyanos",
      keyHash: hashApiKey(process.env.KYANOS_API_KEY),
      name: "Kyanos Production Key",
      permissions: ["*"],
      rateLimit: 1e3,
      createdAt: /* @__PURE__ */ new Date()
    });
  }
  return store;
}
async function getApp() {
  if (app) {
    return app;
  }
  const services = createMockServices();
  const apiKeyStore = createApiKeyStore();
  app = await createGateway(
    {
      rateLimit: {
        enabled: true,
        max: 100,
        windowMs: 6e4
      },
      logging: {
        level: "info",
        pretty: false
      }
    },
    {
      ...services,
      apiKeyStore
    }
  );
  return app;
}
async function handler(req, res) {
  const fastify = await getApp();
  const response = await fastify.inject({
    method: req.method,
    url: req.url || "/",
    headers: req.headers,
    payload: req.body
  });
  Object.entries(response.headers).forEach(([key, value]) => {
    if (value) {
      res.setHeader(key, value);
    }
  });
  res.status(response.statusCode).send(response.body);
}
export {
  handler as default
};
