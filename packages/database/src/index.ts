/**
 * @bentham/database
 *
 * Database schema, migrations, and repositories for Bentham.
 */

// Prisma client
export { prisma, connect, disconnect, healthCheck, PrismaClient } from './client.js';

// Repositories
export * from './repositories/index.js';

// Re-export Prisma types that are commonly needed
export type {
  Tenant,
  TenantStatus,
  User,
  UserRole,
  ApiKey,
  Study,
  StudyStatus,
  Job,
  JobStatus,
  Checkpoint,
  Evidence,
  EvidenceType,
  Account,
  AccountStatus,
  Session,
  SessionStatus,
  CostRecord,
  AuditLog,
  Schedule,
} from '@prisma/client';
