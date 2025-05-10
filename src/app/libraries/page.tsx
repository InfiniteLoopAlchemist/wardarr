'use client';

import { useState, useEffect } from 'react';
import LibraryManager from '@/components/LibraryManager';

interface Library {
  id: number;
  title: string;
  path: string;
  type: 'movie' | 'tv';
  is_enabled: number; // Changed to number (0 or 1)
  sonarr_api_key?: string | null;
  radarr_api_key?: string | null;
  sonarr_port?: number | null;
  radarr_port?: number | null;
}

export default function LibrariesPage() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingLibrary, setEditingLibrary] = useState<Library | null>(null);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);

  const fetchLibraries = async () => {
    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibraries();
  }, []);

  const handleLibraryAdded = () => {
    // Optimistically add or just refetch
    fetchLibraries(); 
  };

  const handleEdit = (library: Library) => {
    setEditingLibrary(library);
    setShowEditModal(true);
  };

  const handleDelete = async (libraryId: number) => {
    if (!window.confirm('Are you sure you want to delete this library and all its scanned history? This action cannot be undone.')) {
      return;
    }
    try {
      const response = await fetch(`http://localhost:5000/api/libraries/${libraryId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      // Refresh list after delete
      fetchLibraries(); 
      alert('Library deleted successfully.');
    } catch (err) {
      console.error('Error deleting library:', err);
      setError(`Failed to delete library: ${err instanceof Error ? err.message : 'Unknown error'}`);
      alert(`Error: ${error}`);
    }
  };

  const handleToggleEnable = async (library: Library) => {
    const newStatus = library.is_enabled === 1 ? 0 : 1;
    const action = newStatus === 1 ? 'enable' : 'disable';
    if (!window.confirm(`Are you sure you want to ${action} the library "${library.title}"? ${newStatus === 0 ? 'It will be excluded from future scans.' : 'It will be included in future scans.'}`)) {
        return;
    }

    try {
        const response = await fetch(`http://localhost:5000/api/libraries/${library.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_enabled: newStatus }),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        // Refresh list after toggle
        fetchLibraries();
         alert(`Library ${action}d successfully.`);
    } catch (err) {
        console.error(`Error ${action}ing library:`, err);
        setError(`Failed to ${action} library: ${err instanceof Error ? err.message : 'Unknown error'}`);
        alert(`Error: ${error}`);
    }
  };

  const handleCloseEditModal = (refresh: boolean = false) => {
    setShowEditModal(false);
    setEditingLibrary(null);
    if (refresh) {
        fetchLibraries();
    }
  };

  // Edit Modal Component (Inline for simplicity, could be extracted)
  const EditLibraryModal = () => {
    if (!showEditModal || !editingLibrary) return null;

    const [currentTitle, setCurrentTitle] = useState(editingLibrary.title);
    const [currentPath, setCurrentPath] = useState(editingLibrary.path);
    const [currentType, setCurrentType] = useState(editingLibrary.type);
    const [currentSonarrApiKey, setCurrentSonarrApiKey] = useState(editingLibrary.sonarr_api_key || '');
    const [currentRadarrApiKey, setCurrentRadarrApiKey] = useState(editingLibrary.radarr_api_key || '');
    const [currentSonarrPort, setCurrentSonarrPort] = useState<string>(editingLibrary.sonarr_port?.toString() || '');
    const [currentRadarrPort, setCurrentRadarrPort] = useState<string>(editingLibrary.radarr_port?.toString() || '');
    const [isSaving, setIsSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setModalError(null);

        try {
            const updates: Partial<Library> = {};
            if (currentTitle !== editingLibrary.title) updates.title = currentTitle;
            if (currentPath !== editingLibrary.path) updates.path = currentPath;
            if (currentType !== editingLibrary.type) updates.type = currentType;
            if (currentType === 'tv' && currentSonarrApiKey !== editingLibrary.sonarr_api_key) updates.sonarr_api_key = currentSonarrApiKey;
            if (currentType === 'movie' && currentRadarrApiKey !== editingLibrary.radarr_api_key) updates.radarr_api_key = currentRadarrApiKey;
            if (currentType === 'tv' && currentSonarrPort !== (editingLibrary.sonarr_port?.toString() || '')) updates.sonarr_port = parseInt(currentSonarrPort);
            if (currentType === 'movie' && currentRadarrPort !== (editingLibrary.radarr_port?.toString() || '')) updates.radarr_port = parseInt(currentRadarrPort);

            if (Object.keys(updates).length === 0) {
                handleCloseEditModal(); // No changes
                return;
            }

            const response = await fetch(`http://localhost:5000/api/libraries/${editingLibrary.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            
            handleCloseEditModal(true); // Close and refresh

        } catch (err) {
            console.error('Error updating library:', err);
            setModalError(`Failed to update library: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 className="text-xl font-semibold mb-4">Edit Library</h3>
                <form onSubmit={handleSave}>
                    <div className="mb-4">
                        <label htmlFor="edit-title" className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                        <input 
                            type="text"
                            id="edit-title"
                            value={currentTitle}
                            onChange={(e) => setCurrentTitle(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label htmlFor="edit-path" className="block text-sm font-medium text-gray-300 mb-1">Path</label>
                        <input 
                            type="text"
                            id="edit-path"
                            value={currentPath}
                            onChange={(e) => setCurrentPath(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label htmlFor="edit-type" className="block text-sm font-medium text-gray-300 mb-1">Type</label>
                        <select 
                            id="edit-type"
                            value={currentType}
                            onChange={(e) => setCurrentType(e.target.value as 'movie' | 'tv')}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="tv">TV Show</option>
                            <option value="movie">Movie</option>
                        </select>
                    </div>
                    {currentType === 'tv' && (
                      <>
                        <div className="mb-4">
                          <label htmlFor="edit-sonarr-key" className="block text-sm font-medium text-gray-300 mb-1">Sonarr API Key</label>
                          <input 
                            type="text"
                            id="edit-sonarr-key"
                            value={currentSonarrApiKey}
                            onChange={(e) => setCurrentSonarrApiKey(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="mb-4">
                          <label htmlFor="edit-sonarr-port" className="block text-sm font-medium text-gray-300 mb-1">Sonarr Port</label>
                          <input
                            type="number"
                            id="edit-sonarr-port"
                            value={currentSonarrPort}
                            onChange={(e) => setCurrentSonarrPort(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-100"
                          />
                        </div>
                      </>
                    )}
                    {currentType === 'movie' && (
                      <>
                        <div className="mb-4">
                          <label htmlFor="edit-radarr-key" className="block text-sm font-medium text-gray-300 mb-1">Radarr API Key</label>
                          <input 
                            type="text"
                            id="edit-radarr-key"
                            value={currentRadarrApiKey}
                            onChange={(e) => setCurrentRadarrApiKey(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="mb-4">
                          <label htmlFor="edit-radarr-port" className="block text-sm font-medium text-gray-300 mb-1">Radarr Port</label>
                          <input
                            type="number"
                            id="edit-radarr-port"
                            value={currentRadarrPort}
                            onChange={(e) => setCurrentRadarrPort(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-100"
                          />
                        </div>
                      </>
                    )}
                    {modalError && <p className="text-red-500 text-sm mb-3">{modalError}</p>}
                    <div className="flex justify-end space-x-3">
                        <button 
                            type="button"
                            onClick={() => handleCloseEditModal()}
                            className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500"
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
  };

  return (
    <div className="min-h-screen">
      <h1 className="text-3xl font-bold mb-8">Manage Libraries</h1>

      <LibraryManager onLibraryAdd={handleLibraryAdded} />

      <h2 className="text-2xl font-semibold mt-10 mb-6">Existing Libraries</h2>

      {error && (
        <div className="bg-red-900 border border-red-700 text-white px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading libraries...</p>
      ) : libraries.length === 0 ? (
        <p className="text-gray-400">No libraries added yet.</p>
      ) : (
        <div className="space-y-4">
          {libraries.map((lib) => (
            <div key={lib.id} className="bg-gray-800 p-4 rounded-lg shadow flex flex-col md:flex-row justify-between items-start md:items-center">
              <div className="flex-grow mb-3 md:mb-0">
                <h3 className="text-lg font-semibold flex items-center">
                  {lib.title}
                  <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${lib.type === 'tv' ? 'bg-blue-900 text-blue-200' : 'bg-purple-900 text-purple-200'}`}>
                    {lib.type.toUpperCase()}
                  </span>
                  <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${lib.is_enabled ? 'bg-green-900 text-green-200' : 'bg-gray-700 text-gray-300'}`}>
                    {lib.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </h3>
                <p className="text-sm text-gray-400 break-all">{lib.path}</p>
              </div>
              <div className="flex space-x-2 flex-shrink-0">
                 {/* Toggle Button */}
                 <button 
                  onClick={() => handleToggleEnable(lib)}
                  className={`p-2 rounded ${lib.is_enabled ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} text-white text-xs`} 
                  title={lib.is_enabled ? 'Disable Library' : 'Enable Library'}
                 >
                  {lib.is_enabled ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  ) : (
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                 </button>
                {/* Edit Button */}
                 <button 
                  onClick={() => handleEdit(lib)}
                  className="p-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  title="Edit Library"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                   </svg>
                 </button>
                {/* Delete Button */}
                 <button 
                  onClick={() => handleDelete(lib.id)}
                  className="p-2 rounded bg-red-600 hover:bg-red-700 text-white text-xs"
                  title="Delete Library"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                       <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                 </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal Portal */}
      {showEditModal && <EditLibraryModal />}

    </div>
  );
}
