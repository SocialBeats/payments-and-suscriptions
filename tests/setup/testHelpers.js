/**
 * Helper utilities for tests
 */
import jwt from 'jsonwebtoken';

/**
 * Generate a valid JWT token for testing
 * @param {Object} payload - User payload
 * @returns {string} JWT token
 */
export const generateTestToken = (payload = {}) => {
  const defaultPayload = {
    id: 'test-user-id-123',
    userId: 'test-user-id-123',
    username: 'testuser',
    email: 'testuser@test.com',
    roles: ['user'],
    pricingPlan: 'FREE',
    ...payload,
  };

  return jwt.sign(defaultPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

/**
 * Generate gateway headers for testing
 * @param {Object} user - User information
 * @returns {Object} Gateway headers
 */
export const generateGatewayHeaders = (user = {}) => {
  const defaultUser = {
    id: 'test-user-id-123',
    username: 'testuser',
    roles: ['user'],
    pricingPlan: 'FREE',
    ...user,
  };

  return {
    'x-gateway-authenticated': 'true',
    'x-user-id': defaultUser.id,
    'x-username': defaultUser.username,
    'x-roles': defaultUser.roles.join(','),
    'x-user-pricing-plan': defaultUser.pricingPlan,
  };
};

/**
 * Create a test subscription object
 * @param {Object} overrides - Override default values
 * @returns {Object} Subscription data
 */
export const createTestSubscription = (overrides = {}) => {
  return {
    userId: 'test-user-id-123',
    username: 'testuser',
    email: 'testuser@test.com',
    planType: 'FREE',
    status: 'active',
    stripeCustomerId: 'cus_test123',
    stripeSubscriptionId: 'sub_test123',
    stripePriceId: 'price_test_free',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    activeAddOns: [],
    ...overrides,
  };
};

/**
 * Create test user data
 * @param {Object} overrides - Override default values
 * @returns {Object} User data
 */
export const createTestUser = (overrides = {}) => {
  const id = overrides.id || `user-${Date.now()}`;
  return {
    id,
    userId: id,
    username: overrides.username || `user_${Date.now()}`,
    email: overrides.email || `user_${Date.now()}@test.com`,
    roles: ['user'],
    pricingPlan: 'FREE',
    ...overrides,
  };
};

/**
 * Wait for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Resolves after the specified time
 */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  generateTestToken,
  generateGatewayHeaders,
  createTestSubscription,
  createTestUser,
  wait,
};
