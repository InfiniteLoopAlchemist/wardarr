/** @jest-environment node */
import request from 'supertest';

const app = require('../server');

describe('Server error routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/libraries returns 500 when getLibraries.all throws', async () => {
    app.getLibraries.all = jest.fn(() => { throw new Error('db error'); });
    const res = await request(app).get('/api/libraries');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to get libraries/);
  });

  it('POST /api/libraries returns 500 when addLibrary.run throws', async () => {
    app.addLibrary.run = jest.fn(() => { throw new Error('insert error'); });
    const res = await request(app).post('/api/libraries').send({
      path: __dirname,
      title: 'Test',
      type: 'movie'
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to add library/);
  });

  it('GET /test triggers error handler and returns 500', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { throw new Error('log failure'); });
    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.text).toBe('Something broke!');
    logSpy.mockRestore();
  });
}); 