/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';

// Require server (uses in-memory DB for tests)
const app = require('../server');

describe('Content API', () => {
  const tempRoot = path.join(os.tmpdir(), `content-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('parameter validation', () => {
    it('returns 400 if path missing', async () => {
      const res = await request(app).get('/api/content/shows');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing path parameter/);
    });

    it('returns 400 if directory not found', async () => {
      const fake = path.join(tempRoot, 'nofolder');
      const res = await request(app)
        .get('/api/content/shows')
        .query({ path: fake });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Directory not found/);
    });
  });

  describe('GET /api/content/shows', () => {
    const showA = 'ShowA (2005) [tvdbid-999]';
    const showB = 'OtherShow';

    beforeAll(() => {
      fs.mkdirSync(path.join(tempRoot, showA));
      fs.mkdirSync(path.join(tempRoot, showB));
      fs.writeFileSync(path.join(tempRoot, 'file.txt'), '');
    });

    it('lists show directories with metadata', async () => {
      const res = await request(app)
        .get('/api/content/shows')
        .query({ path: tempRoot });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: showA,
            year: '2005',
            tvdbId: '999',
            path: path.join(tempRoot, showA)
          }),
          expect.objectContaining({
            name: showB,
            year: null,
            tvdbId: null,
            path: path.join(tempRoot, showB)
          })
        ])
      );
    });
  });

  describe('GET /api/content/seasons', () => {
    const seasonRoot = path.join(tempRoot, 'SomeShow');

    beforeAll(() => {
      fs.mkdirSync(seasonRoot);
      fs.mkdirSync(path.join(seasonRoot, 'Season 2'));
      fs.mkdirSync(path.join(seasonRoot, 'Season 1'));
      fs.mkdirSync(path.join(seasonRoot, 'NotSeason'));
    });

    it('lists and sorts seasons', async () => {
      const res = await request(app)
        .get('/api/content/seasons')
        .query({ path: seasonRoot });
      expect(res.status).toBe(200);
      expect((res.body as any[]).map((r: any) => r.name)).toEqual(['Season 1', 'Season 2']);
      expect(res.body[0].number).toBe(1);
      expect(res.body[1].number).toBe(2);
    });
  });

  describe('GET /api/content/episodes', () => {
    const epRoot = path.join(tempRoot, 'EpisodeRoot');

    beforeAll(() => {
      fs.mkdirSync(epRoot);
      fs.writeFileSync(path.join(epRoot, 'S01E02.Test.ep.mp4'), '');
      fs.writeFileSync(path.join(epRoot, 'Video.mkv'), '');
      fs.writeFileSync(path.join(epRoot, 'other.txt'), '');
    });

    it('lists and sorts episodes by season/episode', async () => {
      const res = await request(app)
        .get('/api/content/episodes')
        .query({ path: epRoot });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({ filename: 'Video.mkv', season: null, episode: null }),
        expect.objectContaining({ filename: 'S01E02.Test.ep.mp4', season: 1, episode: 2 })
      ]);
    });

    it('returns 400 for invalid episodes path', async () => {
      const res = await request(app)
        .get('/api/content/episodes')
        .query({ path: path.join(tempRoot, 'no') });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Directory not found/);
    });
  });
}); 