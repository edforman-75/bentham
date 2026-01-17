/**
 * Encrypted File Credential Provider
 *
 * Stores credentials in an encrypted file using AES-256-GCM.
 * Useful for local development and self-hosted environments.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { SurfaceId } from '@bentham/core';
import type {
  Credential,
  CredentialProvider,
  CredentialType,
  EncryptedData,
} from '../types.js';

/**
 * Encrypted file provider configuration
 */
export interface EncryptedFileProviderConfig {
  /** Path to the encrypted credentials file */
  filePath: string;
  /** Master password for encryption */
  masterPassword: string;
  /** Salt for key derivation (optional, will be generated if not provided) */
  salt?: string;
  /** Number of scrypt iterations (default: 16384) */
  scryptN?: number;
  /** Auto-save after modifications (default: true) */
  autoSave?: boolean;
}

/**
 * File format for stored credentials
 */
interface CredentialStore {
  version: number;
  credentials: Record<string, Credential>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    credentialCount: number;
  };
}

const ENCRYPTION_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Encrypted file credential provider
 */
export class EncryptedFileCredentialProvider implements CredentialProvider {
  readonly name = 'encrypted-file';
  private config: Required<EncryptedFileProviderConfig>;
  private credentials: Map<string, Credential> = new Map();
  private encryptionKey: Buffer;
  private salt: Buffer;
  private loaded = false;
  private dirty = false;

  constructor(config: EncryptedFileProviderConfig) {
    this.config = {
      filePath: config.filePath,
      masterPassword: config.masterPassword,
      salt: config.salt ?? '',
      scryptN: config.scryptN ?? 16384,
      autoSave: config.autoSave ?? true,
    };

    // Generate or use provided salt
    this.salt = this.config.salt
      ? Buffer.from(this.config.salt, 'base64')
      : randomBytes(SALT_LENGTH);

    // Derive encryption key from password
    this.encryptionKey = this.deriveKey(this.config.masterPassword, this.salt);
  }

  /**
   * Derive encryption key using scrypt
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return scryptSync(password, salt, KEY_LENGTH, {
      N: this.config.scryptN,
      r: 8,
      p: 1,
    });
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string): EncryptedData {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let ciphertext = cipher.update(data, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      salt: this.salt.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: ALGORITHM,
      kdf: 'scrypt',
      version: ENCRYPTION_VERSION,
    };
  }

  /**
   * Decrypt data
   */
  private decrypt(encrypted: EncryptedData): string {
    // Re-derive key if salt is different
    const salt = Buffer.from(encrypted.salt, 'base64');
    let key = this.encryptionKey;
    if (!salt.equals(this.salt)) {
      key = this.deriveKey(this.config.masterPassword, salt);
    }

    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = encrypted.authTag ? Buffer.from(encrypted.authTag, 'base64') : undefined;

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    if (authTag) {
      decipher.setAuthTag(authTag);
    }

    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * Load credentials from file
   */
  private load(): void {
    if (this.loaded) return;

    if (!existsSync(this.config.filePath)) {
      this.loaded = true;
      return;
    }

    try {
      const fileContent = readFileSync(this.config.filePath, 'utf8');
      const encrypted: EncryptedData = JSON.parse(fileContent);
      const decrypted = this.decrypt(encrypted);
      const store: CredentialStore = JSON.parse(decrypted);

      // Convert dates back to Date objects
      for (const [id, cred] of Object.entries(store.credentials)) {
        const credential = {
          ...cred,
          createdAt: new Date(cred.createdAt),
          expiresAt: cred.expiresAt ? new Date(cred.expiresAt) : undefined,
        };
        this.credentials.set(id, credential);
      }
    } catch (error) {
      throw new Error(`Failed to load credentials file: ${(error as Error).message}`);
    }

    this.loaded = true;
  }

  /**
   * Save credentials to file
   */
  private save(): void {
    const store: CredentialStore = {
      version: ENCRYPTION_VERSION,
      credentials: Object.fromEntries(this.credentials),
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        credentialCount: this.credentials.size,
      },
    };

    const plaintext = JSON.stringify(store, null, 2);
    const encrypted = this.encrypt(plaintext);

    // Ensure directory exists
    const dir = dirname(this.config.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.config.filePath, JSON.stringify(encrypted, null, 2), 'utf8');
    this.dirty = false;
  }

  /**
   * Auto-save if enabled and dirty
   */
  private autoSave(): void {
    if (this.config.autoSave && this.dirty) {
      this.save();
    }
  }

  async get(id: string): Promise<Credential | null> {
    this.load();
    return this.credentials.get(id) ?? null;
  }

  async getBySurface(surfaceId: SurfaceId): Promise<Credential[]> {
    this.load();
    const results: Credential[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.surfaceId === surfaceId) {
        results.push(cred);
      }
    }
    return results;
  }

  async getActiveBySurface(surfaceId: SurfaceId): Promise<Credential[]> {
    const all = await this.getBySurface(surfaceId);
    const now = new Date();
    return all.filter(cred => {
      if (!cred.isActive) return false;
      if (cred.expiresAt && cred.expiresAt < now) return false;
      return true;
    });
  }

  async store(credential: Credential): Promise<void> {
    this.load();
    this.credentials.set(credential.id, credential);
    this.dirty = true;
    this.autoSave();
  }

  async update(id: string, updates: Partial<Credential>): Promise<void> {
    this.load();
    const existing = this.credentials.get(id);
    if (!existing) {
      throw new Error(`Credential not found: ${id}`);
    }
    this.credentials.set(id, { ...existing, ...updates } as Credential);
    this.dirty = true;
    this.autoSave();
  }

  async delete(id: string): Promise<void> {
    this.load();
    this.credentials.delete(id);
    this.dirty = true;
    this.autoSave();
  }

  async exists(id: string): Promise<boolean> {
    this.load();
    return this.credentials.has(id);
  }

  async list(): Promise<string[]> {
    this.load();
    return Array.from(this.credentials.keys());
  }

  async listByType(type: CredentialType): Promise<Credential[]> {
    this.load();
    const results: Credential[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.type === type) {
        results.push(cred);
      }
    }
    return results;
  }

  /**
   * Force save to file
   */
  flush(): void {
    this.save();
  }

  /**
   * Reload from file (discards unsaved changes)
   */
  reload(): void {
    this.credentials.clear();
    this.loaded = false;
    this.dirty = false;
    this.load();
  }

  /**
   * Get the salt (needed for backup/restore)
   */
  getSalt(): string {
    return this.salt.toString('base64');
  }

  /**
   * Verify the master password
   */
  verifyPassword(password: string): boolean {
    const testKey = this.deriveKey(password, this.salt);
    const keyHash = createHash('sha256').update(this.encryptionKey).digest('hex');
    const testHash = createHash('sha256').update(testKey).digest('hex');
    return keyHash === testHash;
  }

  /**
   * Change the master password
   */
  changePassword(newPassword: string): void {
    this.load();
    this.encryptionKey = this.deriveKey(newPassword, this.salt);
    this.dirty = true;
    this.save();
  }
}

/**
 * Create an encrypted file credential provider
 */
export function createEncryptedFileProvider(config: EncryptedFileProviderConfig): EncryptedFileCredentialProvider {
  return new EncryptedFileCredentialProvider(config);
}
