/** @jest-environment node */
import request from 'supertest';
import fs from 'fs';
import { EventEmitter } from 'events';

// Mock better-sqlite3 to avoid native bindings
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => ({
    prepare: () => ({
      all: () => [],
      get: () => undefined,
      run: () => ({ lastInsertRowid: 1, changes: 1 }),
    }),
    exec: () => {},
  }));
});

// Mock better-sqlite3 and child_process spawn, and provide fs.promises mock before importing server
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      access: jest.fn(),
      readdir: jest.fn(),
    },
  };
});
jest.mock('child_process');
const { spawn } = require('child_process');
const app = require('../server');

describe('Server integration tests', () => {
  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();
    // Default validatePath to true
    (fs.promises.access as jest.Mock).mockResolvedValue(undefined);
  });

  it('GET / returns welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('TV Show API Server');
  });

  it('GET /test returns test message', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.text).toBe('Server test route is working!');
  });

  it('unknown path returns 404 JSON error', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  describe('/api/libraries CRUD', () => {
    it('GET /api/libraries initially empty', async () => {
      const res = await request(app).get('/api/libraries');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('POST missing path returns 400', async () => {
      const res = await request(app).post('/api/libraries').send({ title: 'A', type: 'movie' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing path/);
    });

    it('POST missing title returns 400', async () => {
      const res = await request(app).post('/api/libraries').send({ path: '/tmp', type: 'tv' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing title/);
    });

    it('POST invalid type returns 400', async () => {
      const res = await request(app).post('/api/libraries').send({ path: '/tmp', title: 'B', type: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid type/);
    });

    it('POST non-existent path returns 400', async () => {
      (fs.promises.access as jest.Mock).mockRejectedValue(new Error('no access'));
      const res = await request(app).post('/api/libraries').send({ path: '/nope', title: 'C', type: 'tv' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not exist/);
    });

    it('POST valid library returns id and message', async () => {
      const res = await request(app).post('/api/libraries').send({ path: __dirname, title: 'Lib', type: 'movie' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body.message).toMatch(/success/);
    });

    it('PUT invalid id returns 400', async () => {
      const res = await request(app).put('/api/libraries/abc').send({ title: 'X' });
      expect(res.status).toBe(400);
    });

    it('PUT no fields returns 400', async () => {
      const post = await request(app).post('/api/libraries').send({ path: __dirname, title: 'D', type: 'tv' });
      const id = post.body.id;
      const res = await request(app).put(`/api/libraries/${id}`).send({});
      expect(res.status).toBe(400);
    });

    it('PUT invalid type returns 400', async () => {
      const post = await request(app).post('/api/libraries').send({ path: __dirname, title: 'E', type: 'movie' });
      const id = post.body.id;
      const res = await request(app).put(`/api/libraries/${id}`).send({ type: 'bad' });
      expect(res.status).toBe(400);
    });

    it('PUT valid update returns updated library', async () => {
      const post = await request(app).post('/api/libraries').send({ path: __dirname, title: 'F', type: 'tv' });
      const id = post.body.id;
      const res = await request(app).put(`/api/libraries/${id}`).send({ title: 'F2' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/updated/);
    });

    it('DELETE invalid id returns 400', async () => {
      const res = await request(app).delete('/api/libraries/xyz');
      expect(res.status).toBe(400);
    });

    it('DELETE non-existent returns 200', async () => {
      const res = await request(app).delete('/api/libraries/9999');
      expect(res.status).toBe(200);
    });

    it('DELETE existing returns success message', async () => {
      const post = await request(app).post('/api/libraries').send({ path: __dirname, title: 'G', type: 'movie' });
      const id = post.body.id;
      const res = await request(app).delete(`/api/libraries/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/);
    });
  });

  describe('/api/queue and /api/latest-match', () => {
    it('GET /api/queue returns array', async () => {
      const res = await request(app).get('/api/queue');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
    it('DELETE /api/queue clears records', async () => {
      const res = await request(app).delete('/api/queue');
      expect(res.status).toBe(200);
    });
    it('GET /api/latest-match default found=false and no-cache header', async () => {
      const res = await request(app).get('/api/latest-match');
      expect(res.status).toBe(200);
      expect(res.body.found).toBe(false);
      expect(res.headers['cache-control']).toMatch(/no-cache/);
    });
  });

  describe('POST /api/match', () => {
    it('missing episodePath returns 400', async () => {
      const res = await request(app).post('/api/match').send({});
      expect(res.status).toBe(400);
    });
    it('non-existent file returns 400', async () => {
      (fs.promises.access as jest.Mock).mockRejectedValue(new Error('no file'));
      const res = await request(app).post('/api/match').send({ episodePath: '/bad' });
      expect(res.status).toBe(400);
    });
  });

  describe('Content browsing endpoints', () => {
    beforeEach(() => {
      // always allow access
      (fs.promises.access as jest.Mock).mockResolvedValue(undefined);
    });
    it('GET /api/content/invalid returns 400', async () => {
      const res = await request(app).get('/api/content/unknown?path=/');
      expect(res.status).toBe(400);
    });
    it('GET /api/content/shows returns directory list', async () => {
      const dirent = { name: 'Show (2020) [tvdbid-123]', isDirectory: () => true };
      (fs.promises.readdir as jest.Mock).mockResolvedValue([dirent]);
      const res = await request(app).get('/api/content/shows?path=/tmp');
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('name');
    });
    it('GET /api/content/seasons returns seasons list', async () => {
      const a = { name: 'Season 1', isDirectory: () => true };
      (fs.promises.readdir as jest.Mock).mockResolvedValue([a]);
      const res = await request(app).get('/api/content/seasons?path=/tmp');
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('number', 1);
    });
    it('GET /api/content/episodes returns episodes list', async () => {
      (fs.promises.readdir as jest.Mock).mockResolvedValue(['file1.mkv']);
      const res = await request(app).get('/api/content/episodes?path=/tmp');
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('filename', 'file1.mkv');
    });
  });

  describe('Legacy endpoints', () => {
    it('GET /api/shows missing path returns 400', async () => {
      const res = await request(app).get('/api/shows');
      expect(res.status).toBe(400);
    });
    it('GET /api/shows forwards to content', async () => {
      (fs.promises.readdir as jest.Mock).mockResolvedValue([{ name: 'Dir', isDirectory: () => true }]);
      const res = await request(app).get('/api/shows?path=/tmp');
      expect(res.status).toBe(200);
    });
    it('GET /api/seasons missing path returns 400', async () => {
      const res = await request(app).get('/api/seasons');
      expect(res.status).toBe(400);
    });
    it('GET /api/episodes missing path returns 400', async () => {
      const res = await request(app).get('/api/episodes');
      expect(res.status).toBe(400);
    });
  });

  describe('Browse endpoints', () => {
    it('GET /api/browse returns list', async () => {
      const dirent = { name: 'x', isDirectory: () => false };
      (fs.promises.readdir as jest.Mock).mockResolvedValue([dirent]);
      const res = await request(app).get('/api/browse?path=/tmp');
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('name', 'x');
    });
    it('GET /api/browse/libraries returns libraries list', async () => {
      const post = await request(app).post('/api/libraries').send({ path: __dirname, title: 'Z', type: 'tv' });
      const res = await request(app).get('/api/browse/libraries');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
    it('GET /api/browse/invalid returns 400', async () => {
      const res = await request(app).get('/api/browse/xyz');
      expect(res.status).toBe(400);
    });
  });
});

// Tests for legacy forwarding of seasons and episodes
describe('Legacy endpoints forwarding', () => {
  it('GET /api/seasons forwards to content', async () => {
    (fs.promises.readdir as jest.Mock).mockResolvedValue([{ name: 'Season 1', isDirectory: () => true }]);
    const res = await request(app).get('/api/seasons?path=/tmp');
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('number');
  });
  it('GET /api/episodes forwards to content', async () => {
    (fs.promises.readdir as jest.Mock).mockResolvedValue(['E1.mkv']);
    const res = await request(app).get('/api/episodes?path=/tmp');
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('filename', 'E1.mkv');
  });
});

// Tests for path-based content endpoint
describe('Path-based endpoint', () => {
  it('GET /api/path/shows/:encodedPath returns shows list', async () => {
    (fs.promises.readdir as jest.Mock).mockResolvedValue([{ name: 'Show1', isDirectory: () => true }]);
    const encoded = encodeURIComponent('/tmp');
    const res = await request(app).get(`/api/path/shows/${encoded}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('name', 'Show1');
  });
  it('GET /api/path/invalid returns 400', async () => {
    const encoded = encodeURIComponent('/tmp');
    const res = await request(app).get(`/api/path/invalid/${encoded}`);
    expect(res.status).toBe(400);
  });
});

// Tests for hierarchical browse endpoints
describe('Hierarchical browse endpoints', () => {
  it('GET /api/browse/shows returns shows list', async () => {
    (fs.promises.readdir as jest.Mock).mockResolvedValue([{ name: 'Show2', isDirectory: () => true }]);
    const res = await request(app).get('/api/browse/shows').query({ parent: '/tmp' });
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('name', 'Show2');
  });
  it('GET /api/browse/seasons returns seasons list', async () => {
    (fs.promises.readdir as jest.Mock).mockResolvedValue([{ name: 'Season 2', isDirectory: () => true }]);
    const res = await request(app).get('/api/browse/seasons').query({ parent: '/tmp' });
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('number', 2);
  });
  it('GET /api/browse/episodes returns episodes list', async () => {
    (fs.promises.readdir as jest.Mock).mockResolvedValue(['Episode1.mp4']);
    const res = await request(app).get('/api/browse/episodes').query({ parent: '/tmp' });
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('filename', 'Episode1.mp4');
  });
  it('GET /api/browse/unknownLevel returns 400', async () => {
    const res = await request(app).get('/api/browse/unknownLevel');
    expect(res.status).toBe(400);
  });
}); 