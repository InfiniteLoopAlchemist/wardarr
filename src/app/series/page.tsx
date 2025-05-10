'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface Library {
  id: number;
  title: string;
  path: string;
  type: 'movie' | 'tv';
  sonarr_api_key?: string | null;
  sonarr_port?: number | null;
}

// Base URL for backend API
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

// Helper to get poster URL from Sonarr
const getPosterUrl = (s: any) => {
  const p = s.images?.find((img: any) => img.coverType === 'poster')?.url ?? '';
  return p.startsWith('http') ? p : `${s.libBaseUrl}${p}`;
};

export default function SeriesPage() {
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const resLib = await fetch(`${API_BASE}/api/libraries`);
        if (!resLib.ok) throw new Error(`HTTP ${resLib.status}`);
        const libs: Library[] = await resLib.json();
        const tvLibs = libs.filter(lib => lib.type === 'tv');
        const allSeries = await Promise.all(
          tvLibs.map(async lib => {
            // Determine Sonarr base URL per library
            const libBaseUrl = lib.sonarr_port
              ? `http://localhost:${lib.sonarr_port}`
              : process.env.NEXT_PUBLIC_SONARR_URL || 'http://localhost:8989';
            const res = await fetch(`${API_BASE}/api/series/${lib.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Series fetch failed ${res.status}`);
            // Attach libId and Sonarr base URL for poster mapping
            return data.map((s: any) => ({ ...s, libId: lib.id, libBaseUrl }));
          })
        );
        setSeriesList(allSeries.flat());
      } catch (e: any) {
        setError(e.message || 'Failed to load series');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-6">Series</h1>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      {loading ? (
        <div>Loading series...</div>
      ) : seriesList.length === 0 ? (
        <div>No series found.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {seriesList.map((s: any) => (
            <Link
              key={`${s.libId}-${s.id}`}
              href={`/series/${s.libId}/${s.id}`}
            >
              <div className="bg-gray-800 p-2 rounded hover:shadow-lg">
                <img
                  src={getPosterUrl(s)}
                  alt={s.title}
                  className="w-full h-auto mb-2 rounded"
                />
                <div className="text-center text-sm text-white">{s.title}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
} 