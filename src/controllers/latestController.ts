import { Request, Response } from 'express';
import db from '../db';
// Handlers will require server export for getLatestScannedFile, fallback to local DB statement for direct DB use

export const getLatestVerification = (req: Request, res: Response) => {
  try {
    const { getLatestScannedFile } = require('../../server');
    const stmt = getLatestScannedFile || db.prepare('SELECT * FROM scanned_files ORDER BY last_scanned_time DESC LIMIT 1');
    const latestFile: any = stmt.get();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (!latestFile) {
      return res.json({ found: false });
    }

    let imagePath: string | null = null;
    const rawPath = latestFile.verification_image_path;
    if (rawPath) {
      imagePath = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
    }

    return res.json({
      found: true,
      file_path: latestFile.file_path,
      verification_image_path: imagePath,
      match_score: latestFile.match_score,
      is_verified: latestFile.is_verified === 1,
      episode_info: latestFile.episode_info,
      last_scanned_time: latestFile.last_scanned_time,
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[ERROR] Failed to get latest verification:', error);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json({ found: false });
  }
};

export const getLatestMatch = (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { getLatestScannedFile } = require('../../server');
    const stmt = getLatestScannedFile || db.prepare('SELECT * FROM scanned_files ORDER BY last_scanned_time DESC LIMIT 1');
    const latestFile: any = stmt.get();
    if (!latestFile) {
      return res.json({ found: false });
    }

    let imagePath: string | null = null;
    const rawPath = latestFile.verification_image_path;
    if (rawPath) {
      imagePath = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
    }

    return res.json({
      found: true,
      file_path: latestFile.file_path,
      verification_image_path: imagePath,
      match_score: latestFile.match_score,
      is_verified: latestFile.is_verified === 1,
      episode_info: latestFile.episode_info,
      last_scanned_time: latestFile.last_scanned_time,
      timestamp: Date.now(),
      source: 'database'
    });
  } catch (error: any) {
    console.error('[ERROR] Failed to get latest match:', error);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json({ found: false });
  }
}; 