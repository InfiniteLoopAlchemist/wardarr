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
const db = new Database('libraries.db', { verbose: console.log });

// Create libraries table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('movie', 'tv'))
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
    FOREIGN KEY (library_id) REFERENCES libraries(id)
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

app.use(logRequest);

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
app.use(express.static(publicDir));

console.log('[SERVER] Added JSON parsing middleware and static file handling');

// Database functions for libraries
const getLibraries = db.prepare('SELECT * FROM libraries');
// Removed unused getLibraryById
const addLibrary = db.prepare('INSERT INTO libraries (title, path, type) VALUES (?, ?, ?)');

// Database functions for scanned files
const getScannedFiles = db.prepare('SELECT * FROM scanned_files');
const getScannedFileByPath = db.prepare('SELECT * FROM scanned_files WHERE file_path = ?');
const addScannedFile = db.prepare(`
  INSERT INTO scanned_files 
  (library_id, file_path, file_modified_time, last_scanned_time, verification_image_path, match_score, is_verified, episode_info) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateScannedFile = db.prepare(`
  UPDATE scanned_files 
  SET last_scanned_time = ?, verification_image_path = ?, match_score = ?, is_verified = ?, episode_info = ? 
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
    
    console.log(`[ROUTE] Running clip-matcher on: ${episodePath}`);
    
    // Setup parameters for clip-matcher.py
    const clipMatcherPath = path.join(__dirname, 'scripts', 'clip-matcher.py');
    
    // Create a promise to handle the async process
    const matchPromise = new Promise((resolve) => {
      // Build command to run the Python script directly without using the wrapper
      const process = spawn('python3', [
        clipMatcherPath,
        episodePath,
        '--max-stills', '2'
        // Use default threshold (0.90) which is set in the script
        // Not using --cpu flag to ensure GPU is used if available
      ]);
      
      let stdoutData = '';
      // Capture stdout data
      process.stdout.on('data', (data) => {
        const dataStr = data.toString();
        stdoutData += dataStr;
        console.log(`[CLIP-MATCHER] ${dataStr.trim()}`);
      });
      
      // Capture stderr data
      process.stderr.on('data', (data) => {
        const dataStr = data.toString();
        console.error(`[CLIP-MATCHER ERROR] ${dataStr.trim()}`);
      });
      
      // Handle process completion
      process.on('close', (code) => {
        console.log(`[CLIP-MATCHER] Process exited with code ${code}`);
        
        if (code === 0) {
          try {
            // Extract only the important information from the output
            const lines = stdoutData.split('\n');
            
            // Extract match status
            const isVerified = stdoutData.includes('✓ VERIFIED');
            
            // Extract best match score
            let bestMatch = 0;
            const matchScoreLine = lines.find(line => line.includes('Best match:'));
            if (matchScoreLine) {
              const match = matchScoreLine.match(/Best match: ([\d.]+)/);
              if (match) bestMatch = parseFloat(match[1]);
            }

            // Extract episode detection
            let episode = '';
            const episodeLine = lines.find(line => line.includes('Episode:'));
            if (episodeLine) {
              episode = episodeLine.replace('Episode:', '').trim();
            }
            
            // Extract processing time
            let processingTime = '';
            const timeLine = lines.find(line => line.includes('Total processing time:'));
            if (timeLine) {
              processingTime = timeLine.replace('Total processing time:', '').trim();
            }
            
            // Extract paths to verification images
            let verificationPath = '';
            const verificationLine = lines.find(line => line.includes('Verification images saved to:'));
            if (verificationLine) {
              verificationPath = verificationLine.replace('Verification images saved to:', '').trim();
            }
            
            // Extract best matching still number
            let bestMatchingStill = '';
            const bestStillLine = lines.find(line => line.includes('Best matching still:'));
            if (bestStillLine) {
              bestMatchingStill = bestStillLine.replace('Best matching still:', '').trim();
            }
            
            resolve({
              success: true,
              verified: isVerified,
              matchScore: bestMatch,
              episode: episode,
              processingTime: processingTime,
              verificationPath: verificationPath,
              bestStill: bestMatchingStill,
              usingGPU: stdoutData.includes('Using device: cuda')
            });
          } catch (error) {
            console.error(`[CLIP-MATCHER] Error parsing results: ${error.message}`);
            resolve({ 
              success: false, 
              error: 'Error parsing results'
            });
          }
        } else {
          resolve({ 
            success: false, 
            error: `Process exited with code ${code}`
          });
        }
      });
      
      // Handle process errors
      process.on('error', (err) => {
        console.error(`[CLIP-MATCHER] Failed to start process: ${err.message}`);
        resolve({ success: false, error: `Failed to start process: ${err.message}` });
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
  console.log('[ROUTE] GET /api/history');
  try {
    const history = getScannedFiles.all();
    console.log(`[ROUTE] Returning ${history.length} scanned files`);
    res.json(history);
  } catch (error) {
    console.error('[ERROR] Failed to get scan history:', error);
    res.status(500).json({ error: 'Failed to get scan history from database' });
  }
});
console.log('[ROUTE] Registered route: GET /api/history');

// Global variable to track scan status
let scanStatus = {
  isScanning: false,
  totalFiles: 0,
  processedFiles: 0,
  currentFile: '',
  startTime: null,
  errors: []
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
const copyVerificationImage = async (sourcePath) => {
  if (!sourcePath) return null;
  
  try {
    // Extract the filename from the source path
    const filename = path.basename(sourcePath);
    
    // Create a destination path in the public/matches folder
    const destDir = path.join(publicDir, 'matches');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    const destPath = path.join(destDir, filename);
    
    // Copy the file
    await fs.promises.copyFile(sourcePath, destPath);
    
    // Return the relative path for storing in the database
    return `/matches/${filename}`;
  } catch (error) {
    console.error(`[ERROR] Failed to copy verification image:`, error);
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
      errors: []
    };
    
    // Get all libraries
    const libraries = getLibraries.all();
    
    // Start the scan process asynchronously
    processScan(libraries).catch(error => {
      console.error('[ERROR] Scan process failed:', error);
      scanStatus.isScanning = false;
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
    res.status(500).json({ error: 'Failed to start scan' });
  }
});
console.log('[ROUTE] Registered route: POST /api/scan');

// GET /api/scan/status - Get current scan status
app.get('/api/scan/status', (req, res) => {
  console.log('[ROUTE] GET /api/scan/status');
  res.json(scanStatus);
});
console.log('[ROUTE] Registered route: GET /api/scan/status');

// Helper function to run the clip-matcher.py script
async function runClipMatcher(filePath) {
  return new Promise((resolve) => {
    console.log(`[CLIP-MATCHER] Running clip-matcher.py on: ${filePath}`);
    
    // Build the path to the script
    const clipMatcherPath = path.join(__dirname, 'scripts', 'clip-matcher.py');
    
    // Build command to run the Python script
    const process = spawn('python3', [
      clipMatcherPath,
      filePath,
      '--max-stills', '2'
      // Use default threshold (0.90) which is set in the script
    ]);
    
    let stdoutData = '';
    let stderrData = '';
    
    // Capture stdout data
    process.stdout.on('data', (data) => {
      const dataStr = data.toString();
      stdoutData += dataStr;
      console.log(`[CLIP-MATCHER] ${dataStr.trim()}`);
    });
    
    // Capture stderr data
    process.stderr.on('data', (data) => {
      const dataStr = data.toString();
      stderrData += dataStr;
      console.error(`[CLIP-MATCHER ERROR] ${dataStr.trim()}`);
    });
    
    // Handle process completion
    process.on('close', (code) => {
      console.log(`[CLIP-MATCHER] Process exited with code ${code}`);
      
      if (code === 0) {
        try {
          // Extract only the important information from the output
          const lines = stdoutData.split('\n');
          
          // Extract match status
          const isVerified = stdoutData.includes('✓ VERIFIED');
          
          // Extract best match score
          let bestMatch = 0;
          const matchScoreLine = lines.find(line => line.includes('Best match:'));
          if (matchScoreLine) {
            const match = matchScoreLine.match(/Best match: ([\d.]+)/);
            if (match) bestMatch = parseFloat(match[1]);
          }
          
          // Extract episode detection
          let episode = '';
          const episodeLine = lines.find(line => line.includes('Episode:'));
          if (episodeLine) {
            episode = episodeLine.replace('Episode:', '').trim();
          }
          
          // Extract processing time
          let processingTime = '';
          const timeLine = lines.find(line => line.includes('Total processing time:'));
          if (timeLine) {
            processingTime = timeLine.replace('Total processing time:', '').trim();
          }
          
          // Extract paths to verification images
          let verificationPath = '';
          const verificationLine = lines.find(line => line.includes('Verification images saved to:'));
          if (verificationLine) {
            verificationPath = verificationLine.replace('Verification images saved to:', '').trim();
          }
          
          // Extract best matching still number
          let bestMatchingStill = '';
          const bestStillLine = lines.find(line => line.includes('Best matching still:'));
          if (bestStillLine) {
            bestMatchingStill = bestStillLine.replace('Best matching still:', '').trim();
          }
          
          resolve({
            success: true,
            verified: isVerified,
            matchScore: bestMatch,
            episode: episode,
            processingTime: processingTime,
            verificationPath: verificationPath,
            bestStill: bestMatchingStill,
            usingGPU: stdoutData.includes('Using device: cuda')
          });
        } catch (error) {
          console.error(`[CLIP-MATCHER] Error parsing results: ${error.message}`);
          resolve({ 
            success: false, 
            error: `Error parsing results: ${error.message}`
          });
        }
      } else {
        resolve({ 
          success: false, 
          error: `Process exited with code ${code}: ${stderrData}`
        });
      }
    });
    
    // Handle process errors
    process.on('error', (err) => {
      console.error(`[CLIP-MATCHER] Failed to start process: ${err.message}`);
      resolve({ success: false, error: `Failed to start process: ${err.message}` });
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
  try {
    // Find all media files in all libraries
    let allFiles = [];
    
    for (const library of libraries) {
      console.log(`[SCAN] Finding media files in library: ${library.title} (${library.path})`);
      const libraryFiles = await findMediaFiles(library.path, library.id);
      allFiles.push(...libraryFiles);
    }
    
    scanStatus.totalFiles = allFiles.length;
    console.log(`[SCAN] Found ${allFiles.length} media files to process`);
    
    // Process each file
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      scanStatus.processedFiles = i;
      scanStatus.currentFile = file.path;
      
      try {
        // Check if file has been scanned before
        const existingRecord = getScannedFileByPath.get(file.path);
        
        // Get file stats to check modification time
        const stats = await fs.promises.stat(file.path);
        const modifiedTime = Math.floor(stats.mtimeMs);
        
        // Skip if file hasn't changed since last scan
        if (existingRecord && existingRecord.file_modified_time === modifiedTime) {
          console.log(`[SCAN] Skipping unchanged file: ${file.path}`);
          continue;
        }
        
        console.log(`[SCAN] Processing file: ${file.path}`);
        
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
            verificationImagePath = await copyVerificationImage(bestMatchPath);
          }
          
          // Ensure all values are valid SQLite types
          const now = Math.floor(Date.now());
          const sanitizedLibraryId = sanitizeForSQLite(file.libraryId);
          const sanitizedFilePath = sanitizeForSQLite(file.path);
          const sanitizedModifiedTime = sanitizeForSQLite(modifiedTime);
          const sanitizedScanTime = sanitizeForSQLite(now);
          const sanitizedImagePath = sanitizeForSQLite(verificationImagePath);
          const sanitizedMatchScore = sanitizeForSQLite(
            typeof matchResult.matchScore === 'number' ? matchResult.matchScore : 0
          );
          const sanitizedIsVerified = sanitizeForSQLite(matchResult.verified === true ? 1 : 0);
          const sanitizedEpisode = sanitizeForSQLite(
            typeof matchResult.episode === 'string' ? matchResult.episode : fileName
          );
          
          if (existingRecord) {
            // Update existing record
            console.log(`[DB] Updating record for ${file.path}`);
            updateScannedFile.run(
              sanitizedScanTime,
              sanitizedImagePath,
              sanitizedMatchScore,
              sanitizedIsVerified,
              sanitizedEpisode,
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
          // Even if the matching process failed, still update the database with the error
          console.error(`[ERROR] Clip matcher failed for ${file.path}: ${matchResult.error}`);
          
          // Update with error info but keep existing verification image if any
          const now = Math.floor(Date.now());
          let publicImagePath = null;
          
          // Use existing verification image if available
          if (existingRecord && existingRecord.verification_image_path) {
            publicImagePath = existingRecord.verification_image_path;
          }
          
          // Ensure we're only storing valid SQLite types
          const errorMessage = typeof matchResult.error === 'string' ? 
            `Error: ${matchResult.error}` : 'Error during processing';
            
          const sanitizedLibraryId = sanitizeForSQLite(file.libraryId);
          const sanitizedFilePath = sanitizeForSQLite(file.path);
          const sanitizedModifiedTime = sanitizeForSQLite(modifiedTime);
          const sanitizedScanTime = sanitizeForSQLite(now);
          const sanitizedImagePath = sanitizeForSQLite(publicImagePath);
          const sanitizedErrorMessage = sanitizeForSQLite(errorMessage);
          
          if (existingRecord) {
            // Update existing record with error status
            console.log(`[DB] Updating record with error for ${file.path}`);
            updateScannedFile.run(
              sanitizedScanTime,
              sanitizedImagePath,
              0, // Zero match score to indicate failure
              0, // Not verified
              sanitizedErrorMessage, // Store error in episode info
              sanitizedFilePath
            );
          } else {
            // Create new record with error status
            console.log(`[DB] Inserting new record with error for ${file.path}`);
            addScannedFile.run(
              sanitizedLibraryId,
              sanitizedFilePath,
              sanitizedModifiedTime,
              sanitizedScanTime,
              sanitizedImagePath,
              0, // Zero match score to indicate failure
              0, // Not verified
              sanitizedErrorMessage // Store error in episode info
            );
          }
          
          scanStatus.errors.push(`Failed to process ${file.path}: ${matchResult.error}`);
        }
      } catch (error) {
        console.error(`[ERROR] Failed to process file ${file.path}:`, error);
        scanStatus.errors.push(`Failed to process ${file.path}: ${error.message}`);
      }
    }
    
    // Update final status
    scanStatus.processedFiles = allFiles.length;
    scanStatus.currentFile = '';
    scanStatus.isScanning = false;
    
    console.log(`[SCAN] Scan completed. Processed ${allFiles.length} files with ${scanStatus.errors.length} errors.`);
  } catch (error) {
    console.error('[ERROR] Scan process failed:', error);
    scanStatus.isScanning = false;
    scanStatus.errors.push(`Scan process failed: ${error.message}`);
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
