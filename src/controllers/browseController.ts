import { Request, Response } from 'express';
import * as fs from 'fs';
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
  // Libraries don't require parent path
  if (level === 'libraries') {
    const serverModule = require('../../server');
    const stmt = serverModule.getLibraries || getLibrariesStmt;
    const libraries = stmt.all();
    return res.json(libraries);
  }
  // Validate supported levels
  if (!['shows', 'seasons', 'episodes'].includes(level)) {
    return res.status(400).json({ error: `Invalid browse level: ${level}` });
  }
  const parentPath = req.query.parent as string;
  if (!parentPath) {
    return res.status(400).json({ error: `Missing parent parameter for ${level}` });
  }
  const fullPath = parentPath;
  try {
    await fs.promises.access(fullPath, fs.constants.R_OK);
  } catch {
    return res.status(400).json({ error: `Directory not found: ${fullPath}` });
  }
  try {
    if (level === 'shows') {
      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
      const result = entries
        .filter(e => e.isDirectory())
        .map(dir => {
          const name = dir.name;
          const yearMatch = name.match(/\((\d{4})\)/);
          const idMatch = name.match(/\[tvdbid-(\d+)\]/);
          return {
            name,
            path: path.join(fullPath, name),
            year: yearMatch ? yearMatch[1] : null,
            tvdbId: idMatch ? idMatch[1] : null,
          };
        });
      return res.json(result);
    } else if (level === 'seasons') {
      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
      const result = entries
        .filter(e => e.isDirectory() && /season\s+\d+/i.test(e.name))
        .map(dir => {
          const numMatch = dir.name.match(/season\s+(\d+)/i);
          return {
            name: dir.name,
            path: path.join(fullPath, dir.name),
            number: numMatch ? parseInt(numMatch[1], 10) : null,
          };
        })
        .sort((a, b) => (a.number || 0) - (b.number || 0));
      return res.json(result);
    } else /* episodes */ {
      const fileNames = await fs.promises.readdir(fullPath);
      const videoExts = ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'];
      const result = fileNames
        .filter(fn => videoExts.includes(path.extname(fn).toLowerCase()))
        .map(fn => {
          const match = fn.match(/S(\d+)E(\d+)/i);
          const nameMatch = fn.match(/[sS]\d+[eE]\d+\s*-\s*([^\[\]]+)/);
          return {
            filename: fn,
            path: path.join(fullPath, fn),
            season: match ? parseInt(match[1], 10) : null,
            episode: match ? parseInt(match[2], 10) : null,
            name: nameMatch ? nameMatch[1].trim() : fn,
          };
        })
        .sort((a, b) => ((a.season || 0) - (b.season || 0)) || ((a.episode || 0) - (b.episode || 0)));
      return res.json(result);
    }
  } catch (err: any) {
    console.error(`[ERROR] Error in hierarchical browse: ${err.message}`);
    return res.status(500).json({ error: `Failed to browse ${level}: ${err.message}` });
  }
}; 