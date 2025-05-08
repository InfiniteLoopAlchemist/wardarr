import { useState, useEffect } from 'react';

type Show = { name: string; path: string };

export function useLibraries(baseUrl: string = 'http://localhost:5000') {
  const [shows, setShows] = useState<Show[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchLibraries = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/libraries`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const libs: { id: number; title: string; path: string }[] = await res.json();
      setShows(libs.map(l => ({ name: l.title, path: l.path })));
      setError(null);
    } catch {
      setError('Failed to fetch libraries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibraries();
  }, []);

  return { shows, error, loading, refresh: fetchLibraries };
} 