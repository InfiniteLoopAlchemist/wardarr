import fs from 'fs';

export const validatePath = async (filePath: string): Promise<boolean> => {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch (err: any) {
    console.error(`[PATH VALIDATION ERROR] ${filePath} - ${err.message}`);
    return false;
  }
}; 