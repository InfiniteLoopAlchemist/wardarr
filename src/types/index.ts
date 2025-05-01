export interface ImageAnalysis {
  id?: number;
  path: string;
  hash: string;
  nsfwScore?: number;
  createdAt?: string;
}

export interface NSFWPrediction {
  className: string;
  probability: number;
}

export interface FrameResult {
  path: string;
  hash: string;
  predictions: NSFWPrediction[];
  highestNSFWScore?: number;
}

export interface VideoAnalysisResult {
  videoPath: string;
  frames: FrameResult[];
  overallScore: number;
} 