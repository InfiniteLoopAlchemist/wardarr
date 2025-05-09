import { Request, Response } from 'express';
import path from 'path';
import { validatePath } from '../utils';
const { runClipMatcher, copyVerificationImage } = require('../serverLogic.ts');

export const handleMatch = async (req: Request, res: Response) => {
  const episodePath = req.body.episodePath as string;
  if (!episodePath) {
    return res.status(400).json({ error: 'Missing episodePath parameter' });
  }

  const exists = await validatePath(episodePath);
  if (!exists) {
    return res.status(400).json({ error: `Episode file not found or not accessible: ${episodePath}` });
  }

  try {
    const matchResult: any = await runClipMatcher(episodePath);
    let publicImagePath: string | null = null;

    if (matchResult.verificationPath) {
      const bestMatchSource = path.join(matchResult.verificationPath, 'best_match.jpg');
      publicImagePath = await copyVerificationImage(bestMatchSource, episodePath);
    }

    // Attach copied image path if available
    const response = { ...matchResult, verificationPath: publicImagePath };
    return res.json(response);
  } catch (err: any) {
    console.error('[ERROR] Error running clip-matcher:', err);
    return res.status(500).json({ success: false, error: `Failed to run clip-matcher: ${err.message}` });
  }
}; 