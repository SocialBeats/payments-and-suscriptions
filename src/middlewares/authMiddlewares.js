import jwt from 'jsonwebtoken';
import logger from '../../logger.js';

const openPaths = [
  '/api/v1/docs/',
  '/api/v1/health',
  '/api/v1/about',
  '/api/v1/changelog',
  '/api/v1/version',
  '/api/v1/payments/webhook', // Webhook de Stripe debe ser público
];

/**
 * Middleware de autenticación con soporte dual:
 * 1. Headers del API Gateway (producción)
 * 2. JWT directo (Swagger/testing)
 * 
 * Headers del API Gateway:
 * - x-gateway-authenticated: 'true' si el token es válido
 * - x-user-id: ID del usuario
 * - x-username: Nombre de usuario
 * - x-roles: Roles del usuario (separados por comas)
 * - x-user-pricing-plan: Plan de pricing del usuario
 */
const verifyToken = (req, res, next) => {
  // Permitir rutas abiertas sin verificación
  const fullPath = req.originalUrl.split('?')[0]; // Usar originalUrl para tener la ruta completa
  if (openPaths.some((path) => fullPath.startsWith(path))) {
    return next();
  }

  // Validar que la ruta incluya versión de API (usando originalUrl)
  if (!fullPath.startsWith('/api/v')) {
    return res.status(400).json({
      error: 'INVALID_API_VERSION',
      message: 'You must specify the API version, e.g. /api/v1/...',
    });
  }

  // Opción 1: Verificar autenticación mediante headers del gateway
  const userId = req.headers['x-user-id'];
  const username = req.headers['x-username'];
  const gatewayAuth = req.headers['x-gateway-authenticated'];
  const roles = req.headers['x-roles'];
  const pricingPlan = req.headers['x-user-pricing-plan'];

  if (gatewayAuth === 'true' && userId) {
    // Autenticado vía API Gateway
    req.user = {
      id: userId,
      username: username,
      roles: roles ? roles.split(',') : [],
      pricingPlan: pricingPlan || 'FREE',
    };
    logger.debug(`User authenticated via gateway: ${userId} (${username})`);
    return next();
  }

  // Opción 2: Verificar JWT directo (para Swagger/testing)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(`Unauthenticated request to ${req.path} - No authentication found`);
    return res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required. Provide JWT token or use API Gateway.',
    });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Construir objeto user desde JWT
    req.user = {
      id: decoded.id || decoded.userId,
      username: decoded.username,
      roles: decoded.roles || [],
      pricingPlan: decoded.pricingPlan || 'FREE',
    };

    logger.debug(`User authenticated via JWT: ${req.user.id} (${req.user.username})`);
    next();
  } catch (error) {
    logger.warn(`JWT verification failed: ${error.message}`);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Token expired. Please login again.',
      });
    }
    
    return res.status(403).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid or malformed token.',
    });
  }
};

export default verifyToken;
