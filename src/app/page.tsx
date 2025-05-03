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
  filename: string;
  path: string;
  season: number;
  episode: number;
  name: string;
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
      const response = await fetch('http://localhost:5000/api/browse/libraries');
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
      const response = await fetch(`http://localhost:5000/api/browse/shows?parent=${encodeURIComponent(pathWithoutLeadingSlash)}`);
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
      // First get seasons
      const seasonsResponse = await fetch(`http://localhost:5000/api/browse/seasons?parent=${encodeURIComponent(pathWithoutLeadingSlash)}`);
      if (!seasonsResponse.ok) {
        throw new Error(`HTTP error! status: ${seasonsResponse.status}`);
      }
      
      const seasons = await seasonsResponse.json();
      
      // If we have seasons, get episodes from each season
      if (seasons.length > 0) {
        let allEpisodes: Episode[] = [];
        
        // For simplicity, just get episodes from the first season
        // In a more advanced implementation, you might want to get episodes from all seasons
        const firstSeason = seasons[0];
        const seasonPath = firstSeason.path.replace(/^\//, '');
        
        const episodesResponse = await fetch(`http://localhost:5000/api/browse/episodes?parent=${encodeURIComponent(seasonPath)}`);
        if (!episodesResponse.ok) {
          throw new Error(`HTTP error! status: ${episodesResponse.status}`);
        }
        
        const seasonEpisodes = await episodesResponse.json();
        allEpisodes = [...allEpisodes, ...seasonEpisodes];
        
        setEpisodes(allEpisodes);
        setError(null);
      } else {
        setEpisodes([]);
      }
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
