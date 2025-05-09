// @ts-nocheck

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Directory for public assets
const publicDir = path.join(__dirname, '..', 'public');

// Thresholds for CLIP matcher
const clipMatcherThreshold = 0.90;
const clipMatcherEarlyStop = 0.96;

// Global scan status object
const scanStatus = {
  isScanning: false,
  totalFiles: 0,
  processedFiles: 0,
  currentFile: '',
  startTime: null,
  errors: [],
  latestMatch: null,
  stopRequested: false
};

// Find all media files in a directory recursively
const findMediaFiles = async (dirPath, libraryId) => {
  const videoExtensions = ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'];
  const results = [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
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
  } catch (err) {
    console.error(`[ERROR] Error scanning directory ${dirPath}:`, err);
    return results;
  }
};

// Copy verification image to public/matches
const copyVerificationImage = async (sourcePath, episodeFilePath) => {
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
  } catch (err) {
    console.error(`[ERROR] Failed to copy verification image:`, err);
    return null;
  }
};

// Run the external clip-matcher Python script
async function runClipMatcher(filePath) {
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
      '--threshold', String(clipMatcherThreshold),
      '--early-stop', String(clipMatcherEarlyStop)
    ];
    const proc = spawn('python3', args);
    let stdoutData = '';
    let stderrData = '';
    let jsonOutput = null;
    let verificationPath = null;
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
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
            console.error('[ERROR] Failed to parse JSON from clip matcher stdout:', parseErr);
          }
        }
      }
    });
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
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
        resolve({ success: false, verified: false, verificationPath, error: `Verification failed: ${errMsg || 'No specific error message.'}`, exitCode: 1 });
      } else {
        resolve({ success: false, error: `Process exited with code ${code}: ${errMsg || 'No specific error message.'}`, exitCode: code, verificationPath });
      }
    });
    proc.on('error', (procErr) => {
      resolve({ success: false, error: `Failed to start process: ${procErr.message}`, verificationPath: null });
    });
  });
}

// Sanitize values for SQLite storage
const sanitizeForSQLite = (value) => {
  if (value === undefined) return null;
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === Infinity || value === -Infinity || Number.isNaN(value)) return null;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
};

// Asynchronous scan processor
async function processScan(libraries) {
  scanStatus.stopRequested = false;
  // Use DB helpers from server and local scan logic functions to avoid circular dependency warnings
  const { getScannedFileByPath: dynGet, addScannedFile: dynAdd, updateScannedFile: dynUpdate } = require('../server.ts');
  const dynFind = findMediaFiles;
  const dynMatch = runClipMatcher;
  const dynCopy = copyVerificationImage;
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
    let latestSuccess = null;
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
          const result = await dynMatch(file.path);
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
  } catch (err) {
    console.error('[ERROR] Scan process failed:', err);
    scanStatus.isScanning = false;
    scanStatus.stopRequested = false;
  }
}

module.exports = { scanStatus, findMediaFiles, copyVerificationImage, runClipMatcher, sanitizeForSQLite, processScan }; 