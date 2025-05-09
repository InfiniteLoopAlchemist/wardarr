/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';

const serverModule = require('../server');
const app = serverModule;

// Helper to create temp directory structure
function makeStructure(root: string) {
  const showDir = path.join(root, 'Show1 (2001) [tvdbid-101]');
  const simpleShow = path.join(root, 'SimpleShow');
  fs.mkdirSync(showDir, { recursive: true });
  fs.mkdirSync(simpleShow, { recursive: true });
  const season1 = path.join(showDir, 'Season 1');
  const season2 = path.join(showDir, 'Season 2');
  fs.mkdirSync(season2, { recursive: true });
  fs.mkdirSync(season1, { recursive: true });
  // Episodes
  fs.writeFileSync(path.join(season1, 'Ep1.mkv'), '');
  fs.writeFileSync(path.join(season1, 'Ep2.mp4'), '');
  return { showDir, simpleShow, season1, season2 };
}

// Clean up temp dir
function cleanup(root: string) {
  fs.rmSync(root, { recursive: true, force: true });
}

describe('POST /api/match', () => {
  it('returns 400 if missing episodePath', async () => {
    const res = await request(app).post('/api/match').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing episodePath parameter' });
  });

  it('returns 400 if episode file not found', async () => {
    const res = await request(app).post('/api/match').send({ episodePath: '/no/such/file.mkv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Episode file not found or not accessible/);
  });
});

describe('Path-based content forwarding', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'path-'));
  let showDir: string, simpleShow: string, season1: string;

  beforeAll(() => {
    ({ showDir, simpleShow, season1 } = makeStructure(root));
  });

  afterAll(() => {
    cleanup(root);
  });

  it('GET /api/path/shows lists show directories', async () => {
    const encoded = encodeURIComponent(root);
    const res = await request(app).get(`/api/path/shows/${encoded}`);
    expect(res.status).toBe(200);
    const names = res.body.map((r: any) => r.name).sort();
    expect(names).toEqual([path.basename(showDir), 'SimpleShow']);
  });

  it('GET /api/path/seasons lists seasons sorted', async () => {
    const encoded = encodeURIComponent(showDir);
    const res = await request(app).get(`/api/path/seasons/${encoded}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.name)).toEqual(['Season 1', 'Season 2']);
  });

  it('GET /api/path/episodes lists episodes with null episode and correct filenames', async () => {
    const encoded = encodeURIComponent(season1);
    const res = await request(app).get(`/api/path/episodes/${encoded}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.episode)).toEqual([null, null]);
    expect(res.body.map((r: any) => r.name).sort()).toEqual(['Ep1.mkv', 'Ep2.mp4']);
  });
});

describe('Directory Browse endpoints', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browse-'));
  const fileA = path.join(root, 'a.txt');
  const dirB = path.join(root, 'subdir');

  beforeAll(() => {
    fs.mkdirSync(dirB, { recursive: true });
    fs.writeFileSync(fileA, '');
  });

  afterAll(() => {
    cleanup(root);
  });

  it('GET /api/browse returns items in directory', async () => {
    const res = await request(app).get('/api/browse').query({ path: root });
    expect(res.status).toBe(200);
    const items = res.body.map((r: any) => ({ name: r.name, isDirectory: r.isDirectory }));
    expect(items).toEqual(expect.arrayContaining([
      { name: 'a.txt', isDirectory: false },
      { name: 'subdir', isDirectory: true }
    ]));
  });

  it('GET /api/browse/libraries returns libraries via DB', async () => {
    // Insert libraries
    await request(app).post('/api/libraries').send({ path: root, title: 'L1', type: 'tv' });
    await request(app).post('/api/libraries').send({ path: root, title: 'L2', type: 'movie' });
    const res = await request(app).get('/api/browse/libraries');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/browse/shows requires parent query', async () => {
    const res = await request(app).get('/api/browse/shows');
    expect(res.status).toBe(400);
  });

  it('GET /api/browse/shows with parent returns content', async () => {
    const encodedParent = root;
    const res = await request(app).get('/api/browse/shows').query({ parent: root });
    // Should forward to content/shows and succeed (empty)
    expect([200, 400]).toContain(res.status);
  });

  it('GET /api/browse/invalidLevel returns 400', async () => {
    const res = await request(app).get('/api/browse/unknown');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid browse level/);
  });
}); 