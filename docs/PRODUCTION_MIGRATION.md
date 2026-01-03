# 📋 Guía de Migración a Planes de Producción

## ✅ Migración Completada - SocialBeats-latest.yaml

Se ha actualizado el sistema de planes para reflejar el pricing definitivo de SocialBeats.

### Planes Actualizados

| Plan | Precio | Descripción |
|------|--------|-------------|
| **FREE** | €0.00/mes | Plan gratuito con funcionalidades básicas |
| **PRO** | €9.99/mes | Plan profesional con más límites y features |
| **STUDIO** | €19.99/mes | Plan más avanzado con todo desbloqueado |

### Archivos Modificados

1. **`src/config/plans.config.js`** - Configuración centralizada con FREE, PRO, STUDIO
2. **`src/controllers/subscriptionController.js`** - Actualizado para usar FREE_PLAN
3. **`src/services/stripeService.js`** - Actualizado PRICE_IDS legacy
4. **`src/services/spaceService.js`** - Actualizado plan por defecto a FREE
5. **`.env*`** - Variables STRIPE_PRICE_FREE, STRIPE_PRICE_PRO, STRIPE_PRICE_STUDIO

### Estructura Actual

```javascript
PLANS = {
  FREE: {
    name: 'FREE',
    price: 0.0, // EUR
    stripePriceId: process.env.STRIPE_PRICE_FREE,
    features: {
      advancedProfile: true, banner: false, certificates: true, decoratives: false,
      beats: true, beatSize: true, storage: true, downloads: false, cover: false,
      publicPlaylists: true, playlists: true, collaborators: true, privatePlaylists: false,
      dashboards: true, coreMetrics: true, proMetrics: false, studioMetrics: false,
    },
    usageLimits: {
      maxCertificates: 5, maxBeats: 3, maxBeatSize: 10, maxStorage: 30,
      maxPlaylists: 1, maxCollaborators: 3, maxBeatsPerPlaylist: 3,
      maxDashboards: 3, maxCoreMetrics: 3, maxProMetrics: 0, maxStudioMetrics: 0,
    }
  },
  PRO: {
    name: 'PRO',
    price: 9.99, // EUR
    stripePriceId: process.env.STRIPE_PRICE_PRO,
    // ... features y limits extendidos
  },
  STUDIO: {
    name: 'STUDIO',
    price: 19.99, // EUR
    stripePriceId: process.env.STRIPE_PRICE_STUDIO,
    // ... features y limits máximos (muchos Infinity)
  }
}
```

---

## 🔧 Siguiente Paso: Crear Price IDs en Stripe

### 1. Crear productos en Stripe Dashboard

Ve a https://dashboard.stripe.com/products y crea 3 productos:

1. **SocialBeats FREE** - €0.00/mes (recurring)
2. **SocialBeats PRO** - €9.99/mes (recurring)
3. **SocialBeats STUDIO** - €19.99/mes (recurring)

### 2. Copiar los Price IDs

Cada producto generará un `price_xxxxx`. Cópialos.

### 3. Actualizar `.env`

```env
STRIPE_PRICE_FREE=price_tu_free_id_aqui
STRIPE_PRICE_PRO=price_tu_pro_id_aqui
STRIPE_PRICE_STUDIO=price_tu_studio_id_aqui
```

### 4. Reiniciar servicio

```bash
cd payments-and-suscriptions
docker-compose restart
```

---

## ⚠️ Checklist Pre-Producción

- [x] Planes actualizados a FREE, PRO, STUDIO
- [x] Precios configurados (€0, €9.99, €19.99)
- [x] Features y limits sincronizados con YAML
- [x] SPACE_SERVICE_NAME actualizado a "socialbeats"
- [ ] **PENDIENTE**: Crear Price IDs en Stripe Dashboard
- [ ] **PENDIENTE**: Actualizar .env con Price IDs reales
- [ ] Probar creación de usuario con plan FREE
- [ ] Probar upgrade FREE → PRO
- [ ] Probar upgrade PRO → STUDIO
- [ ] Probar downgrade STUDIO → PRO → FREE
- [ ] Webhooks de Stripe configurados

---

## 📝 AddOns (Futuro)

El YAML también define AddOns que se pueden implementar en el futuro:

| AddOn | Precio | Disponible para |
|-------|--------|-----------------|
| decoratives | €0.99/mes | FREE, PRO |
| promotedBeat | €2.99/mes | PRO, STUDIO |
| privatePlaylists | €2.99/mes | FREE, PRO |
| unlockFullBeatFree | €1.49/mes | FREE |
| unlockFullBeatPro | €1.49/mes | PRO |
| fullStudioMetrics | €19.99/mes | FREE, PRO |

---

## 📚 Referencias

- Configuración: `src/config/plans.config.js`
- SPACE Pricing: `SocialBeats-latest.yaml`
- Stripe Dashboard: https://dashboard.stripe.com/products
