import express from 'express';
import * as subscriptionController from '../controllers/subscriptionController.js';
import verifyToken from '../middlewares/authMiddlewares.js';
import { webhookMiddleware, verifyStripeSignature } from '../middlewares/webhookMiddleware.js';
import logger from '../../logger.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: JWT token obtenido del endpoint de login
 *   responses:
 *     UnauthorizedError:
 *       description: Token de autenticación faltante o inválido
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               error:
 *                 type: string
 *               message:
 *                 type: string
 */

/**
 * @swagger
 * /api/v1/payments/checkout:
 *   post:
 *     summary: Crear una sesión de checkout de Stripe
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planType
 *             properties:
 *               planType:
 *                 type: string
 *                 enum: [BASIC, PREMIUM]
 *                 description: Tipo de plan a contratar (BASIC €0/mes, PREMIUM €10/mes)
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email del usuario (opcional si viene en headers)
 *     responses:
 *       200:
 *         description: Sesión de checkout creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 checkoutUrl:
 *                   type: string
 *                   description: URL de redirección a Stripe Checkout
 *                 sessionId:
 *                   type: string
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autenticado
 *       409:
 *         description: Usuario ya tiene suscripción activa
 *       500:
 *         description: Error del servidor
 */
router.post('/checkout', verifyToken, subscriptionController.createCheckoutSession);

/**
 * @swagger
 * /api/v1/payments/subscription:
 *   get:
 *     summary: Obtener estado de suscripción del usuario
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estado de suscripción obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 subscription:
 *                   type: object
 *                   properties:
 *                     planType:
 *                       type: string
 *                     status:
 *                       type: string
 *                     currentPeriodStart:
 *                       type: string
 *                       format: date-time
 *                     currentPeriodEnd:
 *                       type: string
 *                       format: date-time
 *                     cancelAtPeriodEnd:
 *                       type: boolean
 *                     isActive:
 *                       type: boolean
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Suscripción no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/subscription', verifyToken, subscriptionController.getSubscriptionStatus);

/**
 * @swagger
 * /api/v1/payments/subscription:
 *   delete:
 *     summary: Cancelar suscripción del usuario
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               immediate:
 *                 type: boolean
 *                 default: false
 *                 description: Si cancelar inmediatamente o al final del periodo
 *     responses:
 *       200:
 *         description: Suscripción cancelada
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Suscripción no encontrada
 *       500:
 *         description: Error del servidor
 */
router.delete('/subscription', verifyToken, subscriptionController.cancelSubscription);

/**
 * @swagger
 * /api/v1/payments/webhook:
 *   post:
 *     summary: Webhook de eventos de Stripe
 *     tags: [Payments]
 *     description: Endpoint público para recibir eventos de Stripe (verificado por firma)
 *     responses:
 *       200:
 *         description: Webhook procesado exitosamente
 *       400:
 *         description: Firma inválida o error de procesamiento
 */
// Nota: La ruta webhook NO usa authMiddleware y debe montarse con webhookMiddleware en main.js

logger.info('✅ Subscription routes configured');

export default router;
