/**
 * Mock for SPACE Service
 * Simulates SPACE API responses for testing
 */
import { vi } from 'vitest';

// Mock contract data
export const mockContract = {
  userId: 'user-123',
  username: 'testuser',
  contractedServices: { socialbeats: 'latest' },
  subscriptionPlans: { socialbeats: 'PRO' },
  subscriptionAddOns: {},
  billingPeriod: { autoRenew: true, renewalDays: 30 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Create mock space service functions
 */
export const createSpaceMocks = () => ({
  createSpaceContract: vi.fn().mockResolvedValue(undefined),
  
  updateSpaceContract: vi.fn().mockResolvedValue(undefined),
  
  cancelSpaceContract: vi.fn().mockResolvedValue(undefined),
  
  deleteSpaceContract: vi.fn().mockResolvedValue(undefined),
  
  getSpaceContract: vi.fn().mockResolvedValue(mockContract),
});

export default createSpaceMocks;
