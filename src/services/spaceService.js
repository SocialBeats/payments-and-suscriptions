import { connect } from 'space-node-client';
import logger from '../../logger.js';

// Validación de configuración de SPACE
const SPACE_URL = process.env.SPACE_URL || 'http://localhost:5403';
const SPACE_API_KEY = process.env.SPACE_API_KEY || 'default-key';
const SPACE_SERVICE_NAME = process.env.SPACE_SERVICE_NAME || 'news';

if (process.env.NODE_ENV === 'production' && SPACE_API_KEY === 'default-key') {
  logger.warn('WARNING: Using default SPACE_API_KEY in production');
}

/**
 * Crear un contrato en SPACE para un usuario con un plan específico
 *
 * @param {Object} params - Parámetros del contrato
 * @param {string} params.userId - ID del usuario
 * @param {string} params.username - Nombre de usuario
 * @param {string} params.plan - Plan contratado (BASIC, PRO, PREMIUM)
 * @param {Object} params.addOns - Add-ons adicionales (opcional)
 * @returns {Promise<void>}
 */
export const createSpaceContract = async ({
  userId,
  username,
  plan,
  addOns = {},
}) => {
  return new Promise((resolve, reject) => {
    try {
      logger.info(
        `Creating SPACE contract for user ${userId} (${username}) with plan: ${plan}`
      );

      const spaceClient = connect({
        url: SPACE_URL,
        apiKey: SPACE_API_KEY,
      });

      spaceClient.on('synchronized', async () => {
        try {
          // Intentar obtener contrato existente
          const existingContract =
            await spaceClient.contracts.getContract(userId);

          if (existingContract) {
            logger.info(
              `Contract already exists for user ${userId}. Updating to plan: ${plan}`
            );

            // Actualizar plan existente
            await spaceClient.contracts.updateContract(userId, {
              subscriptionPlans: { [SPACE_SERVICE_NAME]: plan },
              subscriptionAddOns: addOns,
            });

            logger.info(
              `SPACE contract updated successfully for user ${userId}`
            );
            resolve();
          }
        } catch (error) {
          // Si no existe, crear nuevo contrato
          if (
            error.message?.includes('not found') ||
            error.response?.status === 404
          ) {
            logger.info(
              `No existing contract found. Creating new contract for ${userId}`
            );

            await spaceClient.contracts.addContract({
              userContact: { userId, username },
              billingPeriod: { autoRenew: true, renewalDays: 30 },
              contractedServices: { [SPACE_SERVICE_NAME]: '1.0' },
              subscriptionPlans: { [SPACE_SERVICE_NAME]: plan },
              subscriptionAddOns: addOns,
            });

            logger.info(
              `SPACE contract created successfully for user ${userId}`
            );
            resolve();
          } else {
            // Otro tipo de error
            logger.error(
              `Error checking/creating SPACE contract: ${error.message}`
            );
            reject(error);
          }
        }
      });

      spaceClient.on('error', (error) => {
        logger.error(`SPACE client error: ${error.message}`);
        reject(error);
      });

      // Timeout de seguridad
      setTimeout(() => {
        reject(new Error('SPACE contract creation timeout'));
      }, 10000); // 10 segundos
    } catch (error) {
      logger.error(`Error in createSpaceContract: ${error.message}`);
      reject(error);
    }
  });
};

/**
 * Actualizar un contrato existente en SPACE
 *
 * @param {Object} params - Parámetros de actualización
 * @param {string} params.userId - ID del usuario
 * @param {string} params.plan - Nuevo plan
 * @param {Object} params.addOns - Nuevos add-ons (opcional)
 * @returns {Promise<void>}
 */
export const updateSpaceContract = async ({ userId, plan, addOns = {} }) => {
  return new Promise((resolve, reject) => {
    try {
      logger.info(
        `Updating SPACE contract for user ${userId} to plan: ${plan}`
      );

      const spaceClient = connect({
        url: SPACE_URL,
        apiKey: SPACE_API_KEY,
      });

      spaceClient.on('synchronized', async () => {
        try {
          await spaceClient.contracts.updateContract(userId, {
            subscriptionPlans: { [SPACE_SERVICE_NAME]: plan },
            subscriptionAddOns: addOns,
          });

          logger.info(`SPACE contract updated successfully for user ${userId}`);
          resolve();
        } catch (error) {
          logger.error(`Error updating SPACE contract: ${error.message}`);
          reject(error);
        }
      });

      spaceClient.on('error', (error) => {
        logger.error(`SPACE client error: ${error.message}`);
        reject(error);
      });

      // Timeout de seguridad
      setTimeout(() => {
        reject(new Error('SPACE contract update timeout'));
      }, 10000);
    } catch (error) {
      logger.error(`Error in updateSpaceContract: ${error.message}`);
      reject(error);
    }
  });
};

/**
 * Cancelar (desactivar) un contrato en SPACE
 *
 * @param {string} userId - ID del usuario
 * @returns {Promise<void>}
 */
export const cancelSpaceContract = async (userId) => {
  return new Promise((resolve, reject) => {
    try {
      logger.info(`Canceling SPACE contract for user ${userId}`);

      const spaceClient = connect({
        url: SPACE_URL,
        apiKey: SPACE_API_KEY,
      });

      spaceClient.on('synchronized', async () => {
        try {
          // Downgrade a FREE o marcar como inactivo
          await spaceClient.contracts.updateContractSubscription(userId, {
            contractedServices: { [SPACE_SERVICE_NAME]: '1.0' },
            subscriptionPlans: { [SPACE_SERVICE_NAME]: 'BASIC' },
            subscriptionAddOns: {},
          });

          logger.info(
            `SPACE contract canceled (downgraded to FREE) for user ${userId}`
          );
          resolve();
        } catch (error) {
          logger.error(`Error canceling SPACE contract: ${error.message}`);
          reject(error);
        }
      });

      spaceClient.on('error', (error) => {
        logger.error(`SPACE client error: ${error.message}`);
        reject(error);
      });

      // Timeout de seguridad
      setTimeout(() => {
        reject(new Error('SPACE contract cancellation timeout'));
      }, 10000);
    } catch (error) {
      logger.error(`Error in cancelSpaceContract: ${error.message}`);
      reject(error);
    }
  });
};

/**
 * Eliminar completamente un contrato de SPACE
 * Usado cuando se elimina un usuario del sistema
 *
 * @param {string} userId - ID del usuario
 * @returns {Promise<void>}
 */
export const deleteSpaceContract = async (userId) => {
  try {
    logger.info(`Deleting SPACE contract for user ${userId}`);

    // Hacer llamada HTTP directa al endpoint de SPACE
    const response = await fetch(`${SPACE_URL}/api/v1/contracts/${userId}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': SPACE_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      logger.info(`SPACE contract deleted successfully for user ${userId}`);
      return;
    }

    // Si el contrato no existe (404), no es un error crítico
    if (response.status === 404) {
      logger.info(
        `SPACE contract not found for user ${userId}, already deleted`
      );
      return;
    }

    // Cualquier otro error
    const errorText = await response.text();
    throw new Error(
      `Failed to delete SPACE contract: ${response.status} ${errorText}`
    );
  } catch (error) {
    logger.error(
      `Error deleting SPACE contract for user ${userId}: ${error.message}`
    );
    throw error;
  }
};
