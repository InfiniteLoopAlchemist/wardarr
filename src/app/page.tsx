'use client';

import { useState, useEffect } from 'react';
import LibraryManager from '@/components/LibraryManager';
import ShowSelector from '@/components/ShowSelector';
import EpisodeSelector from '@/components/EpisodeSelector';

interface Library {
  name: string;
  path: string;
}

interface Show {
  name: string;
  path: string;
}

interface Episode {
  file: string;
  path: string;
  season: string;
}

export default function Home() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchLibraries = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/libraries');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setLibraries(data);
      setError(null);
    } catch (error) {
      console.error('Error fetching libraries:', error);
      setError('Failed to fetch libraries. Please check if the backend server is running.');
    }
  };

  useEffect(() => {
    fetchLibraries();
  }, []);

  const handleLibrarySelect = async (library: Library) => {
    setSelectedLibrary(library);
    try {
      const pathWithoutLeadingSlash = library.path.replace(/^\//, '');
      const response = await fetch(`http://localhost:5000/api/shows?path=${encodeURIComponent(pathWithoutLeadingSlash)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setShows(data);
      setError(null);
    } catch (error) {
      console.error('Error fetching shows:', error);
      setError('Failed to fetch shows. Please check if the library path is correct.');
    }
  };

  const handleShowSelect = async (show: Show) => {
    setSelectedShow(show);
    try {
      const pathWithoutLeadingSlash = show.path.replace(/^\//, '');
      const response = await fetch(`http://localhost:5000/api/episodes?path=${encodeURIComponent(pathWithoutLeadingSlash)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setEpisodes(data);
      setError(null);
    } catch (error) {
      console.error('Error fetching episodes:', error);
      setError('Failed to fetch episodes. Please check if the show path is correct.');
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">TV Show Library Manager</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="col-span-1">
          <LibraryManager 
            libraries={libraries} 
            onLibrarySelect={handleLibrarySelect}
            onLibraryAdd={fetchLibraries}
          />
        </div>
        
        <div className="col-span-1">
          {selectedLibrary && (
            <ShowSelector 
              shows={shows} 
              onShowSelect={handleShowSelect}
            />
          )}
        </div>
        
        <div className="col-span-1">
          {selectedShow && (
            <EpisodeSelector 
              episodes={episodes}
            />
          )}
        </div>
      </div>
    </main>
  );
}
