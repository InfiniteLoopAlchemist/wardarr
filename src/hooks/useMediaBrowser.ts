import { useState, useCallback } from 'react';

type Show = { name: string; path: string };
type Season = { name: string; path: string };
type Episode = { filename: string; path: string; season: number; episode: number; name: string };

export function useMediaBrowser(baseUrl: string = 'http://localhost:5000') {
  const [shows, setShows] = useState<Show[]>([]); // optional: if orchestrating libraries hook externally
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectShow = useCallback(async (show: Show) => {
    setSelectedShow(show);
    setSelectedSeason(null);
    setEpisodes([]);
    setError(null);
    try {
      const parent = encodeURIComponent(show.path.replace(/^\//, ''));
      const res = await fetch(`${baseUrl}/api/browse/seasons?parent=${parent}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Season[] = await res.json();
      setSeasons(data);
      if (data.length > 0) {
        selectSeason(data[0]);
      }
    } catch {
      setError('Failed to fetch episodes. Please check if the show path is correct.');
    }
  }, [baseUrl]);

  const selectSeason = useCallback(async (season: Season) => {
    setSelectedSeason(season);
    setEpisodes([]);
    setError(null);
    try {
      const parent = encodeURIComponent(season.path.replace(/^\//, ''));
      const res = await fetch(`${baseUrl}/api/browse/episodes?parent=${parent}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Episode[] = await res.json();
      setEpisodes(data);
    } catch {
      setError('Failed to fetch episodes. Please check if the season path is correct.');
    }
  }, [baseUrl]);

  return {
    selectedShow,
    seasons,
    selectedSeason,
    episodes,
    error,
    selectShow,
    selectSeason
  };
} 