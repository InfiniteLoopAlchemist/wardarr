/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';

let app: any;
const TEST_DB = path.join(__dirname, '..', 'libraries.test.db');

describe('Libraries API', () => {
  beforeAll(() => {
    // Remove test database if it exists before loading server
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    // Load server module after ensuring a clean database
    app = require('../server');
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  it('GET /api/libraries returns empty array initially', async () => {
    const res = await request(app).get('/api/libraries');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/libraries adds a library and GET returns it', async () => {
    // Create a temporary directory to serve as a valid library path
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));

    const resPost = await request(app)
      .post('/api/libraries')
      .send({
        path: tempDir,
        title: 'Test Library',
        type: 'tv'
      });

    expect(resPost.status).toBe(200);
    expect(resPost.body).toHaveProperty('message', 'Library added successfully');
    expect(typeof resPost.body.id).toBe('number');

    const resGet = await request(app).get('/api/libraries');
    expect(resGet.status).toBe(200);
    expect(resGet.body).toHaveLength(1);
    expect(resGet.body[0]).toMatchObject({
      id: resPost.body.id,
      title: 'Test Library',
      path: tempDir,
      type: 'tv',
      is_enabled: 1
    });
  });
}); 