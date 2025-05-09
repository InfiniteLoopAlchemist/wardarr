/** @jest-environment node */
import fs from 'fs';

// Import server and its internals
const server = require('../server');
const {
  processScan,
  scanStatus,
  findMediaFiles,
  runClipMatcher,
  copyVerificationImage,
  getScannedFileByPath,
  addScannedFile,
  updateScannedFile,
} = server;

describe('processScan function', () => {
  beforeEach(() => {
    // Reset scanStatus
    scanStatus.isScanning = false;
    scanStatus.totalFiles = 0;
    scanStatus.processedFiles = 0;
    scanStatus.currentFile = '';
    scanStatus.errors = [];
    scanStatus.latestMatch = null;
    scanStatus.stopRequested = false;
    jest.clearAllMocks();
  });

  it('exits early when no enabled libraries', async () => {
    const libs = [{ id: 1, is_enabled: 0, title: 'Bad', path: '/tmp' }];
    await processScan(libs);
    expect(scanStatus.isScanning).toBe(false);
    expect(scanStatus.totalFiles).toBe(0);
    expect(scanStatus.processedFiles).toBe(0);
  });

  it('processes files and updates latest match', async () => {
    // Stub directory read to return one video file entry
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([
      { name: 'video1.mp4', isDirectory: () => false }
    ] as any);
    // Stub file stats
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ mtimeMs: 100 } as any);
    // No existing record
    getScannedFileByPath.get = jest.fn().mockReturnValue(undefined);
    // Stub matcher success
    jest.spyOn(server, 'runClipMatcher').mockResolvedValue({
      success: true,
      verified: true,
      matchScore: 0.77,
      episode: 'video1',
      verificationPath: '/tmp',
    } as any);
    // Stub image copy
    jest.spyOn(server, 'copyVerificationImage').mockResolvedValue(
      '/matches/video1.jpg'
    );
    // Stub DB operations
    addScannedFile.run = jest.fn();
    updateScannedFile.run = jest.fn();

    const libs = [{ id: 1, is_enabled: 1, title: 'Lib', path: '/tmp' }];
    await processScan(libs);

    expect(scanStatus.totalFiles).toBe(1);
    expect(scanStatus.processedFiles).toBe(1);
    expect(scanStatus.isScanning).toBe(false);
    expect(scanStatus.latestMatch).toMatchObject({
      path: '/tmp/video1.mp4',
      imagePath: '/matches/video1.jpg',
      matchScore: 0.77,
      isVerified: true,
      episodeInfo: 'video1',
    });
    expect(addScannedFile.run).toHaveBeenCalled();
  });

  it('handles errors from runClipMatcher', async () => {
    // Stub directory read to return one video file entry
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([
      { name: 'video2.mp4', isDirectory: () => false }
    ] as any);
    // Stub file stats
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ mtimeMs: 200 } as any);
    getScannedFileByPath.get = jest.fn().mockReturnValue(undefined);
    jest.spyOn(server, 'runClipMatcher').mockResolvedValue({
      success: false,
      error: 'Failure occurred',
      exitCode: 2,
      verificationPath: '/tmp',
    } as any);
    jest.spyOn(server, 'copyVerificationImage').mockResolvedValue(null);
    addScannedFile.run = jest.fn();
    updateScannedFile.run = jest.fn();

    const libs = [{ id: 1, is_enabled: 1, title: 'Lib', path: '/tmp' }];
    await processScan(libs);

    expect(scanStatus.totalFiles).toBe(1);
    expect(scanStatus.processedFiles).toBe(1);
    // On failure, no latest successful match should be recorded
    expect(scanStatus.latestMatch).toBeNull();
    expect(addScannedFile.run).toHaveBeenCalled();
  });

  it('handles error without verificationPath', async () => {
    // Stub directory read to return one video file entry
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([
      { name: 'video3.mp4', isDirectory: () => false }
    ] as any);
    // Stub file stats
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ mtimeMs: 300 } as any);
    // No existing record
    getScannedFileByPath.get = jest.fn().mockReturnValue(undefined);
    // Stub matcher failure without verificationPath
    jest.spyOn(server, 'runClipMatcher').mockResolvedValue({
      success: false,
      error: 'Process exited with code 3: Something failed',
      exitCode: 3
    } as any);
    // Stub DB operations
    addScannedFile.run = jest.fn();
    updateScannedFile.run = jest.fn();

    const libs = [{ id: 1, is_enabled: 1, title: 'Lib', path: '/tmp' }];
    await processScan(libs);

    // Should attempt to add a new record even without verificationPath
    expect(addScannedFile.run).toHaveBeenCalled();
  });

  it('catches errors from findMediaFiles and resets status', async () => {
    // Stub findMediaFiles to throw
    jest.spyOn(server, 'findMediaFiles').mockRejectedValue(new Error('scanfail'));
    const libs = [{ id: 1, is_enabled: 1, title: 'Lib', path: '/tmp' }];
    await processScan(libs);

    // Outer catch should reset scanning flags
    expect(scanStatus.isScanning).toBe(false);
    expect(scanStatus.stopRequested).toBe(false);
  });

  it('reuses existing verification image on scan error when no new image is generated', async () => {
    // Stub findMediaFiles to return one video file entry
    jest.spyOn(server, 'findMediaFiles').mockResolvedValue([
      { path: '/tmp/video4.mp4', libraryId: 1 }
    ]);
    // Stub directory read (not used directly, kept for completeness)
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([
      { name: 'video4.mp4', isDirectory: () => false }
    ] as any);
    // Stub file stats
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ mtimeMs: 400 } as any);
    // Existing record with a previous verification image
    getScannedFileByPath.get = jest.fn().mockReturnValue({ verification_image_path: '/existing/path.jpg', file_modified_time: 100 });
    // Stub matcher failure
    jest.spyOn(server, 'runClipMatcher').mockResolvedValue({
      success: false,
      error: 'Error occurred',
      exitCode: 4,
      verificationPath: null,
    } as any);
    // Stub image copy
    jest.spyOn(server, 'copyVerificationImage').mockResolvedValue(null);
    // Stub DB operations
    addScannedFile.run = jest.fn();
    updateScannedFile.run = jest.fn();

    const libs = [{ id: 1, is_enabled: 1, title: 'Lib', path: '/tmp' }];
    await processScan(libs);

    // Should reuse existing image by calling updateScannedFile
    expect(updateScannedFile.run).toHaveBeenCalled();
    // The second argument to updateScannedFile.run should be the existing image path
    const callArgs = updateScannedFile.run.mock.calls[0];
    expect(callArgs[1]).toBe('/existing/path.jpg');
  });
}); 