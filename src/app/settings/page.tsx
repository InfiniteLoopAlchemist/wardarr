'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);

  const handleResetHistory = async () => {
    // Confirmation dialog
    if (!window.confirm('Are you sure you want to reset all scan history? This will require a full rescan of all media.')) {
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setMessageType(null);

    try {
      const response = await fetch('http://localhost:5000/api/queue', {
        method: 'DELETE',
      });

      const responseData = await response.json(); // Attempt to parse JSON regardless of status

      if (!response.ok) {
        throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
      }

      setMessage(responseData.message || 'Scan queue cleared successfully!');
      setMessageType('success');

    } catch (error) {
      console.error('Error resetting scan history:', error);
      setMessage(`Failed to reset scan history: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-xl font-semibold mb-4">Scan Queue Management</h2>
        <p className="text-gray-400 mb-4">
          Resetting the scan queue will remove all records of previously scanned files. 
          The system will then treat all media files as new during the next scan, processing each one.
        </p>
        <button
          onClick={handleResetHistory}
          disabled={isLoading}
          className={`px-4 py-2 rounded font-medium ${
            isLoading
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {isLoading ? 'Resetting...' : 'Reset Scan Queue'}
        </button>

        {message && (
          <div 
            className={`mt-4 p-3 rounded text-sm ${
              messageType === 'success' ? 'bg-green-900 border border-green-700 text-green-200' : 
              messageType === 'error' ? 'bg-red-900 border border-red-700 text-red-200' : ''
            }`}
          >
            {message}
          </div>
        )}
      </div>

      {/* Add more settings sections here in the future if needed */}
      
    </div>
  );
} 