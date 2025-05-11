import { Request, Response } from 'express';
import db from '../db';
import axios from 'axios';

const getLibraryStmt = db.prepare('SELECT * FROM libraries WHERE id = ?');

export const getSeriesDetail = async (req: Request, res: Response) => {
  const libId = parseInt(req.params.libId, 10);
  const seriesId = parseInt(req.params.seriesId, 10);
  if (isNaN(libId) || isNaN(seriesId)) {
    return res.status(400).json({ error: 'Invalid library or series ID' });
  }
  try {
    const lib: any = getLibraryStmt.get(libId);
    if (!lib) {
      return res.status(404).json({ error: 'Library not found' });
    }
    if (!lib.sonarr_api_key) {
      return res.status(400).json({ error: 'Missing Sonarr API key' });
    }
    const baseUrl = lib.sonarr_port
      ? `http://localhost:${lib.sonarr_port}`
      : process.env.SONARR_URL || 'http://localhost:8989';
    // First fetch series metadata
    const seriesRes = await axios.get(
      `${baseUrl}/api/v3/series/${seriesId}`,
      { headers: { 'X-Api-Key': lib.sonarr_api_key } }
    );
    const seriesData: any = seriesRes.data;
    // Then fetch all episodes for this series
    const episodesRes = await axios.get(
      `${baseUrl}/api/v3/episode`,
      {
        params: { seriesId },
        headers: { 'X-Api-Key': lib.sonarr_api_key }
      }
    );
    // Attach episodes directly on the series object
    seriesData.episodes = episodesRes.data;
    return res.json(seriesData);
  } catch (error: any) {
    console.error('[ERROR] getSeriesDetail failed:', error);
    const msg = error.response?.data?.error || error.message || 'Error fetching series detail';
    return res.status(500).json({ error: msg });
  }
}; 