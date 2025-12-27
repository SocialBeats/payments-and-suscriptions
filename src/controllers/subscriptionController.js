import Subscription from '../models/Subscription.js';
import * as stripeService from '../services/stripeService.js';
import * as spaceService from '../services/spaceService.js';
import logger from '../../logger.js';

/**
 * Crear una sesión de checkout de Stripe
 *
 * @route POST /api/v1/payments/checkout
 * @access Private (requiere JWT)
 */
export const createCheckoutSession = async (req, res) => {
  try {
    const { planType } = req.body;

    // Validación de datos
    if (!planType) {
      return res.status(400).json({
        error: 'MISSING_PLAN_TYPE',
        message: 'Plan type is required',
      });
    }

    // Validar plan válido (según configuración de SPACE)
    const validPlans = ['BASIC', 'PREMIUM'];
    if (!validPlans.includes(planType)) {
      return res.status(400).json({
        error: 'INVALID_PLAN_TYPE',
        message: `Plan type must be one of: ${validPlans.join(', ')}`,
      });
    }

    // Obtener información del usuario desde req.user (inyectado por authMiddleware)
    const userId = req.user.id;
    const username = req.user.username;
    const email = req.body.email || `${username}@socialbeats.com`;

    if (!userId || !username) {
      return res.status(401).json({
        error: 'MISSING_USER_INFO',
        message: 'User information not found in request',
      });
    }

    logger.info(`Creating checkout session for user ${userId} with plan: ${planType}`);

    // Obtener o crear customer de Stripe
    const customer = await stripeService.getOrCreateCustomer(email || `${username}@temp.com`, {
      userId,
      username,
    });

    // Verificar si ya existe una suscripción activa
    const existingSubscription = await Subscription.findOne({
      userId,
      status: { $in: ['active', 'trialing'] },
    });

    if (existingSubscription) {
      return res.status(409).json({
        error: 'SUBSCRIPTION_ALREADY_EXISTS',
        message: 'User already has an active subscription',
        subscription: {
          planType: existingSubscription.planType,
          status: existingSubscription.status,
        },
      });
    }

    // Obtener Price ID del plan
    const priceId = stripeService.getPriceIdForPlan(planType);

    // URLs de redirección
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const successUrl = `${frontendUrl}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/pricing?canceled=true`;

    // Crear sesión de checkout
    const session = await stripeService.createCheckoutSession({
      customerId: customer.id,
      priceId,
      successUrl,
      cancelUrl,
      metadata: {
        userId,
        username,
        planType,
      },
    });

    // Guardar o actualizar subscription en base de datos (estado inicial)
    await Subscription.findOneAndUpdate(
      { userId },
      {
        userId,
        username,
        email: email || `${username}@temp.com`,
        stripeCustomerId: customer.id,
        planType,
        status: 'incomplete',
      },
      { upsert: true, new: true }
    );

    logger.info(`Checkout session created successfully: ${session.id}`);

    res.status(200).json({
      message: 'Checkout session created successfully',
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    logger.error(`Error creating checkout session: ${error.message}`);
    res.status(500).json({
      error: 'CHECKOUT_SESSION_ERROR',
      message: 'Failed to create checkout session',
      details: error.message,
    });
  }
};

/**
 * Obtener el estado de la suscripción del usuario
 *
 * @route GET /api/v1/payments/subscription
 * @access Private (requiere JWT)
 */
export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        error: 'MISSING_USER_ID',
        message: 'User ID not found in request',
      });
    }

    const subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      return res.status(404).json({
        error: 'SUBSCRIPTION_NOT_FOUND',
        message: 'No subscription found for this user',
        subscription: {
          planType: 'FREE',
          status: 'none',
        },
      });
    }

    // Si tiene stripeSubscriptionId, obtener datos actualizados de Stripe
    if (subscription.stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripeService.getSubscription(
          subscription.stripeSubscriptionId
        );

        // Actualizar datos locales si hay diferencias
        if (stripeSubscription.status !== subscription.status) {
          subscription.status = stripeSubscription.status;
          subscription.currentPeriodStart = new Date(
            stripeSubscription.current_period_start * 1000
          );
          subscription.currentPeriodEnd = new Date(
            stripeSubscription.current_period_end * 1000
          );
          subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
          await subscription.save();
        }
      } catch (error) {
        logger.warn(`Failed to fetch Stripe subscription details: ${error.message}`);
        // Continuar con datos locales
      }
    }

    res.status(200).json({
      message: 'Subscription retrieved successfully',
      subscription: {
        planType: subscription.planType,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        isActive: subscription.isActive(),
      },
    });
  } catch (error) {
    logger.error(`Error getting subscription status: ${error.message}`);
    res.status(500).json({
      error: 'SUBSCRIPTION_STATUS_ERROR',
      message: 'Failed to retrieve subscription status',
      details: error.message,
    });
  }
};

/**
 * Cancelar la suscripción del usuario
 *
 * @route DELETE /api/v1/payments/subscription
 * @access Private (requiere JWT)
 */
export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { immediate = false } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'MISSING_USER_ID',
        message: 'User ID not found in request',
      });
    }

    const subscription = await Subscription.findOne({ userId });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({
        error: 'SUBSCRIPTION_NOT_FOUND',
        message: 'No active subscription found for this user',
      });
    }

    logger.info(`Canceling subscription for user ${userId}, immediate: ${immediate}`);

    // Cancelar en Stripe
    let stripeSubscription;
    if (immediate) {
      stripeSubscription = await stripeService.cancelSubscriptionImmediately(
        subscription.stripeSubscriptionId
      );
    } else {
      stripeSubscription = await stripeService.cancelSubscription(
        subscription.stripeSubscriptionId,
        true
      );
    }

    // Actualizar en base de datos local
    subscription.status = stripeSubscription.status;
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end || immediate;
    subscription.canceledAt = new Date();
    await subscription.save();

    // Si es cancelación inmediata, actualizar SPACE
    if (immediate) {
      try {
        await spaceService.cancelSpaceContract(userId);
      } catch (error) {
        logger.error(`Failed to cancel SPACE contract: ${error.message}`);
        // No fallar la request, SPACE se actualizará con webhook
      }
    }

    res.status(200).json({
      message: immediate
        ? 'Subscription canceled immediately'
        : 'Subscription will be canceled at the end of billing period',
      subscription: {
        planType: subscription.planType,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });
  } catch (error) {
    logger.error(`Error canceling subscription: ${error.message}`);
    res.status(500).json({
      error: 'SUBSCRIPTION_CANCEL_ERROR',
      message: 'Failed to cancel subscription',
      details: error.message,
    });
  }
};

/**
 * Manejar webhooks de Stripe
 *
 * @route POST /api/v1/payments/webhook
 * @access Public (verificado por firma de Stripe)
 */
export const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const isDummySecret = !webhookSecret || webhookSecret === 'whsec_your_webhook_secret_here';
    
    let event;

    // En desarrollo con secreto dummy, permitir webhooks sin firma
    if (!signature && isDummySecret && process.env.NODE_ENV !== 'production') {
      logger.warn('⚠️  Processing webhook without signature (development mode)');
      // Parsear directamente el body - puede ser Buffer o string
      const bodyString = Buffer.isBuffer(req.body) ? req.body.toString() : 
                         typeof req.body === 'string' ? req.body : 
                         JSON.stringify(req.body);
      event = JSON.parse(bodyString);
    } else if (!signature) {
      logger.error('Missing stripe-signature header');
      return res.status(400).json({
        error: 'MISSING_SIGNATURE',
        message: 'Missing Stripe signature',
      });
    } else {
      // Verificar firma del webhook (req.body debe ser raw buffer)
      event = stripeService.verifyWebhookSignature(req.body, signature);
    }

    logger.info(`Webhook received: ${event.type}`);

    // Manejar diferentes tipos de eventos
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        logger.info(`Unhandled webhook event type: ${event.type}`);
    }

    // Siempre responder 200 para que Stripe no reintente
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    res.status(400).json({
      error: 'WEBHOOK_ERROR',
      message: 'Webhook processing failed',
      details: error.message,
    });
  }
};

/**
 * Manejar evento checkout.session.completed
 */
const handleCheckoutCompleted = async (session) => {
  try {
    const { customer, subscription, metadata } = session;

    if (!metadata?.userId) {
      logger.error('Checkout completed without userId in metadata');
      return;
    }

    // subscription puede ser un ID (string) o un objeto expandido
    const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
    
    logger.info(
      `Checkout completed for user ${metadata.userId}, subscription: ${subscriptionId}`
    );

    // Si la subscription ya viene expandida, usarla directamente
    let stripeSubscription;
    if (typeof subscription === 'object' && subscription.id) {
      stripeSubscription = subscription;
    } else {
      // Si no, obtenerla de Stripe
      stripeSubscription = await stripeService.getSubscription(subscriptionId);
    }
    
    const priceId = stripeSubscription.items.data[0]?.price.id;
    const planType = stripeService.getPlanTypeFromPriceId(priceId);

    // Actualizar o crear subscription en base de datos
    const updateData = {
      stripeCustomerId: customer,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      status: stripeSubscription.status,
      planType,
      cancelAtPeriodEnd: false,
    };

    // Solo agregar fechas si existen y son válidas
    if (stripeSubscription.current_period_start) {
      const startDate = new Date(stripeSubscription.current_period_start * 1000);
      if (!isNaN(startDate.getTime())) {
        updateData.currentPeriodStart = startDate;
      }
    }
    
    if (stripeSubscription.current_period_end) {
      const endDate = new Date(stripeSubscription.current_period_end * 1000);
      if (!isNaN(endDate.getTime())) {
        updateData.currentPeriodEnd = endDate;
      }
    }

    const dbSubscription = await Subscription.findOneAndUpdate(
      { userId: metadata.userId },
      updateData,
      { upsert: true, new: true }
    );

    logger.info(`Subscription updated in database for user ${metadata.userId}`);

    // Crear/actualizar contrato en SPACE
    try {
      await spaceService.createSpaceContract({
        userId: metadata.userId,
        username: metadata.username,
        plan: planType,
      });
      logger.info(`SPACE contract created for user ${metadata.userId}`);
    } catch (error) {
      logger.error(`Failed to create SPACE contract: ${error.message}`);
      // No lanzar error, el webhook ya procesó el pago
    }
  } catch (error) {
    logger.error(`Error handling checkout completed: ${error.message}`);
    throw error;
  }
};

/**
 * Manejar evento customer.subscription.updated
 */
const handleSubscriptionUpdated = async (stripeSubscription) => {
  try {
    const { id, customer, status, metadata } = stripeSubscription;

    // Buscar subscription por stripeSubscriptionId o customerId
    const subscription = await Subscription.findOne({
      $or: [{ stripeSubscriptionId: id }, { stripeCustomerId: customer }],
    });

    if (!subscription) {
      logger.warn(`Subscription not found for Stripe subscription: ${id}`);
      return;
    }

    const priceId = stripeSubscription.items.data[0]?.price.id;
    const planType = stripeService.getPlanTypeFromPriceId(priceId);

    // Actualizar datos
    subscription.stripeSubscriptionId = id;
    subscription.stripePriceId = priceId;
    subscription.status = status;
    subscription.planType = planType;
    subscription.currentPeriodStart = new Date(
      stripeSubscription.current_period_start * 1000
    );
    subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;

    await subscription.save();

    logger.info(`Subscription updated for user ${subscription.userId}`);

    // Actualizar SPACE si el estado cambió
    if (status === 'active') {
      try {
        await spaceService.updateSpaceContract({
          userId: subscription.userId,
          plan: planType,
        });
      } catch (error) {
        logger.error(`Failed to update SPACE contract: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error handling subscription updated: ${error.message}`);
    throw error;
  }
};

/**
 * Manejar evento customer.subscription.deleted
 */
const handleSubscriptionDeleted = async (stripeSubscription) => {
  try {
    const { id } = stripeSubscription;

    const subscription = await Subscription.findOne({ stripeSubscriptionId: id });

    if (!subscription) {
      logger.warn(`Subscription not found for deleted Stripe subscription: ${id}`);
      return;
    }

    subscription.status = 'canceled';
    subscription.canceledAt = new Date();
    await subscription.save();

    logger.info(`Subscription deleted for user ${subscription.userId}`);

    // Cancelar contrato en SPACE
    try {
      await spaceService.cancelSpaceContract(subscription.userId);
    } catch (error) {
      logger.error(`Failed to cancel SPACE contract: ${error.message}`);
    }
  } catch (error) {
    logger.error(`Error handling subscription deleted: ${error.message}`);
    throw error;
  }
};

/**
 * Manejar evento invoice.payment_succeeded
 */
const handlePaymentSucceeded = async (invoice) => {
  try {
    const { subscription: subscriptionId } = invoice;

    if (!subscriptionId) {
      return; // No es pago de suscripción
    }

    const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });

    if (!subscription) {
      return;
    }

    logger.info(`Payment succeeded for user ${subscription.userId}`);

    // Asegurar que el estado sea activo
    if (subscription.status !== 'active') {
      subscription.status = 'active';
      await subscription.save();
    }
  } catch (error) {
    logger.error(`Error handling payment succeeded: ${error.message}`);
    throw error;
  }
};

/**
 * Manejar evento invoice.payment_failed
 */
const handlePaymentFailed = async (invoice) => {
  try {
    const { subscription: subscriptionId } = invoice;

    if (!subscriptionId) {
      return;
    }

    const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });

    if (!subscription) {
      return;
    }

    logger.warn(`Payment failed for user ${subscription.userId}`);

    subscription.status = 'past_due';
    await subscription.save();

    // TODO: Enviar notificación al usuario sobre el pago fallido
  } catch (error) {
    logger.error(`Error handling payment failed: ${error.message}`);
    throw error;
  }
};
