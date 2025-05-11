'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { FaTimes, FaCheckCircle, FaBan } from 'react-icons/fa';

interface Series {
  id: number;
  title: string;
  path: string;
  runtime: number;
  genres: string[];
  firstAired: string;
  overview: string;
  sizeOnDisk: number;
  seasons: Array<any>;
  images?: Array<{ url: string; coverType: string }>;
  // Episodes array if returned at root
  episodes?: Array<any>;
  // Sonarr embedded episodes under _embedded
  _embedded?: { episodes: Array<any> };
}

interface Library {
  id: number;
  sonarr_port?: number | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
const TMDB_CREDIT = 'Metadata provided by TMDB';

const getPosterUrl = (s: Series, port?: number | null) => {
  const img = s.images?.find((i) => i.coverType === 'poster')?.url ?? '';
  const base = port
    ? `http://localhost:${port}`
    : process.env.NEXT_PUBLIC_SONARR_URL || 'http://localhost:8989';
  return img.startsWith('http') ? img : `${base}${img}`;
};

export default function SeriesDetailPage() {
  const { libId, seriesId } = useParams() as { libId: string; seriesId: string };
  const [series, setSeries] = useState<Series | null>(null);
  const [port, setPort] = useState<number | null>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function load() {
      // fetch library to get port
      const rl = await fetch(`${API_BASE}/api/libraries`);
      if (!rl.ok) return;
      const libs: Library[] = await rl.json();
      const lib = libs.find((l) => l.id === parseInt(libId, 10));
      setPort(lib?.sonarr_port ?? null);

      // fetch series detail with embedded episodes
      const rs = await fetch(`${API_BASE}/api/series/${libId}/${seriesId}?embed=episodes`);
      if (!rs.ok) return;
      const data: Series = await rs.json();
      console.log('Fetched series data:', data);
      setSeries(data);
    }
    load();
  }, [libId, seriesId]);

  if (!series) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex">
        <img
          src={getPosterUrl(series, port)}
          alt={series.title}
          className="w-1/3 rounded"
        />
        <div className="ml-8 flex-1">
          <div className="flex items-center">
            <h1 className="text-4xl font-bold">{series.title}</h1>
          </div>
          <div className="mt-4 space-x-4 text-sm text-gray-400">
            <span>{series.runtime}m</span>
            <span>{series.genres.join(', ')}</span>
            <span>{new Date(series.firstAired).getFullYear()}</span>
          </div>
          <div className="mt-2 space-x-4 text-sm text-gray-400">
            <span>{series.path}</span>
            <span>{(series.sizeOnDisk / 1024 ** 3).toFixed(1)} GiB</span>
          </div>
          <p className="mt-4 text-gray-200">{series.overview}</p>
          <p className="mt-2 text-xs text-gray-500">{TMDB_CREDIT}</p>
        </div>
      </div>

      <div className="mt-8">
        {series.seasons.map((season: any) => {
          const { seasonNumber, statistics } = season;
          // Combine embedded episodes or root-level episodes
          const allEps = series._embedded?.episodes ?? series.episodes ?? [];
          const eps = allEps.filter((e) => e.seasonNumber === seasonNumber);
          return (
            <div key={seasonNumber} className="mb-6">
              <div className="flex justify-between items-center bg-gray-800 p-2 rounded">
                <div className="flex items-center space-x-4">
                  <span className="font-medium">Season {seasonNumber}</span>
                  <span className="px-2 py-1 bg-green-600 rounded text-xs">
                    {statistics.episodeFileCount} / {statistics.episodeCount}
                  </span>
                  <span className="text-sm">
                    {(statistics.sizeOnDisk / 1024 ** 3).toFixed(1)} GiB
                  </span>
                </div>
                {/* expand/collapse button */}
                {(() => {
                  const isExpanded = expandedSeasons[seasonNumber] || false;
                  return (
                    <button
                      onClick={() =>
                        setExpandedSeasons((prev) => ({
                          ...prev,
                          [seasonNumber]: !isExpanded
                        }))
                      }
                      className="rounded-full border p-2"
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  );
                })()}
              </div>
              {expandedSeasons[seasonNumber] && (
                <table className="w-full mt-2 text-sm text-left text-gray-200">
                  <thead>
                    <tr className="bg-gray-700">
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">Title</th>
                      <th className="px-2 py-1">Air Date</th>
                      <th className="px-2 py-1 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {eps.map((ep: any) => (
                      <tr key={ep.id} className="border-t border-gray-700">
                        <td className="px-2 py-1">{ep.episodeNumber}</td>
                        <td className="px-2 py-1">{ep.title}</td>
                        <td className="px-2 py-1">
                          {new Date(ep.airDate).toLocaleDateString()}
                        </td>
                        <td className="px-2 py-1 flex justify-end space-x-2">
                          <FaTimes className="text-red-500" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
} 