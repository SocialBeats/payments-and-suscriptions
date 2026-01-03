import Stripe from 'stripe';
import logger from '../../logger.js';

// Validación crítica en producción
if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    'FATAL: STRIPE_SECRET_KEY is not defined in production environment'
  );
}

// Inicializar cliente de Stripe
const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
  {
    apiVersion: '2024-12-18.acacia', // Usar última versión estable
  }
);

// Exportar cliente de Stripe para uso directo cuando sea necesario
export { stripe };

// Importar configuración centralizada de planes
import {
  getStripePriceId,
  getPlanNameFromPriceId,
} from '../config/plans.config.js';

// DEPRECATED: Usar plans.config.js en su lugar
// Mantenido temporalmente para compatibilidad con código legacy
// Los nuevos planes son: FREE, PRO, STUDIO
const PRICE_IDS = {
  FREE: process.env.STRIPE_PRICE_FREE,
  PRO: process.env.STRIPE_PRICE_PRO,
  STUDIO: process.env.STRIPE_PRICE_STUDIO,
};

/**
 * Verificar si un Customer tiene un método de pago válido
 *
 * @param {string} customerId - ID del customer de Stripe
 * @returns {Promise<boolean>} True si tiene método de pago
 */
export const customerHasPaymentMethod = async (customerId) => {
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['default_source', 'invoice_settings.default_payment_method'],
    });

    logger.info(`Checking payment method for customer ${customerId}`);
    logger.info(`- default_payment_method: ${customer.default_payment_method}`);
    logger.info(
      `- invoice_settings.default_payment_method: ${customer.invoice_settings?.default_payment_method}`
    );
    logger.info(`- default_source: ${customer.default_source}`);

    // Verificar si tiene default_payment_method o invoice_settings.default_payment_method
    const hasDefaultPaymentMethod =
      customer.default_payment_method ||
      customer.invoice_settings?.default_payment_method;

    if (hasDefaultPaymentMethod) {
      logger.info(`✅ Customer ${customerId} has default payment method`);
      return true;
    }

    // Verificar si tiene default_source (tarjeta antigua)
    if (customer.default_source) {
      logger.info(`✅ Customer ${customerId} has default source`);
      return true;
    }

    // También verificar si tiene payment methods adjuntos
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });

    const hasPaymentMethods = paymentMethods.data.length > 0;

    if (hasPaymentMethods) {
      logger.info(
        `✅ Customer ${customerId} has ${paymentMethods.data.length} payment method(s)`
      );
      return true;
    }

    logger.warn(`❌ Customer ${customerId} has NO payment methods`);
    return false;
  } catch (error) {
    logger.error(
      `Error checking payment method for customer ${customerId}: ${error.message}`
    );
    // En caso de error, asumimos que NO tiene método de pago (fail-safe)
    return false;
  }
};

/**
 * Crear una sesión de Setup para añadir método de pago
 * Sin cargo, solo para recopilar información de tarjeta
 *
 * @param {Object} params - Parámetros de la sesión
 * @param {string} params.customerId - ID del customer de Stripe
 * @param {string} params.successUrl - URL de redirección en caso de éxito
 * @param {string} params.cancelUrl - URL de redirección en caso de cancelación
 * @param {Object} params.metadata - Metadata adicional
 * @returns {Promise<Object>} Sesión de setup de Stripe
 */
export const createSetupSession = async ({
  customerId,
  successUrl,
  cancelUrl,
  metadata = {},
}) => {
  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });

    logger.info(
      `Setup session created: ${session.id} for customer: ${customerId}`
    );
    return session;
  } catch (error) {
    logger.error(`Error creating setup session: ${error.message}`);
    throw new Error('Failed to create setup session');
  }
};

/**
 * Obtener detalles de una sesión de setup de Stripe
 *
 * @param {string} sessionId - ID de la sesión de setup
 * @returns {Promise<Object>} Detalles de la sesión
 */
export const getSetupSession = async (sessionId) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['setup_intent', 'setup_intent.payment_method'],
    });
    logger.info(`Setup session retrieved: ${sessionId}`);
    return session;
  } catch (error) {
    logger.error(`Error retrieving setup session: ${error.message}`);
    throw new Error('Failed to retrieve setup session');
  }
};

/**
 * Configurar un payment method como default para un customer
 *
 * @param {string} customerId - ID del customer
 * @param {string} paymentMethodId - ID del payment method
 * @returns {Promise<Object>} Customer actualizado
 */
export const setDefaultPaymentMethod = async (customerId, paymentMethodId) => {
  try {
    logger.info(
      `Setting payment method ${paymentMethodId} as default for customer ${customerId}`
    );

    const customer = await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    logger.info(`✅ Default payment method set for customer ${customerId}`);
    return customer;
  } catch (error) {
    logger.error(`Error setting default payment method: ${error.message}`);
    throw new Error('Failed to set default payment method');
  }
};

/**
 * Crear o recuperar un Customer de Stripe
 *
 * @param {string} email - Email del usuario
 * @param {Object} metadata - Metadata adicional (userId, username)
 * @returns {Promise<Object>} Customer de Stripe
 */
export const getOrCreateCustomer = async (email, metadata = {}) => {
  try {
    // Buscar customer existente por email
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      logger.info(`Stripe customer found for email: ${email}`);
      return existingCustomers.data[0];
    }

    // Crear nuevo customer
    const customer = await stripe.customers.create({
      email,
      metadata,
    });

    logger.info(`Stripe customer created: ${customer.id} for email: ${email}`);
    return customer;
  } catch (error) {
    logger.error(`Error getting/creating Stripe customer: ${error.message}`);
    throw new Error('Failed to create Stripe customer');
  }
};

/**
 * Crear una sesión de Checkout de Stripe
 *
 * @param {Object} params - Parámetros de la sesión
 * @param {string} params.customerId - ID del customer de Stripe
 * @param {string} params.priceId - ID del precio en Stripe
 * @param {string} params.successUrl - URL de redirección en caso de éxito
 * @param {string} params.cancelUrl - URL de redirección en caso de cancelación
 * @param {Object} params.metadata - Metadata para identificar el usuario
 * @returns {Promise<Object>} Sesión de checkout de Stripe
 */
export const createCheckoutSession = async ({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
  metadata = {},
}) => {
  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      subscription_data: {
        metadata, // También incluir metadata en la subscription
      },
      allow_promotion_codes: true, // Permitir códigos promocionales
      billing_address_collection: 'auto',
    });

    logger.info(
      `Checkout session created: ${session.id} for customer: ${customerId}`
    );
    return session;
  } catch (error) {
    logger.error(`Error creating checkout session: ${error.message}`);
    throw new Error('Failed to create checkout session');
  }
};

/**
 * Obtener detalles de una suscripción de Stripe
 *
 * @param {string} subscriptionId - ID de la suscripción
 * @returns {Promise<Object>} Detalles de la suscripción
 */
export const getSubscription = async (subscriptionId) => {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    logger.info(`Subscription retrieved: ${subscriptionId}`);
    return subscription;
  } catch (error) {
    logger.error(`Error retrieving subscription: ${error.message}`);
    throw new Error('Failed to retrieve subscription');
  }
};

/**
 * Cancelar una suscripción de Stripe
 *
 * @param {string} subscriptionId - ID de la suscripción
 * @param {boolean} atPeriodEnd - Si cancelar al final del periodo o inmediatamente
 * @returns {Promise<Object>} Suscripción cancelada
 */
export const cancelSubscription = async (
  subscriptionId,
  atPeriodEnd = true
) => {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: atPeriodEnd,
    });

    logger.info(
      `Subscription ${subscriptionId} scheduled for cancellation at period end: ${atPeriodEnd}`
    );
    return subscription;
  } catch (error) {
    logger.error(`Error canceling subscription: ${error.message}`);
    throw new Error('Failed to cancel subscription');
  }
};

/**
 * Cancelar inmediatamente una suscripción
 *
 * @param {string} subscriptionId - ID de la suscripción
 * @returns {Promise<Object>} Suscripción cancelada
 */
export const cancelSubscriptionImmediately = async (subscriptionId) => {
  try {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    logger.info(`Subscription canceled immediately: ${subscriptionId}`);
    return subscription;
  } catch (error) {
    logger.error(`Error canceling subscription immediately: ${error.message}`);
    throw new Error('Failed to cancel subscription immediately');
  }
};

/**
 * Verificar la firma de un webhook de Stripe
 *
 * @param {string} payload - Body del request (raw)
 * @param {string} signature - Firma del header stripe-signature
 * @returns {Object} Evento verificado de Stripe
 */
export const verifyWebhookSignature = (payload, signature) => {
  try {
    // En desarrollo, permitir webhooks sin verificación si no hay secret configurado
    if (
      !webhookSecret ||
      webhookSecret.includes('your_webhook_secret_here') ||
      webhookSecret.includes('dummy')
    ) {
      logger.warn(
        '⚠️  Webhook signature verification DISABLED (development mode)'
      );

      // Parsear el payload manualmente sin verificar firma
      const event = JSON.parse(payload.toString());
      logger.info(`Webhook received (unverified): ${event.type}`);
      return event;
    }

    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
    logger.info(`✅ Webhook signature verified for event: ${event.type}`);
    return event;
  } catch (error) {
    logger.error(`Webhook signature verification failed: ${error.message}`);
    throw new Error('Invalid webhook signature');
  }
};

/**
 * Obtener el Price ID según el tipo de plan
 * Usa la configuración centralizada de plans.config.js
 *
 * @param {string} planType - Tipo de plan (BASIC, PREMIUM, etc.)
 * @returns {string} Price ID de Stripe
 */
export const getPriceIdForPlan = (planType) => {
  const priceId = getStripePriceId(planType);

  if (!priceId) {
    throw new Error(`Price ID not configured for plan: ${planType}`);
  }

  return priceId;
};

/**
 * Obtener el tipo de plan basado en el Price ID
 * Usa la configuración centralizada de plans.config.js
 *
 * @param {string} priceId - Price ID de Stripe
 * @returns {string} Tipo de plan
 */
export const getPlanTypeFromPriceId = (priceId) => {
  const planName = getPlanNameFromPriceId(priceId);
  return planName || 'BASIC'; // Default al plan gratuito si no se encuentra
};

/**
 * Crear una suscripción gratuita directamente (sin checkout)
 * Para usuarios nuevos con plan FREE
 *
 * @param {Object} params - Parámetros de la suscripción
 * @param {string} params.customerId - ID del customer de Stripe
 * @param {string} params.priceId - Price ID del plan FREE (debe ser €0)
 * @param {Object} params.metadata - Metadata adicional
 * @returns {Promise<Object>} Suscripción creada
 */
export const createFreeSubscription = async ({
  customerId,
  priceId,
  metadata = {},
}) => {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata,
      // No requiere payment_method porque el precio es €0
    });

    logger.info(
      `Free subscription created: ${subscription.id} for customer: ${customerId}`
    );
    return subscription;
  } catch (error) {
    logger.error(`Error creating free subscription: ${error.message}`);
    throw new Error('Failed to create free subscription');
  }
};

/**
 * Actualizar el plan de una suscripción existente
 * Maneja upgrades y downgrades con comportamiento diferenciado:
 * - UPGRADE: Cobro prorrateado inmediato, acceso inmediato al nuevo plan
 * - DOWNGRADE: Mantiene plan actual hasta fin de periodo, luego cambia
 *
 * @param {Object} params - Parámetros de actualización
 * @param {string} params.subscriptionId - ID de la suscripción a actualizar
 * @param {string} params.newPriceId - Nuevo Price ID
 * @param {string} params.prorationBehavior - Comportamiento de prorrateo:
 *   - 'create_prorations' (default): Crea cargos/créditos prorrateados (para upgrades)
 *   - 'none': No prorratear, aplicar cambio al inicio del siguiente periodo
 *   - 'always_invoice': Siempre crear una factura inmediata
 * @param {boolean} params.isDowngrade - Si es un downgrade (cambio diferido)
 * @returns {Promise<Object>} Suscripción actualizada
 */
export const updateSubscriptionPlan = async ({
  subscriptionId,
  newPriceId,
  prorationBehavior = 'create_prorations',
  isDowngrade = false,
}) => {
  try {
    // Obtener la suscripción actual
    const currentSubscription =
      await stripe.subscriptions.retrieve(subscriptionId);

    if (!currentSubscription || !currentSubscription.items.data[0]) {
      throw new Error('Invalid subscription or subscription items');
    }

    // Obtener el subscription item ID (necesario para actualizar)
    const subscriptionItemId = currentSubscription.items.data[0].id;
    const currentPriceId = currentSubscription.items.data[0].price.id;

    // Si el precio es el mismo, no hacer nada
    if (currentPriceId === newPriceId) {
      logger.info(
        `Subscription ${subscriptionId} already has price ${newPriceId}`
      );
      return currentSubscription;
    }

    logger.info(
      `Updating subscription ${subscriptionId} from ${currentPriceId} to ${newPriceId} (isDowngrade: ${isDowngrade})`
    );

    // Para DOWNGRADES: Programar el cambio para el final del periodo actual
    if (isDowngrade) {
      // Primero, liberar cualquier schedule existente (sin cancelar la suscripción)
      const existingSchedules = await stripe.subscriptionSchedules.list({
        customer: currentSubscription.customer,
        limit: 10,
      });

      // Liberar schedules activos para esta suscripción
      for (const schedule of existingSchedules.data) {
        if (schedule.subscription === subscriptionId && schedule.status === 'active') {
          logger.info(`Releasing existing schedule ${schedule.id}`);
          await stripe.subscriptionSchedules.release(schedule.id);
        }
      }

      // Crear un schedule para cambiar el plan al final del periodo
      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: subscriptionId,
      });

      // Actualizar el schedule con las fases
      const currentPeriodEnd = currentSubscription.current_period_end;
      
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release', // La suscripción continúa después del schedule
        phases: [
          {
            // Fase 1: Mantener plan actual hasta el final del periodo
            items: [{ price: currentPriceId, quantity: 1 }],
            start_date: currentSubscription.current_period_start,
            end_date: currentPeriodEnd,
          },
          {
            // Fase 2: Cambiar al nuevo plan
            items: [{ price: newPriceId, quantity: 1 }],
            start_date: currentPeriodEnd,
            iterations: 1, // Al menos un periodo, luego se libera
          },
        ],
      });

      logger.info(
        `Downgrade scheduled: ${subscriptionId} will change to ${newPriceId} on ${new Date(currentPeriodEnd * 1000).toISOString()}`
      );

      // Retornar la suscripción actual (no ha cambiado aún)
      // Pero añadir info del cambio pendiente
      return {
        ...currentSubscription,
        scheduled_change: {
          newPriceId,
          effectiveDate: currentPeriodEnd,
          scheduleId: schedule.id,
        },
      };
    }

    // Para UPGRADES: Aplicar inmediatamente con prorrateo
    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        items: [
          {
            id: subscriptionItemId,
            price: newPriceId,
          },
        ],
        proration_behavior: prorationBehavior,
        // Forzar facturación inmediata en upgrades para cobrar la diferencia
        payment_behavior: 'error_if_incomplete',
      }
    );

    logger.info(
      `Subscription ${subscriptionId} updated successfully with proration: ${prorationBehavior}`
    );
    return updatedSubscription;
  } catch (error) {
    logger.error(`Error updating subscription plan: ${error.message}`);
    throw new Error(`Failed to update subscription plan: ${error.message}`);
  }
};

// ====================================================================
// ADDON MANAGEMENT - Subscription Items
// ====================================================================

/**
 * Add an AddOn to an existing subscription as a new subscription item
 * @param {Object} params - Parameters for adding subscription item
 * @param {string} params.subscriptionId - The Stripe subscription ID
 * @param {string} params.priceId - The Stripe price ID for the AddOn
 * @returns {Promise<Object>} The created subscription item
 */
export const addSubscriptionItem = async ({ subscriptionId, priceId }) => {
  try {
    logger.info(`Adding subscription item with price ${priceId} to subscription ${subscriptionId}`);
    
    const subscriptionItem = await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: priceId,
      quantity: 1,
      proration_behavior: 'create_prorations', // Cobrar prorrateo inmediato
    });
    
    logger.info(`Subscription item ${subscriptionItem.id} created successfully`);
    return subscriptionItem;
  } catch (error) {
    logger.error(`Error adding subscription item: ${error.message}`);
    throw new Error(`Failed to add subscription item: ${error.message}`);
  }
};

/**
 * Remove an AddOn from a subscription by deleting the subscription item
 * @param {string} subscriptionItemId - The Stripe subscription item ID to delete
 * @param {Object} options - Additional options
 * @param {boolean} options.clearUsage - Whether to clear metered usage (default: false)
 * @param {string} options.prorationBehavior - Proration behavior (default: 'create_prorations')
 * @returns {Promise<Object>} Confirmation of deletion
 */
export const removeSubscriptionItem = async (subscriptionItemId, options = {}) => {
  try {
    const { clearUsage = false, prorationBehavior = 'create_prorations' } = options;
    
    logger.info(`Removing subscription item ${subscriptionItemId}`);
    
    const deletedItem = await stripe.subscriptionItems.del(subscriptionItemId, {
      clear_usage: clearUsage,
      proration_behavior: prorationBehavior,
    });
    
    logger.info(`Subscription item ${subscriptionItemId} removed successfully`);
    return deletedItem;
  } catch (error) {
    logger.error(`Error removing subscription item: ${error.message}`);
    throw new Error(`Failed to remove subscription item: ${error.message}`);
  }
};

/**
 * List all subscription items for a subscription
 * @param {string} subscriptionId - The Stripe subscription ID
 * @returns {Promise<Array>} Array of subscription items
 */
export const listSubscriptionItems = async (subscriptionId) => {
  try {
    logger.info(`Listing subscription items for subscription ${subscriptionId}`);
    
    const items = await stripe.subscriptionItems.list({
      subscription: subscriptionId,
    });
    
    return items.data;
  } catch (error) {
    logger.error(`Error listing subscription items: ${error.message}`);
    throw new Error(`Failed to list subscription items: ${error.message}`);
  }
};

/**
 * Get a specific subscription item by ID
 * @param {string} subscriptionItemId - The Stripe subscription item ID
 * @returns {Promise<Object>} The subscription item
 */
export const getSubscriptionItem = async (subscriptionItemId) => {
  try {
    const item = await stripe.subscriptionItems.retrieve(subscriptionItemId);
    return item;
  } catch (error) {
    logger.error(`Error retrieving subscription item: ${error.message}`);
    throw new Error(`Failed to retrieve subscription item: ${error.message}`);
  }
};

export default stripe;
