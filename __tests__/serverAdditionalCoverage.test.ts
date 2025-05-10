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
  afterEach(async () => {
    // Ensure scan is stopped and reset after tests that might start it
    if (serverModule.scanStatus.isScanning || serverModule.scanStatus.stopRequested) {
      await request(app).post('/api/scan/stop');
      // Wait for scan to actually stop and reset flags by server or explicitly below
      await new Promise(resolve => setTimeout(resolve, 50)); // Reduced delay, mostly for stop request processing
    }
    // Explicitly reset all states after each test in this describe block
    serverModule.scanStatus.isScanning = false;
    serverModule.scanStatus.stopRequested = false;
    serverModule.scanStatus.latestMatch = null;
    serverModule.scanStatus.processedFiles = 0;
    serverModule.scanStatus.totalFiles = 0;
    serverModule.scanStatus.currentFile = '';
    serverModule.scanStatus.startTime = null;
    serverModule.scanStatus.errors = [];
  });

  it('GET /api/scan/status returns initial scanStatus structure', async () => {
    // Ensure clean state for this specific test
    serverModule.scanStatus.isScanning = false;
    serverModule.scanStatus.stopRequested = false;
    serverModule.scanStatus.latestMatch = null;

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

  it('POST /api/scan sets isScanning to true, then POST /api/scan/stop sets stopRequested to true', async () => {
    // Start scan
    const startRes = await request(app).post('/api/scan');
    expect(startRes.status).toBe(200);
    expect(startRes.body).toHaveProperty('message', 'Scan started');
    expect(startRes.body.status.isScanning).toBe(true); // Check isScanning from response
    expect(serverModule.scanStatus.isScanning).toBe(true); // Check server state directly

    // Stop scan
    const stopRes = await request(app).post('/api/scan/stop');
    expect(stopRes.status).toBe(200);
    expect(stopRes.body).toHaveProperty('message', 'Stop requested. Please wait for the current file to finish.');
    expect(serverModule.scanStatus.stopRequested).toBe(true); // Check server state directly
  });

  it('GET /api/scan/status returns latestMatch with updated timestamp when not scanning', async () => {
    // Explicitly set isScanning to false for this test to ensure correct state
    serverModule.scanStatus.isScanning = false;
    serverModule.scanStatus.stopRequested = false; // Ensure stopRequested is also false
    serverModule.scanStatus.latestMatch = null; // Ensure no previous match

    const mockMatch = {
      path: '/test/file.mkv',
      imagePath: '/matches/some_image.jpg',
      matchScore: 0.95,
      isVerified: true,
      episodeInfo: 'S01E01 - Test Episode',
      timestamp: Date.now() - 10000 // an older timestamp
    };
    serverModule.scanStatus.latestMatch = { ...mockMatch }; // Use a copy

    const res = await request(app).get('/api/scan/status');
    expect(res.status).toBe(200);
    expect(res.body.isScanning).toBe(false);
    expect(res.body.latestMatch).toBeDefined();
    expect(res.body.latestMatch.path).toBe(mockMatch.path);
    expect(res.body.latestMatch.timestamp).toBeGreaterThan(mockMatch.timestamp);

    // Clean up: afterEach will handle the general reset of scanStatus
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

// Test HTTP server connection event handlers

describe('HTTP server connection logging', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('does not log connection events', () => {
    const fakeSocket = new EventEmitter() as any;
    fakeSocket.destroy = () => {};
    fakeSocket.remoteAddress = '1.2.3.4';
    fakeSocket.remotePort = 9999;
    httpServer.emit('connection', fakeSocket);
    fakeSocket.emit('close', false);
    fakeSocket.emit('close', true);
    fakeSocket.emit('error', new Error('socket error'));
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

// Test processScan error-handling in server.js

describe('processScan error handling', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('catches errors thrown by findMediaFiles and resets scanStatus', async () => {
    jest.spyOn(serverModule, 'findMediaFiles').mockImplementation(() => { throw new Error('scan failure'); });
    // Set non-default flags to observe reset
    serverModule.scanStatus.isScanning = true;
    serverModule.scanStatus.stopRequested = true;

    await serverModule.processScan([{ path: '/fake', id: 1, is_enabled: 1 }]);

    expect(serverModule.scanStatus.isScanning).toBe(false);
    expect(serverModule.scanStatus.stopRequested).toBe(false);
  });
});

describe('JSON parse error middleware and static viewer', () => {
  it('returns 400 on invalid JSON body to POST /api/libraries', async () => {
    const res = await request(app)
      .post('/api/libraries')
      .set('Content-Type', 'application/json')
      .send('{bad json}');
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Invalid JSON/);
  });

  it('serves the viewer HTML on GET /viewer.html', async () => {
    const res = await request(app).get('/viewer.html');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toMatch(/html/);
    expect(res.text).toMatch(/<title>Verification Image Viewer<\/title>/);
  });
}); 