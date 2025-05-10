import { useState } from 'react';

interface Library {
  id?: number;
  title: string;
  path: string;
  type: string;
}

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface LibraryManagerProps {
  libraries?: Library[];
  onLibrarySelect?: (library: Library) => void;
  onLibraryAdd: () => void;
}

export default function LibraryManager({ libraries, onLibrarySelect, onLibraryAdd }: LibraryManagerProps) {
  const [newLibraryPath, setNewLibraryPath] = useState('');
  const [newLibraryTitle, setNewLibraryTitle] = useState('');
  const [newLibraryType, setNewLibraryType] = useState<'movie' | 'tv'>('tv');
  const [newSonarrApiKey, setNewSonarrApiKey] = useState('');
  const [newRadarrApiKey, setNewRadarrApiKey] = useState('');
  const [newSonarrPort, setNewSonarrPort] = useState('');
  const [newRadarrPort, setNewRadarrPort] = useState('');
  const [directoryItems, setDirectoryItems] = useState<DirectoryItem[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [isDirectoryBrowserOpen, setIsDirectoryBrowserOpen] = useState(false);
  const [browseFetchError, setBrowseFetchError] = useState<string | null>(null);

  const handleAddLibrary = async () => {
    if (!newLibraryPath) return;
    if (!newLibraryTitle) {
      setBrowseFetchError('Library title is required');
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/libraries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newLibraryTitle,
          path: newLibraryPath,
          type: newLibraryType,
          sonarr_api_key: newSonarrApiKey,
          radarr_api_key: newRadarrApiKey,
          sonarr_port: newSonarrPort ? parseInt(newSonarrPort) : undefined,
          radarr_port: newRadarrPort ? parseInt(newRadarrPort) : undefined
        }),
      });

      if (response.ok) {
        setNewLibraryPath('');
        setNewLibraryTitle('');
        onLibraryAdd();
        setIsDirectoryBrowserOpen(false);
      } else {
        const errorData = await response.json();
        setBrowseFetchError(errorData.error || 'Failed to add library');
      }
    } catch (error) {
      console.error('Error adding library:', error);
      setBrowseFetchError('Failed to connect to server');
    }
  };

  const fetchDirectoryContents = async (path: string) => {
    try {
      setBrowseFetchError(null);
      const response = await fetch(`http://localhost:5000/api/browse?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setDirectoryItems(data);
      setCurrentPath(path);
    } catch (error) {
      console.error('Error fetching directory contents:', error);
      setBrowseFetchError((error as Error).message || 'Failed to fetch directory contents');
    }
  };

  const handleOpenDirectoryBrowser = () => {
    setIsDirectoryBrowserOpen(true);
    fetchDirectoryContents('/');
  };

  const handleNavigateToDirectory = (item: DirectoryItem) => {
    if (item.isDirectory) {
      fetchDirectoryContents(item.path);
    }
  };

  const handleNavigateUp = () => {
    if (currentPath === '/') return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    fetchDirectoryContents(parentPath);
  };

  const handleSelectCurrentPath = () => {
    setNewLibraryPath(currentPath);
    if (!newLibraryTitle) {
      // Set a default title based on the directory name
      setNewLibraryTitle(currentPath.split('/').pop() || currentPath);
    }
    setIsDirectoryBrowserOpen(false);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Libraries</h2>
      
      <div className="mb-4">
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Library Title</label>
          <input
            type="text"
            value={newLibraryTitle}
            onChange={(e) => setNewLibraryTitle(e.target.value)}
            placeholder="Enter library title"
            className="w-full p-2 border rounded text-gray-800"
          />
        </div>
        
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Library Type</label>
          <div className="flex gap-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio"
                name="libraryType"
                checked={newLibraryType === 'movie'}
                onChange={() => setNewLibraryType('movie')}
              />
              <span className="ml-2">Movie</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio"
                name="libraryType"
                checked={newLibraryType === 'tv'}
                onChange={() => setNewLibraryType('tv')}
              />
              <span className="ml-2">TV Show</span>
            </label>
          </div>
        </div>
        
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Library Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLibraryPath}
              onChange={(e) => setNewLibraryPath(e.target.value)}
              placeholder="Enter library path"
              className="flex-grow p-2 border rounded text-gray-800"
            />
            <button
              onClick={handleOpenDirectoryBrowser}
              className="bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300"
            >
              Browse
            </button>
          </div>
        </div>
        
        {newLibraryType === 'tv' && (
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sonarr API Key</label>
            <input
              type="text"
              value={newSonarrApiKey}
              onChange={(e) => setNewSonarrApiKey(e.target.value)}
              placeholder="Enter Sonarr API Key"
              className="w-full p-2 border rounded text-gray-800"
            />
          </div>
        )}
        {newLibraryType === 'tv' && (
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sonarr Port</label>
            <input
              type="number"
              value={newSonarrPort}
              onChange={(e) => setNewSonarrPort(e.target.value)}
              placeholder="8989"
              className="w-full p-2 border rounded text-gray-800"
            />
          </div>
        )}
        {newLibraryType === 'movie' && (
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Radarr API Key</label>
            <input
              type="text"
              value={newRadarrApiKey}
              onChange={(e) => setNewRadarrApiKey(e.target.value)}
              placeholder="Enter Radarr API Key"
              className="w-full p-2 border rounded text-gray-800"
            />
          </div>
        )}
        {newLibraryType === 'movie' && (
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Radarr Port</label>
            <input
              type="number"
              value={newRadarrPort}
              onChange={(e) => setNewRadarrPort(e.target.value)}
              placeholder="7878"
              className="w-full p-2 border rounded text-gray-800"
            />
          </div>
        )}
        
        <button
          onClick={handleAddLibrary}
          className="mt-2 w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
        >
          Add Library
        </button>
      </div>

      {isDirectoryBrowserOpen && (
        <div className="mb-4 border rounded p-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">Directory Browser</h3>
            <button 
              onClick={() => setIsDirectoryBrowserOpen(false)}
              className="text-sm bg-gray-200 px-2 py-1 rounded"
            >
              Close
            </button>
          </div>
          
          {browseFetchError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-2 text-sm">
              {browseFetchError}
            </div>
          )}
          
          <div className="mb-2 flex gap-2 items-center">
            <button 
              onClick={handleNavigateUp}
              className="text-sm bg-gray-200 px-2 py-1 rounded"
              disabled={currentPath === '/'}
            >
              Up
            </button>
            <div className="text-sm bg-gray-100 p-1 rounded flex-grow overflow-x-auto">
              {currentPath}
            </div>
            <button 
              onClick={handleSelectCurrentPath}
              className="text-sm bg-green-500 text-white px-2 py-1 rounded"
            >
              Select
            </button>
          </div>
          
          <div className="max-h-60 overflow-y-auto border rounded">
            {directoryItems.length === 0 ? (
              <div className="p-2 text-gray-500 text-sm">No items found</div>
            ) : (
              directoryItems.map((item) => (
                <div 
                  key={item.path}
                  onClick={() => handleNavigateToDirectory(item)}
                  className={`p-2 hover:bg-gray-100 cursor-pointer flex items-center ${item.isDirectory ? 'font-medium' : 'text-gray-600'}`}
                >
                  {item.isDirectory ? '📁 ' : '📄 '}
                  {item.name}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {libraries && libraries.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">Existing Libraries</h3>
          {libraries.map((library) => (
            <button
              key={library.id || library.path}
              onClick={() => onLibrarySelect && onLibrarySelect(library)}
              className="w-full text-left p-2 hover:bg-gray-100 rounded text-gray-800 flex items-center"
              disabled={!onLibrarySelect}
            >
              <span className="flex-grow">{library.title}</span>
              <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
                {library.type === 'movie' ? 'Movie' : 'TV'}
              </span>
            </button>
          ))}
        </div>
      )}
      
      {libraries && libraries.length === 0 && (
        <div className="mt-6 text-gray-500 text-center p-2">No libraries added yet</div>
      )}

    </div>
  );
}
