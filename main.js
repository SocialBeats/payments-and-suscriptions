import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { connectDB, disconnectDB } from './src/db.js';
// import your middlewares here
import verifyToken from './src/middlewares/authMiddlewares.js';
import { webhookMiddleware, verifyStripeSignature } from './src/middlewares/webhookMiddleware.js';
// import your routes here
import aboutRoutes from './src/routes/aboutRoutes.js';
import healthRoutes from './src/routes/healthRoutes.js';
import subscriptionRoutes from './src/routes/subscriptionRoutes.js';
// import controllers
import * as subscriptionController from './src/controllers/subscriptionController.js';
// import kafka
import { startKafkaConsumer, isKafkaEnabled } from './src/services/kafkaConsumer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

const PORT = process.env.PORT || 3000;

const app = express();

// IMPORTANTE: Montar webhook ANTES de express.json()
// Stripe necesita el body en formato raw para verificar la firma
app.post(
  '/api/v1/payments/webhook',
  webhookMiddleware,
  verifyStripeSignature,
  subscriptionController.handleWebhook
);

app.use(express.json());
app.use(cors());

// add your middlewares here like this:
app.use(verifyToken);

// add your routes here like this:
aboutRoutes(app);
healthRoutes(app);
app.use('/api/v1/payments', subscriptionRoutes);

// Export app for tests. Do not remove this line
export default app;

let server;

if (process.env.NODE_ENV !== 'test') {
  await connectDB();

  // Iniciar consumidor de Kafka si está habilitado
  if (isKafkaEnabled()) {
    logger.info('🔄 Kafka is enabled, starting consumer...');
    startKafkaConsumer().catch((err) => {
      logger.error('Failed to start Kafka consumer:', err);
    });
  } else {
    logger.info('⚠️  Kafka is disabled');
  }

  server = app.listen(PORT, () => {
    logger.warn(`Using log level: ${process.env.LOG_LEVEL}`);
    logger.info(`API running at http://localhost:${PORT}`);
    logger.info(`Health at http://localhost:${PORT}/api/v1/health`);
    logger.info(`API docs running at http://localhost:${PORT}/api/v1/docs/`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
  });
}

async function gracefulShutdown(signal) {
  logger.warn(`${signal} received. Starting secure shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info(
        'Since now new connections are not allowed. Waiting for current operations to finish...'
      );

      try {
        await disconnectDB();
        logger.info('MongoDB connection is now closed.');
      } catch (err) {
        logger.error('Error disconnecting from MongoDB:', err);
      }

      logger.info('shutting down API.');
      process.exit(0);
    });
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
