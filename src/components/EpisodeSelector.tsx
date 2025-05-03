import { useState } from 'react';

interface Episode {
  file: string;
  path: string;
  season: string;
}

interface MatchImage {
  index: number;
  url: string;
  name: string;
}

interface MatchResult {
  status: string;
  images?: MatchImage[];
  message?: string;
  directory?: string;
  log?: string;
}

interface EpisodeSelectorProps {
  episodes: Episode[];
}

export default function EpisodeSelector({ episodes }: EpisodeSelectorProps) {
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [isRunningMatcher, setIsRunningMatcher] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  
  // Group episodes by season
  const episodesBySeason = episodes.reduce((acc, episode) => {
    const season = episode.season;
    if (!acc[season]) {
      acc[season] = [];
    }
    acc[season].push(episode);
    return acc;
  }, {} as Record<string, Episode[]>);
  
  // Sort seasons numerically
  const sortedSeasons = Object.keys(episodesBySeason).sort((a, b) => {
    return parseInt(a) - parseInt(b);
  });
  
  const handlePlayEpisode = (episode: Episode) => {
    setSelectedEpisode(episode);
    setMatchResult(null);
  };
  
  // Parse episode information from filename
  const parseEpisodeInfo = (filename: string) => {
    // Try to extract season and episode numbers (S01E01 format)
    const match = filename.match(/S(\d+)E(\d+)/i);
    if (match) {
      return `E${match[2]}`;
    }
    return filename;
  };

  // Open in a new tab for direct playback
  const openInNewTab = (episode: Episode) => {
    const videoUrl = `http://localhost:5000/api/stream?path=${encodeURIComponent(episode.path)}`;
    window.open(videoUrl, '_blank');
  };
  
  // Run the clip matcher script
  const runClipMatcher = async () => {
    if (!selectedEpisode) return;
    
    setIsRunningMatcher(true);
    setMatchResult(null);
    
    try {
      const response = await fetch(`http://localhost:5000/api/match-clip?path=${encodeURIComponent(selectedEpisode.path)}`);
      const data = await response.json();
      
      if (response.ok) {
        setMatchResult(data);
      } else {
        console.error('Error running clip matcher:', data.error);
        setMatchResult({ status: 'error', message: data.error });
      }
    } catch (error) {
      console.error('Error running clip matcher:', error);
      setMatchResult({ status: 'error', message: 'Failed to run clip matcher' });
    } finally {
      setIsRunningMatcher(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Episodes</h2>
      
      {selectedEpisode && (
        <div className="mb-6">
          <h3 className="font-medium mb-2">{selectedEpisode.file}</h3>
          
          <div className="flex mt-2 gap-2">
            <button 
              onClick={() => setSelectedEpisode(null)}
              className="flex-grow py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Close Player
            </button>
            <button 
              onClick={() => openInNewTab(selectedEpisode)}
              className="flex-grow py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Open in New Tab
            </button>
            <button
              onClick={runClipMatcher}
              disabled={isRunningMatcher}
              className={`flex-grow py-2 ${isRunningMatcher ? 'bg-yellow-500' : 'bg-green-500'} text-white rounded hover:bg-green-600`}
            >
              {isRunningMatcher ? 'Running Matcher...' : 'Run Clip Matcher'}
            </button>
          </div>
          
          {matchResult && (
            <div className="mt-4 p-4 border rounded">
              <h4 className="font-medium">{matchResult.status === 'success' ? 'Matching Results' : 'Error'}</h4>
              
              {matchResult.status === 'success' && matchResult.images && (
                <div className="mt-2">
                  <p className="mb-2">Found {matchResult.images.length} matches</p>
                  <div className="grid grid-cols-1 gap-4">
                    {matchResult.images.map((image, i) => (
                      <div key={i} className="border p-2 rounded">
                        <p className="text-sm mb-1">{image.name}</p>
                        <img 
                          src={`http://localhost:5000${image.url}`}
                          alt={`Match ${i+1}`} 
                          className="w-full h-auto rounded" 
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {matchResult.status !== 'success' && (
                <p className="text-red-500">{matchResult.message || 'Unknown error'}</p>
              )}
            </div>
          )}
        </div>
      )}
      
      <div className="space-y-4">
        {episodes.length === 0 ? (
          <div className="text-gray-500 text-center p-2">No episodes found</div>
        ) : (
          sortedSeasons.map(season => (
            <div key={season} className="border rounded overflow-hidden">
              <div className="bg-gray-100 p-2 font-medium border-b">
                Season {season}
              </div>
              <div className="divide-y">
                {episodesBySeason[season].map((episode) => (
                  <div
                    key={episode.path}
                    className="p-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handlePlayEpisode(episode)}
                  >
                    <div className="flex items-center">
                      <div className="text-blue-500 mr-2">▶</div>
                      <div>
                        <div className="font-medium">{parseEpisodeInfo(episode.file)}</div>
                        <div className="text-sm text-gray-600 truncate">{episode.file}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} 