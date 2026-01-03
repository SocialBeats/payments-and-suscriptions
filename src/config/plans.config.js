/**
 * Configuración centralizada de planes de suscripción y AddOns
 * Alineado con SPACE pricing YAML - SocialBeats-1.0.yaml
 *
 * Para actualizar a planes de producción:
 * 1. Actualizar STRIPE_PRICE_* en .env con los nuevos Price IDs
 * 2. Actualizar prices en este archivo si los precios cambian
 * 3. Actualizar features/usageLimits si cambian las características
 *
 * @see SocialBeats-1.0.yaml para definiciones completas de features y limits
 */

/**
 * Definición de planes disponibles
 * Sincronizado con SocialBeats-1.0.yaml
 *
 * Planes:
 * - FREE: €0.00/mes - Plan gratuito con funcionalidades básicas
 * - PRO: €9.99/mes - Plan profesional con más límites y features
 * - STUDIO: €19.99/mes - Plan más avanzado con todo desbloqueado
 */
export const PLANS = {
  FREE: {
    name: 'FREE',
    displayName: 'Free',
    description: 'Free plan',
    price: 0.0, // EUR
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_FREE,
    features: {
      // Profile
      advancedProfile: true,
      banner: false,
      certificates: true,
      decoratives: false,
      // Beats
      beats: true,
      beatSize: true,
      storage: true,
      downloads: false,
      cover: false,
      promotedBeat: false,
      // Interactions
      publicPlaylists: true,
      playlists: true,
      collaborators: true,
      beatsPerPlaylist: true,
      privatePlaylists: false,
      // Analytics
      dashboards: true,
    },
    usageLimits: {
      // Profile
      maxCertificates: 5,
      // Beats
      maxBeats: 3,
      maxBeatSize: 10, // MB
      maxStorage: 30, // MB
      // Interactions
      maxPlaylists: 1,
      maxCollaborators: 3,
      maxBeatsPerPlaylist: 3,
      // Analytics
      maxDashboards: 3,
    },
  },
  PRO: {
    name: 'PRO',
    displayName: 'Pro',
    description: 'Pro plan',
    price: 9.99, // EUR
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_PRO,
    features: {
      // Profile
      advancedProfile: true,
      banner: true,
      certificates: true,
      decoratives: false,
      // Beats
      beats: true,
      beatSize: true,
      storage: true,
      downloads: false,
      cover: true,
      promotedBeat: false,
      // Interactions
      publicPlaylists: true,
      playlists: true,
      collaborators: true,
      beatsPerPlaylist: true,
      privatePlaylists: false,
      // Analytics
      dashboards: true,
    },
    usageLimits: {
      // Profile
      maxCertificates: 10,
      // Beats
      maxBeats: 30,
      maxBeatSize: 25, // MB
      maxStorage: 750, // MB
      // Interactions
      maxPlaylists: 10,
      maxCollaborators: 10,
      maxBeatsPerPlaylist: 30,
      // Analytics
      maxDashboards: 30,
    },
  },
  STUDIO: {
    name: 'STUDIO',
    displayName: 'Studio',
    description: 'Most advanced plan',
    price: 29.99, // EUR
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_STUDIO,
    features: {
      // Profile
      advancedProfile: true,
      banner: true,
      certificates: true,
      decoratives: true,
      // Beats
      beats: true,
      beatSize: true,
      storage: true,
      downloads: true,
      cover: true,
      promotedBeat: false,
      // Interactions
      publicPlaylists: true,
      playlists: true,
      collaborators: true,
      beatsPerPlaylist: true,
      privatePlaylists: true,
      // Analytics
      dashboards: true,
    },
    usageLimits: {
      // Profile
      maxCertificates: Infinity,
      // Beats
      maxBeats: Infinity,
      maxBeatSize: 50, // MB
      maxStorage: 1000, // MB
      // Interactions
      maxPlaylists: Infinity,
      maxCollaborators: 30,
      maxBeatsPerPlaylist: 250,
      // Analytics
      maxDashboards: Infinity,
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
  return 'FREE';
};

/**
 * ============================================================================
 * ADDONS CONFIGURATION
 * Sincronizado con SocialBeats-1.0.yaml
 * ============================================================================
 */

/**
 * Definición de AddOns disponibles
 *
 * AddOns:
 * - decoratives: €0.99/mes - Decorativos para foto de perfil
 * - promotedBeat: €2.99/mes - Promocionar beats
 * - extraDashboard: €1.49/mes - Dashboard extra
 */
export const ADDONS = {
  decoratives: {
    name: 'decoratives',
    displayName: 'Decorativos',
    description: 'Accede a decorativos exclusivos para tu foto de perfil',
    price: 0.99, // EUR
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_DECORATIVES,
    availableFor: ['FREE', 'PRO'],
    icon: '✨',
    features: {
      decoratives: true,
    },
    usageLimitsExtensions: {},
  },
  promotedBeat: {
    name: 'promotedBeat',
    displayName: 'Beat Promocionado',
    description: 'Promociona tus beats para obtener más visibilidad',
    price: 2.99, // EUR
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_PROMOTED_BEAT,
    availableFor: ['PRO', 'STUDIO'],
    icon: '🚀',
    features: {
      promotedBeat: true,
    },
    usageLimitsExtensions: {},
  },
  extraDashboard: {
    name: 'extraDashboard',
    displayName: 'Dashboard Extra',
    description: 'Añade un dashboard adicional a tu cuenta',
    price: 1.49, // EUR
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_EXTRA_DASHBOARD,
    availableFor: ['FREE', 'PRO'],
    icon: '📊',
    features: {},
    usageLimitsExtensions: {
      maxDashboards: 1,
    },
  },
};

/**
 * Obtener lista de nombres de AddOns válidos
 * @returns {string[]} Array de nombres de AddOns
 */
export const getValidAddOns = () => {
  return Object.keys(ADDONS);
};

/**
 * Verificar si un AddOn es válido
 * @param {string} addonName - Nombre del AddOn
 * @returns {boolean}
 */
export const isValidAddOn = (addonName) => {
  return addonName in ADDONS;
};

/**
 * Obtener configuración de un AddOn
 * @param {string} addonName - Nombre del AddOn
 * @returns {Object|null} Configuración del AddOn o null si no existe
 */
export const getAddOnConfig = (addonName) => {
  return ADDONS[addonName] || null;
};

/**
 * Obtener precio de un AddOn
 * @param {string} addonName - Nombre del AddOn
 * @returns {number} Precio en EUR
 */
export const getAddOnPrice = (addonName) => {
  return ADDONS[addonName]?.price || 0;
};

/**
 * Obtener Stripe Price ID de un AddOn
 * @param {string} addonName - Nombre del AddOn
 * @returns {string|null} Price ID de Stripe
 */
export const getAddOnStripePriceId = (addonName) => {
  return ADDONS[addonName]?.stripePriceId || null;
};

/**
 * Verificar si un AddOn está disponible para un plan
 * @param {string} addonName - Nombre del AddOn
 * @param {string} planName - Nombre del plan
 * @returns {boolean}
 */
export const isAddOnAvailableForPlan = (addonName, planName) => {
  const addon = ADDONS[addonName];
  if (!addon) return false;
  return addon.availableFor.includes(planName);
};

/**
 * Obtener AddOns disponibles para un plan
 * @param {string} planName - Nombre del plan
 * @returns {Object[]} Array de configuraciones de AddOns disponibles
 */
export const getAddOnsForPlan = (planName) => {
  return Object.values(ADDONS).filter((addon) =>
    addon.availableFor.includes(planName)
  );
};

/**
 * Obtener nombre de AddOn desde Price ID
 * @param {string} priceId - Price ID de Stripe
 * @returns {string|null} Nombre del AddOn
 */
export const getAddOnNameFromPriceId = (priceId) => {
  for (const [addonName, config] of Object.entries(ADDONS)) {
    if (config.stripePriceId === priceId) {
      return addonName;
    }
  }
  return null;
};

/**
 * Exportar constantes para validación
 */
export const PLAN_NAMES = getValidPlans();
export const FREE_PLAN = getDefaultFreePlan();
export const ADDON_NAMES = getValidAddOns();

export default {
  PLANS,
  ADDONS,
  PLAN_NAMES,
  ADDON_NAMES,
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
  // AddOns exports
  getValidAddOns,
  isValidAddOn,
  getAddOnConfig,
  getAddOnPrice,
  getAddOnStripePriceId,
  isAddOnAvailableForPlan,
  getAddOnsForPlan,
  getAddOnNameFromPriceId,
};
