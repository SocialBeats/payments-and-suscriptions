import express from 'express';
import * as subscriptionController from '../controllers/subscriptionController.js';
import verifyToken from '../middlewares/authMiddlewares.js';
import {
  webhookMiddleware,
  verifyStripeSignature,
} from '../middlewares/webhookMiddleware.js';
import logger from '../../logger.js';
import { requireInternalApiKey } from '../middlewares/internalMiddleware.js';

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
router.post(
  '/checkout',
  verifyToken,
  subscriptionController.createCheckoutSession
);

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
router.get(
  '/subscription',
  verifyToken,
  subscriptionController.getSubscriptionStatus
);

/**
 * @swagger
 * /api/v1/payments/subscription:
 *   put:
 *     summary: Actualizar el plan de suscripción del usuario
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
 *                 description: Nuevo tipo de plan (BASIC €0/mes, PREMIUM €10/mes)
 *               prorationBehavior:
 *                 type: string
 *                 enum: [create_prorations, none, always_invoice]
 *                 default: create_prorations
 *                 description: |
 *                   Comportamiento del prorrateo:
 *                   - create_prorations: Crear cargos/créditos prorrateados (recomendado)
 *                   - none: Aplicar cambio al inicio del siguiente periodo
 *                   - always_invoice: Siempre crear factura inmediata
 *     responses:
 *       200:
 *         description: Plan actualizado exitosamente
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
 *                     isActive:
 *                       type: boolean
 *                 proration:
 *                   type: object
 *                   properties:
 *                     behavior:
 *                       type: string
 *                     note:
 *                       type: string
 *       400:
 *         description: Datos inválidos o usuario ya tiene ese plan
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Suscripción no encontrada
 *       500:
 *         description: Error del servidor
 */
router.put('/subscription', verifyToken, subscriptionController.updateSubscriptionPlan);

/**
 * @swagger
 * /api/v1/payments/subscription/complete-upgrade:
 *   post:
 *     summary: Completar upgrade después de añadir método de pago
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
 *               - setupSessionId
 *             properties:
 *               setupSessionId:
 *                 type: string
 *                 description: ID de la sesión de setup de Stripe completada
 *     responses:
 *       200:
 *         description: Upgrade completado exitosamente
 *       400:
 *         description: Sesión de setup no completada o datos inválidos
 *       404:
 *         description: Suscripción no encontrada
 *       500:
 *         description: Error del servidor
 */
router.post(
  '/subscription/complete-upgrade',
  verifyToken,
  subscriptionController.completeUpgrade
);

/**
 * @swagger
 * /api/v1/payments/subscription:
 *   delete:
 *     summary: Cancelar suscripción del usuario y downgrade a FREE
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
 *                 description: |
 *                   - true: Cancela inmediatamente y crea suscripción FREE
 *                   - false: Cancela al final del periodo, luego crea FREE
 *     responses:
 *       200:
 *         description: Suscripción cancelada y usuario downgradeado a FREE
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Subscription canceled and downgraded to FREE plan"
 *                 subscription:
 *                   type: object
 *                   properties:
 *                     planType:
 *                       type: string
 *                       example: "BASIC"
 *                     status:
 *                       type: string
 *                       example: "active"
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Suscripción no encontrada
 *       500:
 *         description: Error del servidor
 */
router.delete(
  '/subscription',
  verifyToken,
  subscriptionController.cancelSubscription
);

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

/**
 * @swagger
 * /api/v1/payments/internal/free-contract:
 *   post:
 *     summary: Crear un contrato de suscripción gratuito
 *     tags: [Payments]
 *     security:
 *       - internalAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - username
 *               - plan
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID del usuario
 *               username:
 *                 type: string
 *                 description: Nombre de usuario
 *               plan:
 *                 type: string
 *                 enum: [BASIC, PREMIUM]
 *                 description: Tipo de plan a contratar
 *     responses:
 *       200:
 *         description: Contrato creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 contract:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     username:
 *                       type: string
 *                     plan:
 *                       type: string
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */

router.post(
  '/internal/free-contract',
  requireInternalApiKey,
  subscriptionController.createFreeContract
);

export default router;
