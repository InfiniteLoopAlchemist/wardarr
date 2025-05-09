/** @jest-environment node */
import { EventEmitter } from 'events';
import request from 'supertest';

// Import the server and HTTP server instance
const serverModule = require('../server');
const app = serverModule;
const httpServer = serverModule.server;

// Mock child_process.spawn for runClipMatcher tests
import childProcess from 'child_process';
jest.mock('child_process');
const spawnMock = (childProcess as any).spawn as jest.Mock;
const runClipMatcher = serverModule.runClipMatcher;

// Fake process to simulate stdout, stderr, and close events
class FakeProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }
}

describe('Scan status and scan start routes', () => {
  it('GET /api/scan/status returns initial scanStatus structure', async () => {
    const res = await request(app).get('/api/scan/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      isScanning: false,
      processedFiles: 0,
      totalFiles: 0,
      currentFile: '',
      stopRequested: false
    });
  });

  it('POST /api/scan returns scan started message and status', async () => {
    const res = await request(app).post('/api/scan');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Scan started');
    expect(res.body.status).toHaveProperty('isScanning', true);
  });
});

describe('runClipMatcher stdout JSON parse error handling', () => {
  beforeEach(() => {
    spawnMock.mockClear();
  });

  it('logs an error when JSON.parse in stdout handler throws', async () => {
    const fakeProc = new FakeProcess();
    spawnMock.mockReturnValue(fakeProc);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const promise = runClipMatcher('/path/to/badjson.mp4');
    process.nextTick(() => {
      // Emit invalid JSON to trigger JSON.parse error
      fakeProc.stdout.emit('data', Buffer.from('{bad json}'));
      fakeProc.stderr.emit('data', Buffer.from(''));
      fakeProc.emit('close', 0);
    });

    const result = await promise;
    expect(consoleErrorSpy).toHaveBeenCalled();
    // Even after parse error, fallback score should be zero
    expect(result).toMatchObject({ success: true, matchScore: 0, verificationPath: null });
    consoleErrorSpy.mockRestore();
  });
});

describe('Process event handlers (exit, SIGINT, SIGTERM)', () => {
  let consoleLogSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: any) => {}) as any);
    // Stub httpServer.close to immediately invoke callback
    httpServer.close = jest.fn((cb: Function) => cb());
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('logs on process exit event', () => {
    process.emit('exit', 123);
    expect(consoleLogSpy).toHaveBeenCalledWith(`[PROCESS] Process exiting with code: 123`);
  });

  it('handles SIGINT gracefully', () => {
    process.emit('SIGINT');
    expect(consoleLogSpy).toHaveBeenCalledWith('[PROCESS] Received SIGINT, shutting down gracefully');
    expect(httpServer.close).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('[SERVER] Closed all connections');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('handles SIGTERM gracefully', () => {
    process.emit('SIGTERM');
    expect(consoleLogSpy).toHaveBeenCalledWith('[PROCESS] Received SIGTERM, shutting down gracefully');
    expect(httpServer.close).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('[SERVER] Closed all connections');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('Built-in test endpoint', () => {
  it('returns 200 and correct text on GET /test', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.text).toBe('Server test route is working!');
  });
}); 