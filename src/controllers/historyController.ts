import { Request, Response } from 'express';
import db from '../db';
const { scanStatus } = require('../serverLogic');

const getHistoryStmt = db.prepare('SELECT * FROM scanned_files');
const clearHistoryStmt = db.prepare('DELETE FROM scanned_files');

export const getHistory = (req: Request, res: Response) => {
  try {
    const history = getHistoryStmt.all();
    return res.json(history);
  } catch (error) {
    console.error('[ERROR] Failed to get scan history:', error);
    return res.status(500).json({ error: 'Failed to get scan history from database' });
  }
};

export const clearHistory = (req: Request, res: Response) => {
  try {
    if (scanStatus.isScanning) {
      scanStatus.stopRequested = true;
    }
    const result = clearHistoryStmt.run();
    if (scanStatus.latestMatch) {
      scanStatus.latestMatch = null;
    }
    return res.status(200).json({ message: 'Scan history cleared successfully!' });
  } catch (error) {
    console.error('[ERROR] Failed to clear scan history:', error);
    return res.status(500).json({ error: 'Failed to clear scan history from database' });
  }
}; 