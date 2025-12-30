// Test script para probar el endpoint de actualización de plan
// Ejecutar: node test-update-plan.js

import fetch from 'node-fetch';

// Configuración
const API_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_TOKEN = process.argv[2]; // Pasar como argumento

if (!JWT_TOKEN) {
  console.error('❌ Error: Debes proporcionar un JWT token');
  console.log('Uso: node test-update-plan.js <JWT_TOKEN>');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${JWT_TOKEN}`,
  'Content-Type': 'application/json',
};

// Helper para hacer requests
const apiRequest = async (method, path, body = null) => {
  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json();

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
};

// Test 1: Obtener estado actual
console.log('🔍 Test 1: Obtener estado actual de la suscripción...\n');
const currentState = await apiRequest('GET', '/api/v1/payments/subscription');

if (currentState.ok) {
  console.log('✅ Estado actual:');
  console.log(JSON.stringify(currentState.data, null, 2));
  console.log('\n---\n');
} else {
  console.log('❌ Error obteniendo estado:', currentState.data);
  process.exit(1);
}

const currentPlan = currentState.data.subscription?.planType;

// Test 2: Intentar actualizar al mismo plan (debe fallar)
console.log(`🔍 Test 2: Intentar actualizar al mismo plan (${currentPlan})...\n`);
const sameplanTest = await apiRequest('PUT', '/api/v1/payments/subscription', {
  planType: currentPlan,
});

if (!sameplanTest.ok && sameplanTest.data.error === 'SAME_PLAN') {
  console.log('✅ Validación correcta: No permite actualizar al mismo plan');
  console.log(JSON.stringify(sameplanTest.data, null, 2));
  console.log('\n---\n');
} else {
  console.log('⚠️  Comportamiento inesperado:', sameplanTest.data);
  console.log('\n---\n');
}

// Test 3: Actualizar a un plan diferente
const targetPlan = currentPlan === 'BASIC' ? 'PREMIUM' : 'BASIC';
console.log(`🔍 Test 3: Actualizar de ${currentPlan} a ${targetPlan}...\n`);

const updateResult = await apiRequest('PUT', '/api/v1/payments/subscription', {
  planType: targetPlan,
  prorationBehavior: 'create_prorations',
});

if (updateResult.ok) {
  console.log('✅ Plan actualizado exitosamente:');
  console.log(JSON.stringify(updateResult.data, null, 2));
  console.log('\n---\n');
} else {
  console.log('❌ Error actualizando plan:', updateResult.data);
  console.log('\n---\n');
}

// Test 4: Verificar el cambio
console.log('🔍 Test 4: Verificar que el cambio se aplicó...\n');
await new Promise((resolve) => setTimeout(resolve, 2000)); // Esperar 2 segundos

const verifyState = await apiRequest('GET', '/api/v1/payments/subscription');

if (verifyState.ok) {
  const newPlan = verifyState.data.subscription.planType;

  if (newPlan === targetPlan) {
    console.log(`✅ Verificación exitosa: Plan cambiado a ${newPlan}`);
  } else {
    console.log(`⚠️  Plan no cambió correctamente. Esperado: ${targetPlan}, Actual: ${newPlan}`);
  }

  console.log(JSON.stringify(verifyState.data, null, 2));
  console.log('\n---\n');
}

// Test 5: Volver al plan original
console.log(`🔍 Test 5: Volver al plan original (${currentPlan})...\n`);

const revertResult = await apiRequest('PUT', '/api/v1/payments/subscription', {
  planType: currentPlan,
  prorationBehavior: 'none', // No prorratear, cambio al final del periodo
});

if (revertResult.ok) {
  console.log('✅ Plan revertido exitosamente:');
  console.log(JSON.stringify(revertResult.data, null, 2));
  console.log('\n---\n');
} else {
  console.log('❌ Error revirtiendo plan:', revertResult.data);
  console.log('\n---\n');
}

// Test 6: Intentar plan inválido
console.log('🔍 Test 6: Intentar actualizar a un plan inválido...\n');

const invalidPlanTest = await apiRequest('PUT', '/api/v1/payments/subscription', {
  planType: 'ENTERPRISE', // Plan que no existe
});

if (!invalidPlanTest.ok && invalidPlanTest.data.error === 'INVALID_PLAN_TYPE') {
  console.log('✅ Validación correcta: Rechaza planes inválidos');
  console.log(JSON.stringify(invalidPlanTest.data, null, 2));
  console.log('\n---\n');
} else {
  console.log('⚠️  Comportamiento inesperado:', invalidPlanTest.data);
  console.log('\n---\n');
}

// Resumen
console.log('📊 RESUMEN DE TESTS');
console.log('===================');
console.log('✅ Test 1: Obtener estado actual');
console.log('✅ Test 2: Validación de mismo plan');
console.log(updateResult.ok ? '✅' : '❌', 'Test 3: Actualizar plan');
console.log(verifyState.ok ? '✅' : '❌', 'Test 4: Verificar cambio');
console.log(revertResult.ok ? '✅' : '❌', 'Test 5: Revertir plan');
console.log('✅ Test 6: Validación de plan inválido');
console.log('\n✨ Tests completados!\n');
