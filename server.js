const express = require('express');
const next = require('next');
const path = require('path');
const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const Database = require('better-sqlite3');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const imageUtils = require('./lib/imageUtils');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = process.env.PORT || 3000;

// Initialize database
const db = new Database('database.sqlite3', { verbose: console.log });
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    hash TEXT NOT NULL,
    nsfw_score REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

let nsfwModel;

// Function to load the NSFW model
async function loadNsfwModel() {
  try {
    console.log('Loading NSFW model...');
    nsfwModel = await nsfw.load();
    console.log('NSFW model loaded successfully');
  } catch (error) {
    console.error('Error loading NSFW model:', error);
  }
}

app.prepare().then(async () => {
  const server = express();
  
  // Load NSFW model
  await loadNsfwModel();
  
  // Parse JSON request bodies
  server.use(express.json());
  
  // Serve static files
  server.use('/static', express.static(path.join(__dirname, 'public')));
  
  // API routes
  server.get('/api/health', (req, res) => {
    res.json({ status: 'ok', modelLoaded: !!nsfwModel });
  });
  
  // All other routes go to Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });
  
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Error starting server:', err);
  process.exit(1);
}); 