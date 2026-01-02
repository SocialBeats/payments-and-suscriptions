import logger from '../../logger.js';
import { Kafka } from 'kafkajs';
import Subscription from '../models/Subscription.js';
import * as stripeService from './stripeService.js';
import * as spaceService from './spaceService.js';

const kafka = new Kafka({
  clientId: 'payments-and-suscriptions',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'payments-interaction-group' });
const producer = kafka.producer();

const admin = kafka.admin();

/**
 * Procesar evento de Kafka
 */
async function processEvent(event) {
  const data = event.payload;

  switch (event.type) {
    case 'USER_DELETED':
      try {
        const userId = data.userId;
        logger.info(`Processing USER_DELETED for user ${userId}`);

        // Buscar todas las suscripciones del usuario
        const subscriptions = await Subscription.find({ userId });
        logger.info(`Found ${subscriptions.length} subscriptions for user ${userId}`);

        for (const subscription of subscriptions) {
          try {
            // Cancelar suscripción en Stripe si existe
            if (subscription.stripeSubscriptionId) {
              await stripeService.cancelSubscriptionImmediately(
                subscription.stripeSubscriptionId,
              );
              logger.info(`Canceled Stripe subscription ${subscription.stripeSubscriptionId}`);
            }

            // Eliminar registro de la base de datos
            await Subscription.deleteOne({ _id: subscription._id });
            logger.info(`Deleted subscription ${subscription._id} from database`);
          } catch (err) {
            logger.error(
              `Failed to delete subscription ${subscription._id} for user ${userId}:`,
              err.message
            );
          }
        }

        // Eliminar contrato en SPACE (fuera del loop, una sola vez por usuario)
        try {
          await spaceService.deleteSpaceContract(userId);
          logger.info(`Deleted SPACE contract for user ${userId}`);
        } catch (spaceError) {
          logger.warn(`Failed to delete SPACE contract: ${spaceError.message}`);
        }

        logger.info(`Successfully processed USER_DELETED for user ${userId}`);
      } catch (error) {
        logger.error('Error processing USER_DELETED event:', error);
        throw error;
      }
      break;

    default:
      logger.warn('⚠ Unknown event detected:', event.type);
  }
}

/**
 * Enviar evento fallido a Dead Letter Queue
 */
async function sendToDLQ(event, reason) {
  try {
    await producer.send({
      topic: 'payments-interaction-dlq',
      messages: [
        {
          value: JSON.stringify({
            originalEvent: event,
            error: reason,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });
    logger.warn(`Event sent to DLQ: ${event.type}, reason: ${reason}`);
  } catch (err) {
    logger.error('Failed to send event to DLQ:', err);
  }
}

/**
 * Iniciar consumidor de Kafka
 */
export async function startKafkaConsumer() {
  const MAX_RETRIES = Number(process.env.KAFKA_CONNECTION_MAX_RETRIES || 5);
  const RETRY_DELAY = Number(process.env.KAFKA_CONNECTION_RETRY_DELAY || 5000);
  const COOLDOWN_AFTER_FAIL = Number(process.env.KAFKA_COOLDOWN || 30000);

  let attempt = 1;

  while (true) {
    try {
      logger.info(`Connecting to Kafka... (Attempt ${attempt}/${MAX_RETRIES})`);
      await consumer.connect();
      await producer.connect();
      
      // Suscribirse al topic de usuarios
      await consumer.subscribe({ topic: 'users-events', fromBeginning: true });

      logger.info('✅ Kafka connected & listening to users-events');

      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          try {
            const event = JSON.parse(message.value.toString());
            logger.debug(`Received event from ${topic}:`, event.type);
            await processEvent(event);
          } catch (err) {
            logger.error(
              'Error processing message:',
              err,
              'Message:',
              message.value.toString()
            );
            await sendToDLQ(message.value.toString(), err.message);
          }
        },
      });

      attempt = 1;
      break;
    } catch (err) {
      logger.error(`Kafka connection failed: ${err.message}`);

      if (attempt >= MAX_RETRIES) {
        logger.warn(
          `Max retries reached. Cooling down for ${COOLDOWN_AFTER_FAIL / 1000}s before trying again...`
        );
        await new Promise((res) => setTimeout(res, COOLDOWN_AFTER_FAIL));
        attempt = 1;
      } else {
        attempt++;
        logger.warn(`Retrying in ${RETRY_DELAY / 1000}s...`);
        await new Promise((res) => setTimeout(res, RETRY_DELAY));
      }
    }
  }
}

/**
 * Verificar si Kafka está conectado
 */
export async function isKafkaConnected() {
  try {
    await admin.connect();
    await admin.describeCluster();
    await admin.disconnect();
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Verificar si Kafka está habilitado
 */
export function isKafkaEnabled() {
  return process.env.ENABLE_KAFKA?.toLowerCase() === 'true';
}

export { consumer, producer, processEvent };
