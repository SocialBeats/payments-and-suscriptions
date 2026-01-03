/**
 * Test environment configuration
 * Sets up environment variables BEFORE any modules are imported
 */
import dotenv from 'dotenv';

// Load .env file first to get local configuration
dotenv.config();

// Disable Kafka for tests
process.env.ENABLE_KAFKA = 'false';
process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// MongoDB Test Configuration
// Use port 27017 as default (standard MongoDB port, used in GitHub Actions)
// For local development with docker-compose, set MONGOTESTURL in .env to use port 27020
process.env.MONGOTESTURL = process.env.MONGOTESTURL || 'mongodb://localhost:27017/payments-and-subscriptions_test';

// JWT Secret for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';

// Internal API Key for tests
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-api-key';

// Stripe Test Configuration (use test keys)
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
process.env.STRIPE_PRICE_FREE = process.env.STRIPE_PRICE_FREE || 'price_test_free';
process.env.STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO || 'price_test_pro';
process.env.STRIPE_PRICE_STUDIO = process.env.STRIPE_PRICE_STUDIO || 'price_test_studio';
process.env.STRIPE_PRICE_ADDON_DECORATIVES = process.env.STRIPE_PRICE_ADDON_DECORATIVES || 'price_test_addon_decoratives';
process.env.STRIPE_PRICE_ADDON_PROMOTED_BEAT = process.env.STRIPE_PRICE_ADDON_PROMOTED_BEAT || 'price_test_addon_promoted';
process.env.STRIPE_PRICE_ADDON_UNLOCK_FREE = process.env.STRIPE_PRICE_ADDON_UNLOCK_FREE || 'price_test_addon_unlock_free';
process.env.STRIPE_PRICE_ADDON_UNLOCK_PRO = process.env.STRIPE_PRICE_ADDON_UNLOCK_PRO || 'price_test_addon_unlock_pro';
process.env.STRIPE_PRICE_ADDON_FULL_STUDIO = process.env.STRIPE_PRICE_ADDON_FULL_STUDIO || 'price_test_addon_full_studio';

// SPACE Configuration
process.env.SPACE_URL = 'http://localhost:5403';
process.env.SPACE_API_KEY = 'test-space-api-key';
process.env.SPACE_SERVICE_NAME = 'socialbeats';

// Frontend URL
process.env.FRONTEND_URL = 'http://localhost:5173/socialbeats';

export default {};
