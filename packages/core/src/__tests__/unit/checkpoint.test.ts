/**
 * Tests for Checkpoint System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  getCellKey,
  parseCellKey,
  createCheckpoint,
  updateCheckpointWithResult,
  updateCheckpointRetryState,
  saveCheckpoint,
  loadCheckpoint,
  deleteCheckpoint,
  checkpointExists,
  getRemainingCells,
  canResume,
  CheckpointManager,
  type CellResult,
  type StudyCheckpoint,
} from '../../study/checkpoint.js';

const TEST_CHECKPOINT_DIR = '/tmp/bentham-checkpoint-test';

describe('Checkpoint System', () => {
  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CHECKPOINT_DIR)) {
      fs.rmSync(TEST_CHECKPOINT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(TEST_CHECKPOINT_DIR)) {
      fs.rmSync(TEST_CHECKPOINT_DIR, { recursive: true });
    }
  });

  describe('getCellKey', () => {
    it('should generate consistent key', () => {
      const key = getCellKey(5, 'openai-api', 'us-national');
      expect(key).toBe('5-openai-api-us-national');
    });

    it('should handle different values', () => {
      const key1 = getCellKey(0, 'google-search', 'in-mum');
      const key2 = getCellKey(1, 'google-search', 'in-mum');

      expect(key1).not.toBe(key2);
    });
  });

  describe('createCheckpoint', () => {
    it('should create checkpoint with correct values', () => {
      const checkpoint = createCheckpoint(
        'study-123',
        'Test Study',
        ['openai-api', 'google-search'],
        ['us-national', 'in-mum'],
        10
      );

      expect(checkpoint.studyId).toBe('study-123');
      expect(checkpoint.studyName).toBe('Test Study');
      expect(checkpoint.totalCells).toBe(40); // 10 * 2 * 2
      expect(checkpoint.completedCells).toBe(0);
      expect(checkpoint.failedCells).toBe(0);
      expect(checkpoint.progressPercent).toBe(0);
      expect(checkpoint.metadata.surfaces).toEqual(['openai-api', 'google-search']);
      expect(checkpoint.metadata.locations).toEqual(['us-national', 'in-mum']);
      expect(checkpoint.metadata.queryCount).toBe(10);
    });

    it('should set version', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 1);
      expect(checkpoint.version).toBe('1.0.0');
    });
  });

  describe('updateCheckpointWithResult', () => {
    it('should add completed result', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 2);
      const result: CellResult = {
        queryIndex: 0,
        surfaceId: 's',
        locationId: 'l',
        status: 'completed',
        attempt: 1,
        success: true,
        responseText: 'Response',
      };

      const updated = updateCheckpointWithResult(checkpoint, result);

      expect(updated.completedCells).toBe(1);
      expect(updated.progressPercent).toBe(50); // 1 of 2
      expect(updated.cellResults['0-s-l']).toEqual(result);
    });

    it('should add failed result', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 2);
      const result: CellResult = {
        queryIndex: 0,
        surfaceId: 's',
        locationId: 'l',
        status: 'failed',
        attempt: 3,
        success: false,
        error: 'Max retries exceeded',
      };

      const updated = updateCheckpointWithResult(checkpoint, result);

      expect(updated.failedCells).toBe(1);
      expect(updated.progressPercent).toBe(50);
    });

    it('should update timestamp', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 1);
      const originalUpdatedAt = checkpoint.updatedAt;

      // Wait a tiny bit to ensure different timestamp
      const result: CellResult = {
        queryIndex: 0,
        surfaceId: 's',
        locationId: 'l',
        status: 'completed',
        attempt: 1,
      };

      const updated = updateCheckpointWithResult(checkpoint, result);

      expect(new Date(updated.updatedAt).getTime())
        .toBeGreaterThanOrEqual(new Date(originalUpdatedAt).getTime());
    });
  });

  describe('updateCheckpointRetryState', () => {
    it('should add retry state', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 1);

      const updated = updateCheckpointRetryState(
        checkpoint,
        '0-s-l',
        2,
        'Timeout',
        'TIMEOUT',
        false
      );

      expect(updated.retryStates['0-s-l']).toEqual({
        attempts: 2,
        lastError: 'Timeout',
        lastErrorCode: 'TIMEOUT',
        exhausted: false,
      });
    });

    it('should mark as exhausted', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 1);

      const updated = updateCheckpointRetryState(
        checkpoint,
        '0-s-l',
        3,
        'Max retries',
        'RATE_LIMITED',
        true
      );

      expect(updated.retryStates['0-s-l'].exhausted).toBe(true);
    });
  });

  describe('File Operations', () => {
    it('should save and load checkpoint', () => {
      const checkpoint = createCheckpoint('test-id', 'Test', ['s'], ['l'], 5);

      saveCheckpoint(checkpoint, TEST_CHECKPOINT_DIR);

      expect(checkpointExists('test-id', TEST_CHECKPOINT_DIR)).toBe(true);

      const loaded = loadCheckpoint('test-id', TEST_CHECKPOINT_DIR);

      expect(loaded).not.toBeNull();
      expect(loaded!.studyId).toBe('test-id');
      expect(loaded!.studyName).toBe('Test');
    });

    it('should return null for non-existent checkpoint', () => {
      const loaded = loadCheckpoint('non-existent', TEST_CHECKPOINT_DIR);
      expect(loaded).toBeNull();
    });

    it('should delete checkpoint', () => {
      const checkpoint = createCheckpoint('to-delete', 'Test', ['s'], ['l'], 1);

      saveCheckpoint(checkpoint, TEST_CHECKPOINT_DIR);
      expect(checkpointExists('to-delete', TEST_CHECKPOINT_DIR)).toBe(true);

      deleteCheckpoint('to-delete', TEST_CHECKPOINT_DIR);
      expect(checkpointExists('to-delete', TEST_CHECKPOINT_DIR)).toBe(false);
    });

    it('should handle deleting non-existent checkpoint gracefully', () => {
      expect(() => deleteCheckpoint('non-existent', TEST_CHECKPOINT_DIR)).not.toThrow();
    });
  });

  describe('getRemainingCells', () => {
    it('should return all cells when none completed', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 2);
      checkpoint.executionQueue = ['0-s-l', '1-s-l'];

      const remaining = getRemainingCells(checkpoint);

      expect(remaining).toEqual(['0-s-l', '1-s-l']);
    });

    it('should exclude completed cells', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 2);
      checkpoint.executionQueue = ['0-s-l', '1-s-l'];
      checkpoint.cellResults['0-s-l'] = {
        queryIndex: 0,
        surfaceId: 's',
        locationId: 'l',
        status: 'completed',
        attempt: 1,
      };

      const remaining = getRemainingCells(checkpoint);

      expect(remaining).toEqual(['1-s-l']);
    });

    it('should exclude failed cells', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 2);
      checkpoint.executionQueue = ['0-s-l', '1-s-l'];
      checkpoint.cellResults['0-s-l'] = {
        queryIndex: 0,
        surfaceId: 's',
        locationId: 'l',
        status: 'failed',
        attempt: 3,
      };

      const remaining = getRemainingCells(checkpoint);

      expect(remaining).toEqual(['1-s-l']);
    });
  });

  describe('canResume', () => {
    it('should allow resume when cells remain', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 2);
      checkpoint.executionQueue = ['0-s-l', '1-s-l'];

      const result = canResume(checkpoint);

      expect(result.canResume).toBe(true);
      expect(result.remainingCells).toBe(2);
    });

    it('should not allow resume when complete', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 1);
      checkpoint.completedCells = 1;

      const result = canResume(checkpoint);

      expect(result.canResume).toBe(false);
      expect(result.reason).toBe('Study is already complete');
    });
  });

  describe('CheckpointManager', () => {
    it('should record results', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 2);
      const manager = new CheckpointManager(checkpoint, { enabled: false });

      manager.recordResult({
        queryIndex: 0,
        surfaceId: 's',
        locationId: 'l',
        status: 'completed',
        attempt: 1,
      });

      const current = manager.getCheckpoint();
      expect(current.completedCells).toBe(1);

      manager.stop();
    });

    it('should record retry state', () => {
      const checkpoint = createCheckpoint('id', 'name', ['s'], ['l'], 1);
      const manager = new CheckpointManager(checkpoint, { enabled: false });

      manager.recordRetry('0-s-l', 2, 'Error', 'TIMEOUT');

      const current = manager.getCheckpoint();
      expect(current.retryStates['0-s-l'].attempts).toBe(2);

      manager.stop();
    });

    it('should save to disk', () => {
      const checkpoint = createCheckpoint('manager-test', 'Test', ['s'], ['l'], 1);
      const manager = new CheckpointManager(checkpoint, {
        enabled: true,
        checkpointDir: TEST_CHECKPOINT_DIR,
      });

      manager.recordResult({
        queryIndex: 0,
        surfaceId: 's',
        locationId: 'l',
        status: 'completed',
        attempt: 1,
      });

      manager.save();

      expect(checkpointExists('manager-test', TEST_CHECKPOINT_DIR)).toBe(true);

      manager.stop();
    });

    it('should finalize and cleanup', () => {
      const checkpoint = createCheckpoint('finalize-test', 'Test', ['s'], ['l'], 1);
      const manager = new CheckpointManager(checkpoint, {
        enabled: true,
        checkpointDir: TEST_CHECKPOINT_DIR,
        preserveCheckpoint: false,
      });

      manager.save();
      expect(checkpointExists('finalize-test', TEST_CHECKPOINT_DIR)).toBe(true);

      manager.finalize();
      expect(checkpointExists('finalize-test', TEST_CHECKPOINT_DIR)).toBe(false);
    });

    it('should preserve checkpoint when configured', () => {
      const checkpoint = createCheckpoint('preserve-test', 'Test', ['s'], ['l'], 1);
      const manager = new CheckpointManager(checkpoint, {
        enabled: true,
        checkpointDir: TEST_CHECKPOINT_DIR,
        preserveCheckpoint: true,
      });

      manager.save();
      manager.finalize();

      expect(checkpointExists('preserve-test', TEST_CHECKPOINT_DIR)).toBe(true);
    });
  });
});
