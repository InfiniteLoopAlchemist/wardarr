/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import request from 'supertest';

// Mock sqlite to prevent actual file writes during tests
jest.mock('better-sqlite3', () => {
  // Create a stub statement with predictable behavior
  const stmt = {
    run: jest.fn().mockReturnValue({ changes: 0 }),
    get: jest.fn().mockReturnValue(undefined),
    all: jest.fn().mockReturnValue([]),
  };
  return jest.fn().mockImplementation(() => ({
    exec: jest.fn(),
    prepare: jest.fn().mockReturnValue(stmt),
  }));
});

// Remove existing test database to start with clean state
const dbFile = path.join(__dirname, '..', 'libraries.test.db');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

const app = require('../server');

describe('Core API Routes', () => {
  test('GET /test responds with 200 and expected body', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.text).toBe('Server test route is working!');
  });

  test('GET / responds with 200 and expected body', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('TV Show API Server');
  });

  test('GET /api/libraries returns empty array', async () => {
    const res = await request(app).get('/api/libraries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  test('GET /api/history returns empty array', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  test('GET /api/browse/libraries returns empty array', async () => {
    const res = await request(app).get('/api/browse/libraries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  test('GET /api/latest-match returns found=false', async () => {
    const res = await request(app).get('/api/latest-match');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('found', false);
  });

  test('GET /api/latest-verification returns found=false', async () => {
    const res = await request(app).get('/api/latest-verification');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('found', false);
  });

  test('GET /api/scan/status returns scan status object', async () => {
    const res = await request(app).get('/api/scan/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('isScanning');
    expect(typeof res.body.isScanning).toBe('boolean');
  });

  test('DELETE /api/history clears history (idempotent)', async () => {
    const res = await request(app).delete('/api/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  test('unknown route returns 404 JSON error', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Route not found/);
  });
}); 