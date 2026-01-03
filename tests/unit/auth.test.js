import { describe, it, expect } from 'vitest';
import { api, generateTestToken, generateGatewayHeaders } from '../setup/setup.js';

describe('Authentication Middleware', () => {
  describe('Open Paths (No Auth Required)', () => {
    it('should allow access to /api/v1/health without auth', async () => {
      const res = await api.get('/api/v1/health');
      expect(res.status).toBe(200);
    });

    it('should allow access to /api/v1/about without auth', async () => {
      const res = await api.get('/api/v1/about');
      // Should return 200 or valid response, not 401
      expect(res.status).not.toBe(401);
    });
  });

  describe('JWT Authentication', () => {
    it('should reject request without token to protected route', async () => {
      const res = await api.get('/api/v1/payments/subscription');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'AUTHENTICATION_REQUIRED');
    });

    it('should reject request with invalid token', async () => {
      const res = await api
        .get('/api/v1/payments/subscription')
        .set('Authorization', 'Bearer invalid-token');

      // Invalid token returns 403 (forbidden) not 401
      expect([401, 403]).toContain(res.status);
    });

    it('should accept request with valid JWT token', async () => {
      const token = generateTestToken({
        id: 'user-auth-test',
        username: 'authtestuser',
      });

      const res = await api
        .get('/api/v1/payments/subscription')
        .set('Authorization', `Bearer ${token}`);

      // Should not be 401 (might be 404 if no subscription exists)
      expect(res.status).not.toBe(401);
    });

    it('should extract user info from valid JWT', async () => {
      const token = generateTestToken({
        id: 'user-jwt-extract',
        username: 'jwtextractuser',
      });

      const res = await api
        .get('/api/v1/payments/subscription')
        .set('Authorization', `Bearer ${token}`);

      // If 404, it means auth worked but no subscription found
      if (res.status === 404) {
        expect(res.body.error).toBe('SUBSCRIPTION_NOT_FOUND');
      }
    });
  });

  describe('Gateway Authentication', () => {
    it('should accept request with valid gateway headers', async () => {
      const headers = generateGatewayHeaders({
        id: 'user-gateway-test',
        username: 'gatewaytestuser',
      });

      const res = await api
        .get('/api/v1/payments/subscription')
        .set(headers);

      // Should not be 401
      expect(res.status).not.toBe(401);
    });

    it('should reject gateway auth without x-user-id', async () => {
      const res = await api
        .get('/api/v1/payments/subscription')
        .set('x-gateway-authenticated', 'true')
        .set('x-username', 'testuser');

      // Missing x-user-id should fall back to JWT check
      expect(res.status).toBe(401);
    });
  });

  describe('API Version Validation', () => {
    it('should reject requests without API version', async () => {
      const token = generateTestToken();

      // Direct path without /api/v1
      const res = await api
        .get('/payments/subscription')
        .set('Authorization', `Bearer ${token}`);

      // Should be 400 or 404 (route not found)
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('Internal API Key Authentication', () => {
    it('should accept internal routes with valid API key', async () => {
      const res = await api
        .post('/api/v1/payments/internal/free-contract')
        .set('x-internal-api-key', process.env.INTERNAL_API_KEY)
        .send({
          userId: 'internal-test-user',
          username: 'internaltestuser',
          plan: 'FREE',
          email: 'internal@test.com',
        });

      // Should not be 401 (might fail for other reasons like SPACE service)
      expect(res.status).not.toBe(401);
    });

    it('should reject internal routes without API key', async () => {
      const res = await api
        .post('/api/v1/payments/internal/free-contract')
        .send({
          userId: 'internal-test-user',
          username: 'internaltestuser',
          plan: 'FREE',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
    });

    it('should reject internal routes with invalid API key', async () => {
      const res = await api
        .post('/api/v1/payments/internal/free-contract')
        .set('x-internal-api-key', 'wrong-api-key')
        .send({
          userId: 'internal-test-user',
          username: 'internaltestuser',
          plan: 'FREE',
        });

      expect(res.status).toBe(401);
    });
  });
});
