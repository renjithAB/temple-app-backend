import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

const app = createApp();

describe('Core API Endpoints & Middlewares', () => {
  it('GET /health should return 200 OK and timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /docs should serve Swagger UI HTML', async () => {
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Swagger UI');
  });

  it('GET /api/v1/openapi.json should return valid OpenAPI 3.1 schema', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.title).toContain('Temple Platform');
  });

  it('POST /api/v1/auth/otp/request should validate email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.email).toBeDefined();
  });

  it('POST /api/v1/auth/otp/request should reject unknown body fields (strict schema)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ email: 'test@example.com', unexpectedField: 'malicious' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/v1/me without token should return 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/v1/bookings without token should return 401 UNAUTHORIZED', async () => {
    const res = await request(app).post('/api/v1/bookings').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET non-existent route should return 404 NOT_FOUND format', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('Every response should carry X-Request-Id header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
  });
});
