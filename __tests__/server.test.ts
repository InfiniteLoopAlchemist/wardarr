/** @jest-environment node */
import fs from 'fs';
import path from 'path';
// Remove existing test database so we start with a clean state
const dbFile = path.join(__dirname, '..', 'libraries.test.db');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
import request from 'supertest';
// Mock better-sqlite3 to use in-memory stubs
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => ({
    prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ lastInsertRowid: 1, changes: 1 }) }),
    exec: () => {},
  }));
});
const app = require('../server');

describe('Backend API', () => {
  describe('GET /api/history', () => {
    it('returns a JSON array', async () => {
      const res = await request(app).get('/api/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/latest-match', () => {
    beforeEach(async () => {
      // Clear all scan history so no records exist
      await request(app).delete('/api/history');
    });

    it('returns found=false when no records exist', async () => {
      const res = await request(app).get('/api/latest-match');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('found', false);
    });

    it('sets no-cache headers', async () => {
      const res = await request(app).get('/api/latest-match');
      expect(res.headers['cache-control']).toMatch(/no-cache/);
    });
  });
}); 