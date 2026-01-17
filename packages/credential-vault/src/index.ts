/**
 * @bentham/credential-vault
 *
 * Secure credential storage and rotation for Bentham surface adapters.
 *
 * Features:
 * - Multiple credential types (API keys, OAuth tokens, session cookies, etc.)
 * - Pluggable storage backends (memory, environment, encrypted file)
 * - Credential rotation with multiple strategies
 * - Health tracking and automatic cooldown
 * - Event-based notifications
 */

// Types
export type {
  // Credential types
  CredentialType,
  BaseCredential,
  ApiKeyCredential,
  OAuthCredential,
  SessionCookieCredential,
  UsernamePasswordCredential,
  BearerTokenCredential,
  CustomCredential,
  Credential,
  Cookie,
  // Provider types
  CredentialProvider,
  CredentialProviderConfig,
  // Rotation types
  RotationStrategy,
  CredentialPoolConfig,
  CredentialPoolState,
  CredentialUsage,
  PoolHealth,
  // Encryption types
  EncryptionConfig,
  EncryptedData,
  // Event types
  CredentialEvent,
  CredentialEventListener,
} from './types.js';

// Providers
export {
  MemoryCredentialProvider,
  createMemoryProvider,
  type MemoryProviderConfig,
  EnvironmentCredentialProvider,
  createEnvironmentProvider,
  type EnvironmentProviderConfig,
  type EnvironmentMapping,
  EncryptedFileCredentialProvider,
  createEncryptedFileProvider,
  type EncryptedFileProviderConfig,
} from './providers/index.js';

// Rotation
export {
  CredentialPool,
  createCredentialPool,
  CredentialPoolManager,
  createCredentialPoolManager,
} from './rotation/index.js';

/**
 * Quick setup helpers
 */

import { createMemoryProvider, type MemoryProviderConfig } from './providers/index.js';
import { createEnvironmentProvider, type EnvironmentProviderConfig } from './providers/index.js';
import { createEncryptedFileProvider, type EncryptedFileProviderConfig } from './providers/index.js';
import { createCredentialPoolManager, type CredentialPoolManager } from './rotation/index.js';
import type { RotationStrategy, CredentialProvider } from './types.js';

/**
 * Vault configuration for quick setup
 */
export interface VaultConfig {
  /** Provider type */
  provider: 'memory' | 'environment' | 'encrypted-file';
  /** Provider-specific configuration */
  providerConfig?: MemoryProviderConfig | EnvironmentProviderConfig | EncryptedFileProviderConfig;
  /** Default rotation strategy */
  rotationStrategy?: RotationStrategy;
}

/**
 * Credential Vault - main entry point
 *
 * Provides a unified interface for credential management.
 */
export class CredentialVault {
  readonly provider: CredentialProvider;
  readonly poolManager: CredentialPoolManager;

  constructor(config: VaultConfig) {
    // Create provider based on type
    switch (config.provider) {
      case 'memory':
        this.provider = createMemoryProvider(config.providerConfig as MemoryProviderConfig);
        break;
      case 'environment':
        this.provider = createEnvironmentProvider(config.providerConfig as EnvironmentProviderConfig);
        break;
      case 'encrypted-file':
        if (!config.providerConfig || !('masterPassword' in config.providerConfig)) {
          throw new Error('encrypted-file provider requires masterPassword in providerConfig');
        }
        this.provider = createEncryptedFileProvider(config.providerConfig as EncryptedFileProviderConfig);
        break;
      default:
        throw new Error(`Unknown provider type: ${config.provider}`);
    }

    this.poolManager = createCredentialPoolManager(
      this.provider,
      config.rotationStrategy ?? 'round_robin'
    );
  }

  /**
   * Dispose of the vault and all resources
   */
  dispose(): void {
    this.poolManager.dispose();
  }
}

/**
 * Create a credential vault
 */
export function createCredentialVault(config: VaultConfig): CredentialVault {
  return new CredentialVault(config);
}

/**
 * Create a development vault (memory-backed)
 */
export function createDevVault(): CredentialVault {
  return new CredentialVault({ provider: 'memory' });
}

/**
 * Create an environment-based vault
 */
export function createEnvVault(config?: EnvironmentProviderConfig): CredentialVault {
  return new CredentialVault({
    provider: 'environment',
    providerConfig: config,
  });
}
