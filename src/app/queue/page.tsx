'use client';

import { useState, useEffect } from 'react';

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

export default function QueuePage() {
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  const fetchHistory = async () => {
    try {
      // Don't set loading to true on interval fetches, only initial
      // setLoading(true); 
      const response = await fetch('http://localhost:5000/api/queue');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Sort by scan time (oldest first so first done stays on top)
      const sortedData = [...data].sort((a, b) => a.last_scanned_time - b.last_scanned_time);
      setScannedFiles(sortedData);
      setError(null);
    } catch (error) {
      console.error('Error fetching scan queue:', error);
      setError('Failed to fetch scan queue. Please check if the backend server is running.');
    } finally {
      // Ensure loading is set to false after the first fetch
      setLoading(false); 
    }
  };

  useEffect(() => {
    // Initial fetch
    setLoading(true); // Set loading true only for the initial fetch
    fetchHistory();

    // Set up polling interval
    const intervalId = setInterval(fetchHistory, 5000); // Fetch every 5 seconds

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []); // Run only once on mount to set up polling

  // Filter scanned files based on selected filter
  const filteredFiles = scannedFiles.filter(file => {
    if (filter === 'all') return true;
    if (filter === 'verified') return file.is_verified;
    if (filter === 'unverified') return !file.is_verified;
    return true;
  });

  return (
    <div className="min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Scan Queue</h1>
        
        <div className="flex space-x-2">
          <button 
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('verified')}
            className={`px-3 py-1 rounded ${filter === 'verified' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            Verified
          </button>
          <button 
            onClick={() => setFilter('unverified')}
            className={`px-3 py-1 rounded ${filter === 'unverified' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            Unverified
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-900 border border-red-700 text-white px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="bg-gray-800 p-8 rounded-lg text-center">
          <p className="text-gray-400">
            {filter === 'all' 
              ? 'No scan queue found. Run a scan to generate verification images.' 
              : `No ${filter} files found in scan queue.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 [@media(min-width:2160px)]:grid-cols-2 gap-6">
          {filteredFiles.map(file => (
            <div key={file.id} className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
              {file.verification_image_path ? (
                <img 
                  src={`${(process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000')}${file.verification_image_path}?t=${file.last_scanned_time}`} 
                  alt="Verification" 
                  className="w-full h-auto"
                />
              ) : (
                <div className="h-48 bg-gray-900 flex items-center justify-center">
                  <p className="text-gray-500">No image available</p>
                </div>
              )}
              
              <div className="p-4">
                <div className="text-sm text-gray-400 truncate mb-1" title={file.file_path}>
                  {file.file_path.split('/').pop()}
                </div>
                
                <div className="text-xs text-gray-500">
                  {new Date(file.last_scanned_time).toLocaleString()}
                </div>
                <div className="flex justify-between space-x-2 mt-2">
                  <button type="button" className="flex items-center space-x-1 text-red-500 hover:text-red-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      <line x1="4.22" y1="4.22" x2="19.78" y2="19.78" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                    <span className="text-base uppercase">Blocklist</span>
                  </button>
                  <button type="button" className="flex items-center space-x-1 text-green-500 hover:text-green-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-base uppercase">Verify</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
