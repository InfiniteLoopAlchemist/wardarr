import { Request, Response } from 'express';

/**
 * Start a new scan. Returns 409 if one is already in progress.
 */
export const startScan = (req: Request, res: Response) => {
  // Retrieve server state and logic from the Express app instance
  const { scanStatus, processScan, getLibraries } = (req.app as any);
  try {
    if (scanStatus.isScanning) {
      return res
        .status(409)
        .json({ error: 'A scan is already in progress', status: scanStatus });
    }
    // Initialize scan status
    Object.assign(scanStatus, {
      isScanning: true,
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      startTime: Date.now(),
      errors: [],
      latestMatch: null,
      stopRequested: false
    });
    // Load all libraries
    const libraries = getLibraries.all();
    // Kick off the asynchronous scan
    if (process.env.NODE_ENV !== 'test') {
      setImmediate(() => {
        processScan(libraries).catch((err: any) => {
          console.error('[ERROR] Scan process failed:', err);
          scanStatus.isScanning = false;
          scanStatus.stopRequested = false;
          scanStatus.errors.push(`Scan process failed: ${err.message}`);
        });
      });
    }
    return res.json({ message: 'Scan started', status: scanStatus });
  } catch (err: any) {
    // On error, reset scanning state
    scanStatus.isScanning = false;
    scanStatus.stopRequested = false;
    return res.status(500).json({ error: 'Failed to start scan' });
  }
};

/**
 * Get current scan status. Always returns no-cache headers.
 * While scanning: returns isScanning=true.
 * When idle: populates latestMatch from database if available.
 */
export const getScanStatus = (_req: Request, res: Response) => {
  // Retrieve server state and logic from the Express app instance
  const { scanStatus, getLatestScannedFile } = (res.req!.app as any);
  // If idle and no latestMatch yet, fetch latest from DB
  if (!scanStatus.isScanning && scanStatus.latestMatch == null) {
    try {
      const latestFile: any = getLatestScannedFile.get();
      if (latestFile) {
        scanStatus.latestMatch = {
          path: latestFile.file_path,
          imagePath: latestFile.verification_image_path,
          matchScore: latestFile.match_score,
          isVerified: latestFile.is_verified === 1,
          episodeInfo: latestFile.episode_info,
          timestamp: Date.now()
        };
      }
    } catch (err: any) {
      console.error('[ERROR] Failed to get latest verification for status:', err);
    }
  } else if (scanStatus.latestMatch) {
    // Always update timestamp for existing match
    scanStatus.latestMatch.timestamp = Date.now();
  }

  // Set no-cache headers
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  return res.json(scanStatus);
};

/**
 * Request to stop the current scan. Returns 400 if no scan in progress.
 */
export const stopScan = (_req: Request, res: Response) => {
  // Retrieve server state from the Express app instance
  const { scanStatus } = (res.req!.app as any);
  if (!scanStatus.isScanning) {
    return res.status(400).json({ message: 'No scan is currently in progress.' });
  }
  if (scanStatus.stopRequested) {
    return res.status(400).json({ message: 'Scan stop already requested.' });
  }
  scanStatus.stopRequested = true;
  return res.status(200).json({ message: 'Stop requested. Please wait for the current file to finish.' });
};
