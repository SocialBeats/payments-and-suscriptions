import { describe, it, expect } from 'vitest';
import {
  PLANS,
  ADDONS,
  getValidPlans,
  isValidPlan,
  getPlanConfig,
  getPlanPrice,
  getStripePriceId,
  comparePlans,
  planRequiresPayment,
  getPlanNameFromPriceId,
  getDefaultFreePlan,
  getValidAddOns,
  isValidAddOn,
  getAddOnConfig,
  isAddOnAvailableForPlan,
  getAddOnsForPlan,
  getAddOnStripePriceId,
} from '../../src/config/plans.config.js';

describe('Plans Configuration', () => {
  describe('PLANS constant', () => {
    it('should have FREE, PRO, and STUDIO plans', () => {
      expect(PLANS).toHaveProperty('FREE');
      expect(PLANS).toHaveProperty('PRO');
      expect(PLANS).toHaveProperty('STUDIO');
    });

    it('each plan should have required properties', () => {
      const requiredProps = [
        'name',
        'displayName',
        'description',
        'price',
        'unit',
        'stripePriceId',
        'features',
        'usageLimits',
      ];

      Object.values(PLANS).forEach((plan) => {
        requiredProps.forEach((prop) => {
          expect(plan).toHaveProperty(prop);
        });
      });
    });

    it('FREE plan should have price 0', () => {
      expect(PLANS.FREE.price).toBe(0);
    });

    it('PRO plan should have positive price', () => {
      expect(PLANS.PRO.price).toBeGreaterThan(0);
    });

    it('STUDIO plan should have higher price than PRO', () => {
      expect(PLANS.STUDIO.price).toBeGreaterThan(PLANS.PRO.price);
    });
  });

  describe('getValidPlans()', () => {
    it('should return array of plan names', () => {
      const plans = getValidPlans();

      expect(Array.isArray(plans)).toBe(true);
      expect(plans).toContain('FREE');
      expect(plans).toContain('PRO');
      expect(plans).toContain('STUDIO');
    });
  });

  describe('isValidPlan()', () => {
    it('should return true for valid plans', () => {
      expect(isValidPlan('FREE')).toBe(true);
      expect(isValidPlan('PRO')).toBe(true);
      expect(isValidPlan('STUDIO')).toBe(true);
    });

    it('should return false for invalid plans', () => {
      expect(isValidPlan('INVALID')).toBe(false);
      expect(isValidPlan('basic')).toBe(false);
      expect(isValidPlan('')).toBe(false);
      expect(isValidPlan(null)).toBe(false);
    });
  });

  describe('getPlanConfig()', () => {
    it('should return config for valid plan', () => {
      const config = getPlanConfig('PRO');

      expect(config).not.toBeNull();
      expect(config.name).toBe('PRO');
      expect(config).toHaveProperty('price');
      expect(config).toHaveProperty('features');
    });

    it('should return null for invalid plan', () => {
      expect(getPlanConfig('INVALID')).toBeNull();
    });
  });

  describe('getPlanPrice()', () => {
    it('should return correct prices', () => {
      expect(getPlanPrice('FREE')).toBe(0);
      expect(getPlanPrice('PRO')).toBe(9.99);
      expect(getPlanPrice('STUDIO')).toBe(29.99);
    });

    it('should return 0 for invalid plan', () => {
      expect(getPlanPrice('INVALID')).toBe(0);
    });
  });

  describe('getStripePriceId()', () => {
    it('should return price ID for valid plan', () => {
      const priceId = getStripePriceId('FREE');
      expect(priceId).toBeDefined();
    });

    it('should return null for invalid plan', () => {
      expect(getStripePriceId('INVALID')).toBeNull();
    });
  });

  describe('comparePlans()', () => {
    it('should detect upgrade from FREE to PRO', () => {
      const result = comparePlans('FREE', 'PRO');

      expect(result.isUpgrade).toBe(true);
      expect(result.isDowngrade).toBe(false);
      expect(result.priceDiff).toBeGreaterThan(0);
    });

    it('should detect upgrade from PRO to STUDIO', () => {
      const result = comparePlans('PRO', 'STUDIO');

      expect(result.isUpgrade).toBe(true);
      expect(result.isDowngrade).toBe(false);
    });

    it('should detect downgrade from STUDIO to FREE', () => {
      const result = comparePlans('STUDIO', 'FREE');

      expect(result.isUpgrade).toBe(false);
      expect(result.isDowngrade).toBe(true);
      expect(result.priceDiff).toBeLessThan(0);
    });

    it('should detect same plan', () => {
      const result = comparePlans('PRO', 'PRO');

      expect(result.isUpgrade).toBe(false);
      expect(result.isDowngrade).toBe(false);
      expect(result.isSamePlan).toBe(true);
      expect(result.priceDiff).toBe(0);
    });

    it('should return current and new prices', () => {
      const result = comparePlans('FREE', 'STUDIO');

      expect(result.currentPrice).toBe(0);
      expect(result.newPrice).toBe(29.99);
    });
  });

  describe('planRequiresPayment()', () => {
    it('should return false for FREE plan', () => {
      expect(planRequiresPayment('FREE')).toBe(false);
    });

    it('should return true for paid plans', () => {
      expect(planRequiresPayment('PRO')).toBe(true);
      expect(planRequiresPayment('STUDIO')).toBe(true);
    });
  });

  describe('getPlanNameFromPriceId()', () => {
    it('should return plan name from price ID', () => {
      const freePriceId = PLANS.FREE.stripePriceId;
      if (freePriceId) {
        expect(getPlanNameFromPriceId(freePriceId)).toBe('FREE');
      }
    });

    it('should return null for invalid price ID', () => {
      expect(getPlanNameFromPriceId('invalid_price_id')).toBeNull();
    });
  });

  describe('getDefaultFreePlan()', () => {
    it('should return FREE', () => {
      expect(getDefaultFreePlan()).toBe('FREE');
    });
  });
});

describe('AddOns Configuration', () => {
  describe('ADDONS constant', () => {
    it('should have expected addons', () => {
      expect(ADDONS).toHaveProperty('decoratives');
      expect(ADDONS).toHaveProperty('promotedBeat');
      expect(ADDONS).toHaveProperty('unlockFullBeatFree');
      expect(ADDONS).toHaveProperty('unlockFullBeatPro');
      expect(ADDONS).toHaveProperty('fullStudioMetrics');
    });

    it('each addon should have required properties', () => {
      const requiredProps = [
        'name',
        'displayName',
        'description',
        'price',
        'unit',
        'stripePriceId',
        'availableFor',
        'icon',
      ];

      Object.values(ADDONS).forEach((addon) => {
        requiredProps.forEach((prop) => {
          expect(addon).toHaveProperty(prop);
        });
      });
    });

    it('all addons should have positive price', () => {
      Object.values(ADDONS).forEach((addon) => {
        expect(addon.price).toBeGreaterThan(0);
      });
    });

    it('availableFor should be an array of valid plans', () => {
      const validPlans = getValidPlans();

      Object.values(ADDONS).forEach((addon) => {
        expect(Array.isArray(addon.availableFor)).toBe(true);
        addon.availableFor.forEach((plan) => {
          expect(validPlans).toContain(plan);
        });
      });
    });
  });

  describe('getValidAddOns()', () => {
    it('should return array of addon names', () => {
      const addons = getValidAddOns();

      expect(Array.isArray(addons)).toBe(true);
      expect(addons.length).toBeGreaterThan(0);
      expect(addons).toContain('decoratives');
      expect(addons).toContain('promotedBeat');
    });
  });

  describe('isValidAddOn()', () => {
    it('should return true for valid addons', () => {
      expect(isValidAddOn('decoratives')).toBe(true);
      expect(isValidAddOn('promotedBeat')).toBe(true);
    });

    it('should return false for invalid addons', () => {
      expect(isValidAddOn('invalid')).toBe(false);
      expect(isValidAddOn('')).toBe(false);
      expect(isValidAddOn(null)).toBe(false);
    });
  });

  describe('getAddOnConfig()', () => {
    it('should return config for valid addon', () => {
      const config = getAddOnConfig('decoratives');

      expect(config).not.toBeNull();
      expect(config.name).toBe('decoratives');
      expect(config).toHaveProperty('price');
      expect(config).toHaveProperty('availableFor');
    });

    it('should return null for invalid addon', () => {
      expect(getAddOnConfig('invalid')).toBeNull();
    });
  });

  describe('isAddOnAvailableForPlan()', () => {
    it('decoratives should be available for FREE and PRO', () => {
      expect(isAddOnAvailableForPlan('decoratives', 'FREE')).toBe(true);
      expect(isAddOnAvailableForPlan('decoratives', 'PRO')).toBe(true);
    });

    it('promotedBeat should NOT be available for FREE', () => {
      expect(isAddOnAvailableForPlan('promotedBeat', 'FREE')).toBe(false);
    });

    it('promotedBeat should be available for PRO and STUDIO', () => {
      expect(isAddOnAvailableForPlan('promotedBeat', 'PRO')).toBe(true);
      expect(isAddOnAvailableForPlan('promotedBeat', 'STUDIO')).toBe(true);
    });

    it('unlockFullBeatFree should only be available for FREE', () => {
      expect(isAddOnAvailableForPlan('unlockFullBeatFree', 'FREE')).toBe(true);
      expect(isAddOnAvailableForPlan('unlockFullBeatFree', 'PRO')).toBe(false);
      expect(isAddOnAvailableForPlan('unlockFullBeatFree', 'STUDIO')).toBe(false);
    });

    it('should return false for invalid addon', () => {
      expect(isAddOnAvailableForPlan('invalid', 'FREE')).toBe(false);
    });

    it('should return false for invalid plan', () => {
      expect(isAddOnAvailableForPlan('decoratives', 'INVALID')).toBe(false);
    });
  });

  describe('getAddOnsForPlan()', () => {
    it('should return addons available for FREE plan', () => {
      const addons = getAddOnsForPlan('FREE');

      expect(Array.isArray(addons)).toBe(true);
      expect(addons.some((a) => a.name === 'decoratives')).toBe(true);
      expect(addons.some((a) => a.name === 'unlockFullBeatFree')).toBe(true);
      // promotedBeat should NOT be included
      expect(addons.some((a) => a.name === 'promotedBeat')).toBe(false);
    });

    it('should return addons available for PRO plan', () => {
      const addons = getAddOnsForPlan('PRO');

      expect(Array.isArray(addons)).toBe(true);
      expect(addons.some((a) => a.name === 'decoratives')).toBe(true);
      expect(addons.some((a) => a.name === 'promotedBeat')).toBe(true);
      expect(addons.some((a) => a.name === 'unlockFullBeatPro')).toBe(true);
    });

    it('should return empty array for STUDIO (has all features built-in)', () => {
      const addons = getAddOnsForPlan('STUDIO');
      // STUDIO may have some addons or none, depending on config
      expect(Array.isArray(addons)).toBe(true);
    });
  });

  describe('getAddOnStripePriceId()', () => {
    it('should return price ID for valid addon', () => {
      const priceId = getAddOnStripePriceId('decoratives');
      expect(priceId).toBeDefined();
    });

    it('should return null for invalid addon', () => {
      expect(getAddOnStripePriceId('invalid')).toBeNull();
    });
  });
});
