/** @jest-environment node */

describe('Server module exports', () => {
  const server = require('../server');

  it('exports core Express app', () => {
    expect(typeof server).toBe('function');
    expect(typeof server.get).toBe('function');
  });

  it('exports database statements and helpers', () => {
    expect(typeof server.getLibraries.all).toBe('function');
    expect(typeof server.getLatestScannedFile.get).toBe('function');
    expect(typeof server.findMediaFiles).toBe('function');
    expect(typeof server.runClipMatcher).toBe('function');
    expect(typeof server.copyVerificationImage).toBe('function');
    expect(typeof server.sanitizeForSQLite).toBe('function');
  });

  it('exports scan controls', () => {
    expect(typeof server.processScan).toBe('function');
    expect(typeof server.scanStatus).toBe('object');
  });

  it('exports low-level DB helpers', () => {
    expect(typeof server.getScannedFileByPath).toBe('object');
    expect(typeof server.addScannedFile).toBe('object');
    expect(typeof server.updateScannedFile).toBe('object');
  });
}); 