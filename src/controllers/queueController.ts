import { Request, Response } from 'express';
import db from '../db';
const { scanStatus } = require('../serverLogic');

const getQueueStmt = db.prepare('SELECT * FROM scanned_files');
const clearQueueStmt = db.prepare('DELETE FROM scanned_files');

export const getQueue = (req: Request, res: Response) => {
  try {
    const queue = getQueueStmt.all();
    return res.json(queue);
  } catch (error) {
    console.error('[ERROR] Failed to get scan queue:', error);
    return res.status(500).json({ error: 'Failed to get scan queue from database' });
  }
};

export const clearQueue = (req: Request, res: Response) => {
  try {
    if (scanStatus.isScanning) {
      scanStatus.stopRequested = true;
    }
    const result = clearQueueStmt.run();
    if (scanStatus.latestMatch) {
      scanStatus.latestMatch = null;
    }
    return res.status(200).json({ message: 'Scan queue cleared successfully!' });
  } catch (error) {
    console.error('[ERROR] Failed to clear scan queue:', error);
    return res.status(500).json({ error: 'Failed to clear scan queue from database' });
  }
}; 