import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
// import { glob } from 'glob'; // Commented out
import Database from 'better-sqlite3';
import { createServer } from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Get current directory name (equivalent to __dirname in CommonJS)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database
const db = new Database('libraries.db');

// Define constants for CLIP matching (or read from config/env later)
const clipMatcherThreshold = 0.90; // Threshold used when calling the script
const clipMatcherEarlyStop = 0.96;

// Create libraries table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('movie', 'tv')),
    is_enabled INTEGER DEFAULT 1 NOT NULL CHECK(is_enabled IN (0, 1))
  )
`);

// Create scanned_files table to track processed media files
db.exec(`
  CREATE TABLE IF NOT EXISTS scanned_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    library_id INTEGER NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_modified_time INTEGER NOT NULL,
    last_scanned_time INTEGER,
    verification_image_path TEXT,
    match_score REAL,
    is_verified BOOLEAN,
    episode_info TEXT,
    FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
  )
`);

// Create index for faster lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_scanned_files_path ON scanned_files(file_path);
  CREATE INDEX IF NOT EXISTS idx_scanned_files_library ON scanned_files(library_id);
`);

const app = express();
const PORT = process.env.PORT || 5000; // Used in server.listen at the bottom of the file

// Enhanced logging middleware
const logRequest = (req, res, next) => {
  const start = Date.now();
  console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log(`[HEADERS] ${JSON.stringify(req.headers)}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[BODY] ${JSON.stringify(req.body)}`);
  }
  
  // Log query parameters if any
  if (req.query && Object.keys(req.query).length > 0) {
    console.log(`[QUERY] ${JSON.stringify(req.query)}`);
  }
  
  // Track response
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - start;
    console.log(`[RESPONSE] ${res.statusCode} - ${duration}ms`);
    if (typeof body === 'string' && body.length < 1000) {
      console.log(`[RESPONSE BODY] ${body}`);
    } else {
      console.log('[RESPONSE BODY] Response too large to log or not a string');
    }
    return originalSend.call(this, body);
  };
  
  // Also capture JSON responses
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    console.log(`[RESPONSE JSON] ${res.statusCode} - ${duration}ms`);
    console.log(`[RESPONSE BODY] ${JSON.stringify(body)}`);
    return originalJson.call(this, body);
  };
  
  next();
};

// Log all server events
console.log(`[SERVER] Starting server setup at ${new Date().toISOString()}`);

// app.use(logRequest); // Commented out to reduce verbosity

// Configure CORS with detailed logging
app.use(cors({
  origin: true, // Allow all origins but log them
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

console.log('[SERVER] CORS middleware configured');

// Track connections
const server = createServer(app);

server.on('connection', (socket) => {
  console.log(`[CONNECTION] New connection from ${socket.remoteAddress}:${socket.remotePort}`);
  
  socket.on('close', (hadError) => {
    console.log(`[CONNECTION] Closed connection from ${socket.remoteAddress}:${socket.remotePort} ${hadError ? 'with error' : 'cleanly'}`);
  });
  
  socket.on('error', (err) => {
    console.error(`[CONNECTION ERROR] ${socket.remoteAddress}:${socket.remotePort} - ${err.message}`);
  });
});

// Add middleware to parse JSON and handle errors
app.use(express.json({
  verify: (req, res, buf) => {
    // Skip verification for empty bodies
    if (buf.length === 0) return;
    
    try {
      JSON.parse(buf);
    } catch (e) {
      console.error(`[JSON PARSE ERROR] Invalid JSON: ${e.message}`);
      res.status(400).send(`Invalid JSON: ${e.message}`);
      throw new Error('Invalid JSON');
    }
  }
}));

// Create public directory for static files
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
  console.log(`[SERVER] Created public directory: ${publicDir}`);
}

// Ensure matches directory exists
const matchesDir = path.join(publicDir, 'matches');
if (!fs.existsSync(matchesDir)) {
  fs.mkdirSync(matchesDir, { recursive: true });
  console.log(`[SERVER] Created matches directory: ${matchesDir}`);
}

// Write the viewer HTML file
const viewerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Image Viewer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background-color: #1a1a1a;
            color: #f0f0f0;
            padding: 20px;
            margin: 0;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            background-color: #333;
            padding: 15px;
            border-radius: 8px;
        }
        h1 {
            margin: 0;
            font-size: 24px;
        }
        .verification-image {
            background-color: #333;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .image-container {
            display: flex;
            justify-content: center;
            margin: 20px 0;
        }
        .image-container img {
            max-width: 100%;
            max-height: 500px;
            border-radius: 4px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
        }
        .metadata {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 10px;
            margin-top: 15px;
        }
        .label {
            font-weight: bold;
            color: #aaa;
        }
        .value {
            color: #fff;
            word-break: break-all;
        }
        .refresh-btn {
            background-color: #4a89dc;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover {
            background-color: #5a99ec;
        }
        .status {
            font-size: 14px;
            color: #aaa;
            margin-top: 5px;
        }
        .verified {
            color: #4caf50;
            font-weight: bold;
        }
        .unverified {
            color: #f44336;
            font-weight: bold;
        }
        .refresh-time {
            font-size: 12px;
            color: #777;
            text-align: right;
            margin-top: 10px;
        }
        .no-image {
            text-align: center;
            padding: 40px;
            background-color: #2a2a2a;
            border-radius: 4px;
            color: #aaa;
        }
        .auto-refresh {
            display: flex;
            align-items: center;
            margin-left: 15px;
        }
        .auto-refresh input {
            margin-right: 5px;
        }
        .auto-refresh label {
            font-size: 14px;
            color: #ddd;
        }
        .refresh-controls {
            display: flex;
            align-items: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Verification Image Viewer</h1>
            <div class="refresh-controls">
                <div class="auto-refresh">
                    <input type="checkbox" id="autoRefresh" checked>
                    <label for="autoRefresh">Auto refresh</label>
                </div>
                <button id="refreshBtn" class="refresh-btn">Refresh Now</button>
            </div>
        </div>
        
        <div class="verification-image" id="latestVerification">
            <div class="no-image">Loading verification image...</div>
        </div>

        <div class="scan-status" id="scanStatus">
            <div class="status">Checking scan status...</div>
        </div>
        
        <div class="refresh-time" id="refreshTime"></div>
    </div>

    <script>
        let lastImageTimestamp = 0;
        let currentImagePath = '';
        let autoRefreshInterval;
        let isAutoRefreshEnabled = true;
        
        function updateRefreshTime() {
            const now = new Date();
            document.getElementById('refreshTime').textContent = 
                'Last updated: ' + now.toLocaleTimeString();
        }
        
        function displayVerificationImage(data) {
            const container = document.getElementById('latestVerification');
            
            if (!data || !data.found || !data.verification_image_path) {
                container.innerHTML = '<div class="no-image">No verification image available</div>';
                return;
            }
            
            // Force update with every call now, don't try to be clever with caching
            const uniqueImagePath = data.verification_image_path + '?nocache=' + Date.now(); 
            
            let html = '<div class="image-container">';
            html += '<img src="' + uniqueImagePath + '" alt="Verification image" onload="this.style.opacity=1" onerror="this.src=\'' + uniqueImagePath + '\'" style="opacity:0.95">';
            html += '</div>';
            html += '<div class="metadata">';
            html += '<div class="label">Status:</div>';
            html += '<div class="value ' + (data.is_verified ? 'verified' : 'unverified') + '">';
            html += data.is_verified ? '✓ VERIFIED' : '✗ NOT VERIFIED';
            html += '</div>';
            html += '<div class="label">Match Score:</div>';
            html += '<div class="value">' + (data.match_score * 100).toFixed(1) + '%</div>';
            html += '<div class="label">Episode:</div>';
            html += '<div class="value">' + (data.episode_info || 'Unknown') + '</div>';
            html += '<div class="label">File:</div>';
            html += '<div class="value">' + (data.file_path || 'Unknown') + '</div>';
            html += '<div class="label">Updated:</div>';
            html += '<div class="value">' + new Date().toLocaleTimeString() + '</div>';
            html += '</div>';
            
            container.innerHTML = html;
            updateRefreshTime();
        }
        
        function updateScanStatus(data) {
            const container = document.getElementById('scanStatus');
            
            if (!data) {
                container.innerHTML = '<div class="status">Unable to fetch scan status</div>';
                return;
            }
            
            if (data.isScanning) {
                const progress = data.totalFiles > 0 
                    ? (data.processedFiles / data.totalFiles * 100).toFixed(1) 
                    : 0;
                    
                const currentFile = data.currentFile 
                    ? data.currentFile.split('/').pop() 
                    : 'Unknown';
                
                container.innerHTML = 
                    '<div class="status">Scanning in progress: ' + progress + '% (' + 
                    data.processedFiles + '/' + data.totalFiles + ')</div>' +
                    '<div class="status">Current file: ' + currentFile + '</div>';
                
                // Always force display of the latest match during scanning
                if (data.latestMatch) {
                    // Always force update during scanning
                    displayVerificationImage({
                        found: true,
                        verification_image_path: data.latestMatch.imagePath,
                        match_score: data.latestMatch.matchScore,
                        is_verified: data.latestMatch.isVerified,
                        episode_info: data.latestMatch.episodeInfo,
                        file_path: data.latestMatch.path,
                        timestamp: Date.now() // Force timestamp to be current
                    }, true);
                }
            } else {
                container.innerHTML = '<div class="status">No scan in progress</div>';
                
                // Always force display of the latest match
                if (data.latestMatch) {
                    // Always force update
                    displayVerificationImage({
                        found: true,
                        verification_image_path: data.latestMatch.imagePath,
                        match_score: data.latestMatch.matchScore,
                        is_verified: data.latestMatch.isVerified,
                        episode_info: data.latestMatch.episodeInfo,
                        file_path: data.latestMatch.path,
                        timestamp: Date.now() // Force timestamp to be current
                    }, true);
                }
            }
        }
        
        function fetchLatestVerification() {
            fetch('/api/latest-verification')
                .then(response => response.json())
                .then(data => {
                    displayVerificationImage(data);
                })
                .catch(error => {
                    console.error('Error fetching latest verification:', error);
                });
        }
        
        function fetchScanStatus() {
            fetch('/api/scan/status')
                .then(response => response.json())
                .then(data => {
                    updateScanStatus(data);
                    
                    // Auto-refresh if scan is in progress (more frequently)
                    if (data.isScanning && isAutoRefreshEnabled) {
                        setTimeout(fetchScanStatus, 1000); // Poll every second during active scan
                    }
                })
                .catch(error => {
                    console.error('Error fetching scan status:', error);
                });
        }
        
        function startAutoRefresh() {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
            }
            
            // Set to refresh every 3 seconds
            autoRefreshInterval = setInterval(function() {
                if (isAutoRefreshEnabled) {
                    fetchScanStatus();
                    fetchLatestVerification();
                }
            }, 3000);
        }
        
        // Handle auto-refresh checkbox
        document.getElementById('autoRefresh').addEventListener('change', function(e) {
            isAutoRefreshEnabled = e.target.checked;
            
            if (isAutoRefreshEnabled) {
                startAutoRefresh();
                fetchScanStatus(); // Immediate refresh when enabled
            } else {
                clearInterval(autoRefreshInterval);
            }
        });
        
        // Initial load
        fetchLatestVerification();
        fetchScanStatus();
        updateRefreshTime();
        startAutoRefresh();
        
        // Set up refresh button
        document.getElementById('refreshBtn').addEventListener('click', function() {
            fetchLatestVerification();
            fetchScanStatus();
            updateRefreshTime();
        });
    </script>
</body>
</html>
`;

// Write the viewer HTML file
const viewerPath = path.join(publicDir, 'viewer.html');
fs.writeFileSync(viewerPath, viewerHtml);
console.log(`[SERVER] Created verification image viewer at: ${viewerPath}`);

app.use(express.static(publicDir));
// Explicitly set CORS headers for image files
app.use('/matches', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});

console.log('[SERVER] Added JSON parsing middleware and static file handling');

// Database functions for libraries
const getLibraries = db.prepare('SELECT * FROM libraries');
// Removed unused getLibraryById
const addLibrary = db.prepare('INSERT INTO libraries (title, path, type) VALUES (?, ?, ?)');

// Database functions for scanned files
const getScannedFiles = db.prepare('SELECT * FROM scanned_files');
const getScannedFileByPath = db.prepare('SELECT * FROM scanned_files WHERE file_path = ?');
const getLatestScannedFile = db.prepare('SELECT * FROM scanned_files ORDER BY last_scanned_time DESC LIMIT 1');
const addScannedFile = db.prepare(`
  INSERT INTO scanned_files 
  (library_id, file_path, file_modified_time, last_scanned_time, verification_image_path, match_score, is_verified, episode_info) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateScannedFile = db.prepare(`
  UPDATE scanned_files 
  SET last_scanned_time = ?, verification_image_path = ?, match_score = ?, is_verified = ?, episode_info = ?, 
      file_modified_time = ?
  WHERE file_path = ?
`);

// Helper function to validate a path exists
const validatePath = async (filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch (err) {
    console.error(`[PATH VALIDATION ERROR] ${filePath} - ${err.message}`);
    return false;
  }
};

// GET /api/libraries
app.get('/api/libraries', (req, res) => {
  console.log('[ROUTE] GET /api/libraries');
  try {
    const libraries = getLibraries.all();
    console.log('[ROUTE] GET /api/libraries - Returning:', libraries);
    res.json(libraries);
  } catch (error) {
    console.error('[ERROR] Failed to get libraries:', error);
    res.status(500).json({ error: 'Failed to get libraries from database' });
  }
});
console.log('[ROUTE] Registered route: GET /api/libraries');

// POST /api/libraries
app.post('/api/libraries', async (req, res) => {
  console.log('[ROUTE] POST /api/libraries', req.body);

  if (!req.body.path) {
    return res.status(400).json({ error: 'Missing path in request body' });
  }
  
  if (!req.body.title) {
    return res.status(400).json({ error: 'Missing title in request body' });
  }
  
  if (!req.body.type || !['movie', 'tv'].includes(req.body.type)) {
    return res.status(400).json({ error: 'Missing or invalid type in request body (must be "movie" or "tv")' });
  }
  
  // Validate the path exists
  const exists = await validatePath(req.body.path);
  if (!exists) {
    return res.status(400).json({ error: 'Library path does not exist or is not accessible' });
  }
  
  try {
    const result = addLibrary.run(req.body.title, req.body.path, req.body.type);
    res.json({ 
      message: 'Library added successfully', 
      id: result.lastInsertRowid 
    });
  } catch (error) {
    console.error('[ERROR] Failed to add library:', error);
    res.status(500).json({ error: 'Failed to add library to database' });
  }
});
console.log('[ROUTE] Registered route: POST /api/libraries');

// PUT /api/libraries/:id - Update a library
app.put('/api/libraries/:id', async (req, res) => {
  const libraryId = parseInt(req.params.id, 10);
  console.log(`[ROUTE] PUT /api/libraries/${libraryId}`, req.body);

  const { title, path: libraryPath, type, is_enabled } = req.body;

  // Basic validation
  if (isNaN(libraryId)) {
    return res.status(400).json({ error: 'Invalid library ID' });
  }
  // Check if *at least one* valid field is provided for update
  const providedFields = [title, libraryPath, type, is_enabled].filter(val => val !== undefined);
  if (providedFields.length === 0) {
      return res.status(400).json({ error: 'No update fields provided (title, path, type, or is_enabled)' });
  }
  
  // Validate the fields that *are* provided
  if (type && !['movie', 'tv'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type (must be "movie" or "tv")' });
  }
  if (is_enabled !== undefined && ![0, 1, true, false].includes(is_enabled)) {
       return res.status(400).json({ error: 'Invalid is_enabled value (must be 0, 1, true, or false)' });
  }
  if (title !== undefined && typeof title !== 'string' || title === '') { // Check if title is provided but empty
       return res.status(400).json({ error: 'Title cannot be empty' });
  }
  if (libraryPath !== undefined && typeof libraryPath !== 'string' || libraryPath === '') { // Check if path is provided but empty
       return res.status(400).json({ error: 'Path cannot be empty' });
  }

  // Validate path existence only if it's actually being updated
  if (libraryPath) {
      const exists = await validatePath(libraryPath);
      if (!exists) {
          return res.status(400).json({ error: 'Library path does not exist or is not accessible' });
      }
  }

  // Build the update query dynamically
  let setClauses = [];
  let params = [];
  if (title) {
      setClauses.push('title = ?');
      params.push(title);
  }
  if (libraryPath) {
      setClauses.push('path = ?');
      params.push(libraryPath);
  }
  if (type) {
      setClauses.push('type = ?');
      params.push(type);
  }
  if (is_enabled !== undefined) {
      setClauses.push('is_enabled = ?');
      params.push(is_enabled === true || is_enabled === 1 ? 1 : 0); // Ensure 0 or 1
  }

  if (setClauses.length === 0) {
       return res.status(400).json({ error: 'No valid update fields provided' }); // Should be caught earlier, but safety check
  }

  params.push(libraryId);
  const sql = `UPDATE libraries SET ${setClauses.join(', ')} WHERE id = ?`;

  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Library not found or no changes made' });
    }

    // Fetch the updated library to return it
    const getLibraryById = db.prepare('SELECT * FROM libraries WHERE id = ?');
    const updatedLibrary = getLibraryById.get(libraryId);

    res.json({ 
        message: 'Library updated successfully', 
        library: updatedLibrary 
    });
  } catch (error) {
    console.error('[ERROR] Failed to update library:', error);
    res.status(500).json({ error: 'Failed to update library in database' });
  }
});
console.log('[ROUTE] Registered route: PUT /api/libraries/:id');

// DELETE /api/libraries/:id - Delete a library
app.delete('/api/libraries/:id', (req, res) => {
  const libraryId = parseInt(req.params.id, 10);
  console.log(`[ROUTE] DELETE /api/libraries/${libraryId}`);

  if (isNaN(libraryId)) {
    return res.status(400).json({ error: 'Invalid library ID' });
  }

  try {
    // Since we added ON DELETE CASCADE, deleting the library automatically deletes associated scanned_files
    const deleteLibrary = db.prepare('DELETE FROM libraries WHERE id = ?');
    const result = deleteLibrary.run(libraryId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }

    console.log(`[DB] Deleted library ${libraryId} and associated scanned files (cascade).`);
    res.status(200).json({ message: 'Library deleted successfully' });
  
  } catch (error) {
    console.error('[ERROR] Failed to delete library:', error);
    res.status(500).json({ error: 'Failed to delete library from database' });
  }
});
console.log('[ROUTE] Registered route: DELETE /api/libraries/:id');

// GET /api/content/:type
app.get('/api/content/:type', async (req, res) => {
  const contentType = req.params.type;  // shows, seasons, or episodes
  const contentPath = req.query.path;
  
  console.log(`[ROUTE] GET /api/content/${contentType}`, req.query);
  
  if (!contentPath) {
    return res.status(400).json({ error: `Missing path parameter for ${contentType}` });
  }

  // Ensure path is absolute by adding leading slash if missing
  let fullPath = contentPath;
  if (!fullPath.startsWith('/')) {
    fullPath = '/' + fullPath;
  }
  
  console.log(`[ROUTE] Scanning ${contentType} directory: ${fullPath}`);
  
  try {
    // Check if path exists and is accessible
    const exists = await validatePath(fullPath);
    if (!exists) {
      return res.status(400).json({ error: `Directory not found or not accessible: ${fullPath}` });
    }
    
    // Read directory contents
    const files = await fs.promises.readdir(fullPath, { withFileTypes: true });
    
    let result = [];
    
    // Process based on content type
    if (contentType === 'shows') {
      // Filter for directories only, they represent TV shows
      result = files
        .filter(file => file.isDirectory())
        .map(dir => {
          // Extract show metadata from directory name if present
          // Format example: "South Park (1997) [tvdbid-75897]"
          const name = dir.name;
          const yearMatch = name.match(/\((\d{4})\)/);
          const idMatch = name.match(/\[tvdbid-(\d+)\]/);
          
          return {
            name: name,
            path: path.join(fullPath, name),
            year: yearMatch ? yearMatch[1] : null,
            tvdbId: idMatch ? idMatch[1] : null,
          };
        });
      
      console.log(`[ROUTE] Found ${result.length} shows in ${fullPath}`);
    }
    else if (contentType === 'seasons') {
      // Filter for directories only, they represent seasons
      // Format: "Season 01", "Season 1", etc.
      result = files
        .filter(file => file.isDirectory() && /season\s+\d+/i.test(file.name))
        .map(dir => {
          const seasonNumber = dir.name.match(/season\s+(\d+)/i);
          return {
            name: dir.name,
            path: path.join(fullPath, dir.name),
            number: seasonNumber ? parseInt(seasonNumber[1], 10) : null
          };
        })
        .sort((a, b) => (a.number || 0) - (b.number || 0));
      
      console.log(`[ROUTE] Found ${result.length} seasons in ${fullPath}`);
    }
    else if (contentType === 'episodes') {
      // Read directory contents without file types info
      const fileNames = await fs.promises.readdir(fullPath);
      
      // Filter for video files
      const videoExtensions = ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'];
      result = fileNames
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return videoExtensions.includes(ext);
        })
        .map(file => {
          // Try to extract episode information from filename
          // Format examples:
          // "South Park (1997) - S01E06 - Death [Bluray-1080p][AC3 5.1][x264]-W4NK3R.mkv"
          // "Show.Name.S01E02.Episode.Name.1080p.mkv"
          const episodeMatch = file.match(/S(\d+)E(\d+)/i);
          const episodeNameMatch = file.match(/[sS]\d+[eE]\d+\s*-\s*([^[\]]+)/);
          
          return {
            filename: file,
            path: path.join(fullPath, file),
            season: episodeMatch ? parseInt(episodeMatch[1], 10) : null,
            episode: episodeMatch ? parseInt(episodeMatch[2], 10) : null,
            name: episodeNameMatch ? episodeNameMatch[1].trim() : file
          };
        })
        .sort((a, b) => {
          if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
          return (a.episode || 0) - (b.episode || 0);
        });
      
      console.log(`[ROUTE] Found ${result.length} episodes in ${fullPath}`);
    }
    else {
      return res.status(400).json({ error: `Invalid content type: ${contentType}` });
    }
    
    res.json(result);
  } catch (err) {
    console.error(`[ERROR] Error scanning directory: ${err.message}`);
    res.status(500).json({ error: `Failed to scan directory: ${err.message}` });
  }
});
console.log('[ROUTE] Registered route: GET /api/content/:type');

// Keep the original query parameter-based routes for backward compatibility
// GET /api/shows
app.get('/api/shows', async (req, res) => {
  console.log('[ROUTE] GET /api/shows (query param)', req.query);
  if (!req.query.path) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }
  // Forward to the new endpoint
  req.params.type = 'shows';
  req.url = `/api/content/shows?path=${encodeURIComponent(req.query.path)}`;
  app.handle(req, res);
});

// GET /api/seasons
app.get('/api/seasons', async (req, res) => {
  console.log('[ROUTE] GET /api/seasons (query param)', req.query);
  if (!req.query.path) {
    return res.status(400).json({ error: 'Missing show path parameter' });
  }
  // Forward to the new endpoint
  req.params.type = 'seasons';
  req.url = `/api/content/seasons?path=${encodeURIComponent(req.query.path)}`;
  app.handle(req, res);
});

// GET /api/episodes
app.get('/api/episodes', async (req, res) => {
  console.log('[ROUTE] GET /api/episodes (query param)', req.query);
  if (!req.query.path) {
    return res.status(400).json({ error: 'Missing season path parameter' });
  }
  // Forward to the new endpoint
  req.params.type = 'episodes';
  req.url = `/api/content/episodes?path=${encodeURIComponent(req.query.path)}`;
  app.handle(req, res);
});

// Add support for path-based navigation using URL parameters
// GET /api/path/:type/:parentType/:parentId/:itemId
app.get('/api/path/:type/:encodedPath', async (req, res) => {
  const { type, encodedPath } = req.params;
  const path = decodeURIComponent(encodedPath);
  
  console.log(`[ROUTE] GET /api/path/${type}/${encodedPath}`);
  
  // Forward to the content endpoint
  req.params.type = type;
  req.url = `/api/content/${type}?path=${encodeURIComponent(path)}`;
  app.handle(req, res);
});

console.log('[ROUTE] Registered backward-compatible routes: GET /api/shows, GET /api/seasons, GET /api/episodes');
console.log('[ROUTE] Registered path-based route: GET /api/path/:type/:encodedPath');

// GET /api/browse - Directory browser endpoint
app.get('/api/browse', async (req, res) => {
  const requestedPath = req.query.path || '/';
  console.log(`[ROUTE] GET /api/browse`, { path: requestedPath });
  
  try {
    // Check if path exists and is accessible
    const exists = await validatePath(requestedPath);
    if (!exists) {
      return res.status(400).json({ error: `Directory not found or not accessible: ${requestedPath}` });
    }
    
    // Read directory contents
    const files = await fs.promises.readdir(requestedPath, { withFileTypes: true });
    
    // Convert to the expected format
    const result = files.map(file => ({
      name: file.name,
      path: path.join(requestedPath, file.name),
      isDirectory: file.isDirectory()
    }));
    
    console.log(`[ROUTE] Found ${result.length} items in ${requestedPath}`);
    res.json(result);
  } catch (err) {
    console.error(`[ERROR] Error browsing directory: ${err.message}`);
    res.status(500).json({ error: `Failed to browse directory: ${err.message}` });
  }
});
console.log('[ROUTE] Registered route: GET /api/browse');

// Add specialized hierarchical browsing paths that match the UI flow
app.get('/api/browse/:level', async (req, res) => {
  const { level } = req.params;
  const parentPath = req.query.parent || '';
  
  console.log(`[ROUTE] GET /api/browse/${level}`, { parent: parentPath });
  
  // Map browse levels to content types
  let contentType;
  let path = parentPath;
  
  switch (level) {
    case 'libraries':
      // Return the list of libraries from the database
      try {
        const libraries = getLibraries.all();
        console.log('[ROUTE] Returning libraries list from database');
        return res.json(libraries);
      } catch (error) {
        console.error('[ERROR] Failed to get libraries:', error);
        return res.status(500).json({ error: 'Failed to get libraries from database' });
      }
    
    case 'shows':
      // Shows within a library
      contentType = 'shows';
      break;
    
    case 'seasons':
      // Seasons within a show
      contentType = 'seasons';
      break;
    
    case 'episodes':
      // Episodes within a season
      contentType = 'episodes';
      break;
    
    default:
      return res.status(400).json({ error: `Invalid browse level: ${level}` });
  }
  
  // Forward to the content endpoint
  req.params.type = contentType;
  req.url = `/api/content/${contentType}?path=${encodeURIComponent(path)}`;
  app.handle(req, res);
});

console.log('[ROUTE] Registered hierarchical browsing route: GET /api/browse/:level');

// POST /api/match
app.post('/api/match', async (req, res) => {
  console.log('[ROUTE] POST /api/match', req.body);
  
  if (!req.body.episodePath) {
    return res.status(400).json({ error: 'Missing episodePath parameter' });
  }

  // Get the episode path
  const episodePath = req.body.episodePath;
  
  try {
    // Check if path exists and is accessible
    const exists = await validatePath(episodePath);
    if (!exists) {
      return res.status(400).json({ error: `Episode file not found or not accessible: ${episodePath}` });
    }
    
    console.log(`[ROUTE] Running clip-matcher.py on: ${episodePath}`);
    
    // Setup parameters for clip-matcher.py
    const clipMatcherPath = path.join(__dirname, 'scripts', 'clip-matcher.py');
    const scriptArgs = [
        clipMatcherPath,
        episodePath,
        '--threshold', String(clipMatcherThreshold),
        '--max-stills', '5',
        '--early-stop', String(clipMatcherEarlyStop)
    ];
    
    // Create a promise to handle the async process
    const matchPromise = new Promise((resolve) => {
      // Build command to run the Python script
      const process = spawn('python3', scriptArgs);
      
      let stdoutData = '';
      let stderrData = '';
      let jsonOutput = null;
      let verificationPath = null; // Initialize verificationPath
      
      // Capture stdout data
      process.stdout.on('data', (data) => {
        const dataStr = data.toString();
        stdoutData += dataStr;
        console.log(`[CLIP-MATCHER] ${dataStr.trim()}`);
        
        // Try to extract the verification path from the output
        const verifyPathMatch = dataStr.match(/Verification images saved to:\s*(.+)/);
        if (verifyPathMatch && verifyPathMatch[1]) {
          verificationPath = verifyPathMatch[1].trim();
          console.log(`[CLIP-MATCHER] Detected verification path from stdout: ${verificationPath}`);
        }
      });
      
      // Capture stderr data
      process.stderr.on('data', (data) => {
        const dataStr = data.toString();
        stderrData += dataStr;
        console.error(`[CLIP-MATCHER ERROR] ${dataStr.trim()}`);
        
        // Try to extract verification path from error output too
        const verifyPathMatch = dataStr.match(/Verification images saved to:\s*(.+)/);
        if (verifyPathMatch && verifyPathMatch[1]) {
          verificationPath = verifyPathMatch[1].trim();
          console.log(`[CLIP-MATCHER] Detected verification path from stderr: ${verificationPath}`);
        }
      });
      
      // Handle process exit
      process.on('close', (code) => {
        console.log(`[CLIP-MATCHER] Process exited with code ${code} for file: ${episodePath}`);
        console.log(`[CLIP-MATCHER] verificationPath at close: ${verificationPath || 'null'}`);
        
        // Attempt to extract error message regardless of exit code
        let errorMessage = stderrData.trim() || stdoutData.trim(); // Use stdout as fallback
        
        // Try to extract verification path one last time if not found yet
        if (!verificationPath) {
          const fullOutput = stdoutData + stderrData;
          const finalPathMatch = fullOutput.match(/Verification images saved to:\s*(.+)/);
          if (finalPathMatch && finalPathMatch[1]) {
            verificationPath = finalPathMatch[1].trim();
            console.log(`[CLIP-MATCHER] Found verification path during final check: ${verificationPath}`);
          }
        }
        
        if (stderrData) {
            const tracebackMatch = stderrData.match(/Traceback[\s\S]*?(\w+Error:.+?)(\n|$)/s);
            const simpleErrorMatch = stderrData.match(/(\w+Error:.+?)(\n|$)/s);
            if (tracebackMatch && tracebackMatch[1]) {
                errorMessage = tracebackMatch[1].trim();
            } else if (simpleErrorMatch && simpleErrorMatch[1]) {
                 errorMessage = simpleErrorMatch[1].trim();
            }
            // Remove HuggingFace warning prefix if present
            errorMessage = errorMessage.replace(/.*FutureWarning:.+?\n/s, '').trim();
        } else if (!stdoutData && !stderrData) {
            errorMessage = `Process exited with code ${code} without output.`;
        }

        // --- Logic based on Exit Code FIRST --- 
        if (code === 0) { 
            // Success Case
            if (jsonOutput && typeof jsonOutput === 'object') {
                console.log(`[CLIP-MATCHER] Success (Code 0) with JSON output.`);
                resolve({
                    success: true,
                    verified: jsonOutput.verified === true, 
                    matchScore: typeof jsonOutput.similarity === 'number' ? jsonOutput.similarity : 0,
                    episode: typeof jsonOutput.episode_info === 'string' ? jsonOutput.episode_info : path.basename(episodePath),
                    verificationPath: verificationPath || (jsonOutput.verification_path || null)
                });
            } else {
                console.log(`[CLIP-MATCHER] Success (Code 0) but NO JSON output. Parsing stdout for score...`);
                let fallbackScore = 0;
                const scoreMatch = stdoutData.match(/Best match:\s*([\d.]+)/);
                if (scoreMatch && scoreMatch[1]) {
                    fallbackScore = parseFloat(scoreMatch[1]);
                    console.log(`[CLIP-MATCHER] Found fallback score in stdout: ${fallbackScore}`);
                }
                resolve({
                    success: true,
                    verified: true, // Assume verified on code 0
                    matchScore: fallbackScore, // Use parsed score or 0 
                    episode: path.basename(episodePath),
                    verificationPath // Use path detected from stdout/stderr
                });
            }
        } else if (code === 1) {
            // Verification Failed Case (Non-fatal error)
            console.log(`[CLIP-MATCHER] Verification Failed (Code 1).`);
            resolve({
                success: false,
                verified: false,
                verificationPath, // Include detected path
                error: `Verification failed: ${errorMessage || 'No specific error message.'}`, 
                exitCode: 1
            });
        } else {
            // Other Error Case
            console.error(`[CLIP-MATCHER] Process error (Code ${code}).`);
            resolve({
                success: false,
                error: `Process exited with code ${code}: ${errorMessage || 'No specific error message.'}`, 
                exitCode: code,
                verificationPath // Include detected path
            });
        }
      });
      
      // Handle process errors
      process.on('error', (err) => {
        console.error(`[CLIP-MATCHER] Failed to start process: ${err.message}`);
        resolve({ 
          success: false, 
          error: `Failed to start process: ${err.message}`,
          verificationPath: null // No verification path available 
        });
      });
    });
    
    // Wait for the process to complete and send the results
    const results = await matchPromise;
    res.json(results);
    
  } catch (err) {
    console.error(`[ERROR] Error running clip-matcher: ${err.message}`);
    res.status(500).json({ success: false, error: `Failed to run clip-matcher: ${err.message}` });
  }
});
console.log('[ROUTE] Registered route: POST /api/match');

// GET /api/history - Get scan history
app.get('/api/history', (req, res) => {
  // console.log('[ROUTE] GET /api/history'); // Commented out
  try {
    const history = getScannedFiles.all();
    // console.log(`[ROUTE] Returning ${history.length} scanned files`); // Commented out
    res.json(history);
  } catch (error) {
    console.error('[ERROR] Failed to get scan history:', error);
    res.status(500).json({ error: 'Failed to get scan history from database' });
  }
});
// console.log('[ROUTE] Registered route: GET /api/history'); // Commented out registration log

// DELETE /api/history - Clear all scan history
app.delete('/api/history', (req, res) => {
  console.log('[ROUTE] DELETE /api/history');
  try {
    // Request stop of any ongoing scan first
    if (scanStatus.isScanning) {
      console.log('[ROUTE] Requesting stop of ongoing scan due to history reset...');
      scanStatus.stopRequested = true;
      // We don't wait here, just signal. The scan loop will stop itself.
    }

    // Prepare and run the delete statement
    const deleteAllScannedFiles = db.prepare('DELETE FROM scanned_files');
    const result = deleteAllScannedFiles.run();
    
    console.log(`[DB] Cleared ${result.changes} records from scanned_files table.`);
    
    // Also reset the latestMatch in scanStatus if it exists
    if (scanStatus.latestMatch) {
      scanStatus.latestMatch = null;
      console.log('[STATUS] Cleared latest match from scan status.')
    }

    res.status(200).json({ message: 'Scan history cleared successfully!' });
  } catch (error) {
    console.error('[ERROR] Failed to clear scan history:', error);
    res.status(500).json({ error: 'Failed to clear scan history from database' });
  }
});
console.log('[ROUTE] Registered route: DELETE /api/history');

// POST /api/scan/stop - Request to stop the current scan
app.post('/api/scan/stop', (req, res) => {
  console.log('[ROUTE] POST /api/scan/stop');
  if (!scanStatus.isScanning) {
    return res.status(400).json({ message: 'No scan is currently in progress.' });
  }
  if (scanStatus.stopRequested) {
    return res.status(400).json({ message: 'Scan stop already requested.' });
  }

  console.log('[SCAN] Stop requested by user.');
  scanStatus.stopRequested = true;
  res.status(200).json({ message: 'Scan stop requested. Please wait for the current file to finish.' });
});
console.log('[ROUTE] Registered route: POST /api/scan/stop');

// GET /api/latest-verification - Get most recent verification
app.get('/api/latest-verification', (req, res) => {
  console.log('[ROUTE] GET /api/latest-verification');
  try {
    const latestFile = getLatestScannedFile.get();
    console.log(`[ROUTE] Latest verification file: ${latestFile ? latestFile.file_path : 'None'}`);
    
    if (!latestFile) {
      // Add no-cache headers
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      return res.json({ found: false });
    }
    
    // Check if image exists
    let imagePath = null;
    if (latestFile.verification_image_path) {
      imagePath = latestFile.verification_image_path;
      // Ensure path starts with a slash
      if (!imagePath.startsWith('/')) {
        imagePath = '/' + imagePath;
      }
      console.log(`[ROUTE] Latest verification image: ${imagePath}`);
    }
    
    // Add no-cache headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({
      found: true,
      file_path: latestFile.file_path,
      verification_image_path: imagePath,
      match_score: latestFile.match_score,
      is_verified: latestFile.is_verified === 1,
      episode_info: latestFile.episode_info,
      last_scanned_time: latestFile.last_scanned_time,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[ERROR] Failed to get latest verification:', error);
    res.status(500).json({ error: 'Failed to get latest verification from database' });
  }
});
console.log('[ROUTE] Registered route: GET /api/latest-verification');

// GET /api/latest-match - Get latest match image in real-time
app.get('/api/latest-match', (req, res) => {
  // console.log('[ROUTE] GET /api/latest-match (real-time polling)'); // Commented out to reduce noise

  // Set cache-busting headers
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Always get the latest record from the database for this endpoint
  try {
    const latestFile = getLatestScannedFile.get();
    
    if (!latestFile) {
      return res.json({ found: false });
    }
    
    // Get image path and ensure it's properly formatted
    let imagePath = null;
    if (latestFile.verification_image_path) {
      imagePath = latestFile.verification_image_path;
      if (!imagePath.startsWith('/')) {
        imagePath = '/' + imagePath;
      }
    }
    
    // console.log(`[ROUTE] Returning latest match from database: ${latestFile.file_path}`); // Commented out to reduce noise
    return res.json({
      found: true,
      file_path: latestFile.file_path,
      verification_image_path: imagePath,
      match_score: latestFile.match_score,
      is_verified: latestFile.is_verified === 1,
      episode_info: latestFile.episode_info,
      last_scanned_time: latestFile.last_scanned_time,
      timestamp: Date.now(),
      source: 'database'
    });
  } catch (error) {
    console.error('[ERROR] Failed to get latest match:', error);
    res.status(500).json({ error: 'Failed to get latest match information' });
  }
});
console.log('[ROUTE] Registered route: GET /api/latest-match');

// Global variable to track scan status
let scanStatus = {
  isScanning: false,
  totalFiles: 0,
  processedFiles: 0,
  currentFile: '',
  startTime: null,
  errors: [],
  latestMatch: null, // Keep track of the latest match info
  stopRequested: false // Flag to signal scan stop
};

// Helper function to find all media files in a directory recursively
const findMediaFiles = async (dirPath, libraryId) => {
  const videoExtensions = ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'];
  const results = [];
  
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subResults = await findMediaFiles(fullPath, libraryId);
        results.push(...subResults);
      } else {
        // Check if this is a video file
        const ext = path.extname(entry.name).toLowerCase();
        if (videoExtensions.includes(ext)) {
          results.push({
            path: fullPath,
            libraryId: libraryId
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error(`[ERROR] Error scanning directory ${dirPath}:`, error);
    return results;
  }
};

// Helper function to copy verification image to public folder
const copyVerificationImage = async (sourcePath, episodeFilePath) => {
  if (!sourcePath) return null;
  
  try {
    console.log(`[IMAGE] Attempting to copy from source: ${sourcePath}`);
    
    // Get a unique filename based on the episode file and current timestamp
    const episodeFileName = path.basename(episodeFilePath || 'unknown');
    const timestamp = Date.now();
    const uniqueFilename = `match_${timestamp}_${episodeFileName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
    
    // Create a destination path in the public/matches folder
    const destDir = path.join(publicDir, 'matches');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
      console.log(`[IMAGE] Created destination directory: ${destDir}`);
    }
    
    const destPath = path.join(destDir, uniqueFilename);
    
    // Check if the source file exists with more detailed error logging
    try {
      const sourceStats = await fs.promises.stat(sourcePath);
      console.log(`[IMAGE] Source file found: ${sourcePath} (Size: ${sourceStats.size} bytes)`);
      
      if (sourceStats.size === 0) {
        console.error(`[ERROR] Source verification image exists but is empty (0 bytes): ${sourcePath}`);
        return null;
      }
    } catch (err) {
      console.error(`[ERROR] Source verification image not found or not accessible: ${sourcePath}`);
      console.error(`[ERROR] File access error details: ${err.message}`);
      return null;
    }
    
    // Copy the file
    try {
      await fs.promises.copyFile(sourcePath, destPath);
      console.log(`[IMAGE] Successfully copied verification image to: ${destPath}`);
      
      // Verify the destination file was properly created
      const destStats = await fs.promises.stat(destPath);
      console.log(`[IMAGE] Verified destination file: ${destPath} (Size: ${destStats.size} bytes)`);
    } catch (copyErr) {
      console.error(`[ERROR] Failed to copy verification image from ${sourcePath} to ${destPath}`);
      console.error(`[ERROR] Copy error details: ${copyErr.message}`);
      return null;
    }
    
    // Return the relative path for storing in the database
    // Ensure the path starts with a forward slash
    const relativePath = `/matches/${uniqueFilename}`;
    console.log(`[IMAGE] Using relative path for database: ${relativePath}`);
    return relativePath;
  } catch (error) {
    console.error(`[ERROR] Failed to copy verification image:`, error);
    console.error(`[ERROR] Source path: ${sourcePath}, Episode file: ${episodeFilePath}`);
    return null;
  }
};

// POST /api/scan - Start a scan of all libraries
app.post('/api/scan', async (req, res) => {
  console.log('[ROUTE] POST /api/scan');
  
  // Check if a scan is already in progress
  if (scanStatus.isScanning) {
    return res.status(409).json({ 
      error: 'A scan is already in progress',
      status: scanStatus
    });
  }
  
  try {
    // Reset scan status
    scanStatus = {
      isScanning: true,
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      startTime: Date.now(),
      errors: [],
      latestMatch: null, // Reset latest match
      stopRequested: false // Reset stopRequested flag
    };
    
    // Get all libraries
    const libraries = getLibraries.all();
    
    // Start the scan process asynchronously
    processScan(libraries).catch(error => {
      console.error('[ERROR] Scan process failed:', error);
      scanStatus.isScanning = false;
      scanStatus.stopRequested = false; // Reset flag on error too
      scanStatus.errors.push(`Scan process failed: ${error.message}`);
    });
    
    // Return immediately with initial status
    res.json({ 
      message: 'Scan started',
      status: scanStatus
    });
  } catch (error) {
    console.error('[ERROR] Failed to start scan:', error);
    scanStatus.isScanning = false;
    scanStatus.stopRequested = false; // Reset flag on error too
    res.status(500).json({ error: 'Failed to start scan' });
  }
});
console.log('[ROUTE] Registered route: POST /api/scan');

// GET /api/scan/status - Get current scan status
app.get('/api/scan/status', (req, res) => {
  // console.log('[ROUTE] GET /api/scan/status'); // Commented out

  // If we're not scanning, try to get the latest verification from the database
  if (!scanStatus.isScanning && !scanStatus.latestMatch) {
    try {
      const latestFile = getLatestScannedFile.get();
      if (latestFile) {
        // Add latest verification info to scan status
        scanStatus.latestMatch = {
          path: latestFile.file_path,
          imagePath: latestFile.verification_image_path,
          matchScore: latestFile.match_score,
          isVerified: latestFile.is_verified === 1,
          episodeInfo: latestFile.episode_info,
          timestamp: Date.now() // Always use fresh timestamp
        };
      }
    } catch (error) {
      console.error('[ERROR] Failed to get latest verification for scan status:', error);
    }
  } else if (scanStatus.latestMatch) {
    // Always add a fresh timestamp to force browser to reload the image
    scanStatus.latestMatch.timestamp = Date.now();
  }
  
  // Add no-cache headers to force browser to get fresh data
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  res.json(scanStatus);
});
// console.log('[ROUTE] Registered route: GET /api/scan/status'); // Commented out registration log

// Helper function to run the clip-matcher.py script
async function runClipMatcher(filePath) {
  return new Promise((resolve) => {
    console.log(`[CLIP-MATCHER] Processing file: ${filePath}`);
    
    // Prepare the command that runs the Python script
    const scriptPath = path.join(__dirname, 'scripts', 'clip-matcher.py');
    
    // Make sure scriptPath is valid
    if (!fs.existsSync(scriptPath)) {
      console.error(`[ERROR] Script not found: ${scriptPath}`);
      resolve({ 
        success: false, 
        error: `Script not found: ${scriptPath}` 
      });
      return;
    }
    
    // Array of arguments to pass to the script
    const scriptArgs = [
      scriptPath,  // Path to the script (first argument must be the script path)
      filePath,    // Path to the video file
      '--threshold', String(clipMatcherThreshold),  // Similarity threshold
      '--early-stop', String(clipMatcherEarlyStop) // Early stopping threshold
    ];
    
    console.log(`[CLIP-MATCHER] Command: python3 ${scriptArgs.join(' ')}`);
    
    // Initialize variables to track data from the process
    let stdoutData = '';
    let stderrData = '';
    let jsonOutput = null;
    let verificationPath = null; // Initialize verificationPath
    
    // Spawn Python process
    const process = spawn('python3', scriptArgs);
    
    // Collect stdout data
    process.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdoutData += chunk;
      
      // Try to extract the verification path from the output
      const verifyPathMatch = chunk.match(/Verification images saved to:\s*(.+)/);
      if (verifyPathMatch && verifyPathMatch[1]) {
        verificationPath = verifyPathMatch[1].trim();
        console.log(`[CLIP-MATCHER] Detected verification path from stdout: ${verificationPath}`);
      }
      
      // Look for JSON output
      try {
        // Check if we have any JSON in the output
        const jsonMatches = chunk.match(/({[\s\S]*})/g);
        if (jsonMatches) {
          for (const jsonStr of jsonMatches) {
            try {
              const parsedJson = JSON.parse(jsonStr);
              if (parsedJson && typeof parsedJson === 'object') {
                jsonOutput = parsedJson;
                console.log(`[CLIP-MATCHER] Parsed JSON result:`, jsonOutput);
              }
            } catch (parseErr) {
              // Not valid JSON, continue
            }
          }
        }
      } catch (err) {
        console.error(`[ERROR] Error parsing stdout: ${err.message}`);
      }
    });
    
    // Collect stderr data
    process.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderrData += chunk;
      console.error(`[CLIP-MATCHER][ERROR] ${chunk.trim()}`);
      
      // Try to extract verification path from error output too
      const verifyPathMatch = chunk.match(/Verification images saved to:\s*(.+)/);
      if (verifyPathMatch && verifyPathMatch[1]) {
        verificationPath = verifyPathMatch[1].trim();
        console.log(`[CLIP-MATCHER] Detected verification path from stderr: ${verificationPath}`);
      }
    });
    
    // Handle process exit
    process.on('close', (code) => {
      console.log(`[CLIP-MATCHER] Process exited with code ${code} for file: ${filePath}`);
      console.log(`[CLIP-MATCHER] verificationPath at close: ${verificationPath || 'null'}`);
      
      // Attempt to extract error message regardless of exit code
      let errorMessage = stderrData.trim() || stdoutData.trim(); // Use stdout as fallback
      
      // Try to extract verification path one last time if not found yet
      if (!verificationPath) {
        const fullOutput = stdoutData + stderrData;
        const finalPathMatch = fullOutput.match(/Verification images saved to:\s*(.+)/);
        if (finalPathMatch && finalPathMatch[1]) {
          verificationPath = finalPathMatch[1].trim();
          console.log(`[CLIP-MATCHER] Found verification path during final check: ${verificationPath}`);
        }
      }
      
      if (stderrData) {
          const tracebackMatch = stderrData.match(/Traceback[\s\S]*?(\w+Error:.+?)(\n|$)/s);
          const simpleErrorMatch = stderrData.match(/(\w+Error:.+?)(\n|$)/s);
          if (tracebackMatch && tracebackMatch[1]) {
              errorMessage = tracebackMatch[1].trim();
          } else if (simpleErrorMatch && simpleErrorMatch[1]) {
               errorMessage = simpleErrorMatch[1].trim();
          }
          // Remove HuggingFace warning prefix if present
          errorMessage = errorMessage.replace(/.*FutureWarning:.+?\n/s, '').trim();
      } else if (!stdoutData && !stderrData) {
          errorMessage = `Process exited with code ${code} without output.`;
      }

      // --- Logic based on Exit Code FIRST --- 
      if (code === 0) { 
          // Success Case
          if (jsonOutput && typeof jsonOutput === 'object') {
              console.log(`[CLIP-MATCHER] Success (Code 0) with JSON output.`);
              resolve({
                  success: true,
                  verified: jsonOutput.verified === true, 
                  matchScore: typeof jsonOutput.similarity === 'number' ? jsonOutput.similarity : 0,
                  episode: typeof jsonOutput.episode_info === 'string' ? jsonOutput.episode_info : path.basename(filePath),
                  verificationPath: verificationPath || (jsonOutput.verification_path || null)
              });
          } else {
              console.log(`[CLIP-MATCHER] Success (Code 0) but NO JSON output. Parsing stdout for score...`);
              let fallbackScore = 0;
              const scoreMatch = stdoutData.match(/Best match:\s*([\d.]+)/);
              if (scoreMatch && scoreMatch[1]) {
                  fallbackScore = parseFloat(scoreMatch[1]);
                  console.log(`[CLIP-MATCHER] Found fallback score in stdout: ${fallbackScore}`);
              }
              resolve({
                  success: true,
                  verified: true, // Assume verified on code 0
                  matchScore: fallbackScore, // Use parsed score or 0 
                  episode: path.basename(filePath),
                  verificationPath // Use path detected from stdout/stderr
              });
          }
      } else if (code === 1) {
          // Verification Failed Case (Non-fatal error)
          console.log(`[CLIP-MATCHER] Verification Failed (Code 1).`);
          resolve({
              success: false,
              verified: false,
              verificationPath, // Include detected path
              error: `Verification failed: ${errorMessage || 'No specific error message.'}`, 
              exitCode: 1
          });
      } else {
          // Other Error Case
          console.error(`[CLIP-MATCHER] Process error (Code ${code}).`);
          resolve({
              success: false,
              error: `Process exited with code ${code}: ${errorMessage || 'No specific error message.'}`, 
              exitCode: code,
              verificationPath // Include detected path
          });
      }
    });
    
    // Handle process errors
    process.on('error', (err) => {
      console.error(`[CLIP-MATCHER] Failed to start process: ${err.message}`);
      resolve({ 
        success: false, 
        error: `Failed to start process: ${err.message}`,
        verificationPath: null // No verification path available 
      });
    });
  });
}

// Helper function to ensure values are SQLite-compatible
const sanitizeForSQLite = (value) => {
  if (value === undefined) return null;
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === Infinity || value === -Infinity || Number.isNaN(value)) return null;
  // If it's an object or array, convert to JSON string
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
};

// Helper function to process the scan asynchronously
async function processScan(libraries) {
  // Reset stopRequested flag at the beginning of a new scan
  scanStatus.stopRequested = false; 
  try {
    // Find all media files in all *ENABLED* libraries
    let allFiles = [];
    const enabledLibraries = libraries.filter(lib => lib.is_enabled === 1);
    if (enabledLibraries.length === 0) {
      console.log('[SCAN] No enabled libraries found. Scan aborted.');
      scanStatus.isScanning = false;
      scanStatus.processedFiles = 0;
      scanStatus.totalFiles = 0;
      return; // Exit if no enabled libraries
    }

    console.log(`[SCAN] Found ${enabledLibraries.length} enabled libraries to scan.`);

    for (const library of enabledLibraries) {
      console.log(`[SCAN] Finding media files in enabled library: ${library.title} (${library.path})`);
      const libraryFiles = await findMediaFiles(library.path, library.id);
      allFiles.push(...libraryFiles);
    }
    
    scanStatus.totalFiles = allFiles.length;
    console.log(`[SCAN] Found ${allFiles.length} media files to process`);
    
    // Track the latest successful match
    let latestSuccessfulMatch = null;
    
    // Process each file
    for (let i = 0; i < allFiles.length; i++) {
      // Check if a stop has been requested before processing the next file
      if (scanStatus.stopRequested) {
        console.log('[SCAN] Stop request received. Halting scan...');
        break; // Exit the loop
      }
      
      const file = allFiles[i];
      scanStatus.processedFiles = i;
      scanStatus.currentFile = file.path;
      
      try {
        // Check if file has been scanned before
        const existingRecord = getScannedFileByPath.get(file.path);
        
        // Get file stats to check modification time
        const stats = await fs.promises.stat(file.path);
        const modifiedTime = Math.floor(stats.mtimeMs);
        
        // Determine if a rescan is needed
        let shouldScan = false;
        if (!existingRecord) {
          console.log(`[SCAN] New file detected, scanning: ${file.path}`);
          shouldScan = true;
        } else if (modifiedTime > existingRecord.file_modified_time) {
          console.log(`[SCAN] File modified since last scan, rescanning: ${file.path}`);
          shouldScan = true;
        } else {
          console.log(`[SCAN] File unchanged since last scan, skipping: ${file.path}`);
          // Optional: Update scan status even if skipped, or leave as is
          // scanStatus.processedFiles++; // Increment if you want skipped files to count immediately
        }

        if (shouldScan) {
          // Extract filename without extension for better identification
          const fileName = path.basename(file.path);
          
          // Run the clip-matcher.py script
          const matchResult = await runClipMatcher(file.path);
          
          if (matchResult.success) {
            // Create verification image path based on episode filename
            let verificationImagePath = null;
            if (matchResult.verificationPath) {
              // Construct a predictable path to the best match image
              const bestMatchPath = path.join(matchResult.verificationPath, 'best_match.jpg');
              // Copy the image with a filename based on the episode name
              verificationImagePath = await copyVerificationImage(bestMatchPath, file.path);
            }
            
            // Track this as the latest successful match
            if (verificationImagePath) {
              latestSuccessfulMatch = {
                path: file.path,
                imagePath: verificationImagePath,
                matchScore: typeof matchResult.matchScore === 'number' ? matchResult.matchScore : 0,
                isVerified: matchResult.verified === true,
                episodeInfo: typeof matchResult.episode === 'string' ? matchResult.episode : fileName,
                timestamp: Date.now() // Add a timestamp to force browser cache refresh
              };
              console.log(`[MATCH] Updated latest successful match: ${file.path} -> ${verificationImagePath}`);
              
              // Update the scanStatus with the latest match immediately
              scanStatus.latestMatch = latestSuccessfulMatch;
            }
            
            // Ensure all values are valid SQLite types
            const now = Math.floor(Date.now());
            const sanitizedLibraryId = sanitizeForSQLite(file.libraryId);
            const sanitizedFilePath = sanitizeForSQLite(file.path);
            const sanitizedModifiedTime = sanitizeForSQLite(modifiedTime); // Use current modified time
            const sanitizedScanTime = sanitizeForSQLite(now);
            const sanitizedImagePath = sanitizeForSQLite(verificationImagePath);
            const sanitizedMatchScore = sanitizeForSQLite(
              typeof matchResult.matchScore === 'number' ? matchResult.matchScore : 0
            );
            const sanitizedIsVerified = sanitizeForSQLite(matchResult.verified === true ? 1 : 0);
            // Use detected episode name or fallback to filename
            const episodeInfo = typeof matchResult.episode === 'string' && matchResult.episode ? matchResult.episode : fileName;
            const sanitizedEpisode = sanitizeForSQLite(episodeInfo);
            
            if (existingRecord) {
              // Update existing record
              console.log(`[DB] Updating record for ${file.path}`);
              updateScannedFile.run(
                sanitizedScanTime,
                sanitizedImagePath,
                sanitizedMatchScore,
                sanitizedIsVerified,
                sanitizedEpisode,
                sanitizedModifiedTime,
                sanitizedFilePath
              );
            } else {
              // Insert new record
              console.log(`[DB] Inserting new record for ${file.path}`);
              addScannedFile.run(
                sanitizedLibraryId,
                sanitizedFilePath,
                sanitizedModifiedTime,
                sanitizedScanTime,
                sanitizedImagePath,
                sanitizedMatchScore,
                sanitizedIsVerified,
                sanitizedEpisode
              );
            }
          } else {
            // Handle clip matcher failure
            console.log(`[SCANNER_ERROR] Clip matcher process failed for: ${file.path}`);
            console.log(`[SCANNER_ERROR] Full matchResult:`, JSON.stringify(matchResult, null, 2)); // Log the entire result

            const now = Math.floor(Date.now());
            let publicImagePath = null; // Default to null
            let errorEpisodeInfo = "Processing Error"; // Default error message
            
            const exitCodeMatch = matchResult.error?.match(/Process exited with code (\d+)/);
            const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;
            console.log(`[SCANNER_ERROR] Detected Exit Code: ${exitCode}`);

            // Even on failure, try to get the verification image if the path was created
            if (matchResult.verificationPath) {
                console.log(`[SCANNER_ERROR] Verification path found: ${matchResult.verificationPath}. Attempting image copy.`);
                const bestMatchSourcePath = path.join(matchResult.verificationPath, 'best_match.jpg');
                console.log(`[SCANNER_ERROR] Source path for copy: ${bestMatchSourcePath}`);
                
                publicImagePath = await copyVerificationImage(bestMatchSourcePath, file.path); 
                
                if (publicImagePath) {
                    console.log(`[SCANNER_ERROR] Successfully copied error image to: ${publicImagePath}`);
                } else {
                    console.log(`[SCANNER_ERROR] Failed to copy error image from ${bestMatchSourcePath}.`);
                }
            } else {
                 console.log(`[SCANNER_ERROR] No verification path found in matchResult. Cannot copy image.`);
            }

            // Determine the error message based on the exit code or error content
            if (exitCode === 1) {
                errorEpisodeInfo = "Verification Failed"; // More specific status for exit code 1
            } else if (exitCode) {
                // Specific crash code detected
                errorEpisodeInfo = `Processing Error (Code: ${exitCode})`;
            } else if (matchResult.error?.includes('Error parsing results')) {
                // Handle cases where Node.js failed to parse python script output
                errorEpisodeInfo = "Error Parsing Script Output";
            } else if (matchResult.error?.includes('FutureWarning:')) {
                // Handle HuggingFace warnings more specifically
                errorEpisodeInfo = "HuggingFace Download Warning";
                const realErrorMatch = matchResult.error.match(/FutureWarning:.+?\\n(.+)/s);
                if (realErrorMatch && realErrorMatch[1]) {
                    // Try to append the actual error if found after the warning
                    errorEpisodeInfo = `Warning + Error: ${realErrorMatch[1].trim().substring(0, 50)}`; 
                }
            } // Otherwise, stick with default "Processing Error"
            console.log(`[SCANNER_ERROR] Determined error info: ${errorEpisodeInfo}`);
            
            // Use existing verification image if we couldn't get a new one on error AND one wasn't copied above
            if (!publicImagePath && existingRecord?.verification_image_path) {
                publicImagePath = existingRecord.verification_image_path;
                console.log(`[SCANNER_ERROR] Reusing existing image for ${file.path} after error.`);
            }
            console.log(`[SCANNER_ERROR] Final publicImagePath to be saved: ${publicImagePath}`);

            const sanitizedLibraryId = sanitizeForSQLite(file.libraryId);
            const sanitizedFilePath = sanitizeForSQLite(file.path);
            const sanitizedModifiedTime = sanitizeForSQLite(modifiedTime);
            const sanitizedScanTime = sanitizeForSQLite(now);
            const sanitizedImagePath = sanitizeForSQLite(publicImagePath); // Use the potentially copied image path
            const sanitizedErrorMessage = sanitizeForSQLite(errorEpisodeInfo);

            if (existingRecord) {
              console.log(`[DB] Updating record with error for ${file.path}`);
              updateScannedFile.run(
                sanitizedScanTime,
                sanitizedImagePath, // Store path to error image if copied
                0, // Match score
                0, // Verified status
                sanitizedErrorMessage, // Episode info (Error message)
                sanitizedModifiedTime,
                sanitizedFilePath
              );
            } else {
              console.log(`[DB] Inserting new record with error for ${file.path}`);
              addScannedFile.run(
                sanitizedLibraryId,
                sanitizedFilePath,
                sanitizedModifiedTime,
                sanitizedScanTime,
                sanitizedImagePath, // Store path to error image if copied
                0, // Match score
                0, // Verified status
                sanitizedErrorMessage // Episode info (Error message)
              );
            }
          }
        } // End if(shouldScan)
      } catch (error) {
        console.error(`[ERROR] Failed to process file ${file.path}:`, error);
      }
    }
    
    // Update final status and store the latest successful match info
    scanStatus.processedFiles = allFiles.length;
    scanStatus.currentFile = '';
    scanStatus.isScanning = false;
    scanStatus.stopRequested = false; // Reset flag after stopping
    
    // Add the latest match info to the status
    if (latestSuccessfulMatch) {
      scanStatus.latestMatch = latestSuccessfulMatch;
    }
    
    console.log(`[SCAN] Scan completed. Processed ${allFiles.length} files.`); // Removed error count from log
    if (latestSuccessfulMatch) {
      console.log(`[SCAN] Latest successful match: ${latestSuccessfulMatch.path}`);
    }
  } catch (error) {
    console.error('[ERROR] Scan process failed:', error);
    scanStatus.isScanning = false;
    scanStatus.stopRequested = false; // Reset flag on error too
  }
}

// Add a test route
app.get('/test', (req, res) => {
  console.log('[ROUTE] Handling /test request');
  res.status(200).send('Server test route is working!');
});
console.log('[ROUTE] Registered route: GET /test');

// Add a root path handler
app.get('/', (req, res) => {
  console.log('[ROUTE] Handling / request');
  res.send('TV Show API Server - Test Mode');
});
console.log('[ROUTE] Registered route: GET /');

// Add global error handling middleware
app.use((err, req, res, next) => {
  console.error(`[SERVER ERROR] ${err.stack}`);
  res.status(500).send('Something broke!');
});

// Handle 404 errors for any routes not matched
app.use((req, res) => {
  console.error(`[404 ERROR] No route found for ${req.method} ${req.url}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// Start the server
console.log('[SERVER] Attempting to start server listening...');

try {
  // Use app.listen with explicit host binding
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Node.js backend running on http://localhost:${PORT}`);
    console.log(`[SERVER] Test server running. Try accessing http://localhost:${PORT}/test or http://localhost:${PORT}/api/libraries`);
  });
  console.log('[SERVER] Server listen call completed');
} catch (error) {
  console.error('[SERVER ERROR] Failed to start server:', error);
}

// Add global error handlers
process.on('uncaughtException', (err) => {
  console.error(`[FATAL ERROR] Uncaught exception: ${err.message}`);
  console.error(err.stack);
  process.exit(1); //mandatory (as per the Node.js docs)
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL ERROR] Unhandled Rejection at:', reason);
});

// Log process events
process.on('exit', (code) => {
  console.log(`[PROCESS] Process exiting with code: ${code}`);
});

process.on('SIGINT', () => {
  console.log('[PROCESS] Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('[SERVER] Closed all connections');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('[PROCESS] Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('[SERVER] Closed all connections');
    process.exit(0);
  });
});
