/**
 * Configuración centralizada de planes de suscripción
 * Alineado con SPACE pricing YAML
 * 
 * Para actualizar a planes de producción:
 * 1. Actualizar STRIPE_PRICE_* en .env con los nuevos Price IDs
 * 2. Actualizar prices en este archivo si los precios cambian
 * 3. Actualizar features/usageLimits si cambian las características
 * 
 * @see SPACE pricing.yml para definiciones completas de features y limits
 */

/**
 * Definición de planes disponibles
 * Sincronizado con SPACE pricing.yml
 */
export const PLANS = {
  BASIC: {
    name: 'BASIC',
    displayName: 'Basic',
    description: 'Enjoy daily news about the SPACE!',
    price: 0.0, // EUR
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_BASIC,
    features: {
      news: true,
      sideAds: true,
      bottomAd: true,
    },
    usageLimits: {
      maxNews: 2, // por día
    },
  },
  PREMIUM: {
    name: 'PREMIUM',
    displayName: 'Premium',
    description: 'Disable ads and read more news!',
    price: 10.0, // EUR
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_PREMIUM,
    features: {
      news: true,
      sideAds: false, // Ads desactivados
      bottomAd: false, // Ads desactivados
    },
    usageLimits: {
      maxNews: 10, // por día
    },
  },
};

/**
 * Obtener lista de nombres de planes válidos
 * @returns {string[]} Array de nombres de planes
 */
export const getValidPlans = () => {
  return Object.keys(PLANS);
};

/**
 * Verificar si un plan es válido
 * @param {string} planName - Nombre del plan
 * @returns {boolean}
 */
export const isValidPlan = (planName) => {
  return planName in PLANS;
};

/**
 * Obtener configuración de un plan
 * @param {string} planName - Nombre del plan
 * @returns {Object|null} Configuración del plan o null si no existe
 */
export const getPlanConfig = (planName) => {
  return PLANS[planName] || null;
};

/**
 * Obtener precio de un plan
 * @param {string} planName - Nombre del plan
 * @returns {number} Precio en EUR
 */
export const getPlanPrice = (planName) => {
  return PLANS[planName]?.price || 0;
};

/**
 * Obtener Stripe Price ID de un plan
 * @param {string} planName - Nombre del plan
 * @returns {string|null} Price ID de Stripe
 */
export const getStripePriceId = (planName) => {
  return PLANS[planName]?.stripePriceId || null;
};

/**
 * Determinar si un cambio de plan es upgrade o downgrade
 * @param {string} currentPlan - Plan actual
 * @param {string} newPlan - Plan nuevo
 * @returns {Object} { isUpgrade: boolean, isDowngrade: boolean, priceDiff: number }
 */
export const comparePlans = (currentPlan, newPlan) => {
  const currentPrice = getPlanPrice(currentPlan);
  const newPrice = getPlanPrice(newPlan);
  const priceDiff = newPrice - currentPrice;

  return {
    isUpgrade: priceDiff > 0,
    isDowngrade: priceDiff < 0,
    isSamePlan: priceDiff === 0,
    priceDiff,
    currentPrice,
    newPrice,
  };
};

/**
 * Verificar si un plan requiere método de pago
 * @param {string} planName - Nombre del plan
 * @returns {boolean}
 */
export const planRequiresPayment = (planName) => {
  return getPlanPrice(planName) > 0;
};

/**
 * Obtener mapeo de Price ID a nombre de plan
 * Útil para webhooks de Stripe
 * @param {string} priceId - Price ID de Stripe
 * @returns {string|null} Nombre del plan
 */
export const getPlanNameFromPriceId = (priceId) => {
  for (const [planName, config] of Object.entries(PLANS)) {
    if (config.stripePriceId === priceId) {
      return planName;
    }
  }
  return null;
};

/**
 * Obtener plan por defecto (gratuito)
 * @returns {string} Nombre del plan gratuito
 */
export const getDefaultFreePlan = () => {
  return 'BASIC';
};

/**
 * Exportar constantes para validación
 */
export const PLAN_NAMES = getValidPlans();
export const FREE_PLAN = getDefaultFreePlan();

export default {
  PLANS,
  PLAN_NAMES,
  FREE_PLAN,
  getValidPlans,
  isValidPlan,
  getPlanConfig,
  getPlanPrice,
  getStripePriceId,
  comparePlans,
  planRequiresPayment,
  getPlanNameFromPriceId,
  getDefaultFreePlan,
};
