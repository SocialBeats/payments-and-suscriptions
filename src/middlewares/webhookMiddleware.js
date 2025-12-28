import express from 'express';
import logger from '../../logger.js';

/**
 * Middleware para manejar webhooks de Stripe.
 *
 * IMPORTANTE: Este middleware debe montarse ANTES de express.json()
 * porque Stripe necesita el body en formato raw (Buffer) para verificar la firma.
 *
 * Uso en main.js:
 * app.use('/api/v1/payments/webhook', webhookMiddleware, subscriptionController.handleWebhook);
 */
export const webhookMiddleware = express.raw({
  type: 'application/json',
  verify: (req, res, buf) => {
    // Guardar el raw buffer en req.body para que el controlador pueda verificar la firma
    req.rawBody = buf.toString('utf8');
  },
});

/**
 * Middleware para verificar que el request viene de Stripe
 * (verifica que tenga el header stripe-signature)
 * 
 * En desarrollo con secreto dummy, permite webhooks sin firma para testing manual
 */
export const verifyStripeSignature = (req, res, next) => {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const isDummySecret = !webhookSecret || webhookSecret === 'whsec_your_webhook_secret_here';

  // Permitir webhooks sin firma en desarrollo con secreto dummy
  if (!signature && isDummySecret && process.env.NODE_ENV !== 'production') {
    logger.warn('⚠️  Webhook without signature accepted (development mode with dummy secret)');
    return next();
  }

  if (!signature) {
    logger.error('Webhook request missing stripe-signature header');
    return res.status(400).json({
      error: 'MISSING_SIGNATURE',
      message: 'Missing Stripe signature header',
    });
  }

  // El body debe ser un Buffer para verificación
  if (!Buffer.isBuffer(req.body)) {
    logger.error('Webhook body is not a buffer');
    return res.status(400).json({
      error: 'INVALID_BODY_FORMAT',
      message: 'Request body must be raw for signature verification',
    });
  }

  next();
};

export default webhookMiddleware;
