const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const sharp = require('sharp');
const Jimp = require('jimp');
const ffmpeg = require('fluent-ffmpeg');
const tf = require('@tensorflow/tfjs-node');
const blurhash = require('blurhash');

// Promisify functions
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

/**
 * Analyzes an image with NSFWJS
 * @param {string} imagePath - Path to the image file
 * @param {object} model - Loaded NSFWJS model
 * @returns {Promise<object>} - NSFW classification results
 */
async function analyzeImage(imagePath, model) {
  try {
    // Read the image and decode it
    const buffer = await readFile(imagePath);
    const image = tf.node.decodeImage(buffer, 3);
    
    // Get predictions from the NSFW model
    const predictions = await model.classify(image);
    
    // Dispose the tensor to free memory
    image.dispose();
    
    return predictions;
  } catch (error) {
    console.error(`Error analyzing image ${imagePath}:`, error);
    throw error;
  }
}

/**
 * Generates a perceptual hash for an image using Jimp
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - Image hash
 */
async function generateImageHash(imagePath) {
  try {
    // Load the image with Jimp
    const image = await Jimp.read(imagePath);
    
    // Resize to a smaller size for consistent hashing
    image.resize(32, 32).greyscale();
    
    // Generate a simple perceptual hash
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const pixels = [];
    
    // Get pixel data
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // Since we greyscaled the image, we can use just one channel
        pixels.push(image.bitmap.data[idx]);
      }
    }
    
    // Calculate the average value
    const avg = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;
    
    // Generate the hash string (0 if pixel is below average, 1 if above)
    let hash = '';
    for (const pixel of pixels) {
      hash += pixel < avg ? '0' : '1';
    }
    
    return hash;
  } catch (error) {
    console.error(`Error generating hash for ${imagePath}:`, error);
    throw error;
  }
}

/**
 * Generates a BlurHash for an image
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - BlurHash string
 */
async function generateBlurHash(imagePath) {
  try {
    // Read the image with sharp
    const { data, info } = await sharp(imagePath)
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });
    
    // Convert to blurhash
    const hash = blurhash.encode(
      new Uint8ClampedArray(data), 
      info.width, 
      info.height,
      4, // x components
      3  // y components
    );
    
    return hash;
  } catch (error) {
    console.error(`Error generating blurhash for ${imagePath}:`, error);
    throw error;
  }
}

/**
 * Extracts frames from a video file
 * @param {string} videoPath - Path to the video file
 * @param {string} outputDir - Directory to save extracted frames
 * @param {number} frameRate - Number of frames to extract per second
 * @returns {Promise<string[]>} - Array of paths to extracted frames
 */
async function extractFrames(videoPath, outputDir, frameRate = 1) {
  try {
    // Create output directory if it doesn't exist
    try {
      await stat(outputDir);
    } catch (error) {
      await mkdir(outputDir, { recursive: true });
    }
    
    const outputPattern = path.join(outputDir, 'frame-%04d.jpg');
    
    return new Promise((resolve, reject) => {
      // Get video duration
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        
        const duration = metadata.format.duration;
        const expectedFrames = Math.ceil(duration * frameRate);
        const framePaths = Array.from(
          { length: expectedFrames },
          (_, i) => path.join(outputDir, `frame-${String(i + 1).padStart(4, '0')}.jpg`)
        );
        
        ffmpeg(videoPath)
          .outputOptions([
            `-vf fps=${frameRate}`,
            '-q:v 2'
          ])
          .output(outputPattern)
          .on('end', () => resolve(framePaths))
          .on('error', reject)
          .run();
      });
    });
  } catch (error) {
    console.error(`Error extracting frames from ${videoPath}:`, error);
    throw error;
  }
}

module.exports = {
  analyzeImage,
  generateImageHash,
  generateBlurHash,
  extractFrames
}; 