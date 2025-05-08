import { useState, useEffect, useCallback } from 'react';

type LatestMatch = {
  found: boolean;
  file_path?: string;
  verification_image_path?: string;
  match_score?: number;
  is_verified?: boolean;
  episode_info?: string;
  last_scanned_time?: number;
};

export function useLatestMatch(baseUrl: string = 'http://localhost:5000') {
  const [latest, setLatest] = useState<LatestMatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMatch = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/latest-match`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.found) {
        setLatest(data);
      } else {
        setLatest(null);
      }
    } catch (e: any) {
      setError('Failed to fetch latest match');
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchMatch();
    const interval = setInterval(fetchMatch, 3000);
    return () => clearInterval(interval);
  }, [fetchMatch]);

  return { latest, error, refresh: fetchMatch };
} 