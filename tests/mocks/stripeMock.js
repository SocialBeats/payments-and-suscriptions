/**
 * Mock for Stripe Service
 * Simulates Stripe API responses for testing
 */
import { vi } from 'vitest';

// Mock customer data
export const mockCustomer = {
  id: 'cus_mock123',
  email: 'test@example.com',
  metadata: { userId: 'user-123', username: 'testuser' },
  default_payment_method: 'pm_mock123',
  invoice_settings: { default_payment_method: 'pm_mock123' },
};

// Mock subscription data
export const mockStripeSubscription = {
  id: 'sub_mock123',
  customer: 'cus_mock123',
  status: 'active',
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  items: {
    data: [
      {
        id: 'si_mock123',
        price: { id: 'price_test_pro' },
      },
    ],
  },
};

// Mock checkout session
export const mockCheckoutSession = {
  id: 'cs_mock123',
  url: 'https://checkout.stripe.com/mock',
  customer: 'cus_mock123',
  subscription: 'sub_mock123',
  status: 'open',
  mode: 'subscription',
};

// Mock setup session
export const mockSetupSession = {
  id: 'seti_mock123',
  url: 'https://checkout.stripe.com/setup/mock',
  customer: 'cus_mock123',
  status: 'open',
};

// Mock payment method
export const mockPaymentMethod = {
  id: 'pm_mock123',
  type: 'card',
  card: {
    brand: 'visa',
    last4: '4242',
    exp_month: 12,
    exp_year: 2030,
  },
};

// Mock webhook event
export const createMockWebhookEvent = (type, data) => ({
  id: `evt_mock_${Date.now()}`,
  type,
  data: { object: data },
  created: Math.floor(Date.now() / 1000),
});

/**
 * Create mock stripe service functions
 */
export const createStripeMocks = () => ({
  getOrCreateCustomer: vi.fn().mockResolvedValue(mockCustomer),
  
  customerHasPaymentMethod: vi.fn().mockResolvedValue(true),
  
  createCheckoutSession: vi.fn().mockResolvedValue(mockCheckoutSession),
  
  createSetupSession: vi.fn().mockResolvedValue(mockSetupSession),
  
  getSetupSession: vi.fn().mockResolvedValue({
    ...mockSetupSession,
    setup_intent: {
      payment_method: mockPaymentMethod,
    },
  }),
  
  setDefaultPaymentMethod: vi.fn().mockResolvedValue(mockCustomer),
  
  createSubscription: vi.fn().mockResolvedValue(mockStripeSubscription),
  
  getSubscription: vi.fn().mockResolvedValue(mockStripeSubscription),
  
  updateSubscription: vi.fn().mockResolvedValue(mockStripeSubscription),
  
  cancelSubscription: vi.fn().mockResolvedValue({
    ...mockStripeSubscription,
    status: 'canceled',
    canceled_at: Math.floor(Date.now() / 1000),
  }),
  
  addSubscriptionItem: vi.fn().mockResolvedValue({
    id: 'si_addon_mock123',
    price: { id: 'price_test_addon' },
  }),
  
  removeSubscriptionItem: vi.fn().mockResolvedValue({ deleted: true }),
  
  getPriceIdForPlan: vi.fn().mockImplementation((plan) => `price_test_${plan.toLowerCase()}`),
  
  getPortalSession: vi.fn().mockResolvedValue({
    id: 'bps_mock123',
    url: 'https://billing.stripe.com/mock',
  }),
  
  constructWebhookEvent: vi.fn().mockImplementation((payload, sig, secret) => {
    return JSON.parse(payload);
  }),
});

export default createStripeMocks;
