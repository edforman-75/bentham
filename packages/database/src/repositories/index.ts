/**
 * Repository exports for @bentham/database
 */

// Tenant repositories
export {
  createTenant,
  findTenantById,
  findTenantBySlug,
  updateTenant,
  listTenants,
  createUser,
  findUserById,
  findUserByEmail,
  updateUser,
  listTenantUsers,
  createApiKey,
  findApiKeyByHash,
  findApiKeysByPrefix,
  touchApiKey,
  revokeApiKey,
  listTenantApiKeys,
} from './tenant.repository.js';

// Study repositories
export {
  createStudy,
  findStudyById,
  findStudyByIdForTenant,
  updateStudyStatus,
  updateStudyProgress,
  incrementStudyProgress,
  listStudiesForTenant,
  findAtRiskStudies,
  findStudiesByStatus,
  createJobs,
  findJobById,
  findJobByCoordinates,
  updateJobStatus,
  incrementJobAttempts,
  findPendingJobs,
  findJobsByStatus,
  getJobStatusCounts,
  getCompletedJobResults,
  createCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,
} from './study.repository.js';
