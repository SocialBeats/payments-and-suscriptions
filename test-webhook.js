/**
 * Script para probar el webhook manualmente
 * Obtiene la sesión de checkout completada y llama al webhook local
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const CHECKOUT_SESSION_ID = process.argv[2]; // Pasar el ID de la sesión como argumento

if (!CHECKOUT_SESSION_ID) {
  console.error('❌ Uso: node test-webhook.js <checkout_session_id>');
  console.error('Ejemplo: node test-webhook.js cs_test_...');
  process.exit(1);
}

async function triggerWebhook() {
  try {
    console.log(`🔍 Obteniendo datos de la sesión: ${CHECKOUT_SESSION_ID}`);
    
    // Obtener la sesión de Stripe
    const stripe = (await import('stripe')).default(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(CHECKOUT_SESSION_ID, {
      expand: ['subscription']
    });

    console.log(`✅ Sesión encontrada:`);
    console.log(`   - Customer: ${session.customer}`);
    console.log(`   - Subscription: ${session.subscription?.id || session.subscription}`);
    console.log(`   - Payment Status: ${session.payment_status}`);
    console.log(`   - Metadata:`, session.metadata);

    if (session.payment_status !== 'paid') {
      console.error(`❌ El pago no está completado. Status: ${session.payment_status}`);
      process.exit(1);
    }

    // Crear evento simulado
    const webhookEvent = {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: session
      },
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null }
    };

    console.log('\n📤 Enviando webhook a localhost:3010...');

    // Llamar al webhook local
    const response = await fetch('http://localhost:3006/api/v1/payments/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookEvent)
    });

    console.log(`📥 Respuesta del webhook: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Webhook procesado exitosamente:', data);
    } else {
      const error = await response.text();
      console.error('❌ Error en el webhook:', error);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

triggerWebhook();
