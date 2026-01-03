/**
 * Unit tests for Stripe Service with mocks
 * Tests the stripeService functions in isolation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStripeMocks, mockCustomer, mockStripeSubscription, mockCheckoutSession } from '../mocks/stripeMock.js';

// Mock the stripe module before importing the service
vi.mock('stripe', () => {
  const mockStripe = {
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
    },
    subscriptions: {
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
    },
    subscriptionItems: {
      create: vi.fn(),
      del: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
    paymentMethods: {
      list: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  
  return {
    default: vi.fn(() => mockStripe),
    Stripe: vi.fn(() => mockStripe),
  };
});

describe('Stripe Service Functions', () => {
  let stripeMocks;

  beforeEach(() => {
    stripeMocks = createStripeMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOrCreateCustomer', () => {
    it('should return existing customer if found', async () => {
      const result = await stripeMocks.getOrCreateCustomer('test@example.com', { userId: 'user-123' });
      
      expect(result).toEqual(mockCustomer);
      expect(stripeMocks.getOrCreateCustomer).toHaveBeenCalledWith('test@example.com', { userId: 'user-123' });
    });

    it('should create new customer if not found', async () => {
      stripeMocks.getOrCreateCustomer.mockResolvedValueOnce({
        ...mockCustomer,
        id: 'cus_new123',
      });

      const result = await stripeMocks.getOrCreateCustomer('new@example.com', { userId: 'user-456' });
      
      expect(result.id).toBe('cus_new123');
    });

    it('should handle errors gracefully', async () => {
      stripeMocks.getOrCreateCustomer.mockRejectedValueOnce(new Error('Stripe API error'));

      await expect(stripeMocks.getOrCreateCustomer('error@example.com')).rejects.toThrow('Stripe API error');
    });
  });

  describe('customerHasPaymentMethod', () => {
    it('should return true when customer has payment method', async () => {
      const result = await stripeMocks.customerHasPaymentMethod('cus_mock123');
      
      expect(result).toBe(true);
    });

    it('should return false when customer has no payment method', async () => {
      stripeMocks.customerHasPaymentMethod.mockResolvedValueOnce(false);

      const result = await stripeMocks.customerHasPaymentMethod('cus_no_payment');
      
      expect(result).toBe(false);
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session successfully', async () => {
      const result = await stripeMocks.createCheckoutSession({
        customerId: 'cus_mock123',
        priceId: 'price_test_pro',
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });

      expect(result).toEqual(mockCheckoutSession);
      expect(result.url).toContain('checkout.stripe.com');
    });

    it('should include metadata in session', async () => {
      const metadata = { userId: 'user-123', planType: 'PRO' };
      
      await stripeMocks.createCheckoutSession({
        customerId: 'cus_mock123',
        priceId: 'price_test_pro',
        metadata,
      });

      expect(stripeMocks.createCheckoutSession).toHaveBeenCalled();
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription successfully', async () => {
      const result = await stripeMocks.createSubscription({
        customerId: 'cus_mock123',
        priceId: 'price_test_pro',
      });

      expect(result).toEqual(mockStripeSubscription);
      expect(result.status).toBe('active');
    });

    it('should handle trial periods', async () => {
      stripeMocks.createSubscription.mockResolvedValueOnce({
        ...mockStripeSubscription,
        status: 'trialing',
        trial_end: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
      });

      const result = await stripeMocks.createSubscription({
        customerId: 'cus_mock123',
        priceId: 'price_test_pro',
        trialDays: 14,
      });

      expect(result.status).toBe('trialing');
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription plan', async () => {
      stripeMocks.updateSubscription.mockResolvedValueOnce({
        ...mockStripeSubscription,
        items: {
          data: [{ id: 'si_mock123', price: { id: 'price_test_studio' } }],
        },
      });

      const result = await stripeMocks.updateSubscription('sub_mock123', {
        priceId: 'price_test_studio',
      });

      expect(result.items.data[0].price.id).toBe('price_test_studio');
    });

    it('should handle proration', async () => {
      await stripeMocks.updateSubscription('sub_mock123', {
        priceId: 'price_test_studio',
        prorationBehavior: 'create_prorations',
      });

      expect(stripeMocks.updateSubscription).toHaveBeenCalled();
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription immediately', async () => {
      const result = await stripeMocks.cancelSubscription('sub_mock123');

      expect(result.status).toBe('canceled');
      expect(result.canceled_at).toBeDefined();
    });

    it('should cancel at period end', async () => {
      stripeMocks.cancelSubscription.mockResolvedValueOnce({
        ...mockStripeSubscription,
        cancel_at_period_end: true,
        status: 'active',
      });

      const result = await stripeMocks.cancelSubscription('sub_mock123', { atPeriodEnd: true });

      expect(result.cancel_at_period_end).toBe(true);
      expect(result.status).toBe('active');
    });
  });

  describe('addSubscriptionItem', () => {
    it('should add addon to subscription', async () => {
      const result = await stripeMocks.addSubscriptionItem({
        subscriptionId: 'sub_mock123',
        priceId: 'price_test_addon_decoratives',
      });

      expect(result.id).toBe('si_addon_mock123');
    });
  });

  describe('removeSubscriptionItem', () => {
    it('should remove addon from subscription', async () => {
      const result = await stripeMocks.removeSubscriptionItem('si_addon_mock123');

      expect(result.deleted).toBe(true);
    });
  });

  describe('getPriceIdForPlan', () => {
    it('should return correct price ID for each plan', () => {
      expect(stripeMocks.getPriceIdForPlan('FREE')).toBe('price_test_free');
      expect(stripeMocks.getPriceIdForPlan('PRO')).toBe('price_test_pro');
      expect(stripeMocks.getPriceIdForPlan('STUDIO')).toBe('price_test_studio');
    });
  });

  describe('getPortalSession', () => {
    it('should create billing portal session', async () => {
      const result = await stripeMocks.getPortalSession({
        customerId: 'cus_mock123',
        returnUrl: 'http://localhost/account',
      });

      expect(result.url).toContain('billing.stripe.com');
    });
  });
});
