import path from 'path';
import Database from 'better-sqlite3';
import fs from 'fs';

const isTest = process.env.NODE_ENV === 'test';
const dbPath = isTest
  ? ':memory:'
  : path.join(__dirname, '..', 'libraries.db');

// Ensure database directory exists in production
if (!isTest) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = new Database(dbPath);

// Create libraries table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('movie', 'tv')),
    is_enabled INTEGER DEFAULT 1 NOT NULL CHECK(is_enabled IN (0, 1))
  );

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
  );

  CREATE INDEX IF NOT EXISTS idx_scanned_files_path ON scanned_files(file_path);
  CREATE INDEX IF NOT EXISTS idx_scanned_files_library ON scanned_files(library_id);
`);

// Migrate: add Sonarr and Radarr API key columns if missing
// SQLite will ignore these if columns already exist
try {
  db.exec('ALTER TABLE libraries ADD COLUMN sonarr_api_key TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE libraries ADD COLUMN radarr_api_key TEXT');
} catch (_) {}

// Create scanned_files table to track processed media files
// This can remain here or be moved later if desired
// ... existing scanned_files table creation ...
// (omitted for brevity, since controllers will only use libraries now)

export default db; 