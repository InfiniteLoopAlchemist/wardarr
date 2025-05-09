import { Request, Response } from 'express';
import * as fs from 'fs';
import path from 'path';

export const getContent = async (req: Request, res: Response) => {
  const contentType = req.params.type; // shows, seasons, episodes
  const contentPath = req.query.path as string;

  if (!contentPath) {
    return res.status(400).json({ error: `Missing path parameter for ${contentType}` });
  }

  let fullPath = contentPath;
  if (!fullPath.startsWith('/')) fullPath = '/' + fullPath;

  try {
    await fs.promises.access(fullPath, fs.constants.R_OK);
  } catch {
    return res.status(400).json({ error: 'Directory not found' });
  }

  try {
    // Directly read directory; errors will be caught in catch block
    const files = await fs.promises.readdir(fullPath, { withFileTypes: true });
    let result: any[] = [];

    if (contentType === 'shows') {
      result = files.filter(f => f.isDirectory()).map(dir => {
        const name = dir.name;
        const yearMatch = name.match(/\((\d{4})\)/);
        const idMatch = name.match(/\[tvdbid-(\d+)\]/);
        return {
          name,
          path: path.join(fullPath, name),
          year: yearMatch ? yearMatch[1] : null,
          tvdbId: idMatch ? idMatch[1] : null
        };
      });
    } else if (contentType === 'seasons') {
      result = files.filter(f => f.isDirectory() && /season\s+\d+/i.test(f.name))
        .map(dir => {
          const numMatch = dir.name.match(/season\s+(\d+)/i);
          return { name: dir.name, path: path.join(fullPath, dir.name), number: numMatch ? parseInt(numMatch[1], 10) : null };
        })
        .sort((a, b) => (a.number || 0) - (b.number || 0));
    } else if (contentType === 'episodes') {
      const fileNames = await fs.promises.readdir(fullPath);
      const videoExts = ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'];
      result = fileNames.filter(fn => videoExts.includes(path.extname(fn).toLowerCase())).map(fn => {
        const match = fn.match(/S(\d+)E(\d+)/i);
        const nameMatch = fn.match(/[sS]\d+[eE]\d+\s*-\s*([^\[\]]+)/);
        return {
          filename: fn,
          path: path.join(fullPath, fn),
          season: match ? parseInt(match[1], 10) : null,
          episode: match ? parseInt(match[2], 10) : null,
          name: nameMatch ? nameMatch[1].trim() : fn
        };
      }).sort((a, b) => ((a.season || 0) - (b.season || 0)) || ((a.episode || 0) - (b.episode || 0)));
    } else {
      return res.status(400).json({ error: `Invalid content type: ${contentType}` });
    }

    return res.json(result);
  } catch (err: any) {
    console.error(`[ERROR] Error scanning directory: ${err.message}`);
    return res.status(500).json({ error: `Failed to scan directory: ${err.message}` });
  }
};

export const legacyShows = (req: Request, res: Response) => {
  const contentPath = req.query.path as string;
  if (!contentPath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }
  req.params.type = 'shows';
  req.query.path = contentPath;
  return getContent(req, res);
};

export const legacySeasons = (req: Request, res: Response) => {
  const contentPath = req.query.path as string;
  if (!contentPath) {
    return res.status(400).json({ error: 'Missing show path parameter' });
  }
  req.params.type = 'seasons';
  req.query.path = contentPath;
  return getContent(req, res);
};

export const legacyEpisodes = (req: Request, res: Response) => {
  const contentPath = req.query.path as string;
  if (!contentPath) {
    return res.status(400).json({ error: 'Missing season path parameter' });
  }
  req.params.type = 'episodes';
  req.query.path = contentPath;
  return getContent(req, res);
};

export const pathBased = (req: Request, res: Response) => {
  const contentType = req.params.type;
  // encodedPath may be string or array of segments
  let encodedRest = req.params.encodedPath;
  if (Array.isArray(encodedRest)) {
    // Join multiple segments with '/'
    encodedRest = encodedRest.join('/');
  }
  if (!encodedRest) {
    return res.status(400).json({ error: `Missing encodedPath parameter for ${contentType}` });
  }
  // Decode percent-encoded path
  const decodedPath = decodeURIComponent(encodedRest);
  req.params.type = contentType;
  req.query.path = decodedPath;
  return getContent(req, res);
};
