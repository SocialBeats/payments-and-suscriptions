/**
 * AddOn Routes
 * Endpoints for managing subscription add-ons
 */

import { Router } from 'express';
import {
  getAvailableAddOns,
  getMyAddOns,
  purchaseAddOn,
  cancelAddOn,
  completeAddOnSetup,
} from '../controllers/addOnController.js';

const router = Router();

// ====================================================================
// PUBLIC ROUTES
// El middleware global verifyToken ya está en main.js
// y permite rutas /api/v1/addons si se añaden a openPaths
// ====================================================================

/**
 * @swagger
 * /api/v1/payments/addons:
 *   get:
 *     summary: Get all available add-ons
 *     description: Returns all add-ons. If user is authenticated, filters by plan availability.
 *     tags: [AddOns]
 *     responses:
 *       200:
 *         description: List of available add-ons
 */
router.get('/', getAvailableAddOns);

// ====================================================================
// PROTECTED ROUTES (require authentication via global verifyToken)
// ====================================================================

/**
 * @swagger
 * /api/v1/payments/addons/my:
 *   get:
 *     summary: Get user's add-ons
 *     description: Returns active and available add-ons for the authenticated user
 *     tags: [AddOns]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's active and available add-ons
 *       401:
 *         description: Not authenticated
 */
router.get('/my', getMyAddOns);

/**
 * @swagger
 * /api/v1/payments/addons/purchase:
 *   post:
 *     summary: Purchase an add-on
 *     description: Add an add-on to the current subscription
 *     tags: [AddOns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - addonName
 *             properties:
 *               addonName:
 *                 type: string
 *                 description: Name of the add-on to purchase
 *     responses:
 *       200:
 *         description: Add-on purchased successfully
 *       400:
 *         description: Invalid add-on or not available for plan
 *       402:
 *         description: Payment method required
 */
router.post('/purchase', purchaseAddOn);

/**
 * @swagger
 * /api/v1/payments/addons/complete-setup:
 *   post:
 *     summary: Complete add-on purchase after payment setup
 *     description: Called after adding a payment method to complete add-on purchase
 *     tags: [AddOns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - addonName
 *             properties:
 *               addonName:
 *                 type: string
 *                 description: Name of the add-on being purchased
 *     responses:
 *       200:
 *         description: Add-on setup completed
 */
router.post('/complete-setup', completeAddOnSetup);

/**
 * @swagger
 * /api/v1/payments/addons/{addonName}:
 *   delete:
 *     summary: Cancel an add-on
 *     description: Remove an active add-on from the subscription
 *     tags: [AddOns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addonName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the add-on to cancel
 *     responses:
 *       200:
 *         description: Add-on canceled successfully
 *       404:
 *         description: Add-on not found or not active
 */
router.delete('/:addonName', cancelAddOn);

export default router;
