/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';

const serverModule = require('../server');
const app = serverModule;
const addLibrary = serverModule.addLibrary;
const addScannedFile = serverModule.addScannedFile;

// Ensure public/matches directory exists for static file tests
const publicMatchesDir = path.join(__dirname, '..', 'public', 'matches');

beforeAll(() => {
  if (!fs.existsSync(publicMatchesDir)) {
    fs.mkdirSync(publicMatchesDir, { recursive: true });
  }
});

describe('Latest Verification Endpoint', () => {
  beforeEach(async () => {
    // Clear scanned_files and reset status via API
    await request(app).delete('/api/queue');
  });

  it('returns found=false when no records', async () => {
    const res = await request(app).get('/api/latest-verification');
    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toMatch(/no-cache/);
    expect(res.header['pragma']).toBe('no-cache');
    expect(res.header['expires']).toBe('0');
    expect(res.body).toEqual({ found: false });
  });

  it('returns found=true with correct fields after insert', async () => {
    const libId = addLibrary.run('LibX', '/tmp', 'tv').lastInsertRowid;
    const now = Date.now();
    addScannedFile.run(libId, '/file1.mp4', 111, now, '/matches/img1.jpg', 0.88, 1, 'epX');

    const res = await request(app).get('/api/latest-verification');
    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toMatch(/no-cache/);
    expect(res.body.found).toBe(true);
    expect(res.body.file_path).toBe('/file1.mp4');
    expect(res.body.verification_image_path).toBe('/matches/img1.jpg');
    expect(res.body.match_score).toBe(0.88);
    expect(res.body.is_verified).toBe(true);
    expect(res.body.episode_info).toBe('epX');
    expect(res.body.last_scanned_time).toBe(now);
    expect(res.body.timestamp).toBeGreaterThanOrEqual(now);
  });
});

describe('Latest Match Endpoint', () => {
  beforeEach(async () => {
    // Clear scanned_files via API
    await request(app).delete('/api/queue');
  });

  it('returns found=false when no records', async () => {
    const res = await request(app).get('/api/latest-match');
    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toMatch(/no-cache/);
    expect(res.body).toEqual({ found: false });
  });

  it('returns found=true with source and correct fields after insert', async () => {
    const libId = addLibrary.run('LibY', '/tmp', 'tv').lastInsertRowid;
    const ts = 222;
    addScannedFile.run(libId, '/file2.mkv', 222, ts, 'img2.jpg', 0.55, 0, 'epY');

    const res = await request(app).get('/api/latest-match');
    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toMatch(/no-cache/);
    expect(res.body.found).toBe(true);
    expect(res.body.source).toBe('database');
    expect(res.body.file_path).toBe('/file2.mkv');
    expect(res.body.verification_image_path).toBe('/img2.jpg');
    expect(res.body.match_score).toBe(0.55);
    expect(res.body.is_verified).toBe(false);
    expect(res.body.episode_info).toBe('epY');
    expect(res.body.timestamp).toBeGreaterThanOrEqual(ts);
  });
});

describe('Static file serving and CORS for /matches', () => {
  const testFile = 'test.txt';
  const testContent = 'Hello World';

  beforeAll(() => {
    fs.writeFileSync(path.join(publicMatchesDir, testFile), testContent);
  });

  afterAll(() => {
    fs.unlinkSync(path.join(publicMatchesDir, testFile));
  });

  it('serves static files under /matches with CORS and no-cache headers', async () => {
    const res = await request(app).get(`/matches/${testFile}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe(testContent);
    expect(res.header['access-control-allow-origin']).toBe('*');
    expect(res.header['cache-control']).toMatch(/no-cache/);
    expect(res.header['pragma']).toBe('no-cache');
    expect(res.header['expires']).toBe('0');
  });
}); 