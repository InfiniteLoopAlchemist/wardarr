/** @jest-environment node */
import request from 'supertest';
import fs from 'fs';
import path from 'path';

// Mock child_process to avoid actual spawns
jest.mock('child_process');
// Use real better-sqlite3 as we only stub statements exported by server
const app = require('../server');

describe('Additional server endpoints for full coverage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Default fs.promises.readdir to empty array
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([] as any);
  });

  describe('Legacy content routes (/api/shows, /api/seasons, /api/episodes)', () => {
    it('GET /api/shows without path returns 400', async () => {
      const res = await request(app).get('/api/shows');
      expect(res.status).toBe(400);
    });

    it('GET /api/shows?path returns shows list', async () => {
      const dirent = { name: 'ShowX', isDirectory: () => true };
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue([dirent] as any);
      const res = await request(app).get('/api/shows?path=/tmp');
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('name', 'ShowX');
    });

    it('GET /api/seasons without path returns 400', async () => {
      const res = await request(app).get('/api/seasons');
      expect(res.status).toBe(400);
    });

    it('GET /api/seasons?path returns seasons list', async () => {
      const dirent = { name: 'Season 2', isDirectory: () => true };
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue([dirent] as any);
      const res = await request(app).get('/api/seasons?path=/tmp');
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('number', 2);
    });

    it('GET /api/episodes without path returns 400', async () => {
      const res = await request(app).get('/api/episodes');
      expect(res.status).toBe(400);
    });

    it('GET /api/episodes?path returns episodes list', async () => {
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue(['ep1.mp4', 'note.txt'] as any);
      const res = await request(app).get('/api/episodes?path=/tmp');
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('filename', 'ep1.mp4');
    });
  });

  describe('/api/path/:type/:encodedPath', () => {
    it('invalid type returns 400', async () => {
      const res = await request(app).get('/api/path/unknown/' + encodeURIComponent('/tmp'));
      expect(res.status).toBe(400);
    });

    it('valid type forwards to content', async () => {
      const dirent = { name: 'ShowY', isDirectory: () => true };
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue([dirent] as any);
      const res = await request(app).get('/api/path/shows/' + encodeURIComponent('/tmp'));
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('name', 'ShowY');
    });
  });

  describe('/api/browse endpoints', () => {
    it('GET /api/browse returns list of items', async () => {
      const dirent = { name: 'file.txt', isDirectory: () => false };
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue([dirent] as any);
      const res = await request(app).get('/api/browse?path=/tmp');
      expect(res.status).toBe(200);
      expect(res.body[0]).toHaveProperty('name', 'file.txt');
    });

    it('GET /api/browse default path returns array', async () => {
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);
      const res = await request(app).get('/api/browse');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/browse/libraries returns libs from DB', async () => {
      // stub getLibraries
      app.getLibraries.all = jest.fn().mockReturnValue([{ id: 1, title: 'L', path: '/tmp', type: 'tv', is_enabled: 1 }]);
      const res = await request(app).get('/api/browse/libraries');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 1, title: 'L', path: '/tmp', type: 'tv', is_enabled: 1 }]);
    });

    it('GET /api/browse/invalid returns 400', async () => {
      const res = await request(app).get('/api/browse/invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('/api/latest-verification', () => {
    it('returns found=false when no record', async () => {
      const res = await request(app).get('/api/latest-verification');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('found', false);
      expect(res.headers['cache-control']).toMatch(/no-cache/);
    });

    it('returns record when exists', async () => {
      const record = { 
        file_path: '/f', verification_image_path: '/img', match_score: 0.5, 
        is_verified: 1, episode_info: 'E', last_scanned_time: 123
      };
      // stub getLatestScannedFile
      app.getLatestScannedFile.get = jest.fn().mockReturnValue(record);
      // stub access to fs
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const res = await request(app).get('/api/latest-verification');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('found', true);
      expect(res.body).toHaveProperty('file_path', '/f');
    });
  });
});

// Add tests for process event handlers to cover shutdown and errors
describe('Process event handlers', () => {
  let exitSpy: jest.SpyInstance, logSpy: jest.SpyInstance, errorSpy: jest.SpyInstance;
  beforeAll(() => {
    // @ts-ignore: override process.exit to prevent exiting during tests
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Stub server.close to invoke callback immediately
    app.server.close = jest.fn(cb => cb());
  });
  afterAll(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('handles uncaughtException', () => {
    process.emit('uncaughtException', new Error('test error'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/Uncaught exception/));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles unhandledRejection', () => {
    // @ts-ignore: allow unhandledRejection event emit
    process.emit('unhandledRejection', 'reason');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Rejection'), 'reason');
  });

  it('handles exit event', () => {
    // @ts-ignore: allow exit event emit
    process.emit('exit', 42);
    expect(logSpy).toHaveBeenCalledWith('[PROCESS] Process exiting with code: 42');
  });

  it('handles SIGINT', () => {
    // @ts-ignore: allow SIGINT event emit
    process.emit('SIGINT');
    expect(logSpy).toHaveBeenCalledWith('[PROCESS] Received SIGINT, shutting down gracefully');
    expect(logSpy).toHaveBeenCalledWith('[SERVER] Closed all connections');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('handles SIGTERM', () => {
    // @ts-ignore: allow SIGTERM event emit
    process.emit('SIGTERM');
    expect(logSpy).toHaveBeenCalledWith('[PROCESS] Received SIGTERM, shutting down gracefully');
    expect(logSpy).toHaveBeenCalledWith('[SERVER] Closed all connections');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
}); 