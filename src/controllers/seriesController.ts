import { Request, Response } from 'express';
import db from '../db';
import axios from 'axios';

const getLibraryStmt = db.prepare('SELECT * FROM libraries WHERE id = ?');

export const getSeries = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid library ID' });
  }

  try {
    const lib: any = getLibraryStmt.get(id);
    if (!lib) {
      return res.status(404).json({ error: 'Library not found' });
    }
    if (!lib.sonarr_api_key) {
      return res.status(400).json({ error: 'Missing Sonarr API key' });
    }

    // Determine base URL using per-library port if set, else environment or default
    const baseUrl = lib.sonarr_port
      ? `http://localhost:${lib.sonarr_port}`
      : process.env.SONARR_URL || 'http://localhost:8989';
    const response = await axios.get(`${baseUrl}/api/v3/series`, {
      headers: { 'X-Api-Key': lib.sonarr_api_key }
    });
    return res.json(response.data);
  } catch (error: any) {
    // Log full error for debugging
    console.error('[ERROR] getSeries failed:', error);
    // Extract message from response or error object
    const msg =
      error.response?.data?.error ||
      error.message ||
      'Unknown error fetching series';
    return res.status(500).json({ error: msg });
  }
};