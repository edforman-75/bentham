/**
 * Error Handler Middleware
 *
 * Centralizes error handling and response formatting.
 */

import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { BenthamError } from '@bentham/core';

/**
 * Format error for API response
 */
function formatError(
  error: Error | FastifyError,
  requestId: string
): { statusCode: number; body: object } {
  // Handle Bentham errors
  if (error instanceof BenthamError) {
    return {
      statusCode: error.httpStatus,
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      },
    };
  }

  // Handle Fastify validation errors
  if ('validation' in error && Array.isArray((error as FastifyError).validation)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: {
            errors: (error as FastifyError).validation,
          },
          requestId,
        },
      },
    };
  }

  // Handle Fastify errors with status code
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        error: {
          code: error.code ?? 'ERROR',
          message: error.message,
          requestId,
        },
      },
    };
  }

  // Handle generic errors
  return {
    statusCode: 500,
    body: {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'An internal error occurred'
          : error.message,
        requestId,
      },
    },
  };
}

/**
 * Internal error handler implementation
 */
async function errorHandlerPluginImpl(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.requestContext?.requestId ?? 'unknown';

    // Log error
    request.log.error({
      err: error,
      requestId,
      url: request.url,
      method: request.method,
    });

    const { statusCode, body } = formatError(error, requestId);
    reply.status(statusCode).send(body);
  });

  // Handle 404s
  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.requestContext?.requestId ?? 'unknown';

    reply.status(404).send({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId,
      },
    });
  });
}

/**
 * Register error handler (wrapped with fastify-plugin to skip encapsulation)
 */
export const errorHandlerPlugin = fp(errorHandlerPluginImpl, {
  name: 'error-handler-plugin',
  fastify: '4.x',
});
