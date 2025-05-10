/** @jest-environment node */
import path from 'path';
import { spawnSync } from 'child_process';

describe('Server CLI startup', () => {
  it('logs startup messages when run directly', () => {
    const serverPath = path.resolve(__dirname, '../server.ts');
    // Use PORT=0 for ephemeral port and set a timeout to kill the process
    const result = spawnSync('node', ['-r', 'ts-node/register', serverPath], {
      env: { ...process.env, PORT: '0' },
      encoding: 'utf8',
      timeout: 3000,
    });
    console.log('Spawn result:', result);
    const out = result.stdout || '';
    const err = result.stderr || '';
    console.log('stdout:', out);
    console.log('stderr:', err);
    // The server startup block should run when server.js is the main module
    expect(out).toMatch(/\[SERVER\] Attempting to start server listening\.\.\./);
    expect(out).toMatch(/\[SERVER\] Node\.js backend running on http:\/\/localhost:0/);
    expect(out).toMatch(/\[SERVER\] Server listen call completed/);
  });
}); 