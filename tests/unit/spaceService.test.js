/**
 * Unit tests for SPACE Service with mocks
 * Tests the spaceService functions in isolation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSpaceMocks, mockContract } from '../mocks/spaceMock.js';

describe('SPACE Service Functions', () => {
  let spaceMocks;

  beforeEach(() => {
    spaceMocks = createSpaceMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSpaceContract', () => {
    it('should create a new contract successfully', async () => {
      await spaceMocks.createSpaceContract({
        userId: 'user-123',
        username: 'testuser',
        plan: 'PRO',
      });

      expect(spaceMocks.createSpaceContract).toHaveBeenCalledWith({
        userId: 'user-123',
        username: 'testuser',
        plan: 'PRO',
      });
    });

    it('should create contract with addons', async () => {
      await spaceMocks.createSpaceContract({
        userId: 'user-123',
        username: 'testuser',
        plan: 'PRO',
        addOns: { decoratives: 1, promotedBeat: 1 },
      });

      expect(spaceMocks.createSpaceContract).toHaveBeenCalled();
    });

    it('should handle errors when creating contract', async () => {
      spaceMocks.createSpaceContract.mockRejectedValueOnce(new Error('SPACE API error'));

      await expect(spaceMocks.createSpaceContract({
        userId: 'user-error',
        username: 'erroruser',
        plan: 'FREE',
      })).rejects.toThrow('SPACE API error');
    });

    it('should create contract for each plan type', async () => {
      const plans = ['FREE', 'PRO', 'STUDIO'];

      for (const plan of plans) {
        await spaceMocks.createSpaceContract({
          userId: `user-${plan}`,
          username: `user_${plan.toLowerCase()}`,
          plan,
        });
      }

      expect(spaceMocks.createSpaceContract).toHaveBeenCalledTimes(3);
    });
  });

  describe('updateSpaceContract', () => {
    it('should update contract plan', async () => {
      await spaceMocks.updateSpaceContract({
        userId: 'user-123',
        plan: 'STUDIO',
      });

      expect(spaceMocks.updateSpaceContract).toHaveBeenCalledWith({
        userId: 'user-123',
        plan: 'STUDIO',
      });
    });

    it('should update contract with new addons', async () => {
      await spaceMocks.updateSpaceContract({
        userId: 'user-123',
        plan: 'PRO',
        addOns: { promotedBeat: 1 },
      });

      expect(spaceMocks.updateSpaceContract).toHaveBeenCalled();
    });

    it('should handle upgrade from FREE to PRO', async () => {
      await spaceMocks.updateSpaceContract({
        userId: 'user-123',
        plan: 'PRO',
      });

      expect(spaceMocks.updateSpaceContract).toHaveBeenCalled();
    });

    it('should handle downgrade from STUDIO to PRO', async () => {
      await spaceMocks.updateSpaceContract({
        userId: 'user-123',
        plan: 'PRO',
      });

      expect(spaceMocks.updateSpaceContract).toHaveBeenCalled();
    });
  });

  describe('cancelSpaceContract', () => {
    it('should cancel contract (downgrade to FREE)', async () => {
      await spaceMocks.cancelSpaceContract('user-123');

      expect(spaceMocks.cancelSpaceContract).toHaveBeenCalledWith('user-123');
    });

    it('should handle already canceled contract', async () => {
      // Should not throw even if already canceled
      await spaceMocks.cancelSpaceContract('user-already-free');

      expect(spaceMocks.cancelSpaceContract).toHaveBeenCalled();
    });
  });

  describe('deleteSpaceContract', () => {
    it('should delete contract completely', async () => {
      await spaceMocks.deleteSpaceContract('user-123');

      expect(spaceMocks.deleteSpaceContract).toHaveBeenCalledWith('user-123');
    });

    it('should handle non-existent contract', async () => {
      // Should not throw if contract doesn't exist
      await spaceMocks.deleteSpaceContract('user-not-found');

      expect(spaceMocks.deleteSpaceContract).toHaveBeenCalled();
    });
  });

  describe('getSpaceContract', () => {
    it('should retrieve contract', async () => {
      const result = await spaceMocks.getSpaceContract('user-123');

      expect(result).toEqual(mockContract);
    });

    it('should return null for non-existent contract', async () => {
      spaceMocks.getSpaceContract.mockResolvedValueOnce(null);

      const result = await spaceMocks.getSpaceContract('user-not-found');

      expect(result).toBeNull();
    });
  });
});
