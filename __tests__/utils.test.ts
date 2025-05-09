/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import os from 'os';

const { sanitizeForSQLite, copyVerificationImage } = require('../server');

describe('sanitizeForSQLite', () => {
  it('converts undefined to null', () => {
    expect(sanitizeForSQLite(undefined)).toBeNull();
  });

  it('converts boolean to integers', () => {
    expect(sanitizeForSQLite(true)).toBe(1);
    expect(sanitizeForSQLite(false)).toBe(0);
  });

  it('handles special numbers', () => {
    expect(sanitizeForSQLite(Infinity)).toBeNull();
    expect(sanitizeForSQLite(-Infinity)).toBeNull();
    expect(sanitizeForSQLite(NaN)).toBeNull();
  });

  it('serializes objects and arrays', () => {
    const obj = { a: 1 };
    expect(sanitizeForSQLite(obj)).toBe(JSON.stringify(obj));
    const arr = [1, 2, 3];
    expect(sanitizeForSQLite(arr)).toBe(JSON.stringify(arr));
  });

  it('returns primitive numbers and strings unchanged', () => {
    expect(sanitizeForSQLite(42)).toBe(42);
    expect(sanitizeForSQLite('hello')).toBe('hello');
  });
});

describe('copyVerificationImage', () => {
  const episodePath = '/episode.mp4';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when sourcePath is falsy', async () => {
    const result = await copyVerificationImage('', episodePath);
    expect(result).toBeNull();
  });

  it('returns null when fs.stat throws', async () => {
    jest.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('stat error'));
    const result = await copyVerificationImage('/nonexistent', episodePath);
    expect(result).toBeNull();
  });

  it('returns null when source file is empty', async () => {
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 0 } as any);
    const result = await copyVerificationImage('/empty', episodePath);
    expect(result).toBeNull();
  });

  it('returns relative path on successful copy', async () => {
    // Stub stat for source and destination
    const statMock = jest.spyOn(fs.promises, 'stat')
      .mockResolvedValueOnce({ size: 10 } as any)
      .mockResolvedValueOnce({ size: 10 } as any);
    jest.spyOn(fs.promises, 'copyFile').mockResolvedValue();

    const result = await copyVerificationImage('/any/source.jpg', episodePath);
    expect(typeof result).toBe('string');
    expect(result.startsWith('/matches/')).toBe(true);

    statMock.mockRestore();
  });
}); 