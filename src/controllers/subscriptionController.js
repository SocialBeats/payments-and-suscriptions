import Subscription from '../models/Subscription.js';
import * as stripeService from '../services/stripeService.js';
import * as spaceService from '../services/spaceService.js';
import logger from '../../logger.js';
import { 
  getValidPlans, 
  comparePlans, 
  getDefaultFreePlan, 
  FREE_PLAN,
  isAddOnAvailableForPlan,
  getAddOnConfig,
} from '../config/plans.config.js';

/**
 * Formatear AddOns para el formato que espera SPACE
 * SPACE espera: { socialbeats: { addonName: quantity, ... } }
 */
const formatAddOnsForSpace = (addonNames) => {
  const result = {};
  for (const name of addonNames) {
    result[name] = 1;
  }
  return result;
};

/**
 * Eliminar AddOns incompatibles con el nuevo plan
 * Elimina de Stripe y actualiza la base de datos
 * 
 * @param {Object} subscription - Documento de suscripción de MongoDB
 * @param {string} newPlanType - Nuevo tipo de plan
 * @returns {Object} - { removedAddOns: string[], remainingAddOns: string[] }
 */
const removeIncompatibleAddOns = async (subscription, newPlanType) => {
  const removedAddOns = [];
  const remainingAddOns = [];

  if (!subscription.activeAddOns || subscription.activeAddOns.length === 0) {
    return { removedAddOns, remainingAddOns };
  }

  for (const addon of subscription.activeAddOns) {
    if (addon.status !== 'active') continue;

    // Verificar si el addon es compatible con el nuevo plan
    if (!isAddOnAvailableForPlan(addon.name, newPlanType)) {
      logger.info(`AddOn "${addon.name}" not compatible with plan ${newPlanType}, removing...`);
      
      // Eliminar de Stripe si tiene subscription item
      if (addon.stripeSubscriptionItemId) {
        try {
          await stripeService.removeSubscriptionItem(addon.stripeSubscriptionItemId);
          logger.info(`AddOn "${addon.name}" removed from Stripe subscription`);
        } catch (stripeError) {
          logger.error(`Failed to remove addon from Stripe: ${stripeError.message}`);
          // Continuar de todas formas
        }
      }

      // Marcar como cancelado en la DB
      addon.status = 'canceled';
      removedAddOns.push(addon.name);
    } else {
      remainingAddOns.push(addon.name);
    }
  }

  // Guardar cambios si hubo addons eliminados
  if (removedAddOns.length > 0) {
    await subscription.save();
    logger.info(`Removed ${removedAddOns.length} incompatible addons: ${removedAddOns.join(', ')}`);
  }

  return { removedAddOns, remainingAddOns };
};

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
    const validPlans = getValidPlans();
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

    logger.info(
      `Creating checkout session for user ${userId} with plan: ${planType}`
    );

    // Obtener o crear customer de Stripe
    const customer = await stripeService.getOrCreateCustomer(
      email || `${username}@temp.com`,
      {
        userId,
        username,
      }
    );

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
          subscription.cancelAtPeriodEnd =
            stripeSubscription.cancel_at_period_end;
          await subscription.save();
        }
      } catch (error) {
        logger.warn(
          `Failed to fetch Stripe subscription details: ${error.message}`
        );
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
        // Información de cambio de plan pendiente (downgrade programado)
        pendingPlanChange: subscription.metadata?.pendingPlanChange || null,
        pendingChangeDate: subscription.metadata?.pendingChangeDate || null,
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
 * Crear una suscripción del plan básico usando el spaceService, en el cuerpo de la petición se pasarán
 * userId, username y plan.
 * Además, crea el registro local de Subscription, el cliente en Stripe y la suscripción gratuita.
 */
export const createFreeContract = async (req, res) => {
  try {
    const { userId, username, plan, email } = req.body;

    if (!userId || !username || !plan) {
      return res.status(400).json({
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'userId, username and plan are required',
      });
    }

    // Validar que el plan sea FREE (gratuito)
    if (plan !== FREE_PLAN) {
      return res.status(400).json({
        error: 'INVALID_PLAN',
        message: `This endpoint only creates ${FREE_PLAN} (free) plans`,
      });
    }

    logger.info(`Creating free contract for user ${userId} (${username})`);

    // 1. Crear contrato en SPACE
    const contract = await spaceService.createSpaceContract({
      userId,
      username,
      plan,
    });

    logger.info(`✅ SPACE contract created for user ${userId}`);

    // 2. Crear Customer en Stripe
    const customerEmail = email || `${username}@socialbeats.com`;
    const customer = await stripeService.getOrCreateCustomer(customerEmail, {
      userId,
      username,
    });

    logger.info(`✅ Stripe customer created/retrieved: ${customer.id}`);

    // 3. Crear suscripción gratuita en Stripe
    const freePriceId = stripeService.getPriceIdForPlan(FREE_PLAN);
    const stripeSubscription = await stripeService.createFreeSubscription({
      customerId: customer.id,
      priceId: freePriceId,
      metadata: {
        userId,
        username,
        planType: FREE_PLAN,
      },
    });

    logger.info(
      `✅ Free Stripe subscription created: ${stripeSubscription.id}`
    );

    // 4. Crear/Actualizar suscripción local en MongoDB con todos los datos
    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      {
        userId,
        username,
        email: customerEmail,
        planType: FREE_PLAN,
        status: 'active',
        stripeCustomerId: customer.id,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: freePriceId,
        currentPeriodStart: new Date(
          stripeSubscription.current_period_start * 1000
        ),
        currentPeriodEnd: new Date(
          stripeSubscription.current_period_end * 1000
        ),
        cancelAtPeriodEnd: false,
      },
      { upsert: true, new: true }
    );

    logger.info(`✅ Local subscription created in MongoDB for user ${userId}`);

    res.status(200).json({
      message: 'Free contract and Stripe subscription created successfully',
      contract,
      subscription: {
        userId: subscription.userId,
        username: subscription.username,
        email: subscription.email,
        planType: subscription.planType,
        status: subscription.status,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        isActive: subscription.isActive(),
      },
    });
  } catch (error) {
    logger.error(`Error creating free contract: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    res.status(500).json({
      error: 'CONTRACT_ERROR',
      message: 'Failed to create free contract',
      details: error.message,
    });
  }
};

/**
 * Actualizar el plan de suscripción del usuario
 *
 * @route PUT /api/v1/payments/subscription
 * @access Private (requiere JWT)
 */
export const updateSubscriptionPlan = async (req, res) => {
  try {
    const userId = req.user.id;
    const username = req.user.username;
    const { planType, prorationBehavior = 'create_prorations' } = req.body;

    // Validación de datos
    if (!planType) {
      return res.status(400).json({
        error: 'MISSING_PLAN_TYPE',
        message: 'Plan type is required',
      });
    }

    // Validar plan válido
    const validPlans = getValidPlans();
    if (!validPlans.includes(planType)) {
      return res.status(400).json({
        error: 'INVALID_PLAN_TYPE',
        message: `Plan type must be one of: ${validPlans.join(', ')}`,
      });
    }

    // Validar proration behavior
    const validProrationBehaviors = [
      'create_prorations',
      'none',
      'always_invoice',
    ];
    if (!validProrationBehaviors.includes(prorationBehavior)) {
      return res.status(400).json({
        error: 'INVALID_PRORATION_BEHAVIOR',
        message: `Proration behavior must be one of: ${validProrationBehaviors.join(', ')}`,
      });
    }

    logger.info(
      `Updating subscription plan for user ${userId} to: ${planType} (proration: ${prorationBehavior})`
    );

    // Buscar suscripción existente
    const subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      return res.status(404).json({
        error: 'SUBSCRIPTION_NOT_FOUND',
        message: 'No subscription found for this user',
      });
    }

    // Si no tiene stripeSubscriptionId, es un usuario sin suscripción en Stripe
    if (!subscription.stripeSubscriptionId) {
      return res.status(400).json({
        error: 'NO_STRIPE_SUBSCRIPTION',
        message:
          'User does not have a Stripe subscription. Please create one first using checkout.',
      });
    }

    // Verificar que no sea el mismo plan
    if (subscription.planType === planType) {
      return res.status(400).json({
        error: 'SAME_PLAN',
        message: `User already has ${planType} plan`,
        subscription: {
          planType: subscription.planType,
          status: subscription.status,
        },
      });
    }

    // Obtener el nuevo Price ID
    const newPriceId = stripeService.getPriceIdForPlan(planType);

    // Determinar si es upgrade o downgrade (usar configuración centralizada)
    const { isUpgrade, currentPrice, newPrice } = comparePlans(
      subscription.planType,
      planType
    );

    // Si hay un downgrade pendiente y el usuario quiere hacer upgrade, cancelar el schedule
    if (subscription.metadata?.scheduleId) {
      try {
        logger.info(`Releasing pending schedule ${subscription.metadata.scheduleId}`);
        // Usar release() en lugar de cancel() para mantener la suscripción activa
        await stripeService.stripe.subscriptionSchedules.release(subscription.metadata.scheduleId);
        
        // Limpiar metadata
        subscription.metadata = {
          ...subscription.metadata,
          pendingPlanChange: undefined,
          pendingChangeDate: undefined,
          scheduleId: undefined,
        };
        await subscription.save();
        logger.info('Pending schedule released successfully, subscription remains active');
      } catch (error) {
        // Si el schedule ya no existe o ya fue procesado, continuar
        logger.warn(`Could not release schedule: ${error.message}`);
      }
    }

    // Si es upgrade a plan de pago, verificar que tenga método de pago
    if (isUpgrade && newPrice > 0) {
      logger.info(
        `User ${userId} attempting upgrade from ${subscription.planType} to ${planType}`
      );

      // Verificar si el customer tiene un default payment method configurado
      const customer = await stripeService.stripe.customers.retrieve(
        subscription.stripeCustomerId,
        { expand: ['invoice_settings.default_payment_method'] }
      );

      const hasDefaultPaymentMethod =
        customer.default_payment_method ||
        customer.invoice_settings?.default_payment_method ||
        customer.default_source;

      if (!hasDefaultPaymentMethod) {
        logger.warn(`❌ User ${userId} has no DEFAULT payment method`);

        // Buscar payment methods adjuntos
        const paymentMethods = await stripeService.stripe.paymentMethods.list({
          customer: subscription.stripeCustomerId,
          type: 'card',
          limit: 1,
        });

        // Si tiene payment methods pero no hay default, configurar el primero
        if (paymentMethods.data.length > 0) {
          logger.info(
            `🔧 Found ${paymentMethods.data.length} payment method(s), setting first as default`
          );

          try {
            await stripeService.setDefaultPaymentMethod(
              subscription.stripeCustomerId,
              paymentMethods.data[0].id
            );
            logger.info(
              `✅ Payment method ${paymentMethods.data[0].id} set as default automatically`
            );
          } catch (error) {
            logger.error(
              `Failed to set default payment method: ${error.message}`
            );
            // Continuar con crear setup session
          }
        } else {
          // No tiene ningún payment method, crear sesión de setup
          logger.warn(`❌ User ${userId} has NO payment methods attached`);

          let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          frontendUrl = frontendUrl.replace(/\/$/, '');

          try {
            const setupSession = await stripeService.createSetupSession({
              customerId: subscription.stripeCustomerId,
              successUrl: `${frontendUrl}/app/pricing?setup=success&upgrade_to=${planType}&session_id={CHECKOUT_SESSION_ID}`,
              cancelUrl: `${frontendUrl}/app/pricing?setup=canceled`,
              metadata: {
                userId,
                username,
                pendingUpgradeTo: planType,
              },
            });

            logger.info(
              `Setup session created for user ${userId}: ${setupSession.id}`
            );

            return res.status(402).json({
              error: 'PAYMENT_METHOD_REQUIRED',
              message:
                'Payment method required for upgrade. Please add a payment method first.',
              setupUrl: setupSession.url,
              setupSessionId: setupSession.id,
            });
          } catch (setupError) {
            logger.error(
              `Failed to create setup session: ${setupError.message}`
            );

            return res.status(500).json({
              error: 'SETUP_SESSION_ERROR',
              message: 'Failed to create payment setup session',
              details: setupError.message,
            });
          }
        }
      } else {
        logger.info(`✅ User ${userId} has default payment method configured`);
      }
    }

    // Determinar el comportamiento de prorrateo inteligente
    let effectiveProrationBehavior = prorationBehavior;

    // Para upgrades: prorrateo inmediato
    // Para downgrades: programar cambio al final del periodo
    if (prorationBehavior === 'create_prorations') {
      effectiveProrationBehavior = isUpgrade
        ? 'always_invoice' // Upgrade: cobrar diferencia inmediatamente
        : 'none'; // Downgrade: no crear cargos (el cambio se programa)

      logger.info(
        `Auto-detected ${isUpgrade ? 'upgrade' : 'downgrade'}, using proration: ${effectiveProrationBehavior}`
      );
    }

    // Verificar si la suscripción en Stripe está cancelada
    let stripeSubscription;
    try {
      stripeSubscription = await stripeService.getSubscription(subscription.stripeSubscriptionId);
    } catch (error) {
      logger.error(`Could not retrieve Stripe subscription: ${error.message}`);
    }

    // Si la suscripción está cancelada en Stripe, crear una nueva
    if (stripeSubscription && stripeSubscription.status === 'canceled') {
      logger.info(`Stripe subscription is canceled, creating new subscription for user ${userId}`);
      
      // Gestionar AddOns incompatibles con el nuevo plan
      const { removedAddOns, remainingAddOns } = await removeIncompatibleAddOns(subscription, planType);
      if (removedAddOns.length > 0) {
        logger.info(`Removed ${removedAddOns.length} incompatible addons for new subscription to ${planType}`);
      }
      
      // Crear nueva suscripción
      const newSubscription = await stripeService.stripe.subscriptions.create({
        customer: subscription.stripeCustomerId,
        items: [{ price: newPriceId }],
        payment_behavior: 'error_if_incomplete',
        proration_behavior: 'none',
        metadata: {
          userId,
          username,
          planType,
        },
      });

      // Actualizar en base de datos
      subscription.stripeSubscriptionId = newSubscription.id;
      subscription.stripePriceId = newPriceId;
      subscription.planType = planType;
      subscription.status = newSubscription.status;
      subscription.currentPeriodStart = new Date(newSubscription.current_period_start * 1000);
      subscription.currentPeriodEnd = new Date(newSubscription.current_period_end * 1000);
      subscription.metadata = {
        ...subscription.metadata,
        pendingPlanChange: undefined,
        pendingChangeDate: undefined,
        scheduleId: undefined,
      };
      await subscription.save();

      logger.info(`New subscription created: ${newSubscription.id}`);

      // Actualizar SPACE con addons restantes
      try {
        await spaceService.updateSpaceContract({ 
          userId, 
          plan: planType,
          addOns: {
            socialbeats: formatAddOnsForSpace(remainingAddOns),
          },
        });
        logger.info(`SPACE contract updated to ${planType}`);
      } catch (error) {
        logger.error(`Failed to update SPACE contract: ${error.message}`);
      }

      return res.status(200).json({
        message: 'New subscription created successfully',
        subscription: {
          planType,
          status: newSubscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          isActive: newSubscription.status === 'active',
          activeAddOns: remainingAddOns,
        },
        change: {
          type: 'new_subscription',
          from: subscription.planType,
          to: planType,
        },
        removedAddOns: removedAddOns.length > 0 ? {
          count: removedAddOns.length,
          names: removedAddOns,
          reason: `These add-ons are not available for the ${planType} plan`,
        } : undefined,
        proration: {
          behavior: 'none',
          note: 'New subscription created. Full price charged for this billing period.',
        },
      });
    }

    // Actualizar en Stripe (suscripción activa)
    const updatedStripeSubscription =
      await stripeService.updateSubscriptionPlan({
        subscriptionId: subscription.stripeSubscriptionId,
        newPriceId,
        prorationBehavior: effectiveProrationBehavior,
        isDowngrade: !isUpgrade, // Pasar flag de downgrade
      });

    // Para downgrades, el plan NO cambia inmediatamente en nuestra DB
    // Solo se programa el cambio en Stripe
    if (!isUpgrade && updatedStripeSubscription.scheduled_change) {
      logger.info(`Downgrade scheduled for user ${userId}, keeping current plan until period end`);
      
      // Guardar info del cambio pendiente en metadata
      subscription.metadata = {
        ...subscription.metadata,
        pendingPlanChange: planType,
        pendingChangeDate: new Date(updatedStripeSubscription.scheduled_change.effectiveDate * 1000),
        scheduleId: updatedStripeSubscription.scheduled_change.scheduleId,
      };
      await subscription.save();

      // NO actualizar SPACE todavía - el webhook lo hará cuando el cambio sea efectivo

      return res.status(200).json({
        message: 'Plan change scheduled successfully',
        subscription: {
          planType: subscription.planType, // Plan actual (no cambia aún)
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          isActive: subscription.isActive(),
        },
        change: {
          type: 'downgrade',
          from: subscription.planType,
          to: planType,
          effectiveDate: new Date(updatedStripeSubscription.scheduled_change.effectiveDate * 1000),
        },
        proration: {
          behavior: 'scheduled',
          note: `You will keep your ${subscription.planType} plan until ${new Date(updatedStripeSubscription.scheduled_change.effectiveDate * 1000).toLocaleDateString()}. Then it will change to ${planType}.`,
        },
      });
    }

    // Para upgrades, actualizar inmediatamente en base de datos

    // Gestionar AddOns incompatibles con el nuevo plan
    const { removedAddOns, remainingAddOns } = await removeIncompatibleAddOns(subscription, planType);
    if (removedAddOns.length > 0) {
      logger.info(`Removed ${removedAddOns.length} incompatible addons for plan change to ${planType}`);
    }

    // Actualizar en base de datos
    subscription.planType = planType;
    subscription.stripePriceId = newPriceId;
    subscription.status = updatedStripeSubscription.status;
    subscription.currentPeriodStart = new Date(
      updatedStripeSubscription.current_period_start * 1000
    );
    subscription.currentPeriodEnd = new Date(
      updatedStripeSubscription.current_period_end * 1000
    );
    await subscription.save();

    logger.info(`Subscription plan updated in database for user ${userId}`);

    // Actualizar en SPACE (con addons restantes)
    try {
      await spaceService.updateSpaceContract({
        userId,
        plan: planType,
        addOns: {
          socialbeats: formatAddOnsForSpace(remainingAddOns),
        },
      });
      logger.info(`SPACE contract updated to ${planType} for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to update SPACE contract: ${error.message}`);
      // No fallar la request, el webhook puede sincronizar después
    }

    res.status(200).json({
      message: 'Subscription plan updated successfully',
      subscription: {
        planType: subscription.planType,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        isActive: subscription.isActive(),
        activeAddOns: remainingAddOns,
      },
      change: {
        type: isUpgrade ? 'upgrade' : 'downgrade',
        from: currentPrice,
        to: newPrice,
      },
      removedAddOns: removedAddOns.length > 0 ? {
        count: removedAddOns.length,
        names: removedAddOns,
        reason: `These add-ons are not available for the ${planType} plan`,
      } : undefined,
      proration: {
        behavior: effectiveProrationBehavior,
        note:
          effectiveProrationBehavior === 'create_prorations'
            ? isUpgrade
              ? 'Prorated charges will be applied. You have immediate access to new features.'
              : 'Prorated credits will be applied to your next invoice.'
            : isUpgrade
              ? 'Changes will take effect immediately.'
              : 'You will keep your current plan until the end of the billing period.',
      },
    });
  } catch (error) {
    logger.error(`Error updating subscription plan: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);

    // Si el error es de Stripe sobre método de pago, dar una respuesta específica
    if (error.message && error.message.includes('no attached payment source')) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      // Intentar obtener la suscripción para crear sesión de setup
      try {
        const subscription = await Subscription.findOne({
          userId: req.user.id,
        });

        if (subscription && subscription.stripeCustomerId) {
          const setupSession = await stripeService.createSetupSession({
            customerId: subscription.stripeCustomerId,
            successUrl: `${frontendUrl}/pricing?setup=success&upgrade_to=${req.body.planType}`,
            cancelUrl: `${frontendUrl}/pricing?setup=canceled`,
            metadata: {
              userId: req.user.id,
              username: req.user.username,
              pendingUpgradeTo: req.body.planType,
            },
          });

          return res.status(402).json({
            error: 'PAYMENT_METHOD_REQUIRED',
            message:
              'Payment method required for upgrade. Please add a payment method first.',
            setupUrl: setupSession.url,
            setupSessionId: setupSession.id,
          });
        }
      } catch (setupError) {
        logger.error(
          `Failed to create setup session in error handler: ${setupError.message}`
        );
      }
    }

    res.status(500).json({
      error: 'SUBSCRIPTION_UPDATE_ERROR',
      message: 'Failed to update subscription plan',
      details: error.message,
    });
  }
};

/**
 * Completar upgrade pendiente después de añadir método de pago
 * Se llama después de que el usuario completa el setup de Stripe
 *
 * @route POST /api/v1/payments/subscription/complete-upgrade
 * @access Private (requiere JWT)
 */
export const completeUpgrade = async (req, res) => {
  try {
    const userId = req.user.id;
    const { setupSessionId } = req.body;

    if (!setupSessionId) {
      return res.status(400).json({
        error: 'MISSING_SETUP_SESSION_ID',
        message: 'Setup session ID is required',
      });
    }

    logger.info(
      `Completing upgrade for user ${userId} after payment method setup`
    );

    // Verificar la sesión de setup
    const setupSession = await stripeService.getSetupSession(setupSessionId);

    if (setupSession.status !== 'complete') {
      return res.status(400).json({
        error: 'SETUP_NOT_COMPLETE',
        message: 'Payment method setup is not complete',
      });
    }

    // Obtener el payment method de la sesión
    const paymentMethodId =
      setupSession.setup_intent?.payment_method?.id ||
      setupSession.setup_intent?.payment_method;

    if (!paymentMethodId) {
      logger.error('No payment method found in setup session');
      return res.status(400).json({
        error: 'NO_PAYMENT_METHOD',
        message: 'No payment method found in completed setup session',
      });
    }

    logger.info(`Payment method found: ${paymentMethodId}`);

    // Obtener el plan al que quiere hacer upgrade desde metadata
    const pendingUpgradeTo = setupSession.metadata?.pendingUpgradeTo;

    if (!pendingUpgradeTo) {
      return res.status(400).json({
        error: 'NO_PENDING_UPGRADE',
        message: 'No pending upgrade found in session metadata',
      });
    }

    // Buscar suscripción del usuario
    const subscription = await Subscription.findOne({ userId });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({
        error: 'SUBSCRIPTION_NOT_FOUND',
        message: 'No subscription found for this user',
      });
    }

    // Configurar el payment method como default del customer
    try {
      await stripeService.setDefaultPaymentMethod(
        subscription.stripeCustomerId,
        paymentMethodId
      );
      logger.info(`✅ Payment method ${paymentMethodId} set as default`);
    } catch (error) {
      logger.error(`Failed to set default payment method: ${error.message}`);
      return res.status(500).json({
        error: 'SET_PAYMENT_METHOD_ERROR',
        message: 'Failed to set payment method as default',
        details: error.message,
      });
    }

    // Ahora que tiene método de pago configurado, actualizar el plan
    const newPriceId = stripeService.getPriceIdForPlan(pendingUpgradeTo);

    const updatedStripeSubscription =
      await stripeService.updateSubscriptionPlan({
        subscriptionId: subscription.stripeSubscriptionId,
        newPriceId,
        prorationBehavior: 'create_prorations',
      });

    // Actualizar en base de datos
    subscription.planType = pendingUpgradeTo;
    subscription.stripePriceId = newPriceId;
    subscription.status = updatedStripeSubscription.status;
    subscription.currentPeriodStart = new Date(
      updatedStripeSubscription.current_period_start * 1000
    );
    subscription.currentPeriodEnd = new Date(
      updatedStripeSubscription.current_period_end * 1000
    );
    await subscription.save();

    // Actualizar en SPACE
    try {
      await spaceService.updateSpaceContract({
        userId,
        plan: pendingUpgradeTo,
      });
    } catch (error) {
      logger.error(`Failed to update SPACE contract: ${error.message}`);
    }

    res.status(200).json({
      message: 'Upgrade completed successfully',
      subscription: {
        planType: subscription.planType,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        isActive: subscription.isActive(),
      },
    });
  } catch (error) {
    logger.error(`Error completing upgrade: ${error.message}`);
    res.status(500).json({
      error: 'COMPLETE_UPGRADE_ERROR',
      message: 'Failed to complete upgrade',
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

    logger.info(
      `Canceling subscription for user ${userId}, immediate: ${immediate}`
    );

    // Cancelar suscripción PREMIUM/de pago en Stripe
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
    subscription.cancelAtPeriodEnd =
      stripeSubscription.cancel_at_period_end || immediate;
    subscription.canceledAt = new Date();
    await subscription.save();
    logger.info(
      `Stripe subscription ${subscription.stripeSubscriptionId} canceled`
    );

    // Si es cancelación inmediata, crear suscripción FREE y actualizar SPACE
    if (immediate) {
      try {
        // Crear suscripción FREE en Stripe
        const freePriceId = stripeService.getPriceIdForPlan(FREE_PLAN);
        const freeSubscription = await stripeService.createFreeSubscription({
          customerId: subscription.stripeCustomerId,
          priceId: freePriceId,
          metadata: {
            userId,
            username: subscription.username,
            planType: FREE_PLAN,
          },
        });

        logger.info(`Free subscription created: ${freeSubscription.id}`);

        // Actualizar en base de datos con nueva suscripción FREE
        subscription.stripeSubscriptionId = freeSubscription.id;
        subscription.stripePriceId = freePriceId;
        subscription.planType = FREE_PLAN;
        subscription.status = 'active';
        subscription.currentPeriodStart = new Date(
          freeSubscription.current_period_start * 1000
        );
        subscription.currentPeriodEnd = new Date(
          freeSubscription.current_period_end * 1000
        );
        subscription.cancelAtPeriodEnd = false;
        subscription.canceledAt = new Date();
        await subscription.save();

        // Downgrade a FREE en SPACE
        await spaceService.cancelSpaceContract(userId);

        logger.info(`User ${userId} downgraded to FREE plan successfully`);
      } catch (error) {
        logger.error(`Failed to create FREE subscription: ${error.message}`);

        // Si falla la creación de FREE, al menos actualizar DB a canceled
        subscription.status = stripeSubscription.status;
        subscription.cancelAtPeriodEnd = true;
        subscription.canceledAt = new Date();
        await subscription.save();

        return res.status(500).json({
          error: 'FREE_SUBSCRIPTION_ERROR',
          message:
            'Subscription canceled but failed to create FREE plan. Please contact support.',
          details: error.message,
        });
      }
    } else {
      // Cancelación al final del periodo: solo marcar para cancelar
      subscription.status = stripeSubscription.status;
      subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
      subscription.canceledAt = new Date();
      await subscription.save();

      logger.info(
        `Subscription will be canceled at period end: ${subscription.currentPeriodEnd}`
      );
    }

    res.status(200).json({
      message: immediate
        ? 'Subscription canceled and downgraded to FREE plan'
        : 'Subscription will be canceled at the end of billing period, then downgraded to FREE',
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
    const isDummySecret =
      !webhookSecret || webhookSecret === 'whsec_your_webhook_secret_here';

    let event;

    // En desarrollo con secreto dummy, permitir webhooks sin firma
    if (!signature && isDummySecret && process.env.NODE_ENV !== 'production') {
      logger.warn(
        '⚠️  Processing webhook without signature (development mode)'
      );
      // Parsear directamente el body - puede ser Buffer o string
      const bodyString = Buffer.isBuffer(req.body)
        ? req.body.toString()
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body);
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

      case 'subscription_schedule.completed':
      case 'subscription_schedule.released':
        await handleScheduleCompleted(event.data.object);
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
    const subscriptionId =
      typeof subscription === 'string' ? subscription : subscription?.id;

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
      const startDate = new Date(
        stripeSubscription.current_period_start * 1000
      );
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
    subscription.currentPeriodEnd = new Date(
      stripeSubscription.current_period_end * 1000
    );
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
    const { id, customer } = stripeSubscription;

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: id,
    });

    if (!subscription) {
      logger.warn(
        `Subscription not found for deleted Stripe subscription: ${id}`
      );
      return;
    }

    logger.info(
      `Subscription deleted for user ${subscription.userId}, creating FREE plan`
    );

    try {
      // Crear suscripción FREE automáticamente
      const freePriceId = stripeService.getPriceIdForPlan(FREE_PLAN);
      const freeSubscription = await stripeService.createFreeSubscription({
        customerId: subscription.stripeCustomerId || customer,
        priceId: freePriceId,
        metadata: {
          userId: subscription.userId,
          username: subscription.username,
          planType: FREE_PLAN,
        },
      });

      // Actualizar registro con nueva suscripción FREE
      subscription.stripeSubscriptionId = freeSubscription.id;
      subscription.stripePriceId = freePriceId;
      subscription.planType = FREE_PLAN;
      subscription.status = 'active';
      subscription.currentPeriodStart = new Date(
        freeSubscription.current_period_start * 1000
      );
      subscription.currentPeriodEnd = new Date(
        freeSubscription.current_period_end * 1000
      );
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = new Date();
      await subscription.save();

      logger.info(`FREE subscription created for user ${subscription.userId}`);
    } catch (error) {
      logger.error(`Failed to create FREE subscription: ${error.message}`);

      // Si falla, al menos marcar como cancelado
      subscription.status = 'canceled';
      subscription.canceledAt = new Date();
      await subscription.save();
    }

    // Downgrade a FREE en SPACE
    try {
      await spaceService.cancelSpaceContract(subscription.userId);
      logger.info(
        `SPACE contract downgraded to FREE for user ${subscription.userId}`
      );
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

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
    });

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

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId,
    });

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

/**
 * Manejar evento subscription_schedule.completed o released
 * Este evento se dispara cuando un schedule (downgrade programado) se completa
 */
const handleScheduleCompleted = async (schedule) => {
  try {
    const { subscription: subscriptionId, customer } = schedule;

    if (!subscriptionId) {
      logger.warn('Schedule completed without subscription ID');
      return;
    }

    logger.info(`Schedule completed for subscription ${subscriptionId}`);

    // Obtener la suscripción actualizada de Stripe
    const stripeSubscription = await stripeService.getSubscription(subscriptionId);
    const priceId = stripeSubscription.items.data[0]?.price.id;
    const planType = stripeService.getPlanTypeFromPriceId(priceId);

    // Buscar en nuestra DB
    const subscription = await Subscription.findOne({
      $or: [{ stripeSubscriptionId: subscriptionId }, { stripeCustomerId: customer }],
    });

    if (!subscription) {
      logger.warn(`Subscription not found for schedule: ${subscriptionId}`);
      return;
    }

    const previousPlan = subscription.planType;

    // Gestionar AddOns incompatibles con el nuevo plan (downgrade)
    const { removedAddOns, remainingAddOns } = await removeIncompatibleAddOns(subscription, planType);
    if (removedAddOns.length > 0) {
      logger.info(`Removed ${removedAddOns.length} incompatible addons after downgrade to ${planType}: ${removedAddOns.join(', ')}`);
    }

    // Actualizar en DB con el nuevo plan
    subscription.planType = planType;
    subscription.stripePriceId = priceId;
    subscription.status = stripeSubscription.status;
    subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    
    // Limpiar metadata del schedule pendiente
    subscription.metadata = {
      ...subscription.metadata,
      pendingPlanChange: undefined,
      pendingChangeDate: undefined,
      scheduleId: undefined,
    };
    
    await subscription.save();

    logger.info(`Subscription downgrade completed: ${previousPlan} -> ${planType} for user ${subscription.userId}`);

    // Actualizar SPACE con el nuevo plan y addons restantes
    try {
      await spaceService.updateSpaceContract({
        userId: subscription.userId,
        plan: planType,
        addOns: {
          socialbeats: formatAddOnsForSpace(remainingAddOns),
        },
      });
      logger.info(`SPACE contract updated to ${planType} for user ${subscription.userId}`);
    } catch (error) {
      logger.error(`Failed to update SPACE contract: ${error.message}`);
    }
  } catch (error) {
    logger.error(`Error handling schedule completed: ${error.message}`);
    throw error;
  }
};
