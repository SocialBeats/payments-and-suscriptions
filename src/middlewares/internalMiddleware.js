import logger from '../../logger.js';

/**
 * Middleware para validar acceso mediante Internal API Key.
 * Usado para comunicación entre microservicios o FaaS de confianza.
 */
export const requireInternalApiKey = (req, res, next) => {
  const apiKey = req.headers['x-internal-api-key'];
  const configuredKey = process.env.INTERNAL_API_KEY;

  if (!configuredKey) {
    logger.error('INTERNAL_API_KEY no está configurada en el entorno');
    return res.status(500).json({
      error: 'CONFIGURATION_ERROR',
      message: 'Internal authentication configuration error',
    });
  }

  if (!apiKey || apiKey !== configuredKey) {
    logger.warn(
      `Intento de acceso interno fallido desde ${req.ip}. Key proporcionada: ${apiKey ? '***' : 'missing'}`
    );
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or missing internal API key',
    });
  }

  logger.info('Acceso interno autorizado correctamente');
  next();
};
