'use client';

import React from 'react';
import Image from 'next/image';
import ShowSelector from '@/components/ShowSelector';
import EpisodeSelector from '@/components/EpisodeSelector';
import { useScan } from '@/hooks/useScan';
import { useLatestMatch } from '@/hooks/useLatestMatch';
import { useLibraries } from '@/hooks/useLibraries';
import { useMediaBrowser } from '@/hooks/useMediaBrowser';
import { getSeasonCardClass } from '@/lib/uiUtils';

interface ScanStatus {
  isScanning: boolean;
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  startTime: number | null;
  errors: string[];
  stopRequested: boolean;
}

interface ScannedFile {
  id: number;
  library_id: number;
  file_path: string;
  file_modified_time: number;
  last_scanned_time: number;
  verification_image_path: string | null;
  match_score: number;
  is_verified: boolean;
  episode_info: string;
}

interface Show {
  name: string;
  path: string;
}

interface Episode {
  filename: string;
  path: string;
  season: number;
  episode: number;
  name: string;
}

interface Season {
  name: string;
  path: string;
}

export default function Dashboard() {
  const { scanStatus, error: scanError, isStopping, stopMessage, startScan, stopScan } = useScan();
  const { latest: latestScan, error: matchError } = useLatestMatch();
  const { shows, error: libsError, loading: libsLoading } = useLibraries();
  const { selectedShow, seasons, selectedSeason, episodes, error: browserError, selectShow, selectSeason } = useMediaBrowser();

  const error = scanError || libsError || browserError;

  // Calculate progress percentage
  const progressPercentage = scanStatus.totalFiles > 0 
    ? Math.round((scanStatus.processedFiles / scanStatus.totalFiles) * 100) 
    : 0;

  return (
    <div className="min-h-screen">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      {error && (
        <div className="bg-red-900 border border-red-700 text-white px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}
      
      {/* Scan Controls */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Media Scanner</h2>
          <div className="flex space-x-2">
            <button
              onClick={startScan}
              disabled={scanStatus.isScanning || isStopping}
              className={`px-4 py-2 rounded font-medium ${
                scanStatus.isScanning || isStopping
                  ? 'bg-gray-600 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {scanStatus.isScanning ? 'Scanning...' : 'Scan All Libraries'}
            </button>
            {scanStatus.isScanning && (
              <button
                onClick={stopScan}
                disabled={isStopping || scanStatus.stopRequested}
                className={`px-4 py-2 rounded font-medium ${
                  isStopping || scanStatus.stopRequested
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isStopping || scanStatus.stopRequested ? 'Stopping...' : 'Stop Scan'}
              </button>
            )}
          </div>
        </div>
        
        {/* Progress Bar and Status */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-400">
              {scanStatus.isScanning ? `Scanning... ${progressPercentage}%` : 'Scan Idle'}
            </span>
            <span className="text-sm text-gray-500">
              {scanStatus.processedFiles} / {scanStatus.totalFiles} files
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          {scanStatus.isScanning && scanStatus.currentFile && (
            <div className="text-xs text-gray-400 mt-1 truncate">Current file: {scanStatus.currentFile}</div>
          )}
        </div>
      </div>
      
      {/* Latest Verification */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-xl font-semibold mb-4">Latest Verification</h2>
        
        {latestScan && latestScan.verification_image_path ? (
          <div>
            <div className="flex items-center mb-3">
              <div className={`w-3 h-3 rounded-full mr-2 ${latestScan.is_verified ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="font-medium">
                {latestScan.is_verified ? 'Verified' : 'Not Verified'} 
                {latestScan.match_score != null && ` (Score: ${latestScan.match_score!.toFixed(2)})`}
              </span>
            </div>
            
            <div className="mb-3 text-sm text-gray-400">
              <div>File: {latestScan.file_path!.split('/').pop()}</div>
              {latestScan.episode_info && latestScan.episode_info !== 'Processing Error' && (
                <div>Episode: {latestScan.episode_info}</div>
              )}
              <div>Scanned: {new Date(latestScan.last_scanned_time!).toLocaleString()}</div>
            </div>
            
            <div className="bg-black rounded overflow-hidden">
              <img
                key={latestScan.last_scanned_time!}
                src={`${(process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000')}${latestScan.verification_image_path}?t=${latestScan.last_scanned_time!}`}
                alt="Verification"
                className="w-full h-auto"
              />
            </div>
          </div>
        ) : (
          <div className="text-gray-400">No verification images available yet. Run a scan to generate verification images.</div>
        )}
      </div>
      
      {/* Media Browser */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <ShowSelector 
            shows={shows} 
            onShowSelect={selectShow}
          />
          
          {selectedShow && seasons.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-8">
              <h2 className="text-xl font-semibold mb-4">Seasons</h2>
              <div className="space-y-3">
                {seasons.map((season) => (
                  <div
                    key={season.path}
                    onClick={() => selectSeason(season)}
                    className={`border border-gray-700 rounded p-3 hover:bg-gray-700 cursor-pointer ${getSeasonCardClass(selectedSeason?.path === season.path)}`}
                  >
                    <div className="font-medium">{season.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div>
          {selectedSeason && (
            <EpisodeSelector 
              episodes={episodes}
            />
          )}
        </div>
      </div>
    </div>
  );
}
