/** @jest-environment node */
import path from 'path';
import { spawnSync } from 'child_process';

describe('Server CLI startup', () => {
  it('logs startup messages when run directly', () => {
    const serverPath = path.resolve(__dirname, '../server.js');
    // Use PORT=0 for ephemeral port and set a timeout to kill the process
    const result = spawnSync('node', [serverPath], {
      env: { ...process.env, PORT: '0' },
      encoding: 'utf8',
      timeout: 3000,
    });
    const out = result.stdout || '';
    // The server startup block should run when server.js is the main module
    expect(out).toMatch(/\[SERVER\] Attempting to start server listening\.\.\./);
    expect(out).toMatch(/\[SERVER\] Node\.js backend running on http:\/\/localhost:0/);
    expect(out).toMatch(/\[SERVER\] Server listen call completed/);
  });
}); 