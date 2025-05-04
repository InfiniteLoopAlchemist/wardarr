'use client';

import { useState, useEffect } from 'react';

interface Library {
  id: number;
  title: string;
  path: string;
  type: string;
}

export default function LibrariesPage() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  
  // Form state
  const [newLibrary, setNewLibrary] = useState({
    title: '',
    path: '',
    type: 'tv' // Default to TV
  });
  
  // Form validation
  const [formErrors, setFormErrors] = useState({
    title: '',
    path: ''
  });

  // Fetch libraries
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

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewLibrary(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error when user types
    if (formErrors[name as keyof typeof formErrors]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Validate form
  const validateForm = () => {
    let valid = true;
    const errors = {
      title: '',
      path: ''
    };
    
    if (!newLibrary.title.trim()) {
      errors.title = 'Library title is required';
      valid = false;
    }
    
    if (!newLibrary.path.trim()) {
      errors.path = 'Library path is required';
      valid = false;
    }
    
    setFormErrors(errors);
    return valid;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      const response = await fetch('http://localhost:5000/api/libraries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newLibrary),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      // Reset form and hide it
      setNewLibrary({
        title: '',
        path: '',
        type: 'tv'
      });
      setShowAddForm(false);
      
      // Refresh libraries list
      fetchLibraries();
      
    } catch (error) {
      console.error('Error adding library:', error);
      setError(`Failed to add library: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Browse for directory
  const handleBrowse = async () => {
    try {
      const startPath = newLibrary.path || '/';
      const response = await fetch(`http://localhost:5000/api/browse?path=${encodeURIComponent(startPath)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filter for directories only
      interface DirectoryItem {
        name: string;
        path: string;
        isDirectory: boolean;
      }
      
      const directories = data.filter((item: DirectoryItem) => item.isDirectory);
      
      // TODO: Show a directory browser modal
      console.log('Available directories:', directories);
      
      // For now, just use the first directory as an example
      if (directories.length > 0) {
        setNewLibrary(prev => ({
          ...prev,
          path: directories[0].path
        }));
      }
      
    } catch (error) {
      console.error('Error browsing directories:', error);
      setError(`Failed to browse directories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Media Libraries</h1>
        
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          Add Library
        </button>
      </div>
      
      {error && (
        <div className="bg-red-900 border border-red-700 text-white px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}
      
      {/* Add Library Form */}
      {showAddForm && (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
          <h2 className="text-xl font-semibold mb-4">Add New Library</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Library Title</label>
                <input
                  type="text"
                  name="title"
                  value={newLibrary.title}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My TV Shows"
                />
                {formErrors.title && (
                  <p className="mt-1 text-sm text-red-500">{formErrors.title}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Library Type</label>
                <select
                  name="type"
                  value={newLibrary.type}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="tv">TV Shows</option>
                  <option value="movie">Movies</option>
                </select>
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Library Path</label>
                <div className="flex">
                  <input
                    type="text"
                    name="path"
                    value={newLibrary.path}
                    onChange={handleInputChange}
                    className="flex-grow bg-gray-700 border border-gray-600 rounded-l px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="/path/to/media"
                  />
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-r"
                  >
                    Browse
                  </button>
                </div>
                {formErrors.path && (
                  <p className="mt-1 text-sm text-red-500">{formErrors.path}</p>
                )}
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
              >
                Add Library
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Libraries List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : libraries.length === 0 ? (
        <div className="bg-gray-800 p-8 rounded-lg text-center">
          <p className="text-gray-400 mb-4">No libraries found. Add your first media library to get started.</p>
          {!showAddForm && (
            <button 
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
            >
              Add Library
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {libraries.map(library => (
            <div key={library.id} className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="bg-blue-600 p-3 rounded-lg mr-4">
                    {library.type === 'tv' ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path>
                      </svg>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{library.title}</h3>
                    <p className="text-sm text-gray-400">{library.type === 'tv' ? 'TV Shows' : 'Movies'}</p>
                  </div>
                </div>
                
                <div className="text-sm text-gray-400 mb-4 break-all">
                  <div className="font-medium text-gray-300 mb-1">Path:</div>
                  {library.path}
                </div>
                
                <div className="flex justify-end">
                  <button className="text-blue-400 hover:text-blue-300 text-sm">
                    Scan Library
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
