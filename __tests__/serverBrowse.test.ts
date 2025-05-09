/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';

// Require server (uses in-memory DB for tests)
const app = require('../server');

describe('Browse API', () => {
  const tempRoot = path.join(os.tmpdir(), `browse-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns 400 when path not found', async () => {
    const fake = path.join(tempRoot, 'noexist');
    const res = await request(app).get('/api/browse').query({ path: fake });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Directory not found/);
  });

  it('lists directory contents', async () => {
    // Create a file and a directory
    const filePath = path.join(tempRoot, 'file.txt');
    const dirPath = path.join(tempRoot, 'dir');
    fs.writeFileSync(filePath, 'hello');
    fs.mkdirSync(dirPath);

    const res = await request(app).get('/api/browse').query({ path: tempRoot });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { name: 'file.txt', path: filePath, isDirectory: false },
        { name: 'dir', path: dirPath, isDirectory: true }
      ])
    );
  });

  it('lists libraries when level is libraries', async () => {
    const res = await request(app).get('/api/browse/libraries');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 400 for invalid browse level', async () => {
    const res = await request(app).get('/api/browse/invalid').query({ parent: tempRoot });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid browse level/);
  });
}); 