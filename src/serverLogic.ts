import fs, { Dirent } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Directory for public assets
const publicDir = path.join(__dirname, '..', 'public');

// Threshold for CLIP matcher early-stop
const clipMatcherThreshold = 0.87;

// Type for latest successful match result
export type LatestSuccess = {
  path: string;
  imagePath: string;
  matchScore: number;
  isVerified: boolean;
  episodeInfo: string;
  timestamp: number;
};

// Global scan status object
const scanStatus = {
  isScanning: false,
  totalFiles: 0,
  processedFiles: 0,
  currentFile: '',
  startTime: null,
  errors: [],
  latestMatch: null as LatestSuccess | null,
  stopRequested: false
};

// Find all media files in a directory recursively
export const findMediaFiles = async (dirPath: string, libraryId: number): Promise<{ path: string; libraryId: number }[]> => {
  const videoExtensions = ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'];
  const results = [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true }) as Dirent[];
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subResults = await findMediaFiles(fullPath, libraryId);
        results.push(...subResults);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (videoExtensions.includes(ext)) {
          results.push({ path: fullPath, libraryId });
        }
      }
    }
    return results;
  } catch (err: unknown) {
    if (err instanceof Error) console.error(`[ERROR] Error scanning directory ${dirPath}:`, err);
    return results;
  }
};

// Copy verification image to public/matches
export const copyVerificationImage = async (sourcePath: string | null, episodeFilePath?: string): Promise<string | null> => {
  if (!sourcePath) return null;
  try {
    console.log(`[IMAGE] Attempting to copy from source: ${sourcePath}`);
    const episodeFileName = path.basename(episodeFilePath || 'unknown');
    const timestamp = Date.now();
    const uniqueFilename = `match_${timestamp}_${episodeFileName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
    const destDir = path.join(publicDir, 'matches');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
      console.log(`[IMAGE] Created destination directory: ${destDir}`);
    }
    const destPath = path.join(destDir, uniqueFilename);
    // Verify source file exists and is not empty
    try {
      const stats = await fs.promises.stat(sourcePath);
      if (stats.size === 0) {
        console.error(`[ERROR] Source verification image is empty: ${sourcePath}`);
        return null;
      }
    } catch (statErr) {
      console.error(`[ERROR] Cannot access source verification image: ${sourcePath}`, statErr);
      return null;
    }
    await fs.promises.copyFile(sourcePath, destPath);
    return `/matches/${uniqueFilename}`;
  } catch (err: unknown) {
    if (err instanceof Error) console.error(`[ERROR] Failed to copy verification image:`, err);
    return null;
  }
};

// Run the external clip-matcher Python script
export async function runClipMatcher(filePath: string): Promise<any> {
  return new Promise((resolve) => {
    console.log(`[CLIP-MATCHER] Processing file: ${filePath}`);
    const scriptPath = path.join(__dirname, '..', 'scripts', 'clip-matcher.py');
    if (!fs.existsSync(scriptPath)) {
      console.error(`[ERROR] Script not found: ${scriptPath}`);
      resolve({ success: false, error: `Script not found: ${scriptPath}` });
      return;
    }
    const args = [
      scriptPath,
      filePath,
      '--threshold', String(clipMatcherThreshold)
    ];
    const proc = spawn('python3', ['-u', ...args]);
    let stdoutData = '';
    let stderrData = '';
    let jsonOutput: any = null;
    let verificationPath: string | null = null;
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      console.log(`[CLIP-MATCHER][PY] ${text.trim()}`);
      stdoutData += text;
      // Attempt to extract verification path from accumulated stdout data
      const matchOut = stdoutData.match(/Verification images saved to:\s*(.+)/);
      if (matchOut && matchOut[1]) verificationPath = matchOut[1].trim();
      const jsonMatches = text.match(/({[\s\S]*})/g);
      if (jsonMatches) {
        for (const jm of jsonMatches) {
          try {
            jsonOutput = JSON.parse(jm);
          } catch (parseErr) {
            if (parseErr instanceof Error) console.error('[ERROR] Failed to parse JSON from clip matcher stdout:', parseErr);
          }
        }
      }
    });
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      console.error(`[CLIP-MATCHER][PY-ERR] ${text.trim()}`);
      stderrData += text;
      // Attempt to extract verification path from accumulated stderr data
      const matchErr = stderrData.match(/Verification images saved to:\s*(.+)/);
      if (matchErr && matchErr[1]) verificationPath = matchErr[1].trim();
    });
    proc.on('close', (code) => {
      let errMsg = stderrData.trim() || stdoutData.trim();
      if (stderrData) {
        const tb = stderrData.match(/Traceback[\s\S]*?(\w+Error:.+?)(\n|$)/s);
        const simp = stderrData.match(/(\w+Error:.+?)(\n|$)/s);
        if (tb && tb[1]) errMsg = tb[1].trim();
        else if (simp && simp[1]) errMsg = simp[1].trim();
        errMsg = errMsg.replace(/.*FutureWarning:.+?\n/s, '').trim();
      } else if (!stdoutData && !stderrData) {
        errMsg = `Process exited with code ${code} without output.`;
      }
      if (code === 0) {
        if (jsonOutput && typeof jsonOutput === 'object') {
          resolve({
            success: true,
            verified: jsonOutput.verified === true,
            matchScore: typeof jsonOutput.similarity === 'number' ? jsonOutput.similarity : 0,
            episode: typeof jsonOutput.episode_info === 'string' ? jsonOutput.episode_info : path.basename(filePath),
            verificationPath: verificationPath || (jsonOutput.verification_path || null)
          });
        } else {
          let score = 0;
          const m = stdoutData.match(/Best match:\s*([\d.]+)/);
          if (m && m[1]) score = parseFloat(m[1]);
          resolve({ success: true, verified: true, matchScore: score, episode: path.basename(filePath), verificationPath });
        }
      } else if (code === 1) {
        // If script exited with code 1 but produced a verificationPath (TMDB fallback or match ran), treat as success but not verified
        if (verificationPath) {
          // Extract best match score from stdout if available
          let score = 0;
          const m = stdoutData.match(/Best match:\s*([\d.]+)/);
          if (m && m[1]) score = parseFloat(m[1]);
          resolve({
            success: true,
            verified: false,
            matchScore: score,
            episode: path.basename(filePath),
            verificationPath
          });
        } else {
          // No stills found, treat as true failure
          resolve({ success: false, verified: false, verificationPath: null, error: `Verification failed: ${errMsg || 'No specific error message.'}`, exitCode: 1 });
        }
      } else {
        resolve({ success: false, error: `Process exited with code ${code}: ${errMsg || 'No specific error message.'}`, exitCode: code, verificationPath });
      }
    });
    proc.on('error', (procErr) => {
      resolve({ success: false, error: procErr instanceof Error ? `Failed to start process: ${procErr.message}` : 'Failed to start process', verificationPath: null });
    });
  });
}

// Sanitize values for SQLite storage
export const sanitizeForSQLite = (value: any): any => {
  if (value === undefined) return null;
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === Infinity || value === -Infinity || Number.isNaN(value)) return null;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
};

// Asynchronous scan processor
export async function processScan(libraries: { path: string; id: number; is_enabled: number }[]): Promise<void> {
  scanStatus.stopRequested = false;
  // Pull scanning functions and DB helpers from main server export so tests can stub them
  const serverModule = require('../server');
  const dynFind = serverModule.findMediaFiles || findMediaFiles;
  const dynMatch = serverModule.runClipMatcher || runClipMatcher;
  const dynCopy = serverModule.copyVerificationImage || copyVerificationImage;
  const dynGet = serverModule.getScannedFileByPath;
  const dynAdd = serverModule.addScannedFile;
  const dynUpdate = serverModule.updateScannedFile;
  try {
    const enabled = libraries.filter(l => l.is_enabled === 1);
    if (enabled.length === 0) {
      scanStatus.isScanning = false;
      scanStatus.totalFiles = 0;
      scanStatus.processedFiles = 0;
      return;
    }
    let allFiles = [];
    for (const lib of enabled) {
      const files = await dynFind(lib.path, lib.id);
      allFiles.push(...files);
    }
    scanStatus.totalFiles = allFiles.length;
    let latestSuccess: LatestSuccess | null = null;
    for (let i = 0; i < allFiles.length; i++) {
      if (scanStatus.stopRequested) break;
      const file = allFiles[i];
      scanStatus.processedFiles = i;
      scanStatus.currentFile = file.path;
      try {
        const existing = dynGet.get(file.path);
        const stats = await fs.promises.stat(file.path);
        const modTime = Math.floor(stats.mtimeMs);
        let should = !existing || modTime > existing.file_modified_time;
        if (should) {
          // Preload current and next two episodes into temp for faster I/O
          const tempDir = path.join(__dirname, '..', 'temp');
          await fs.promises.mkdir(tempDir, { recursive: true });
          for (let preloadIdx = i; preloadIdx < Math.min(i + 3, allFiles.length); preloadIdx++) {
            const upcoming = allFiles[preloadIdx].path;
            const base = path.basename(upcoming);
            const ext = path.extname(base);
            const nameWithoutExt = ext ? base.slice(0, -ext.length) : base;
            const safeName = nameWithoutExt.replace(/[^\w\-_]/g, '_');
            const destPath = path.join(tempDir, safeName + ext);
            if (!fs.existsSync(destPath)) {
              console.log(`[PRELOAD] Copying ${upcoming} to ${destPath}`);
              try {
                await fs.promises.copyFile(upcoming, destPath);
              } catch (e) {
                console.error(`[PRELOAD] Failed to copy ${upcoming}: ${e}`);
              }
            }
          }
          const result = await dynMatch(file.path);
          if (!result.success) {
            console.error(`[CLIP-MATCHER] Error for file ${file.path}: ${result.error}`);
          }
          let imgPath = null;
          // Attempt to copy new verification image on success
          if (result.success && result.verificationPath) {
            const best = path.join(result.verificationPath, 'best_match.jpg');
            imgPath = await dynCopy(best, file.path);
          // Fallback to existing image if no new one and record exists
          } else if (existing && existing.verification_image_path) {
            imgPath = existing.verification_image_path;
          }
          // Record latest successful match only when new image produced
          if (result.success && result.verificationPath && imgPath) {
            latestSuccess = { path: file.path, imagePath: imgPath, matchScore: result.matchScore, isVerified: result.verified === true, episodeInfo: result.episode, timestamp: Date.now() };
            scanStatus.latestMatch = latestSuccess;
          }
          const now = Math.floor(Date.now());
          const values = [
            sanitizeForSQLite(file.libraryId),
            sanitizeForSQLite(file.path),
            sanitizeForSQLite(modTime),
            sanitizeForSQLite(now),
            sanitizeForSQLite(imgPath),
            sanitizeForSQLite(result.matchScore || 0),
            sanitizeForSQLite(result.verified === true ? 1 : 0),
            sanitizeForSQLite(result.episode)
          ];
          if (existing) {
            dynUpdate.run(values[3], values[4], values[5], values[6], values[7], values[2], values[1]);
          } else {
            dynAdd.run(...values);
          }
        }
      } catch (e) {
        console.error(`[ERROR] Failed to process file ${file.path}:`, e);
      }
    }
    scanStatus.processedFiles = allFiles.length;
    scanStatus.currentFile = '';
    scanStatus.isScanning = false;
    scanStatus.stopRequested = false;
    if (latestSuccess) scanStatus.latestMatch = latestSuccess;
  } catch (err: unknown) {
    if (err instanceof Error) console.error('[ERROR] Scan process failed:', err);
    scanStatus.isScanning = false;
    scanStatus.stopRequested = false;
  }
}

export { scanStatus }; 