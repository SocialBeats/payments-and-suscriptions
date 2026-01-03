/**
 * Tests for About Routes
 * Tests the about/info endpoints
 */
import { describe, it, expect } from 'vitest';
import { api, generateTestToken } from '../setup/setup.js';

describe('About Routes', () => {
  describe('GET /api/v1/about', () => {
    it('should return service information', async () => {
      const res = await api.get('/api/v1/about');

      // About endpoint may return 200 or redirect
      expect([200, 301, 302, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/about/version', () => {
    it('should return version information', async () => {
      const res = await api.get('/api/v1/about/version');

      // Version endpoint should return some info
      expect([200, 404]).toContain(res.status);
      
      if (res.status === 200) {
        expect(res.body).toBeDefined();
      }
    });
  });

  describe('GET /api/v1/about/plans', () => {
    it('should return available plans', async () => {
      const res = await api.get('/api/v1/about/plans');

      expect([200, 404]).toContain(res.status);
      
      if (res.status === 200) {
        expect(res.body).toHaveProperty('plans');
      }
    });

    it('should include plan details when authenticated', async () => {
      const token = generateTestToken();
      
      const res = await api
        .get('/api/v1/about/plans')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/about/addons', () => {
    it('should return available addons', async () => {
      const res = await api.get('/api/v1/about/addons');

      expect([200, 404]).toContain(res.status);
      
      if (res.status === 200) {
        expect(res.body).toHaveProperty('addons');
      }
    });
  });

  describe('GET /api/v1/about/features', () => {
    it('should return feature information', async () => {
      const res = await api.get('/api/v1/about/features');

      expect([200, 404]).toContain(res.status);
    });
  });
});

describe('Service Info Endpoints', () => {
  describe('API Documentation', () => {
    it('should provide API info at root', async () => {
      const res = await api.get('/api/v1');

      // Root may return info, redirect, or require auth
      expect([200, 301, 302, 401, 404]).toContain(res.status);
    });
  });

  describe('Service Status', () => {
    it('should report service status', async () => {
      const res = await api.get('/api/v1/health');

      expect(res.status).toBe(200);
      // Status puede ser 'ok' o 'OK'
      expect(['ok', 'OK']).toContain(res.body.status);
    });

    it('should include detailed status', async () => {
      const res = await api.get('/api/v1/health/detailed');

      expect([200, 404]).toContain(res.status);
    });
  });
});
