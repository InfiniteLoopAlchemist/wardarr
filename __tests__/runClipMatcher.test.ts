/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// Mock child_process.spawn before importing server
import childProcess from 'child_process';
jest.mock('child_process');
const spawnMock = (childProcess as any).spawn as jest.Mock;

const server = require('../server');
const { runClipMatcher, sanitizeForSQLite } = server;

describe('runClipMatcher helper', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns error when script not found', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const res = await runClipMatcher('/tmp/video.mp4');
    expect(res).toEqual({
      success: false,
      error: expect.stringContaining('Script not found')
    });
  });

  it('parses JSON output and returns correct fields', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = fakeProc.addListener;
    spawnMock.mockReturnValue(fakeProc);

    const promise = runClipMatcher('/tmp/video.mp4');
    const jsonOutput = { verified: true, similarity: 0.42, episode_info: 'E1', verification_path: '/vp' };
    fakeProc.stdout.emit('data', JSON.stringify(jsonOutput));
    fakeProc.stdout.emit('data', '\n');
    fakeProc.emit('close', 0);

    const res = await promise;
    expect(res).toEqual({
      success: true,
      verified: true,
      matchScore: 0.42,
      episode: 'E1',
      verificationPath: '/vp'
    });
  });

  it('falls back to parsing Best match when no JSON', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = fakeProc.addListener;
    spawnMock.mockReturnValue(fakeProc);

    const promise = runClipMatcher('/tmp/video.mp4');
    fakeProc.stdout.emit('data', 'Some text Best match: 0.88 extra');
    fakeProc.emit('close', 0);

    const res = await promise;
    expect(res).toEqual({
      success: true,
      verified: true,
      matchScore: 0.88,
      episode: 'video.mp4',
      verificationPath: null
    });
  });

  it('handles exit code 1 as verification failed', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = fakeProc.addListener;
    spawnMock.mockReturnValue(fakeProc);

    const promise = runClipMatcher('/tmp/video.mp4');
    fakeProc.stderr.emit('data', 'Error parsing results occurred');
    fakeProc.emit('close', 1);

    const res = await promise;
    expect(res).toEqual({
      success: false,
      verified: false,
      verificationPath: null,
      error: expect.stringContaining('Verification failed'),
      exitCode: 1
    });
  });

  it('handles other exit codes as errors', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = fakeProc.addListener;
    spawnMock.mockReturnValue(fakeProc);

    const promise = runClipMatcher('/tmp/video.mp4');
    fakeProc.stderr.emit('data', 'Fatal error occurred');
    fakeProc.emit('close', 2);

    const res = await promise;
    expect(res).toEqual({
      success: false,
      error: expect.stringContaining('Process exited with code 2'),
      exitCode: 2,
      verificationPath: null
    });
  });

  it('handles spawn errors gracefully', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = jest.fn((event, cb) => {
      if (event === 'error') cb(new Error('spawn failure'));
    });
    spawnMock.mockReturnValue(fakeProc);

    const res = await runClipMatcher('/tmp/video.mp4');
    expect(res).toEqual({
      success: false,
      error: expect.stringContaining('Failed to start process: spawn failure'),
      verificationPath: null
    });
  });

  it('strips HuggingFace FutureWarning prefix from error output', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = fakeProc.addListener;
    spawnMock.mockReturnValue(fakeProc);

    const promise = runClipMatcher('/tmp/video.mp4');
    const warning = 'FutureWarning: warning text\nRealError: actual failure\n';
    fakeProc.stderr.emit('data', warning);
    fakeProc.emit('close', 2);

    const res = await promise;
    expect(res.success).toBe(false);
    expect(res.exitCode).toBe(2);
    expect(res.error).toContain('RealError: actual failure');
  });

  it('detects verificationPath from stderr on success fallback branch', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = fakeProc.addListener;
    spawnMock.mockReturnValue(fakeProc);

    const promise = runClipMatcher('/tmp/video.mp4');
    // Emit stderr path before close
    fakeProc.stderr.emit('data', 'Verification images saved to: /tmp/vpath\n');
    fakeProc.stdout.emit('data', 'Best match: 0.55');
    fakeProc.emit('close', 0);

    const res = await promise;
    expect(res.success).toBe(true);
    expect(res.matchScore).toBe(0.55);
    expect(res.verificationPath).toBe('/tmp/vpath');
  });

  it('detects verificationPath from stdout on success fallback branch', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = fakeProc.addListener;
    spawnMock.mockReturnValue(fakeProc);

    const promise = runClipMatcher('/tmp/video.mp4');
    // Emit stdout path before close
    fakeProc.stdout.emit('data', 'Verification images saved to: /tmp/stdoutpath\n');
    fakeProc.emit('close', 0);

    const res = await promise;
    expect(res.success).toBe(true);
    expect(res.verificationPath).toBe('/tmp/stdoutpath');
  });

  it('handles no output scenario', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeProc: any = new EventEmitter();
    fakeProc.stdout = new EventEmitter();
    fakeProc.stderr = new EventEmitter();
    fakeProc.on = fakeProc.addListener;
    spawnMock.mockReturnValue(fakeProc);

    const promise = runClipMatcher('/tmp/video.mp4');
    // No data emitted on stdout or stderr
    fakeProc.emit('close', 1);
    const res = await promise;

    expect(res).toEqual({
      success: false,
      verified: false,
      verificationPath: null,
      exitCode: 1,
      error: expect.stringContaining('Process exited with code 1 without output')
    });
  });
});

describe('sanitizeForSQLite helper', () => {
  it('returns null for undefined', () => {
    expect(sanitizeForSQLite(undefined)).toBeNull();
  });
  it('returns 1 for true and 0 for false', () => {
    expect(sanitizeForSQLite(true)).toBe(1);
    expect(sanitizeForSQLite(false)).toBe(0);
  });
  it('returns null for Infinity, -Infinity, NaN', () => {
    expect(sanitizeForSQLite(Infinity)).toBeNull();
    expect(sanitizeForSQLite(-Infinity)).toBeNull();
    expect(sanitizeForSQLite(NaN)).toBeNull();
  });
  it('serializes objects and arrays', () => {
    expect(sanitizeForSQLite({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
    expect(sanitizeForSQLite([1, 2, 3])).toBe(JSON.stringify([1, 2, 3]));
  });
  it('returns primitive values as-is', () => {
    expect(sanitizeForSQLite(123)).toBe(123);
    expect(sanitizeForSQLite('abc')).toBe('abc');
  });
}); 