/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';

const app = require('../server');

describe('Legacy Content Endpoints', () => {
  const root = path.join(os.tmpdir(), `legacy-${Date.now()}`);
  const showA = path.join(root, 'ShowA (1999) [tvdbid-123]');
  const showB = path.join(root, 'SimpleShow');

  beforeAll(() => {
    // Create shows
    fs.mkdirSync(showA, { recursive: true });
    fs.mkdirSync(showB, { recursive: true });
    // Create seasons under showA in reverse order
    fs.mkdirSync(path.join(showA, 'Season 2'), { recursive: true });
    fs.mkdirSync(path.join(showA, 'Season 1'), { recursive: true });
    // Create episodes under Season 1
    const epDir = path.join(showA, 'Season 1');
    fs.writeFileSync(path.join(epDir, 'Show - S01E02 - Name2.mkv'), '');
    fs.writeFileSync(path.join(epDir, 'Show - S01E01 - Name1.mkv'), '');
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('GET /api/shows', () => {
    it('returns 400 when path missing', async () => {
      const res = await request(app).get('/api/shows');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing path parameter' });
    });

    it('returns show directories with metadata', async () => {
      const res = await request(app).get('/api/shows').query({ path: root });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      const names = res.body.map((r: any) => r.name).sort();
      expect(names).toEqual([ 'ShowA (1999) [tvdbid-123]', 'SimpleShow' ]);
      const a = res.body.find((r: any) => r.name.startsWith('ShowA'));
      expect(a.year).toBe('1999');
      expect(a.tvdbId).toBe('123');
      const b = res.body.find((r: any) => r.name === 'SimpleShow');
      expect(b.year).toBeNull();
      expect(b.tvdbId).toBeNull();
    });
  });

  describe('GET /api/seasons', () => {
    it('returns 400 when path missing', async () => {
      const res = await request(app).get('/api/seasons');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing show path parameter' });
    });

    it('returns seasons sorted by number', async () => {
      const res = await request(app).get('/api/seasons').query({ path: showA });
      expect(res.status).toBe(200);
      expect(res.body.map((s: any) => s.name)).toEqual(['Season 1', 'Season 2']);
      expect(res.body.map((s: any) => s.number)).toEqual([1, 2]);
    });
  });

  describe('GET /api/episodes', () => {
    it('returns 400 when path missing', async () => {
      const res = await request(app).get('/api/episodes');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing season path parameter' });
    });

    it('returns episodes sorted by season and episode', async () => {
      const epPath = path.join(showA, 'Season 1');
      const res = await request(app).get('/api/episodes').query({ path: epPath });
      expect(res.status).toBe(200);
      expect(res.body.map((e: any) => e.episode)).toEqual([1, 2]);
      expect(res.body.map((e: any) => e.name)).toEqual(['Name1.mkv', 'Name2.mkv']);
    });
  });
}); 