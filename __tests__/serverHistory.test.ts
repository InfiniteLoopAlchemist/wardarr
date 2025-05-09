/** @jest-environment node */
import request from 'supertest';

const serverModule = require('../server');
const app = serverModule;
const addScannedFile = serverModule.addScannedFile;
const addLibrary = serverModule.addLibrary;

describe('History API', () => {
  beforeEach(async () => {
    // Clear any existing history and reset scanStatus
    await request(app).delete('/api/history');
    serverModule.scanStatus.latestMatch = null;
  });

  it('GET /api/history returns empty array initially', async () => {
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/history returns inserted records', async () => {
    // Insert sample libraries and records directly into the database
    const lib1 = addLibrary.run('Lib1', '/video1.mp4', 'tv').lastInsertRowid;
    const lib2 = addLibrary.run('Lib2', '/video2.mp4', 'tv').lastInsertRowid;
    addScannedFile.run(lib1, '/video1.mp4', 1234, 5678, '/matches/1.jpg', 0.5, 1, 'ep1');
    addScannedFile.run(lib2, '/video2.mp4', 2345, 6789, '/matches/2.jpg', 0.75, 0, 'ep2');

    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      library_id: 1,
      file_path: '/video1.mp4',
      match_score: 0.5,
      is_verified: 1,
      episode_info: 'ep1'
    });
    expect(res.body[1]).toMatchObject({
      library_id: 2,
      file_path: '/video2.mp4',
      match_score: 0.75,
      is_verified: 0,
      episode_info: 'ep2'
    });
  });

  it('DELETE /api/history clears records and scanStatus.latestMatch', async () => {
    // Insert a library, a record, and set latestMatch
    const lib3 = addLibrary.run('Lib3', '/video3.mp4', 'tv').lastInsertRowid;
    addScannedFile.run(lib3, '/video3.mp4', 3456, 7890, '/matches/3.jpg', 1, 1, 'ep3');
    serverModule.scanStatus.latestMatch = {
      path: '/video3.mp4',
      imagePath: '/matches/3.jpg',
      matchScore: 1,
      isVerified: true,
      episodeInfo: 'ep3',
      timestamp: Date.now()
    };

    const resDel = await request(app).delete('/api/history');
    expect(resDel.status).toBe(200);
    expect(resDel.body).toHaveProperty('message', 'Scan history cleared successfully!');

    const resGet = await request(app).get('/api/history');
    expect(resGet.status).toBe(200);
    expect(resGet.body).toEqual([]);
    expect(serverModule.scanStatus.latestMatch).toBeNull();
  });
}); 