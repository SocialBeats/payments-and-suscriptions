import Subscription from '../models/Subscription.js';
import * as stripeService from '../services/stripeService.js';
import * as spaceService from '../services/spaceService.js';
import logger from '../../logger.js';
import {
  ADDONS,
  getValidAddOns,
  isValidAddOn,
  getAddOnConfig,
  isAddOnAvailableForPlan,
  getAddOnsForPlan,
  getAddOnStripePriceId,
} from '../config/plans.config.js';

/**
 * Obtener todos los AddOns disponibles
 *
 * @route GET /api/v1/payments/addons
 * @access Public
 */
export const getAvailableAddOns = async (req, res) => {
  try {
    // Si el usuario está autenticado, filtrar por su plan
    const userId = req.user?.id;
    let addons = Object.values(ADDONS);

    if (userId) {
      const subscription = await Subscription.findOne({ userId });
      if (subscription) {
        // Filtrar AddOns disponibles para el plan del usuario
        addons = getAddOnsForPlan(subscription.planType);

        // Marcar cuáles ya tiene activos
        addons = addons.map((addon) => ({
          ...addon,
          isActive: subscription.hasAddOn(addon.name),
          // No exponer el stripePriceId al frontend
          stripePriceId: undefined,
        }));
      }
    }

    // Limpiar stripePriceId para respuesta pública
    const sanitizedAddons = addons.map(({ stripePriceId, ...rest }) => rest);

    res.status(200).json({
      addons: sanitizedAddons,
      total: sanitizedAddons.length,
    });
  } catch (error) {
    logger.error(`Error getting available addons: ${error.message}`);
    res.status(500).json({
      error: 'ADDONS_FETCH_ERROR',
      message: 'Failed to fetch available add-ons',
      details: error.message,
    });
  }
};

/**
 * Obtener AddOns del usuario actual
 *
 * @route GET /api/v1/payments/addons/my
 * @access Private (requiere JWT)
 */
export const getMyAddOns = async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      return res.status(404).json({
        error: 'SUBSCRIPTION_NOT_FOUND',
        message: 'No subscription found for this user',
      });
    }

    // Obtener AddOns activos con su info completa
    const activeAddOns = subscription.activeAddOns
      .filter((addon) => addon.status === 'active')
      .map((addon) => {
        const config = getAddOnConfig(addon.name);
        return {
          name: addon.name,
          displayName: config?.displayName || addon.name,
          description: config?.description || '',
          price: config?.price || 0,
          icon: config?.icon || '📦',
          purchasedAt: addon.purchasedAt,
          status: addon.status,
        };
      });

    // Obtener AddOns disponibles para comprar
    const availableAddOns = getAddOnsForPlan(subscription.planType)
      .filter((addon) => !subscription.hasAddOn(addon.name))
      .map(({ stripePriceId, ...rest }) => rest);

    res.status(200).json({
      planType: subscription.planType,
      activeAddOns,
      availableAddOns,
    });
  } catch (error) {
    logger.error(`Error getting user addons: ${error.message}`);
    res.status(500).json({
      error: 'ADDONS_FETCH_ERROR',
      message: 'Failed to fetch user add-ons',
      details: error.message,
    });
  }
};

/**
 * Comprar un AddOn
 *
 * @route POST /api/v1/payments/addons/purchase
 * @access Private (requiere JWT)
 */
export const purchaseAddOn = async (req, res) => {
  try {
    const userId = req.user.id;
    const username = req.user.username;
    const { addonName } = req.body;

    // Validaciones
    if (!addonName) {
      return res.status(400).json({
        error: 'MISSING_ADDON_NAME',
        message: 'AddOn name is required',
      });
    }

    if (!isValidAddOn(addonName)) {
      return res.status(400).json({
        error: 'INVALID_ADDON',
        message: `Invalid add-on: ${addonName}. Valid add-ons: ${getValidAddOns().join(', ')}`,
      });
    }

    // Buscar suscripción
    const subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      return res.status(404).json({
        error: 'SUBSCRIPTION_NOT_FOUND',
        message: 'No subscription found. Please subscribe to a plan first.',
      });
    }

    // Verificar que la suscripción esté activa
    if (!subscription.isActive()) {
      return res.status(400).json({
        error: 'SUBSCRIPTION_NOT_ACTIVE',
        message: 'Your subscription must be active to purchase add-ons',
      });
    }

    // Verificar que el AddOn esté disponible para el plan
    if (!isAddOnAvailableForPlan(addonName, subscription.planType)) {
      return res.status(400).json({
        error: 'ADDON_NOT_AVAILABLE',
        message: `Add-on "${addonName}" is not available for plan ${subscription.planType}`,
        availableFor: getAddOnConfig(addonName)?.availableFor || [],
      });
    }

    // Verificar que no tenga ya este AddOn
    if (subscription.hasAddOn(addonName)) {
      return res.status(400).json({
        error: 'ADDON_ALREADY_ACTIVE',
        message: `You already have the "${addonName}" add-on active`,
      });
    }

    // Verificar que tenga suscripción en Stripe
    if (!subscription.stripeSubscriptionId) {
      return res.status(400).json({
        error: 'NO_STRIPE_SUBSCRIPTION',
        message:
          'No active Stripe subscription found. Please upgrade from FREE plan first.',
      });
    }

    const addonConfig = getAddOnConfig(addonName);
    const addonPriceId = getAddOnStripePriceId(addonName);

    if (!addonPriceId) {
      return res.status(500).json({
        error: 'ADDON_NOT_CONFIGURED',
        message: `Add-on "${addonName}" is not properly configured in Stripe`,
      });
    }

    logger.info(
      `User ${userId} purchasing add-on: ${addonName} (${addonPriceId})`
    );

    // Verificar método de pago
    const hasPaymentMethod = await stripeService.customerHasPaymentMethod(
      subscription.stripeCustomerId
    );

    if (!hasPaymentMethod) {
      // Crear sesión de setup para añadir método de pago
      let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      frontendUrl = frontendUrl.replace(/\/$/, '');

      const setupSession = await stripeService.createSetupSession({
        customerId: subscription.stripeCustomerId,
        successUrl: `${frontendUrl}/app/pricing?setup=success&addon=${addonName}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${frontendUrl}/app/pricing?setup=canceled`,
        metadata: {
          userId,
          username,
          pendingAddon: addonName,
        },
      });

      return res.status(402).json({
        error: 'PAYMENT_METHOD_REQUIRED',
        message: 'Payment method required to purchase add-on',
        setupUrl: setupSession.url,
        setupSessionId: setupSession.id,
      });
    }

    // Añadir item a la suscripción existente en Stripe
    const subscriptionItem = await stripeService.addSubscriptionItem({
      subscriptionId: subscription.stripeSubscriptionId,
      priceId: addonPriceId,
    });

    logger.info(
      `Add-on item created in Stripe: ${subscriptionItem.id} for user ${userId}`
    );

    // Guardar en base de datos
    subscription.activeAddOns.push({
      name: addonName,
      stripeSubscriptionItemId: subscriptionItem.id,
      stripePriceId: addonPriceId,
      purchasedAt: new Date(),
      status: 'active',
    });
    await subscription.save();

    // Sincronizar con SPACE
    try {
      const activeAddOnNames = subscription.getActiveAddOnNames();
      await spaceService.updateSpaceContract({
        userId,
        plan: subscription.planType,
        addOns: {
            socialbeats: formatAddOnsForSpace(activeAddOnNames),
        },
      });
      logger.info(`SPACE contract updated with add-on ${addonName}`);
    } catch (spaceError) {
      logger.error(`Failed to sync add-on with SPACE: ${spaceError.message}`);
      // No fallar la request, los webhooks pueden sincronizar después
    }

    res.status(200).json({
      message: `Add-on "${addonConfig.displayName}" purchased successfully`,
      addon: {
        name: addonName,
        displayName: addonConfig.displayName,
        price: addonConfig.price,
        icon: addonConfig.icon,
        status: 'active',
        purchasedAt: new Date(),
      },
      subscription: {
        planType: subscription.planType,
        activeAddOns: subscription.getActiveAddOnNames(),
      },
    });
  } catch (error) {
    logger.error(`Error purchasing add-on: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    res.status(500).json({
      error: 'ADDON_PURCHASE_ERROR',
      message: 'Failed to purchase add-on',
      details: error.message,
    });
  }
};

/**
 * Cancelar un AddOn
 *
 * @route DELETE /api/v1/payments/addons/:addonName
 * @access Private (requiere JWT)
 */
export const cancelAddOn = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addonName } = req.params;

    if (!isValidAddOn(addonName)) {
      return res.status(400).json({
        error: 'INVALID_ADDON',
        message: `Invalid add-on: ${addonName}`,
      });
    }

    const subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      return res.status(404).json({
        error: 'SUBSCRIPTION_NOT_FOUND',
        message: 'No subscription found for this user',
      });
    }

    // Buscar el AddOn activo
    const addonIndex = subscription.activeAddOns.findIndex(
      (addon) => addon.name === addonName && addon.status === 'active'
    );

    if (addonIndex === -1) {
      return res.status(404).json({
        error: 'ADDON_NOT_FOUND',
        message: `Add-on "${addonName}" is not active on your subscription`,
      });
    }

    const addon = subscription.activeAddOns[addonIndex];

    logger.info(`User ${userId} canceling add-on: ${addonName}`);

    // Eliminar item de la suscripción en Stripe
    if (addon.stripeSubscriptionItemId) {
      try {
        await stripeService.removeSubscriptionItem(
          addon.stripeSubscriptionItemId
        );
        logger.info(
          `Add-on item removed from Stripe: ${addon.stripeSubscriptionItemId}`
        );
      } catch (stripeError) {
        logger.error(
          `Failed to remove item from Stripe: ${stripeError.message}`
        );
        // Continuar de todas formas para limpiar la DB
      }
    }

    // Actualizar estado en base de datos
    subscription.activeAddOns[addonIndex].status = 'canceled';
    await subscription.save();

    // Sincronizar con SPACE
    try {
      const activeAddOnNames = subscription.getActiveAddOnNames();
      await spaceService.updateSpaceContract({
        userId,
        plan: subscription.planType,
        addOns: formatAddOnsForSpace(activeAddOnNames),
      });
      logger.info(`SPACE contract updated after canceling add-on ${addonName}`);
    } catch (spaceError) {
      logger.error(
        `Failed to sync add-on cancellation with SPACE: ${spaceError.message}`
      );
    }

    const addonConfig = getAddOnConfig(addonName);

    res.status(200).json({
      message: `Add-on "${addonConfig.displayName}" canceled successfully`,
      addon: {
        name: addonName,
        displayName: addonConfig.displayName,
        status: 'canceled',
      },
      subscription: {
        planType: subscription.planType,
        activeAddOns: subscription.getActiveAddOnNames(),
      },
    });
  } catch (error) {
    logger.error(`Error canceling add-on: ${error.message}`);
    res.status(500).json({
      error: 'ADDON_CANCEL_ERROR',
      message: 'Failed to cancel add-on',
      details: error.message,
    });
  }
};

/**
 * Completar compra de AddOn después de setup de método de pago
 *
 * @route POST /api/v1/payments/addons/complete-setup
 * @access Private (requiere JWT)
 */
export const completeAddOnSetup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addonName } = req.body;

    if (!addonName) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'Addon name is required',
      });
    }

    logger.info(
      `Completing add-on setup for user ${userId}, addon: ${addonName}`
    );

    // Verificar que el AddOn es válido
    if (!isValidAddOn(addonName)) {
      return res.status(400).json({
        error: 'INVALID_ADDON',
        message: `Invalid add-on: ${addonName}`,
        validAddOns: getValidAddOns(),
      });
    }

    // Buscar la suscripción del usuario para obtener el customerId
    const subscription = await Subscription.findOne({ userId });

    if (!subscription || !subscription.stripeCustomerId) {
      return res.status(404).json({
        error: 'SUBSCRIPTION_NOT_FOUND',
        message: 'No subscription found for this user',
      });
    }

    // Después de completar el setup, el payment method está adjunto pero NO como default
    // Necesitamos establecerlo como default para que Stripe pueda cobrar
    try {
      const paymentMethods = await stripeService.stripe.paymentMethods.list({
        customer: subscription.stripeCustomerId,
        type: 'card',
        limit: 1,
      });

      if (paymentMethods.data.length > 0) {
        const paymentMethodId = paymentMethods.data[0].id;
        logger.info(
          `🔧 Setting payment method ${paymentMethodId} as default for customer ${subscription.stripeCustomerId}`
        );

        await stripeService.setDefaultPaymentMethod(
          subscription.stripeCustomerId,
          paymentMethodId
        );

        logger.info(
          `✅ Payment method ${paymentMethodId} set as default successfully`
        );
      } else {
        logger.warn(
          `❌ No payment methods found for customer ${subscription.stripeCustomerId} after setup`
        );
        return res.status(400).json({
          error: 'NO_PAYMENT_METHOD',
          message:
            'Payment method setup was not completed. Please try adding a payment method again.',
        });
      }
    } catch (pmError) {
      logger.error(`Error setting default payment method: ${pmError.message}`);
      return res.status(500).json({
        error: 'PAYMENT_METHOD_ERROR',
        message: 'Failed to configure payment method',
        details: pmError.message,
      });
    }

    // Ahora proceder con la compra del AddOn
    // Reutilizamos la lógica de purchaseAddOn
    req.body.addonName = addonName;
    return purchaseAddOn(req, res);
  } catch (error) {
    logger.error(`Error completing add-on setup: ${error.message}`);
    res.status(500).json({
      error: 'ADDON_SETUP_ERROR',
      message: 'Failed to complete add-on setup',
      details: error.message,
    });
  }
};

/**
 * Formatear AddOns para el formato que espera SPACE
 * SPACE espera: { addonName: quantity, ... }
 *
 * @param {string[]} addonNames - Array de nombres de AddOns activos
 * @returns {Object} Objeto con formato para SPACE
 */
const formatAddOnsForSpace = (addonNames) => {
  const result = {};
  for (const name of addonNames) {
    result[name] = 1; // Cantidad siempre 1 para nuestros AddOns
  }
  return result;
};

export default {
  getAvailableAddOns,
  getMyAddOns,
  purchaseAddOn,
  cancelAddOn,
  completeAddOnSetup,
};
