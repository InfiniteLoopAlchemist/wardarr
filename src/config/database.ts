import Database from 'better-sqlite3';
import * as path from 'path';

// Types for better-sqlite3 should now be installed via @types/better-sqlite3

const dbPath = path.join(process.cwd(), 'libraries.db');
console.log(`[DB] Initializing database at: ${dbPath}`);

let dbInstance: Database.Database;

try {
  dbInstance = new Database(dbPath, { verbose: console.log });
} catch (error: any) {
  console.error('[DB_ERROR] Failed to open database:', error.message);
  process.exit(1);
}

const createSchema = () => {
  console.log(`[DB] Running schema setup...`);
  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS libraries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('movie', 'tv')),
        is_enabled INTEGER DEFAULT 1 NOT NULL CHECK(is_enabled IN (0, 1))
      )
    `);
    console.log(`[DB] 'libraries' table ensured.`);

    dbInstance.exec(`
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
    console.log(`[DB] 'scanned_files' table ensured.`);

    dbInstance.exec(`
      CREATE INDEX IF NOT EXISTS idx_scanned_files_path ON scanned_files(file_path);
    `);
    console.log(`[DB] Index 'idx_scanned_files_path' ensured.`);

    dbInstance.exec(`
      CREATE INDEX IF NOT EXISTS idx_scanned_files_library ON scanned_files(library_id);
    `);
    console.log(`[DB] Index 'idx_scanned_files_library' ensured.`);

    console.log(`[DB] Schema setup completed successfully.`);
  } catch (error: any) {
    console.error(`[DB_ERROR] Failed to create schema:`, error.message);
    process.exit(1);
  }
};

// Initialize schema
createSchema();

// Graceful shutdown
process.on('exit', () => {
  if (dbInstance && dbInstance.open) {
    dbInstance.close();
    console.log(`[DB] Database connection closed.`);
  }
});

export const db = dbInstance; 