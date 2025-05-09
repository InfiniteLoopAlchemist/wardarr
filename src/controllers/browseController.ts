import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db';
const getLibrariesStmt = db.prepare('SELECT * FROM libraries');
// import { validatePath } from '../utils'; // removed existence check to allow direct readdir
import { getContent } from './contentController';

export const browseRoot = async (req: Request, res: Response) => {
  const requestedPath = (req.query.path as string) || '/';
  try {
    const entries = await fs.promises.readdir(requestedPath, { withFileTypes: true });
    const result = entries.map(entry => ({
      name: entry.name,
      path: path.join(requestedPath, entry.name),
      isDirectory: entry.isDirectory()
    }));
    return res.json(result);
  } catch (err: any) {
    console.error(`[ERROR] Error browsing directory: ${err.message}`);
    if (err.code === 'ENOENT') {
      return res.status(400).json({ error: `Directory not found: ${requestedPath}` });
    }
    return res.status(500).json({ error: `Failed to browse directory: ${err.message}` });
  }
};

export const browseLevel = async (req: Request, res: Response) => {
  const { level } = req.params;
  const parentPath = (req.query.parent as string) || '';
  try {
    if (level === 'libraries') {
      // Use server stub if available, else use local statement
      const serverModule = require('../../server');
      const stmt = serverModule.getLibraries || getLibrariesStmt;
      const libraries = stmt.all();
      return res.json(libraries);
    }
    if (['shows', 'seasons', 'episodes'].includes(level)) {
      req.params.type = level;
      req.query.path = parentPath;
      return getContent(req, res);
    }
    return res.status(400).json({ error: `Invalid browse level: ${level}` });
  } catch (err: any) {
    console.error(`[ERROR] Error in hierarchical browse: ${err.message}`);
    return res.status(500).json({ error: `Failed to browse ${level}: ${err.message}` });
  }
}; 