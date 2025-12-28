import mongoose from 'mongoose';

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
      required: true,
      unique: true,
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
      enum: ['active', 'canceled', 'past_due', 'incomplete', 'trialing', 'unpaid'],
      default: 'incomplete',
    },
    // Plan contratado (FREE es interno, BASIC y PREMIUM vienen de SPACE)
    planType: {
      type: String,
      enum: ['FREE', 'BASIC', 'PREMIUM'],
      default: 'FREE',
    },
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

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
