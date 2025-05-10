/** @jest-environment node */
import request from 'supertest';
const app = require('../server');

describe('Static viewer page', () => {
  it('serves viewer.html', async () => {
    const res = await request(app).get('/viewer.html');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<title>Verification Image Viewer<\/title>/);
  });
}); 