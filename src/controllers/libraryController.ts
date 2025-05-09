import { Request, Response } from 'express';
import db from '../db';
import { validatePath } from '../utils';

const getLibrariesStmt = db.prepare('SELECT * FROM libraries');

export const getLibraries = (req: Request, res: Response) => {
  try {
    // Use server export if available to allow stubbing in tests
    const serverModule = require('../../server.ts');
    const stmt = serverModule.getLibraries || getLibrariesStmt;
    const libraries = stmt.all();
    return res.json(libraries);
  } catch (error) {
    console.error('[ERROR] Failed to get libraries:', error);
    return res.status(500).json({ error: 'Failed to get libraries from database' });
  }
};

const addLibraryStmt = db.prepare('INSERT INTO libraries (title, path, type) VALUES (?, ?, ?)');

export const createLibrary = async (req: Request, res: Response) => {
  const { title, path: libraryPath, type } = req.body;

  if (!libraryPath) {
    return res.status(400).json({ error: 'Missing path in request body' });
  }
  if (!title) {
    return res.status(400).json({ error: 'Missing title in request body' });
  }
  if (!type || !['movie', 'tv'].includes(type)) {
    return res.status(400).json({ error: 'Missing or invalid type in request body (must be "movie" or "tv")' });
  }

  const exists = await validatePath(libraryPath);
  if (!exists) {
    return res.status(400).json({ error: 'Library path does not exist or is not accessible' });
  }

  try {
    // Use server export if available to allow stubbing in tests
    const serverModule = require('../../server.ts');
    const stmt = serverModule.addLibrary || addLibraryStmt;
    const result = stmt.run(title, libraryPath, type);
    return res.json({ message: 'Library added successfully', id: result.lastInsertRowid });
  } catch (error) {
    console.error('[ERROR] Failed to add library:', error);
    return res.status(500).json({ error: 'Failed to add library to database' });
  }
};

export const updateLibrary = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid library ID' });
  }

  const { title, path: libraryPath, type, is_enabled } = req.body;
  const provided = [title, libraryPath, type, is_enabled].some(val => val !== undefined);
  if (!provided) {
    return res.status(400).json({ error: 'No update fields provided (title, path, type, or is_enabled)' });
  }

  if (type !== undefined && !['movie', 'tv'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type (must be "movie" or "tv")' });
  }

  if (is_enabled !== undefined && ![0, 1, true, false].includes(is_enabled)) {
    return res.status(400).json({ error: 'Invalid is_enabled value (must be 0, 1, true, or false)' });
  }

  if (libraryPath !== undefined) {
    if (typeof libraryPath !== 'string' || libraryPath === '') {
      return res.status(400).json({ error: 'Path cannot be empty' });
    }
    const exists = await validatePath(libraryPath);
    if (!exists) {
      return res.status(400).json({ error: 'Library path does not exist or is not accessible' });
    }
  }

  const clauses: string[] = [];
  const params: any[] = [];

  if (title !== undefined) {
    if (typeof title !== 'string' || title === '') {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }
    clauses.push('title = ?');
    params.push(title);
  }
  if (libraryPath !== undefined) {
    clauses.push('path = ?');
    params.push(libraryPath);
  }
  if (type !== undefined) {
    clauses.push('type = ?');
    params.push(type);
  }
  if (is_enabled !== undefined) {
    clauses.push('is_enabled = ?');
    params.push(is_enabled === true || is_enabled === 1 ? 1 : 0);
  }

  if (clauses.length === 0) {
    return res.status(400).json({ error: 'No valid update fields provided' });
  }

  params.push(id);
  const sql = `UPDATE libraries SET ${clauses.join(', ')} WHERE id = ?`;

  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    const getById = db.prepare('SELECT * FROM libraries WHERE id = ?');
    const updated = getById.get(id);
    return res.json({ message: 'Library updated successfully', library: updated });
  } catch (error) {
    console.error('[ERROR] Failed to update library:', error);
    return res.status(500).json({ error: 'Failed to update library in database' });
  }
};

export const deleteLibrary = (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid library ID' });
  }

  try {
    const stmt = db.prepare('DELETE FROM libraries WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }
    return res.status(200).json({ message: 'Library deleted successfully' });
  } catch (error) {
    console.error('[ERROR] Failed to delete library:', error);
    return res.status(500).json({ error: 'Failed to delete library from database' });
  }
};
