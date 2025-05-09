/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';

// Require server (uses in-memory DB for tests)
const app = require('../server');

describe('Alias Content API Endpoints', () => {
  const tempRoot = path.join(os.tmpdir(), `alias-test-${Date.now()}`);
  const seasonRoot = path.join(tempRoot, 'SeasonShow');
  const epRoot = path.join(tempRoot, 'EpisodeShow');

  beforeAll(() => {
    // Show directories
    fs.mkdirSync(tempRoot, { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'Show1'));  // regular dir
    fs.mkdirSync(path.join(tempRoot, 'Show2 (2020) [tvdbid-123]'));

    // Seasons directory
    fs.mkdirSync(seasonRoot);
    fs.mkdirSync(path.join(seasonRoot, 'Season 2'));
    fs.mkdirSync(path.join(seasonRoot, 'Season 1'));

    // Episodes directory
    fs.mkdirSync(epRoot);
    fs.writeFileSync(path.join(epRoot, 'S02E01.mkv'), '');
    fs.writeFileSync(path.join(epRoot, 'Video.mp4'), '');
  });

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('GET /api/shows returns same as /api/content/shows', async () => {
    const resAlias = await request(app).get('/api/shows').query({ path: tempRoot });
    const resContent = await request(app).get('/api/content/shows').query({ path: tempRoot });
    expect(resAlias.status).toBe(200);
    expect(resAlias.body).toEqual(resContent.body);
  });

  it('GET /api/path/shows/:encodedPath returns shows list', async () => {
    const encoded = encodeURIComponent(tempRoot);
    const res = await request(app).get(`/api/path/shows/${encoded}`);
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.name)).toEqual(
      expect.arrayContaining(['Show1', 'Show2 (2020) [tvdbid-123]'])
    );
  });

  it('GET /api/seasons returns same as /api/content/seasons', async () => {
    const resAlias = await request(app).get('/api/seasons').query({ path: seasonRoot });
    const resContent = await request(app).get('/api/content/seasons').query({ path: seasonRoot });
    expect(resAlias.status).toBe(200);
    expect(resAlias.body).toEqual(resContent.body);
  });

  it('GET /api/path/seasons/:encodedPath returns seasons list', async () => {
    const encoded = encodeURIComponent(seasonRoot);
    const res = await request(app).get(`/api/path/seasons/${encoded}`);
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.name)).toEqual(['Season 1', 'Season 2']);
  });

  it('GET /api/episodes returns same as /api/content/episodes', async () => {
    const resAlias = await request(app).get('/api/episodes').query({ path: epRoot });
    const resContent = await request(app).get('/api/content/episodes').query({ path: epRoot });
    expect(resAlias.status).toBe(200);
    expect(resAlias.body).toEqual(resContent.body);
  });

  it('GET /api/path/episodes/:encodedPath returns episodes list', async () => {
    const encoded = encodeURIComponent(epRoot);
    const res = await request(app).get(`/api/path/episodes/${encoded}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ season: 2, episode: 1 }),
        expect.objectContaining({ filename: 'Video.mp4' })
      ])
    );
  });
}); 