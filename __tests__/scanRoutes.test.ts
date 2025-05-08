/** @jest-environment node */
import request from 'supertest';
import fs from 'fs';
import betterSqlite3Mock from 'better-sqlite3';
import childProcess from 'child_process';

// Mock filesystem
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      access: jest.fn().mockResolvedValue(undefined),
      readdir: jest.fn().mockResolvedValue([]),
      stat: jest.fn().mockResolvedValue({ mtimeMs: Date.now() }),
    },
    existsSync: () => true,
  };
});

// Mock database
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => ({
    prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ lastInsertRowid: 1, changes: 1 }) }),
    exec: () => {},
  }));
});

// Mock child process spawn
jest.mock('child_process', () => ({ spawn: jest.fn() }));

// Helper to load fresh app instance (resets scanStatus)
const loadApp = () => {
  jest.resetModules();
  // Re-apply mocks
  jest.mock('fs');
  jest.mock('child_process');
  const app = require('../server');
  return app;
};

describe('Scan endpoints integration tests', () => {
  let app = loadApp();

  it('POST /api/scan error when db.all throws', async () => {
    const appErr = loadApp();
    // Stub getLibraries.all to throw
    appErr.getLibraries.all = () => { throw new Error('db fail'); };
    const res = await request(appErr).post('/api/scan');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to start scan/);
  });

  it('POST /api/scan starts scan and conflicts on second call', async () => {
    const res1 = await request(app).post('/api/scan');
    expect(res1.status).toBe(200);
    expect(res1.body.message).toMatch(/Scan started/);
    expect(res1.body.status).toHaveProperty('isScanning', true);

    const res2 = await request(app).post('/api/scan');
    expect(res2.status).toBe(409);
    expect(res2.body.error).toMatch(/already in progress/);
  });

  it('GET /api/scan/status returns no-cache headers and status', async () => {
    const res = await request(app).get('/api/scan/status');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-cache/);
    expect(res.body).toHaveProperty('isScanning', true);
  });

  it('POST /api/scan/stop before scan returns 400', async () => {
    const freshApp = loadApp();
    const res = await request(freshApp).post('/api/scan/stop');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No scan is currently in progress/);
  });

  it('POST /api/scan/stop after start returns 200 then 400', async () => {
    const appRun = loadApp();
    await request(appRun).post('/api/scan');
    const res1 = await request(appRun).post('/api/scan/stop');
    expect(res1.status).toBe(200);
    expect(res1.body.message).toMatch(/Stop requested/);

    const res2 = await request(appRun).post('/api/scan/stop');
    expect(res2.status).toBe(400);
    expect(res2.body.message).toMatch(/already requested/);
  });
}); 