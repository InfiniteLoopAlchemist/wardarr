import * as fs from 'fs';
import * as path from 'path';

// TODO: This should be configurable or imported from a config file
const PUBLIC_DIR_PATH = path.join(process.cwd(), 'public'); // Placeholder

export interface MediaFile {
  path: string;
  libraryId: number | string; // Assuming libraryId could be string or number
}

/**
 * Validates if a path exists and is readable.
 * @param filePath The path to validate.
 * @returns True if the path is valid, false otherwise.
 */
export const validatePath = async (filePath: string): Promise<boolean> => {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch (err: any) {
    console.error(`[PATH VALIDATION ERROR] ${filePath} - ${err.message}`);
    return false;
  }
};

/**
 * Finds all media files in a directory recursively.
 * @param dirPath The directory path to scan.
 * @param libraryId The ID of the library this directory belongs to.
 * @returns A promise that resolves to an array of MediaFile objects.
 */
export const findMediaFiles = async (dirPath: string, libraryId: number | string): Promise<MediaFile[]> => {
  const videoExtensions = ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'];
  const results: MediaFile[] = [];
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
          results.push({ path: fullPath, libraryId: libraryId });
        }
      }
    }
  } catch (error: any) {
    console.error(`[ERROR] Error scanning directory ${dirPath}:`, error.message);
    // Return whatever was found so far, or rethrow if critical
  }
  return results;
};

/**
 * Copies a verification image to a public directory and returns its relative path.
 * @param sourcePath The path to the source image.
 * @param referenceFilePath A path used to generate a unique name for the copied image.
 * @returns A promise that resolves to the relative public path of the copied image, or null on failure.
 */
export const storeVerificationImage = async (sourcePath: string, referenceFilePath: string): Promise<string | null> => {
  if (!sourcePath) {
    return null;
  }

  try {
    console.log(`[IMAGE] Attempting to copy from source: ${sourcePath}`);

    const referenceFileName = path.basename(referenceFilePath || 'unknown');
    const timestamp = Date.now();
    const uniqueFilename = `match_${timestamp}_${referenceFileName.replace(/[^a-zA-Z0-9._-]/g, '_')}.jpg`;

    const destDir = path.join(PUBLIC_DIR_PATH, 'matches');
    if (!fs.existsSync(destDir)) {
      await fs.promises.mkdir(destDir, { recursive: true });
      console.log(`[IMAGE] Created destination directory: ${destDir}`);
    }

    const destPath = path.join(destDir, uniqueFilename);

    try {
      const sourceStats = await fs.promises.stat(sourcePath);
      console.log(`[IMAGE] Source file found: ${sourcePath} (Size: ${sourceStats.size} bytes)`);
      if (sourceStats.size === 0) {
        console.error(`[ERROR] Source verification image exists but is empty (0 bytes): ${sourcePath}`);
        return null;
      }
    } catch (err: any) {
      console.error(`[ERROR] Source verification image not found or not accessible: ${sourcePath}`);
      console.error(`[ERROR] File access error details: ${err.message}`);
      return null;
    }

    try {
      await fs.promises.copyFile(sourcePath, destPath);
      console.log(`[IMAGE] Successfully copied verification image to: ${destPath}`);
      const destStats = await fs.promises.stat(destPath); // Verify copy
      console.log(`[IMAGE] Verified destination file: ${destPath} (Size: ${destStats.size} bytes)`);
    } catch (copyErr: any) {
      console.error(`[ERROR] Failed to copy verification image from ${sourcePath} to ${destPath}`);
      console.error(`[ERROR] Copy error details: ${copyErr.message}`);
      return null;
    }

    const relativePath = `/matches/${uniqueFilename}`;
    console.log(`[IMAGE] Using relative path for database: ${relativePath}`);
    return relativePath;

  } catch (error: any) {
    console.error(`[ERROR] Failed to copy verification image:`, error.message);
    console.error(`[ERROR] Source path: ${sourcePath}, Reference file: ${referenceFilePath}`);
    return null;
  }
};

/**
 * Gets file statistics.
 * @param filePath The path to the file.
 * @returns A promise that resolves to fs.Stats object or null if an error occurs.
 */
export const getFileStats = async (filePath: string): Promise<fs.Stats | null> => {
  try {
    return await fs.promises.stat(filePath);
  } catch (error: any) {
    console.error(`[ERROR] Failed to get stats for file ${filePath}: ${error.message}`);
    return null;
  }
}; 