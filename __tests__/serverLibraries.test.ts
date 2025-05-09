/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';

let app: any;
const TEST_DB = path.join(__dirname, '..', 'libraries.test.db');

describe('Libraries API', () => {
  let libId: number;
  let libPath: string;

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

    // Capture library ID and path for subsequent tests
    libPath = tempDir;
    libId = resPost.body.id;

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

  it('PUT /api/libraries/:id updates a library', async () => {
    const newTitle = 'Updated Library';
    const resPut = await request(app)
      .put(`/api/libraries/${libId}`)
      .send({ title: newTitle });
    expect(resPut.status).toBe(200);
    expect(resPut.body).toHaveProperty('message', 'Library updated successfully');
    expect(resPut.body.library).toMatchObject({
      id: libId,
      title: newTitle,
      path: libPath,
      type: 'tv',
      is_enabled: 1
    });
  });

  it('DELETE /api/libraries/:id deletes a library', async () => {
    const resDel = await request(app).delete(`/api/libraries/${libId}`);
    expect(resDel.status).toBe(200);
    expect(resDel.body).toHaveProperty('message', 'Library deleted successfully');
    const resGetAfter = await request(app).get('/api/libraries');
    expect(resGetAfter.body).toEqual([]);
  });
});

describe('Libraries API error paths', () => {
  it('POST /api/libraries missing fields returns 400', async () => {
    const validPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
    // Missing all fields
    let res = await request(app).post('/api/libraries').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing path in request body' });
    // Provide path only
    res = await request(app).post('/api/libraries').send({ path: validPath });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing title in request body' });
    // Provide path and title only
    res = await request(app).post('/api/libraries').send({ path: validPath, title: 'T' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing or invalid type in request body (must be "movie" or "tv")' });
  });

  it('PUT /api/libraries/:id error cases', async () => {
    const validPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
    // Invalid ID
    let res = await request(app).put('/api/libraries/abc').send({ title: 'X' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid library ID' });
    // No update fields
    // First insert a valid library to get an ID
    const { body } = await request(app).post('/api/libraries').send({ path: validPath, title: 'Temp', type: 'tv' });
    const id = body.id;
    res = await request(app).put(`/api/libraries/${id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No update fields provided (title, path, type, or is_enabled)' });
    // Invalid type
    res = await request(app).put(`/api/libraries/${id}`).send({ type: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid type (must be "movie" or "tv")' });
    // Invalid is_enabled
    res = await request(app).put(`/api/libraries/${id}`).send({ is_enabled: 5 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid is_enabled value (must be 0, 1, true, or false)' });
    // Invalid path
    res = await request(app).put(`/api/libraries/${id}`).send({ path: '/no/such/path' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Library path does not exist or is not accessible' });
  });

  it('DELETE /api/libraries/:id error cases', async () => {
    // Invalid ID
    let res = await request(app).delete('/api/libraries/xyz');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid library ID' });
    // Non-existent ID
    res = await request(app).delete('/api/libraries/9999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Library not found' });
  });
}); 