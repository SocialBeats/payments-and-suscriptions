import Stripe from 'stripe';
import logger from '../../logger.js';

// Validación crítica en producción
if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
  throw new Error('FATAL: STRIPE_SECRET_KEY is not defined in production environment');
}

// Inicializar cliente de Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-12-18.acacia', // Usar última versión estable
});

// Exportar cliente de Stripe para uso directo cuando sea necesario
export { stripe };

// Mapeo de planes a Price IDs de Stripe
// Alineado con planes de SPACE: BASIC (€0) y PREMIUM (€10/mes)
const PRICE_IDS = {
  BASIC: process.env.STRIPE_PRICE_BASIC,
  PREMIUM: process.env.STRIPE_PRICE_PREMIUM,
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
    logger.info(`- invoice_settings.default_payment_method: ${customer.invoice_settings?.default_payment_method}`);
    logger.info(`- default_source: ${customer.default_source}`);
    
    // Verificar si tiene default_payment_method o invoice_settings.default_payment_method
    const hasDefaultPaymentMethod = customer.default_payment_method || 
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
      logger.info(`✅ Customer ${customerId} has ${paymentMethods.data.length} payment method(s)`);
      return true;
    }
    
    logger.warn(`❌ Customer ${customerId} has NO payment methods`);
    return false;
  } catch (error) {
    logger.error(`Error checking payment method for customer ${customerId}: ${error.message}`);
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

    logger.info(`Setup session created: ${session.id} for customer: ${customerId}`);
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
    logger.info(`Setting payment method ${paymentMethodId} as default for customer ${customerId}`);
    
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

    logger.info(`Checkout session created: ${session.id} for customer: ${customerId}`);
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
export const cancelSubscription = async (subscriptionId, atPeriodEnd = true) => {
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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // En desarrollo, permitir webhooks sin verificación si no hay secret configurado
    if (!webhookSecret || webhookSecret.includes('your_webhook_secret_here') || webhookSecret.includes('dummy')) {
      logger.warn('⚠️  Webhook signature verification DISABLED (development mode)');
      logger.warn('⚠️  In production, configure STRIPE_WEBHOOK_SECRET properly!');
      
      // Parsear el payload manualmente sin verificar firma
      const event = JSON.parse(payload.toString());
      logger.info(`Webhook received (unverified): ${event.type}`);
      return event;
    }

    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    logger.info(`✅ Webhook signature verified for event: ${event.type}`);
    return event;
  } catch (error) {
    logger.error(`Webhook signature verification failed: ${error.message}`);
    throw new Error('Invalid webhook signature');
  }
};

/**
 * Obtener el Price ID según el tipo de plan
 *
 * @param {string} planType - Tipo de plan (BASIC, PRO, PREMIUM)
 * @returns {string} Price ID de Stripe
 */
export const getPriceIdForPlan = (planType) => {
  const priceId = PRICE_IDS[planType];

  if (!priceId) {
    throw new Error(`Price ID not configured for plan: ${planType}`);
  }

  return priceId;
};

/**
 * Obtener el tipo de plan basado en el Price ID
 *
 * @param {string} priceId - Price ID de Stripe
 * @returns {string} Tipo de plan
 */
export const getPlanTypeFromPriceId = (priceId) => {
  for (const [planType, id] of Object.entries(PRICE_IDS)) {
    if (id === priceId) {
      return planType;
    }
  }
  return 'FREE'; // Default si no se encuentra
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
export const createFreeSubscription = async ({ customerId, priceId, metadata = {} }) => {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata,
      // No requiere payment_method porque el precio es €0
    });

    logger.info(`Free subscription created: ${subscription.id} for customer: ${customerId}`);
    return subscription;
  } catch (error) {
    logger.error(`Error creating free subscription: ${error.message}`);
    throw new Error('Failed to create free subscription');
  }
};

/**
 * Actualizar el plan de una suscripción existente
 * Maneja upgrades y downgrades con prorrateo automático
 *
 * @param {Object} params - Parámetros de actualización
 * @param {string} params.subscriptionId - ID de la suscripción a actualizar
 * @param {string} params.newPriceId - Nuevo Price ID
 * @param {string} params.prorationBehavior - Comportamiento de prorrateo:
 *   - 'create_prorations' (default): Crea cargos/créditos prorrateados
 *   - 'none': No prorratear, aplicar cambio al inicio del siguiente periodo
 *   - 'always_invoice': Siempre crear una factura inmediata
 * @returns {Promise<Object>} Suscripción actualizada
 */
export const updateSubscriptionPlan = async ({
  subscriptionId,
  newPriceId,
  prorationBehavior = 'create_prorations',
}) => {
  try {
    // Obtener la suscripción actual
    const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (!currentSubscription || !currentSubscription.items.data[0]) {
      throw new Error('Invalid subscription or subscription items');
    }

    // Obtener el subscription item ID (necesario para actualizar)
    const subscriptionItemId = currentSubscription.items.data[0].id;
    const currentPriceId = currentSubscription.items.data[0].price.id;

    // Si el precio es el mismo, no hacer nada
    if (currentPriceId === newPriceId) {
      logger.info(`Subscription ${subscriptionId} already has price ${newPriceId}`);
      return currentSubscription;
    }

    logger.info(
      `Updating subscription ${subscriptionId} from ${currentPriceId} to ${newPriceId}`
    );

    // Actualizar la suscripción con el nuevo precio
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscriptionItemId,
          price: newPriceId,
        },
      ],
      proration_behavior: prorationBehavior,
      // billing_cycle_anchor: 'unchanged', // Mantener el ciclo de facturación
    });

    logger.info(
      `Subscription ${subscriptionId} updated successfully with proration: ${prorationBehavior}`
    );
    return updatedSubscription;
  } catch (error) {
    logger.error(`Error updating subscription plan: ${error.message}`);
    throw new Error(`Failed to update subscription plan: ${error.message}`);
  }
};

export default stripe;
