# 📋 Guía de Migración a Planes de Producción

## ✅ Centralización Completada

Se ha creado un sistema centralizado de configuración de planes que facilita la actualización a los planes reales de producción.

### Archivos Modificados

1. **NUEVO**: `src/config/plans.config.js` - Configuración centralizada de todos los planes
2. **ACTUALIZADO**: `src/controllers/subscriptionController.js` - Usa `getValidPlans()` y `comparePlans()`
3. **ACTUALIZADO**: `src/services/stripeService.js` - Usa funciones centralizadas

### Estructura Actual

```javascript
PLANS = {
  BASIC: {
    name: 'BASIC',
    price: 0.0 EUR,
    stripePriceId: process.env.STRIPE_PRICE_BASIC,
    features: { news: true, sideAds: true, bottomAd: true },
    usageLimits: { maxNews: 2 }
  },
  PREMIUM: {
    name: 'PREMIUM',
    price: 10.0 EUR,
    stripePriceId: process.env.STRIPE_PRICE_PREMIUM,
    features: { news: true, sideAds: false, bottomAd: false },
    usageLimits: { maxNews: 10 }
  }
}
```

---

## 🔄 Pasos para Migrar a Planes Reales

### 1. Obtener los nuevos Price IDs de Stripe

En el Dashboard de Stripe (producción):
- Crea los productos/precios para tus planes reales
- Anota los `price_xxxxx` IDs generados

### 2. Actualizar el archivo `.env`

```env
# ANTES (testing)
STRIPE_PRICE_BASIC=price_1SiacrPKbLZoYa8MUF2j4H7R
STRIPE_PRICE_PREMIUM=price_1SiadQPKbLZoYa8MyxsF2XPz

# DESPUÉS (producción) - Ejemplo
STRIPE_PRICE_BASIC=price_1RealBasicPriceID123
STRIPE_PRICE_PREMIUM=price_1RealPremiumPriceID456
```

### 3. Actualizar `src/config/plans.config.js`

Solo necesitas modificar:

```javascript
export const PLANS = {
  BASIC: {
    name: 'BASIC',
    displayName: 'Basic',
    description: 'Enjoy daily news about the SPACE!',
    price: 0.0, // ← Cambiar si el precio cambia
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_BASIC, // ← Ya usa .env
    features: {
      news: true,
      sideAds: true,
      bottomAd: true,
    },
    usageLimits: {
      maxNews: 2, // ← Ajustar si cambia el límite
    },
  },
  PREMIUM: {
    name: 'PREMIUM',
    displayName: 'Premium',
    description: 'Disable ads and read more news!',
    price: 10.0, // ← Cambiar al precio real
    unit: 'user/month',
    stripePriceId: process.env.STRIPE_PRICE_PREMIUM, // ← Ya usa .env
    features: {
      news: true,
      sideAds: false,
      bottomAd: false,
    },
    usageLimits: {
      maxNews: 10, // ← Ajustar si cambia el límite
    },
  },
};
```

### 4. Si los nombres de planes cambian

Si en lugar de `BASIC` y `PREMIUM` usas otros nombres (ej: `FREE`, `PRO`, `ENTERPRISE`):

1. Renombrar las keys en `PLANS` object
2. Actualizar `.env` con las nuevas variables:
   ```env
   STRIPE_PRICE_FREE=price_xxx
   STRIPE_PRICE_PRO=price_yyy
   STRIPE_PRICE_ENTERPRISE=price_zzz
   ```
3. Actualizar `FREE_PLAN` en `plans.config.js`:
   ```javascript
   export const getDefaultFreePlan = () => {
     return 'FREE'; // o el nombre de tu plan gratuito
   };
   ```

### 5. Reiniciar el servicio

```bash
cd payments-and-suscriptions
docker-compose restart
```

---

## 🧪 Testing

### Verificar configuración cargada

```javascript
import { PLANS, getValidPlans, comparePlans } from './config/plans.config.js';

console.log('Planes válidos:', getValidPlans());
console.log('Config BASIC:', PLANS.BASIC);
console.log('Config PREMIUM:', PLANS.PREMIUM);
```

### Test de upgrade/downgrade

```javascript
const result = comparePlans('BASIC', 'PREMIUM');
console.log(result);
// { isUpgrade: true, currentPrice: 0, newPrice: 10, priceDiff: 10 }
```

---

## ⚠️ Checklist Pre-Producción

- [ ] Price IDs de Stripe creados en producción
- [ ] `.env` actualizado con nuevos Price IDs
- [ ] `plans.config.js` actualizado con precios reales
- [ ] Nombres de planes actualizados (si aplica)
- [ ] Límites de uso actualizados (si aplica)
- [ ] Variables de entorno en servidor de producción actualizadas
- [ ] Servicio reiniciado con nueva configuración
- [ ] Probado upgrade BASIC → PREMIUM
- [ ] Probado downgrade PREMIUM → BASIC
- [ ] Probado creación de usuario con plan FREE
- [ ] Webhooks de Stripe configurados con URL de producción

---

## 📝 Información para pasarme

Cuando tengas los planes reales, pásame:

```
PLAN: BASIC
- Price ID: price_xxxxx
- Precio: €X.XX
- Features: { ... }
- Usage Limits: { maxNews: X }

PLAN: PREMIUM
- Price ID: price_yyyyy
- Precio: €Y.YY
- Features: { ... }
- Usage Limits: { maxNews: Y }
```

Y haré los cambios en ~2 minutos.

---

## 🎯 Ventajas de esta implementación

✅ **Un solo archivo** para actualizar precios y configuración
✅ **Type-safe** con funciones helper
✅ **Escalable** - Fácil añadir más planes (PRO, ENTERPRISE, etc.)
✅ **Consistente** - Misma lógica en todo el código
✅ **Documentado** - Sincronizado con SPACE pricing.yml
✅ **Testeable** - Funciones puras para testing

---

## 📚 Referencias

- Configuración: `src/config/plans.config.js`
- SPACE Pricing: `space-socialbeats/pricing.yml`
- Stripe Dashboard: https://dashboard.stripe.com/prices
