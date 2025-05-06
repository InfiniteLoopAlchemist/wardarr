'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import ShowSelector from '@/components/ShowSelector';
import EpisodeSelector from '@/components/EpisodeSelector';

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
  const [scanStatus, setScanStatus] = useState<ScanStatus>({
    isScanning: false,
    totalFiles: 0,
    processedFiles: 0,
    currentFile: '',
    startTime: null,
    errors: [],
    stopRequested: false
  });
  const [latestScan, setLatestScan] = useState<ScannedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shows] = useState<Show[]>([]);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isStoppingScan, setIsStoppingScan] = useState<boolean>(false);
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  // Fetch scan status
  const fetchScanStatus = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/scan/status');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setScanStatus(data);
    } catch (error) {
      console.error('Error fetching scan status:', error);
      setError('Failed to fetch scan status. Please check if the backend server is running.');
    }
  };

  // Fetch latest scan
  const fetchLatestScan = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/history');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Find the most recent scan
      if (data.length > 0) {
        const sorted = [...data].sort((a, b) => b.last_scanned_time - a.last_scanned_time);
        setLatestScan(sorted[0]);
      }
    } catch (error) {
      console.error('Error fetching scan history:', error);
      setError('Failed to fetch scan history. Please check if the backend server is running.');
    }
  };

  // Fetch latest match for real-time updates
  const fetchLatestMatch = async () => {
    try {
      // Use the /api/latest-match endpoint for the most up-to-date image
      const response = await fetch('http://localhost:5000/api/latest-match'); 
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Update latestScan state if a match is found
      if (data.found) {
        setLatestScan({
          id: -1, // Placeholder ID as this doesn't come from history
          library_id: -1, // Placeholder
          file_path: data.file_path || '',
          file_modified_time: data.last_scanned_time || Date.now(), // Approximate
          last_scanned_time: data.last_scanned_time || Date.now(),
          verification_image_path: data.verification_image_path,
          match_score: data.match_score || 0,
          is_verified: data.is_verified || false,
          episode_info: data.episode_info || ''
        });
      } else {
        // If no match found by the specific endpoint, maybe keep the last known from history?
        // Or set to null if you prefer:
        // setLatestScan(null);
      }
    } catch (error) {
      console.error('Error fetching latest match:', error);
      // Don't necessarily set a global error here, as it's for background polling
    }
  };

  // Start a scan
  const startScan = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setScanStatus(data.status);
      
      // Start polling for updates
      const intervalId = setInterval(async () => {
        const statusResponse = await fetch('http://localhost:5000/api/scan/status');
        const statusData = await statusResponse.json();
        setScanStatus(statusData);
        
        // If scan is complete, stop polling and fetch the latest scan
        if (!statusData.isScanning) {
          clearInterval(intervalId);
          fetchLatestScan();
        }
      }, 2000);
      
      // Clean up interval on component unmount
      return () => clearInterval(intervalId);
    } catch (error) {
      console.error('Error starting scan:', error);
      setError(`Failed to start scan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Stop the current scan
  const handleStopScan = async () => {
    if (!scanStatus.isScanning || isStoppingScan) return;

    setIsStoppingScan(true);
    setStopMessage(null); // Clear previous message

    try {
      const response = await fetch('http://localhost:5000/api/scan/stop', {
        method: 'POST'
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to request scan stop');
      }
      
      setStopMessage(data.message || 'Stop request sent successfully.');
      // Polling will eventually update isScanning to false

    } catch (error) {
      console.error('Error stopping scan:', error);
      setError(`Failed to stop scan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Keep loading state true until scan actually stops via polling
      // setIsStoppingScan(false); 
    }
  };

  useEffect(() => {
    let scanIntervalId: NodeJS.Timeout | null = null;
    let matchIntervalId: NodeJS.Timeout | null = null;

    // Initial data fetch
    fetchScanStatus();
    fetchLatestMatch(); // Fetch latest match on initial load

    // Function to handle polling
    const startPolling = () => {
      // Poll for scan status
      scanIntervalId = setInterval(async () => {
        try {
          const statusResponse = await fetch('http://localhost:5000/api/scan/status');
          const statusData = await statusResponse.json();
          setScanStatus(statusData);

          // If scan finishes, clear this interval
          if (!statusData.isScanning) {
            if (scanIntervalId) clearInterval(scanIntervalId);
            scanIntervalId = null;
            // Fetch final history once scan is done (optional, fetchLatestMatch handles real-time)
            // fetchLatestScan(); 
          }
        } catch (error) {
          console.error('Error polling scan status:', error);
          if (scanIntervalId) clearInterval(scanIntervalId); // Stop polling on error
          scanIntervalId = null;
        }
      }, 2000); // Poll scan status every 2 seconds

      // Poll for latest match updates independently
      matchIntervalId = setInterval(fetchLatestMatch, 3000); // Poll latest match every 3 seconds
    };

    // Start polling immediately if a scan is already running based on initial fetch
    fetch('http://localhost:5000/api/scan/status')
      .then(res => res.json())
      .then(initialStatus => {
        setScanStatus(initialStatus); // Ensure state is up-to-date
        if (initialStatus.isScanning) {
          startPolling();
        } else {
          // If not scanning initially, still poll for latest match
          matchIntervalId = setInterval(fetchLatestMatch, 3000);
        }
      })
      .catch(error => {
        console.error('Error fetching initial scan status:', error);
        setError('Failed to fetch initial scan status.');
         // Still set up match polling even if status check fails initially
        matchIntervalId = setInterval(fetchLatestMatch, 3000);
      });

    // Clean up intervals on component unmount
    return () => {
      if (scanIntervalId) clearInterval(scanIntervalId);
      if (matchIntervalId) clearInterval(matchIntervalId);
    };
  }, []); // Run only once on mount

  // Calculate progress percentage
  const progressPercentage = scanStatus.totalFiles > 0 
    ? Math.round((scanStatus.processedFiles / scanStatus.totalFiles) * 100) 
    : 0;

  const handleShowSelect = async (show: Show) => {
    setSelectedShow(show);
    setSelectedSeason(null);
    setEpisodes([]);
    
    try {
      const pathWithoutLeadingSlash = show.path.replace(/^\//, '');
      // Get seasons for the selected show
      const seasonsResponse = await fetch(`http://localhost:5000/api/browse/seasons?parent=${encodeURIComponent(pathWithoutLeadingSlash)}`);
      if (!seasonsResponse.ok) {
        throw new Error(`HTTP error! status: ${seasonsResponse.status}`);
      }
      
      const seasonsData = await seasonsResponse.json();
      setSeasons(seasonsData);
      
      // If we have seasons, select the first one by default
      if (seasonsData.length > 0) {
        handleSeasonSelect(seasonsData[0]);
      } else {
        setSeasons([]);
      }
    } catch (error) {
      console.error('Error fetching episodes:', error);
      setError('Failed to fetch episodes. Please check if the show path is correct.');
    }
  };

  const handleSeasonSelect = async (season: Season) => {
    setSelectedSeason(season);
    setEpisodes([]);
    
    try {
      const seasonPath = season.path.replace(/^\//, '');
      
      const episodesResponse = await fetch(`http://localhost:5000/api/browse/episodes?parent=${encodeURIComponent(seasonPath)}`);
      if (!episodesResponse.ok) {
        throw new Error(`HTTP error! status: ${episodesResponse.status}`);
      }
      
      const seasonEpisodes = await episodesResponse.json();
      setEpisodes(seasonEpisodes);
      setError(null);
    } catch (error) {
      console.error('Error fetching episodes:', error);
      setError('Failed to fetch episodes. Please check if the season path is correct.');
    }
  };

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
              disabled={scanStatus.isScanning || isStoppingScan}
              className={`px-4 py-2 rounded font-medium ${
                scanStatus.isScanning || isStoppingScan
                  ? 'bg-gray-600 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {scanStatus.isScanning ? 'Scanning...' : 'Scan All Libraries'}
            </button>
            {scanStatus.isScanning && (
              <button
                onClick={handleStopScan}
                disabled={isStoppingScan || scanStatus.stopRequested}
                className={`px-4 py-2 rounded font-medium ${
                  isStoppingScan || scanStatus.stopRequested
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isStoppingScan || scanStatus.stopRequested ? 'Stopping...' : 'Stop Scan'}
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
                {latestScan.match_score && ` (Score: ${latestScan.match_score.toFixed(2)})`}
              </span>
            </div>
            
            <div className="mb-3 text-sm text-gray-400">
              <div>File: {latestScan.file_path.split('/').pop()}</div>
              {latestScan.episode_info && latestScan.episode_info !== 'Processing Error' && (
                <div>Episode: {latestScan.episode_info}</div>
              )}
              <div>Scanned: {new Date(latestScan.last_scanned_time).toLocaleString()}</div>
            </div>
            
            <div className="bg-black rounded overflow-hidden">
              <Image
                src={`${latestScan.verification_image_path}?t=${latestScan.last_scanned_time}`}
                alt="Verification"
                className="w-full h-auto"
                width={500}
                height={300}
                unoptimized
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
            onShowSelect={handleShowSelect}
          />
          
          {selectedShow && seasons.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-8">
              <h2 className="text-xl font-semibold mb-4">Seasons</h2>
              <div className="space-y-3">
                {seasons.map((season) => (
                  <div
                    key={season.path}
                    onClick={() => handleSeasonSelect(season)}
                    className={`border border-gray-700 rounded p-3 hover:bg-gray-700 cursor-pointer ${
                      selectedSeason?.path === season.path ? 'bg-gray-700 border-blue-500' : ''
                    }`}
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
