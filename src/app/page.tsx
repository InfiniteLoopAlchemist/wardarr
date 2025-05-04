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

interface Season {
  name: string;
  path: string;
}

export default function Home() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
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
          
          {selectedShow && seasons.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow-md mt-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Seasons</h2>
              <div className="space-y-3">
                {seasons.map((season) => (
                  <div
                    key={season.path}
                    onClick={() => handleSeasonSelect(season)}
                    className={`border rounded p-3 hover:bg-gray-50 cursor-pointer ${
                      selectedSeason?.path === season.path ? 'bg-blue-50 border-blue-300' : ''
                    }`}
                  >
                    <div className="font-medium text-blue-600">{season.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="col-span-1">
          {selectedSeason && (
            <EpisodeSelector 
              episodes={episodes}
            />
          )}
        </div>
      </div>
    </main>
  );
}
