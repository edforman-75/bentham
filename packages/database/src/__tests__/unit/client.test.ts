/**
 * Database client unit tests
 *
 * These tests verify the module structure and exports.
 * Integration tests with a real database are in the regression folder.
 */

import { describe, it, expect } from 'vitest';

describe('Database Client Module', () => {
  describe('exports', () => {
    it('should export prisma client functions', async () => {
      // Import the module
      const clientModule = await import('../../client.js');

      expect(typeof clientModule.prisma).toBe('object');
      expect(typeof clientModule.connect).toBe('function');
      expect(typeof clientModule.disconnect).toBe('function');
      expect(typeof clientModule.healthCheck).toBe('function');
    });
  });
});

describe('Client Functions', () => {
  it('connect function should exist', async () => {
    const { connect } = await import('../../client.js');
    expect(typeof connect).toBe('function');
  });

  it('disconnect function should exist', async () => {
    const { disconnect } = await import('../../client.js');
    expect(typeof disconnect).toBe('function');
  });

  it('healthCheck function should exist', async () => {
    const { healthCheck } = await import('../../client.js');
    expect(typeof healthCheck).toBe('function');
  });
});
