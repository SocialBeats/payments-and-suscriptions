import mongoose from 'mongoose';

/**
 * Modelo de Suscripción
 *
 * FLUJO DE SUSCRIPCIONES:
 * ========================
 *
 * 1. USUARIO NUEVO (Plan FREE):
 *    - Se crea automáticamente un plan FREE en SPACE al registrarse
 *    - OPCIÓN A: Crear suscripción en Stripe con precio €0 (sin checkout, sin tarjeta)
 *    - OPCIÓN B: No crear nada en Stripe hasta que haga upgrade
 *    - En DB: Guardar registro con planType='FREE', status='active', stripeSubscriptionId=null
 *
 * 2. UPGRADE (FREE → BASIC/PREMIUM):
 *    - Si NO tiene suscripción en Stripe: Crear checkout y nueva suscripción
 *    - Si SÍ tiene suscripción: Actualizar con stripe.subscriptions.update()
 *    - Stripe maneja prorrateo automático (cobra diferencia inmediata)
 *    - Actualizar en DB y sincronizar con SPACE
 *
 * 3. DOWNGRADE (PREMIUM → BASIC o → FREE):
 *    - Actualizar suscripción con stripe.subscriptions.update()
 *    - Stripe crea crédito prorrateado para siguiente periodo
 *    - Actualizar en DB y sincronizar con SPACE
 *    - Si baja a FREE, considerar cancelar suscripción en Stripe
 *
 * 4. CAMBIO LATERAL (BASIC ↔ PREMIUM):
 *    - Actualizar con stripe.subscriptions.update()
 *    - Prorrateo según diferencia de precio
 *
 * ESTADOS EN STRIPE:
 * - 'active': Suscripción activa y pagada
 * - 'trialing': En periodo de prueba
 * - 'past_due': Pago fallido, reintentando
 * - 'incomplete': Checkout iniciado pero no completado
 * - 'canceled': Cancelada
 * - 'unpaid': Pago fallido definitivamente
 */

const subscriptionSchema = new mongoose.Schema(
  {
    // Referencia simple al usuario (string, no ObjectId para evitar relación entre microservicios)
    userId: {
      type: String,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    // Identificadores de Stripe
    stripeCustomerId: {
      type: String,
      required: false, // No obligatorio para usuarios FREE internos
      unique: true,
      sparse: true, // Permite nulos/inexistentes sin violar unicidad
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      sparse: true, // Permite nulls sin violar unicidad
      index: true,
    },
    stripePriceId: {
      type: String,
    },
    // Estado de la suscripción
    status: {
      type: String,
      enum: [
        'active',
        'canceled',
        'past_due',
        'incomplete',
        'trialing',
        'unpaid',
      ],
      default: 'incomplete',
    },
    // Plan contratado (FREE, PRO, STUDIO - sincronizado con SPACE)
    planType: {
      type: String,
      enum: ['FREE', 'PRO', 'STUDIO'],
      default: 'FREE',
    },
    // AddOns activos - Array de objetos con info de cada AddOn
    activeAddOns: [
      {
        name: {
          type: String,
          enum: [
            'decoratives',
            'promotedBeat',
            'privatePlaylists',
            'unlockFullBeatFree',
            'unlockFullBeatPro',
            'fullStudioMetrics',
          ],
          required: true,
        },
        stripeSubscriptionItemId: {
          type: String, // ID del item dentro de la suscripción de Stripe
        },
        stripePriceId: {
          type: String,
        },
        purchasedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ['active', 'canceled', 'pending'],
          default: 'active',
        },
      },
    ],
    // Fechas de periodo de facturación
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
    // Control de cancelación
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    canceledAt: {
      type: Date,
    },
    // Metadata adicional
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'subscriptions',
  }
);

// Índice compuesto para búsquedas frecuentes
subscriptionSchema.index({ userId: 1, status: 1 });

// Método para verificar si la suscripción está activa
subscriptionSchema.methods.isActive = function () {
  return this.status === 'active' || this.status === 'trialing';
};

// Método para verificar si la suscripción puede renovarse
subscriptionSchema.methods.canRenew = function () {
  return (
    this.isActive() &&
    !this.cancelAtPeriodEnd &&
    this.currentPeriodEnd &&
    this.currentPeriodEnd > new Date()
  );
};

// Método para verificar si un AddOn está activo
subscriptionSchema.methods.hasAddOn = function (addonName) {
  return this.activeAddOns?.some(
    (addon) => addon.name === addonName && addon.status === 'active'
  );
};

// Método para obtener los nombres de AddOns activos
subscriptionSchema.methods.getActiveAddOnNames = function () {
  return (
    this.activeAddOns
      ?.filter((addon) => addon.status === 'active')
      .map((addon) => addon.name) || []
  );
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
