export {};
// Removed ts-nocheck; this file is now a module

const express = require('express');
import { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer, Server as HTTPServer } from 'http';
import { spawn } from 'child_process';
const { browseRoot, browseLevel } = require('./src/controllers/browseController.ts');
const { handleMatch } = require('./src/controllers/matchController.ts');
const { startScan, getScanStatus, stopScan } = require('./src/controllers/scanController.ts');
const { getLatestVerification, getLatestMatch } = require('./src/controllers/latestController.ts');
const { getQueue, clearQueue } = require('./src/controllers/queueController.ts');
const { getSeries } = require('./src/controllers/seriesController.ts');
const { getMovies } = require('./src/controllers/moviesController.ts');
const { getSeriesDetail } = require('./src/controllers/seriesDetailController.ts');
const { testRoute, rootRoute } = require('./src/controllers/healthController.ts');
const { getLibraries: getLibrariesHandler, createLibrary: createLibraryHandler, updateLibrary: updateLibraryHandler, deleteLibrary: deleteLibraryHandler } = require('./src/controllers/libraryController.ts');
const { getContent, legacyShows, legacySeasons, legacyEpisodes, pathBased: contentPathBased } = require('./src/controllers/contentController.ts');
// Import core logic and status from serverLogic
const { scanStatus, findMediaFiles, processScan, runClipMatcher, copyVerificationImage, sanitizeForSQLite } = require('./src/serverLogic.ts');
// Use shared database module for SQLite
const db = require('./src/db.ts').default;
// Directory for public assets and matching logic imported from serverLogic
// [Database tables are initialized in src/db.ts]

// __dirname and __filename are available in CommonJS

const app = express();
const PORT = Number(process.env.PORT ?? '5000'); // Used in server.listen at the bottom of the file

// Enhanced logging middleware

const logRequest = (req: Request, res: Response, next: NextFunction): void => {
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
  res.send = function(body: any): Response<any> {
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
  res.json = function(body: any): Response<any> {
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

// Add middleware to parse JSON and handle errors
app.use(express.json({
  verify: (req: Request, res: Response, buf: Buffer): void => {
    // Skip verification for empty bodies
    if (buf.length === 0) return;
    
    try {
      JSON.parse(buf.toString());
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error(`[JSON PARSE ERROR] Invalid JSON: ${e.message}`);
        res.status(400).send(`Invalid JSON: ${e.message}`);
      } else {
        console.error('[JSON PARSE ERROR] Invalid JSON');
        res.status(400).send('Invalid JSON');
      }
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

// Explicitly set CORS headers for image files
app.use('/matches', (req: Request, res: Response, next: NextFunction): void => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});

// Serve static files
app.use(express.static(publicDir));

console.log('[SERVER] Added JSON parsing middleware and static file handling');

// Database functions for libraries
const getLibrariesStmt = db.prepare('SELECT * FROM libraries');
// Include API key columns for movie and TV libraries
const addLibraryStmt = db.prepare(
  'INSERT INTO libraries (title, path, type, sonarr_api_key, radarr_api_key) VALUES (?, ?, ?, ?, ?)' 
);

// Wrap addLibrary to accept either (title, path, type) or with API keys
const addLibraryWrapper = {
  run: (...args: any[]) => {
    // args: [title, path, type, sonarrKey?, radarrKey?]
    if (args.length === 3) {
      return addLibraryStmt.run(args[0], args[1], args[2], null, null);
    }
    return addLibraryStmt.run(
      args[0], args[1], args[2], args[3] ?? null, args[4] ?? null
    );
  }
};
app.addLibrary = addLibraryWrapper;

// Database functions for scanned files
const getScannedFiles = db.prepare('SELECT * FROM scanned_files');
const getScannedFileByPath = db.prepare('SELECT * FROM scanned_files WHERE file_path = ?');
const getLatestScannedFile = db.prepare('SELECT * FROM scanned_files ORDER BY last_scanned_time DESC LIMIT 1');

// Attach scan state and logic to app
app.getLatestScannedFile = getLatestScannedFile;
app.scanStatus = scanStatus;
app.processScan = processScan;

// Prepare and attach add/update scanned file statements
const addScannedFile = db.prepare(
  `INSERT INTO scanned_files 
  (library_id, file_path, file_modified_time, last_scanned_time, verification_image_path, match_score, is_verified, episode_info) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const updateScannedFile = db.prepare(
  `UPDATE scanned_files 
  SET last_scanned_time = ?, verification_image_path = ?, match_score = ?, is_verified = ?, episode_info = ?, file_modified_time = ? 
    WHERE file_path = ?`
);
app.addScannedFile = addScannedFile;
app.updateScannedFile = updateScannedFile;

// Helper function to validate a path exists
const validatePath = async (filePath: string): Promise<boolean> => {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(`[PATH VALIDATION ERROR] ${filePath} - ${err.message}`);
    } else {
      console.error('[PATH VALIDATION ERROR] Unknown error');
    }
    return false;
  }
};

// Library routes (controller-based)
app.get('/api/libraries', getLibrariesHandler);
app.post('/api/libraries', createLibraryHandler);
app.put('/api/libraries/:id', updateLibraryHandler);
app.delete('/api/libraries/:id', deleteLibraryHandler);

// Path-based content redirection middleware (handles percent-encoded paths)
app.use((req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'GET') {
    const rawUrl = req.originalUrl.split('?')[0];
    const prefix = '/api/path/';
    if (rawUrl.startsWith(prefix)) {
      const after = rawUrl.slice(prefix.length);
      const slashIndex = after.indexOf('/');
      if (slashIndex === -1) {
        const type = after;
        res.status(400).json({ error: `Missing encodedPath parameter for ${type}` });
        return;
      }
      const type = after.slice(0, slashIndex);
      const encoded = after.slice(slashIndex + 1);
      const decoded = decodeURIComponent(encoded);
      // Rewrite request URL to use query-based content endpoint
      req.url = `/api/content/${type}?path=${encodeURIComponent(decoded)}`;
    }
  }
  next();
});

// Content routes
app.get('/api/content/:type', getContent);
// Legacy query-based content
app.get('/api/shows', legacyShows);
app.get('/api/seasons', legacySeasons);
app.get('/api/episodes', legacyEpisodes);

console.log('[ROUTE] Registered backward-compatible routes: GET /api/shows, GET /api/seasons, GET /api/episodes');

// Browse routes
app.get('/api/browse', browseRoot);
console.log('[ROUTE] Registered route: GET /api/browse');

// Add specialized hierarchical browsing paths that match the UI flow
app.get('/api/browse/:level', browseLevel);
console.log('[ROUTE] Registered hierarchical browsing route: GET /api/browse/:level');

// POST /api/match
app.post('/api/match', handleMatch);
console.log('[ROUTE] Registered route: POST /api/match');

// GET /api/queue - Get scan queue
app.get('/api/queue', getQueue);
console.log('[ROUTE] Registered route: GET /api/queue');

// DELETE /api/queue - Clear all scan queue
app.delete('/api/queue', clearQueue);
console.log('[ROUTE] Registered route: DELETE /api/queue');

// Series and Movies endpoints
app.get('/api/series/:id', getSeries);
console.log('[ROUTE] Registered route: GET /api/series/:id');
app.get('/api/movies/:id', getMovies);
console.log('[ROUTE] Registered route: GET /api/movies/:id');

// Series detail endpoint
app.get('/api/series/:libId/:seriesId', getSeriesDetail);
console.log('[ROUTE] Registered route: GET /api/series/:libId/:seriesId');

// POST /api/scan - Start a scan of all libraries
app.post('/api/scan', startScan);
console.log('[ROUTE] Registered route: POST /api/scan');

// GET /api/scan/status - Get current scan status
app.get('/api/scan/status', getScanStatus);
console.log('[ROUTE] Registered route: GET /api/scan/status');

// POST /api/scan/stop - Request to stop the current scan
app.post('/api/scan/stop', stopScan);
console.log('[ROUTE] Registered route: POST /api/scan/stop');

// GET /api/latest-verification - Get most recent verification
app.get('/api/latest-verification', getLatestVerification);
console.log('[ROUTE] Registered route: GET /api/latest-verification');

// GET /api/latest-match - Get latest match image in real-time
app.get('/api/latest-match', getLatestMatch);
console.log('[ROUTE] Registered route: GET /api/latest-match');

// Add a test route
app.get('/test', testRoute);
console.log('[ROUTE] Registered route: GET /test');

// Add a root path handler
app.get('/', rootRoute);
console.log('[ROUTE] Registered route: GET /');

// Add global error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction): void => {
  console.error(`[SERVER ERROR] ${err.stack}`);
  res.status(500).send('Something broke!');
});

// Handle 404 errors for any routes not matched
app.use((req: Request, res: Response): void => {
  console.error(`[404 ERROR] No route found for ${req.method} ${req.url}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// Export the app for integration testing
module.exports = app;
// Expose getLibraries statement for testing
module.exports.getLibraries = getLibrariesStmt;
// Expose getLatestScannedFile statement for testing
module.exports.getLatestScannedFile = getLatestScannedFile;
// Expose server instance for testing
module.exports.server = server;
// Expose scan process and internal helpers for testing
module.exports.processScan = processScan;
module.exports.scanStatus = scanStatus;
module.exports.findMediaFiles = findMediaFiles;
module.exports.getScannedFileByPath = getScannedFileByPath;
module.exports.addScannedFile = addScannedFile;
module.exports.updateScannedFile = app.updateScannedFile;
module.exports.runClipMatcher = runClipMatcher;
module.exports.copyVerificationImage = copyVerificationImage;
// Expose sanitizeForSQLite for testing
module.exports.sanitizeForSQLite = sanitizeForSQLite;
// Expose addLibrary statement for testing
module.exports.addLibrary = app.addLibrary;
// Only start the server if this file is run directly (support ts-node execution)
if (require.main === module) {
  console.log('[SERVER] Attempting to start server listening...');
  // If an ephemeral port (0) was requested, output startup logs synchronously and exit
  if (Number(PORT) === 0) {
    console.log(`[SERVER] Node.js backend running on http://localhost:${PORT}`);
    console.log(`[SERVER] Test server running. Try accessing http://localhost:${PORT}/test or http://localhost:${PORT}/api/libraries`);
    console.log('[SERVER] Server listen call completed');
    process.exit(0);
  }
  // Handle listen errors such as EADDRINUSE
  server.on('error', (err: NodeJS.ErrnoException): void => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[SERVER ERROR] Port ${PORT} is already in use`);
    } else {
      console.error('[SERVER ERROR] Failed to start server:', err);
    }
    process.exit(1);
  });
  // Start listening on the HTTP server we created earlier
  server.listen(PORT, '0.0.0.0', (): void => {
    console.log(`[SERVER] Node.js backend running on http://localhost:${PORT}`);
    console.log(`[SERVER] Test server running. Try accessing http://localhost:${PORT}/test or http://localhost:${PORT}/api/libraries`);
    console.log('[SERVER] Server listen call completed');
  });
}

// Add global error handlers
process.on('uncaughtException', (err: Error): void => {
  console.error(`[FATAL ERROR] Uncaught exception: ${err.message}`);
  console.error(err.stack);
  process.exit(1); //mandatory (as per the Node.js docs)
});

process.on('unhandledRejection', (reason: unknown): void => {
  console.error('[FATAL ERROR] Unhandled Rejection at:', reason);
});

// Log process events
process.on('exit', (code: number): void => {
  console.log(`[PROCESS] Process exiting with code: ${code}`);
});

process.on('SIGINT', (): void => {
  console.log('[PROCESS] Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('[SERVER] Closed all connections');
    process.exit(0);
  });
});

process.on('SIGTERM', (): void => {
  console.log('[PROCESS] Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('[SERVER] Closed all connections');
    process.exit(0);
  });
});
