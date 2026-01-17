/**
 * Prisma Client singleton for Bentham
 *
 * This module provides a single Prisma Client instance that is reused
 * across the application to prevent connection pool exhaustion.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Create Prisma Client with logging configuration
 */
function createPrismaClient(): PrismaClient {
  const logLevel = process.env.DATABASE_LOG_LEVEL || 'warn';

  const logOptions: ('query' | 'info' | 'warn' | 'error')[] = [];

  switch (logLevel) {
    case 'query':
      logOptions.push('query', 'info', 'warn', 'error');
      break;
    case 'info':
      logOptions.push('info', 'warn', 'error');
      break;
    case 'warn':
      logOptions.push('warn', 'error');
      break;
    case 'error':
      logOptions.push('error');
      break;
  }

  return new PrismaClient({
    log: logOptions,
  });
}

/**
 * Singleton Prisma Client instance
 *
 * In development, we store the client on the global object to prevent
 * creating multiple instances during hot reloading.
 */
export const prisma: PrismaClient =
  globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

/**
 * Connect to the database
 */
export async function connect(): Promise<void> {
  await prisma.$connect();
}

/**
 * Disconnect from the database
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      healthy: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { PrismaClient };
