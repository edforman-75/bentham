/**
 * Credential Providers
 *
 * Different backend implementations for credential storage.
 */

export {
  MemoryCredentialProvider,
  createMemoryProvider,
  type MemoryProviderConfig,
} from './memory.js';

export {
  EnvironmentCredentialProvider,
  createEnvironmentProvider,
  type EnvironmentProviderConfig,
  type EnvironmentMapping,
} from './environment.js';

export {
  EncryptedFileCredentialProvider,
  createEncryptedFileProvider,
  type EncryptedFileProviderConfig,
} from './encrypted-file.js';
