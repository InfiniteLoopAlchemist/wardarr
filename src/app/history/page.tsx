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

export default function HistoryPage() {
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5000/api/history');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Sort by scan time (newest first)
        const sortedData = [...data].sort((a, b) => b.last_scanned_time - a.last_scanned_time);
        setScannedFiles(sortedData);
        setError(null);
      } catch (error) {
        console.error('Error fetching scan history:', error);
        setError('Failed to fetch scan history. Please check if the backend server is running.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

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
        <h1 className="text-3xl font-bold">Scan History</h1>
        
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
              ? 'No scan history found. Run a scan to generate verification images.' 
              : `No ${filter} files found in scan history.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFiles.map(file => (
            <div key={file.id} className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
              {file.verification_image_path ? (
                <div className="relative">
                  <img 
                    src={file.verification_image_path} 
                    alt="Verification" 
                    className="w-full h-auto"
                  />
                  <div 
                    className={`absolute top-2 right-2 w-4 h-4 rounded-full ${
                      file.is_verified ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  ></div>
                </div>
              ) : (
                <div className="h-48 bg-gray-900 flex items-center justify-center">
                  <p className="text-gray-500">No image available</p>
                </div>
              )}
              
              <div className="p-4">
                <div className="flex items-center mb-2">
                  <div className={`w-3 h-3 rounded-full mr-2 ${file.is_verified ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="font-medium">
                    {file.is_verified ? 'Verified' : 'Not Verified'} 
                    {file.match_score && ` (${file.match_score.toFixed(2)})`}
                  </span>
                </div>
                
                <div className="text-sm text-gray-400 truncate mb-1" title={file.file_path}>
                  {file.file_path.split('/').pop()}
                </div>
                
                {file.episode_info && (
                  <div className="text-sm text-gray-400 mb-1">
                    {file.episode_info}
                  </div>
                )}
                
                <div className="text-xs text-gray-500">
                  {new Date(file.last_scanned_time).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
