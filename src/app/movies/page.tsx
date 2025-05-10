'use client';

import React, { useState, useEffect } from 'react';

interface Library {
  id: number;
  title: string;
  path: string;
  type: 'movie' | 'tv';
  radarr_api_key?: string | null;
  radarr_port?: number | null;
}

// Base URL for backend API
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export default function MoviesPage() {
  const [moviesList, setMoviesList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const resLib = await fetch(`${API_BASE}/api/libraries`);
        if (!resLib.ok) throw new Error(`HTTP ${resLib.status}`);
        const libs: Library[] = await resLib.json();
        const movieLibs = libs.filter(lib => lib.type === 'movie');
        const allMovies = await Promise.all(
          movieLibs.map(async lib => {
            const libBaseUrl = lib.radarr_port
              ? `http://localhost:${lib.radarr_port}`
              : process.env.NEXT_PUBLIC_RADARR_URL || 'http://localhost:7878';
            const res = await fetch(`${API_BASE}/api/movies/${lib.id}`);
            const data: any[] = await res.json();
            if (!res.ok) throw new Error(`Movies fetch failed ${res.status}`);
            const moviesWithPosters = await Promise.all(
              data.map(async m => {
                let posterUrl = m.remotePoster.startsWith('http')
                  ? m.remotePoster
                  : `${libBaseUrl}${m.remotePoster}`;
                if (TMDB_API_KEY && m.tmdbId) {
                  try {
                    const tmdbRes = await fetch(
                      `https://api.themoviedb.org/3/movie/${m.tmdbId}?api_key=${TMDB_API_KEY}`
                    );
                    if (tmdbRes.ok) {
                      const tmdbData = await tmdbRes.json();
                      if (tmdbData.poster_path) {
                        posterUrl = `${TMDB_IMAGE_BASE}${tmdbData.poster_path}`;
                      }
                    }
                  } catch {
                    // ignore TMDB fetch errors
                  }
                }
                return { ...m, libBaseUrl, posterUrl };
              })
            );
            return moviesWithPosters;
          })
        );
        setMoviesList(allMovies.flat());
      } catch (e: any) {
        setError(e.message || 'Failed to load movies');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-6">Movies</h1>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      {loading ? (
        <div>Loading movies...</div>
      ) : moviesList.length === 0 ? (
        <div>No movies found.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {moviesList.map((m: any) => (
            <div key={m.id} className="bg-gray-800 p-2 rounded">
              <img
                src={m.posterUrl}
                alt={m.title}
                className="w-full h-auto mb-2 rounded"
              />
              <div className="text-center text-sm text-white">{m.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 