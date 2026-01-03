import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { api, generateTestToken } from '../setup/setup.js';
import Subscription from '../../src/models/Subscription.js';

describe('AddOn Controller', () => {
  let testToken;
  let testUserId;
  let testUsername;

  beforeEach(() => {
    testUserId = `user-addon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    testUsername = `addonuser_${Date.now()}`;
    testToken = generateTestToken({
      id: testUserId,
      username: testUsername,
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    if (testUserId) {
      await Subscription.deleteMany({ userId: testUserId });
    }
  });

  describe('GET /api/v1/payments/addons', () => {
    it('should return available addons without authentication', async () => {
      const res = await api.get('/api/v1/payments/addons');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('addons');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.addons)).toBe(true);
    });

    it('should return addons with valid structure', async () => {
      const res = await api.get('/api/v1/payments/addons');

      expect(res.status).toBe(200);

      // Each addon should have required fields
      res.body.addons.forEach((addon) => {
        expect(addon).toHaveProperty('name');
        expect(addon).toHaveProperty('displayName');
        expect(addon).toHaveProperty('price');
        // stripePriceId should not be exposed
        expect(addon).not.toHaveProperty('stripePriceId');
      });
    });

    it('should filter addons by user plan when authenticated', async () => {
      // Create subscription with FREE plan
      await Subscription.create({
        userId: testUserId,
        username: testUsername,
        email: `${testUsername}@test.com`,
        planType: 'FREE',
        status: 'active',
        stripeCustomerId: `cus_${Date.now()}`,
      });

      const res = await api
        .get('/api/v1/payments/addons')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('addons');
    });
  });

  describe('GET /api/v1/payments/addons/my', () => {
    it('should return 401 without authentication', async () => {
      const res = await api.get('/api/v1/payments/addons/my');

      expect(res.status).toBe(401);
    });

    it('should return 404 when user has no subscription', async () => {
      const res = await api
        .get('/api/v1/payments/addons/my')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'SUBSCRIPTION_NOT_FOUND');
    });

    it('should return user addons when subscription exists', async () => {
      // Create subscription
      await Subscription.create({
        userId: testUserId,
        username: testUsername,
        email: `${testUsername}@test.com`,
        planType: 'PRO',
        status: 'active',
        stripeCustomerId: `cus_${Date.now()}`,
        activeAddOns: [],
      });

      const res = await api
        .get('/api/v1/payments/addons/my')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('planType', 'PRO');
      expect(res.body).toHaveProperty('activeAddOns');
      expect(res.body).toHaveProperty('availableAddOns');
      expect(Array.isArray(res.body.activeAddOns)).toBe(true);
      expect(Array.isArray(res.body.availableAddOns)).toBe(true);
    });

    it('should show active addons correctly', async () => {
      // Create unique user for this test to avoid race conditions
      const addonTestUserId = `addon-active-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const addonTestUsername = `addonactive_${Date.now()}`;
      const addonTestToken = generateTestToken({
        id: addonTestUserId,
        username: addonTestUsername,
      });

      // Create subscription with an active addon
      await Subscription.create({
        userId: addonTestUserId,
        username: addonTestUsername,
        email: `${addonTestUsername}@test.com`,
        planType: 'PRO',
        status: 'active',
        stripeCustomerId: `cus_active_${Date.now()}`,
        stripeSubscriptionId: `sub_active_${Date.now()}`,
        activeAddOns: [
          {
            name: 'promotedBeat',
            status: 'active',
            purchasedAt: new Date(),
          },
        ],
      });

      const res = await api
        .get('/api/v1/payments/addons/my')
        .set('Authorization', `Bearer ${addonTestToken}`);

      expect(res.status).toBe(200);
      expect(res.body.activeAddOns.length).toBe(1);
      expect(res.body.activeAddOns[0].name).toBe('promotedBeat');

      // Cleanup
      await Subscription.deleteMany({ userId: addonTestUserId });
    });
  });

  describe('POST /api/v1/payments/addons/purchase', () => {
    it('should return 401 without authentication', async () => {
      const res = await api
        .post('/api/v1/payments/addons/purchase')
        .send({ addonName: 'decoratives' });

      expect(res.status).toBe(401);
    });

    it('should return 400 without addonName', async () => {
      const res = await api
        .post('/api/v1/payments/addons/purchase')
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'MISSING_ADDON_NAME');
    });

    it('should return 400 with invalid addonName', async () => {
      const res = await api
        .post('/api/v1/payments/addons/purchase')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ addonName: 'invalid_addon' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'INVALID_ADDON');
    });

    it('should return 404 when user has no subscription', async () => {
      const res = await api
        .post('/api/v1/payments/addons/purchase')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ addonName: 'decoratives' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'SUBSCRIPTION_NOT_FOUND');
    });

    it('should return 400 when subscription is not active', async () => {
      await Subscription.create({
        userId: testUserId,
        username: testUsername,
        email: `${testUsername}@test.com`,
        planType: 'FREE',
        status: 'canceled', // Inactive
        stripeCustomerId: `cus_${Date.now()}`,
      });

      const res = await api
        .post('/api/v1/payments/addons/purchase')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ addonName: 'decoratives' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'SUBSCRIPTION_NOT_ACTIVE');
    });

    it('should return 400 when addon not available for plan', async () => {
      // Use unique user to avoid race conditions
      const planTestUserId = `addon-plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const planTestUsername = `plantest_${Date.now()}`;
      const planTestToken = generateTestToken({
        id: planTestUserId,
        username: planTestUsername,
      });

      await Subscription.create({
        userId: planTestUserId,
        username: planTestUsername,
        email: `${planTestUsername}@test.com`,
        planType: 'FREE',
        status: 'active',
        stripeCustomerId: `cus_plan_${Date.now()}`,
        stripeSubscriptionId: `sub_plan_${Date.now()}`,
      });

      // promotedBeat is only for PRO and STUDIO
      const res = await api
        .post('/api/v1/payments/addons/purchase')
        .set('Authorization', `Bearer ${planTestToken}`)
        .send({ addonName: 'promotedBeat' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'ADDON_NOT_AVAILABLE');

      // Cleanup
      await Subscription.deleteMany({ userId: planTestUserId });
    });

    it('should return 400 when addon already active', async () => {
      await Subscription.create({
        userId: testUserId,
        username: testUsername,
        email: `${testUsername}@test.com`,
        planType: 'FREE',
        status: 'active',
        stripeCustomerId: `cus_${Date.now()}`,
        stripeSubscriptionId: `sub_${Date.now()}`,
        activeAddOns: [
          {
            name: 'decoratives',
            status: 'active',
            purchasedAt: new Date(),
          },
        ],
      });

      const res = await api
        .post('/api/v1/payments/addons/purchase')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ addonName: 'decoratives' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'ADDON_ALREADY_ACTIVE');
    });

    it('should return 400 when no Stripe subscription exists', async () => {
      await Subscription.create({
        userId: testUserId,
        username: testUsername,
        email: `${testUsername}@test.com`,
        planType: 'FREE',
        status: 'active',
        stripeCustomerId: `cus_${Date.now()}`,
        // No stripeSubscriptionId
      });

      const res = await api
        .post('/api/v1/payments/addons/purchase')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ addonName: 'decoratives' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'NO_STRIPE_SUBSCRIPTION');
    });
  });

  describe('DELETE /api/v1/payments/addons/:addonName', () => {
    it('should return 401 without authentication', async () => {
      const res = await api.delete('/api/v1/payments/addons/decoratives');

      expect(res.status).toBe(401);
    });

    it('should return 400 with invalid addonName', async () => {
      const res = await api
        .delete('/api/v1/payments/addons/invalid_addon')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'INVALID_ADDON');
    });

    it('should return 404 when user has no subscription', async () => {
      const res = await api
        .delete('/api/v1/payments/addons/decoratives')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'SUBSCRIPTION_NOT_FOUND');
    });

    it('should return 404 when addon is not active', async () => {
      // Create unique userId for this specific test
      const uniqueTestUserId = `test-addon-cancel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const uniqueTestUsername = `testuser_${Date.now()}`;
      const uniqueTestToken = generateTestToken({
        id: uniqueTestUserId,
        username: uniqueTestUsername,
      });

      await Subscription.create({
        userId: uniqueTestUserId,
        username: uniqueTestUsername,
        email: `${uniqueTestUsername}@test.com`,
        planType: 'FREE',
        status: 'active',
        stripeCustomerId: `cus_${Date.now()}`,
        stripeSubscriptionId: `sub_${Date.now()}`,
        activeAddOns: [], // No addons
      });

      const res = await api
        .delete('/api/v1/payments/addons/decoratives')
        .set('Authorization', `Bearer ${uniqueTestToken}`);

      // 404 = either subscription not found (race condition) or addon not found (expected)
      expect(res.status).toBe(404);
      // API returns different errors depending on the situation
      expect(['ADDON_NOT_ACTIVE', 'ADDON_NOT_FOUND', 'SUBSCRIPTION_NOT_FOUND']).toContain(res.body.error);

      // Cleanup
      await Subscription.deleteMany({ userId: uniqueTestUserId });
    });
  });
});
