import { describe, it, expect } from 'vitest';
import { api } from '../setup/setup.js';

describe('GET /api/v1/health', () => {
  it('should return 200 and the health payload', async () => {
    const res = await api.get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('message', 'Health check successful');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('db', 'connected');
  });

  it('should return kafka status', async () => {
    const res = await api.get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('kafka');
    expect(res.body.kafka).toHaveProperty('enabled');
    expect(res.body.kafka).toHaveProperty('connected');
    // In test environment, kafka should be disabled
    expect(res.body.kafka.enabled).toBe(false);
  });

  it('should return uptime as a number', async () => {
    const res = await api.get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThan(0);
  });

  it('should return valid ISO timestamp', async () => {
    const res = await api.get('/api/v1/health');

    expect(res.status).toBe(200);
    const timestamp = new Date(res.body.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).not.toBeNaN();
  });
});
