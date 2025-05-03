const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
// const { glob } = require('glob'); // Commented out

const app = express();
const PORT = process.env.PORT || 5000;

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
const server = require('http').createServer(app);

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
  verify: (req, res, buf, encoding) => {
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

// In-memory storage for libraries
let libraries = [];

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
  console.log('[ROUTE] GET /api/libraries - Returning:', libraries);
  res.json(libraries);
});
console.log('[ROUTE] Registered route: GET /api/libraries');

// POST /api/libraries
app.post('/api/libraries', async (req, res) => {
  console.log('[ROUTE] POST /api/libraries', req.body);

  if (!req.body.path) {
    return res.status(400).json({ error: 'Missing path in request body' });
  }
  
  // Validate the path exists
  const exists = await validatePath(req.body.path);
  if (!exists) {
    return res.status(400).json({ error: 'Library path does not exist or is not accessible' });
  }
  
  libraries.push(req.body);
  res.json({ message: 'Library added successfully' });
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
      // Return the list of libraries
      console.log('[ROUTE] Returning libraries list');
      return res.json(libraries);
    
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
    
    // Use child_process to run the Python script
    const { spawn } = require('child_process');
    
    // Create a promise to handle the async process
    const matchPromise = new Promise((resolve, reject) => {
      // Build command to run the Python script with the correct arguments
      // Process 2 stills to find the best match between them
      const process = spawn('python3', [
        clipMatcherPath,
        episodePath,
        '--max-stills', '2'
        // Use default threshold (0.90) which is set in the script
        // Not using --cpu flag to ensure GPU is used if available
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
        reject({ success: false, error: `Failed to start process: ${err.message}` });
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

console.log('[SERVER] Attempting to start server listening...');

// Use the HTTP server instead of app.listen
server.listen(PORT, () => {
  console.log(`[SERVER] Node.js backend running on http://localhost:${PORT}`);
  console.log(`[SERVER] Test server running. Try accessing http://localhost:${PORT}/test or http://localhost:${PORT}/api/libraries`);
}); 

// Add global error handlers
process.on('uncaughtException', (err) => {
  console.error(`[FATAL ERROR] Uncaught exception: ${err.message}`);
  console.error(err.stack);
  process.exit(1); //mandatory (as per the Node.js docs)
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL ERROR] Unhandled Rejection at:', promise);
  console.error('[FATAL ERROR] Reason:', reason);
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