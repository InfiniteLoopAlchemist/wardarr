#!/usr/bin/env python3

import os
import sys
import json
import argparse
import subprocess
import requests
import shutil
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from pathlib import Path
import torch
from transformers import CLIPProcessor, CLIPModel
from concurrent.futures import ThreadPoolExecutor

# Check for GPU availability
device = torch.device('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
print(f"Using device: {device}")

# TMDB API key
TMDB_API_KEY = '44027419f85a28c4be535275eba62ca7'
TMDB_BASE_URL = 'https://api.themoviedb.org/3'
TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original'

# Similarity threshold (0.40 default is stricter than before)
SIMILARITY_THRESHOLD = 0.40

# Temp directory
TEMP_DIR = 'temp'

# Output directory for verification images
VERIFY_DIR = 'verification'

# Frame extraction rate (1 frame per second)
FRAME_RATE = 1

def parse_filename(filepath):
    """Extract show, season and episode information from filename."""
    filename = os.path.basename(filepath)
    
    print(f"Analyzing filename: {filename}")
    
    # Extract season and episode information
    import re
    match = re.search(r'S(\d+)E(\d+)', filename, re.IGNORECASE)
    
    if match:
        season = int(match.group(1))
        episode = int(match.group(2))
        
        return {
            "show": "South Park",  # Hardcoded for now
            "tvdbId": 75897,       # Hardcoded for now
            "tmdbId": 2190,        # Hardcoded for now
            "season": season,
            "episode": episode
        }
    
    return None

def get_episode_images(series_id, season, episode):
    """Get episode images from TMDB."""
    try:
        print(f"Getting images for S{season}E{episode}")
        url = f"{TMDB_BASE_URL}/tv/{series_id}/season/{season}/episode/{episode}/images"
        response = requests.get(url, params={"api_key": TMDB_API_KEY})
        return response.json()
    except Exception as e:
        print(f"Error getting episode images: {str(e)}")
        return None

def download_image(url, output_path):
    """Download an image from URL."""
    try:
        print(f"Downloading image to: {output_path}")
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Download the image
        response = requests.get(url)
        with open(output_path, 'wb') as f:
            f.write(response.content)
            
        print(f"Image saved: {output_path} ({len(response.content)} bytes)")
        return output_path
    except Exception as e:
        print(f"Error downloading image: {str(e)}")
        return None

def extract_frames(video_path, output_dir, frame_rate=1):
    """Extract frames from video at specified rate."""
    try:
        print(f"Extracting frames at {frame_rate} fps...")
        
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Extract frames using FFmpeg
        ffmpeg_cmd = f'ffmpeg -i "{video_path}" -vf "fps={frame_rate}" -q:v 2 "{output_dir}/frame-%04d.jpg"'
        subprocess.run(ffmpeg_cmd, shell=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Get list of extracted frames
        frame_files = [f for f in os.listdir(output_dir) if f.startswith('frame-')]
        frame_paths = [os.path.join(output_dir, f) for f in sorted(frame_files)]
        
        print(f"Extracted {len(frame_paths)} frames")
        return frame_paths
    except Exception as e:
        print(f"Error extracting frames: {str(e)}")
        return []

def cosine_similarity(a, b):
    """Calculate cosine similarity between two vectors."""
    return torch.nn.functional.cosine_similarity(
        torch.tensor(a, device=device).unsqueeze(0), 
        torch.tensor(b, device=device).unsqueeze(0)
    ).item()

def process_batch(batch, still_embedding, processor, model):
    """Process a batch of frames to calculate similarity with the still."""
    results = []
    
    for frame_path in batch:
        try:
            # Load and process the image
            image = Image.open(frame_path)
            inputs = processor(images=image, return_tensors="pt")
            
            # Move inputs to device
            inputs = {k: v.to(device) for k, v in inputs.items()}
            
            # Get image embedding
            with torch.no_grad():
                frame_embedding = model.get_image_features(**inputs).squeeze().cpu().numpy()
            
            # Calculate similarity
            similarity = cosine_similarity(still_embedding, frame_embedding)
            
            results.append({
                "path": frame_path,
                "similarity": similarity
            })
            
        except Exception as e:
            print(f"Error processing frame {frame_path}: {str(e)}")
    
    return results

def create_comparison_image(still_path, frame_path, output_path, similarity):
    """Create a side-by-side comparison image for verification."""
    try:
        # Open images
        still_img = Image.open(still_path)
        frame_img = Image.open(frame_path)
        
        # Resize to match height
        height = 360
        still_width = int((still_img.width / still_img.height) * height)
        frame_width = int((frame_img.width / frame_img.height) * height)
        
        still_img = still_img.resize((still_width, height), Image.LANCZOS)
        frame_img = frame_img.resize((frame_width, height), Image.LANCZOS)
        
        # Create new image with both side by side
        comparison = Image.new('RGB', (still_width + frame_width + 10, height + 50), color=(255, 255, 255))
        comparison.paste(still_img, (0, 0))
        comparison.paste(frame_img, (still_width + 10, 0))
        
        # Add text
        draw = ImageDraw.Draw(comparison)
        draw.text((10, height + 10), f"TMDB Still", fill=(0, 0, 0))
        draw.text((still_width + 20, height + 10), f"Video Frame - Similarity: {similarity:.3f}", fill=(0, 0, 0))
        
        # Save comparison image
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        comparison.save(output_path)
        print(f"Saved comparison image: {output_path}")
        return output_path
    except Exception as e:
        print(f"Error creating comparison image: {str(e)}")
        return None

def process_media_file(media_path, threshold=SIMILARITY_THRESHOLD, max_stills=2, strict_mode=False):
    """Main function to process a media file."""
    try:
        import time
        start_time = time.time()
        
        print(f"Processing file: {media_path}")
        print(f"Using similarity threshold: {threshold}")
        print(f"Maximum stills to process: {max_stills}")
        print(f"Strict mode: {strict_mode}")
        
        # Parse filename to extract metadata
        file_info = parse_filename(media_path)
        
        if not file_info:
            print("Failed to parse filename")
            return False
        
        print(f"Detected: {file_info['show']} S{file_info['season']}E{file_info['episode']}")
        
        # Get episode images from TMDB
        episode_images = get_episode_images(file_info['tmdbId'], file_info['season'], file_info['episode'])
        
        if not episode_images or 'stills' not in episode_images or len(episode_images['stills']) == 0:
            print("No episode stills available")
            return False
        
        # Limit the number of stills to process
        stills_to_process = min(len(episode_images['stills']), max_stills)
        print(f"Found {len(episode_images['stills'])} stills for episode (will process {stills_to_process})")
        
        # Prepare verification directory
        verify_path = os.path.join(VERIFY_DIR, f"{file_info['tmdbId']}_S{file_info['season']}E{file_info['episode']}")
        os.makedirs(verify_path, exist_ok=True)
        
        # Extract frames from video
        frames_dir = os.path.join(TEMP_DIR, f"{file_info['tmdbId']}_S{file_info['season']}E{file_info['episode']}_frames")
        frame_paths = extract_frames(media_path, frames_dir, FRAME_RATE)
        
        if len(frame_paths) == 0:
            print("Failed to extract frames from video")
            return False
        
        # Initialize CLIP model
        print("Loading CLIP model...")
        model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
        processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        
        # Process the specified number of stills
        max_similarity = 0.0
        best_match_frame = None
        best_match_still = None
        best_match_still_path = None
        
        # For strict mode, track matches for each still
        still_matches = []
        
        for still_index, still in enumerate(episode_images['stills'][:stills_to_process]):
            still_url = f"{TMDB_IMAGE_BASE_URL}{still['file_path']}"
            
            # Prepare file path for this still
            still_path = os.path.join(TEMP_DIR, f"{file_info['tmdbId']}_S{file_info['season']}E{file_info['episode']}_still_{still_index + 1}.jpg")
            
            # Download the reference still
            print(f"\nProcessing still #{still_index + 1} of {stills_to_process}")
            download_image(still_url, still_path)
            
            # Get embedding for the reference still
            print(f"Getting embedding for still #{still_index + 1}...")
            still_image = Image.open(still_path)
            still_inputs = processor(images=still_image, return_tensors="pt")
            
            # Move inputs to device
            still_inputs = {k: v.to(device) for k, v in still_inputs.items()}
            
            with torch.no_grad():
                still_embedding = model.get_image_features(**still_inputs).squeeze().cpu().numpy()
            
            # Compare with video frames
            print(f"Comparing still #{still_index + 1} with video frames...")
            still_max_similarity = 0.0
            still_best_match = None
            
            # Process frames in batches
            BATCH_SIZE = 10
            num_batches = (len(frame_paths) + BATCH_SIZE - 1) // BATCH_SIZE
            
            for i in range(num_batches):
                batch = frame_paths[i * BATCH_SIZE:(i + 1) * BATCH_SIZE]
                print(f"Processing frames {i * BATCH_SIZE + 1}-{min((i + 1) * BATCH_SIZE, len(frame_paths))} of {len(frame_paths)}...")
                
                batch_results = process_batch(batch, still_embedding, processor, model)
                
                for result in batch_results:
                    similarity = result["similarity"]
                    frame_path = result["path"]
                    
                    if similarity > still_max_similarity:
                        still_max_similarity = similarity
                        still_best_match = frame_path
                        print(f"New best match for still #{still_index + 1}: {similarity:.3f} (frame: {os.path.basename(frame_path)})")
                    
                    # Update global best match if this is better
                    if similarity > max_similarity:
                        max_similarity = similarity
                        best_match_frame = frame_path
                        best_match_still = still_index + 1
                        best_match_still_path = still_path
                        print(f"New overall best match: {similarity:.3f} (frame: {os.path.basename(frame_path)}, still: #{still_index + 1})")
            
            # Store match for this still for strict mode
            still_matches.append({
                "still_index": still_index + 1,
                "max_similarity": still_max_similarity,
                "best_match": still_best_match,
                "still_path": still_path
            })
            
            # Create comparison image for this still
            if still_best_match:
                comparison_path = os.path.join(verify_path, f"still_{still_index + 1}_match.jpg")
                create_comparison_image(still_path, still_best_match, comparison_path, still_max_similarity)
        
        # Determine if this is a match based on mode
        if strict_mode:
            # In strict mode, require all stills to match above threshold
            all_matched = all(match["max_similarity"] >= threshold for match in still_matches)
            is_match = all_matched
            print(f"\nStrict mode: Requiring all {len(still_matches)} stills to match above threshold {threshold}")
            for match in still_matches:
                print(f"Still #{match['still_index']}: Similarity {match['max_similarity']:.3f} - {'✓' if match['max_similarity'] >= threshold else '✗'}")
        else:
            # In normal mode, just need the best match to be above threshold
            is_match = max_similarity >= threshold
        
        end_time = time.time()
        total_duration = end_time - start_time
        
        # Create final verification image for the best match
        if best_match_frame and best_match_still_path:
            final_comparison_path = os.path.join(verify_path, "best_match.jpg")
            create_comparison_image(best_match_still_path, best_match_frame, final_comparison_path, max_similarity)
        
        print("\nResults:")
        print("---------")
        print(f"File: {os.path.basename(media_path)}")
        print(f"Episode: {file_info['show']} S{file_info['season']}E{file_info['episode']}")
        print(f"Best match: {max_similarity:.3f} (threshold: {threshold})")
        print(f"Match: {'✓ VERIFIED' if is_match else '✗ WRONG EPISODE'}")
        if best_match_frame:
            print(f"Best matching frame: {os.path.basename(best_match_frame)}")
            if best_match_still:
                print(f"Best matching still: #{best_match_still}")
        print(f"Total processing time: {total_duration:.2f} seconds")
        
        # Display path to verification images
        print(f"\nVerification images saved to: {verify_path}")
        print("Please check these images to manually confirm the match.")
        
        return is_match
    
    except Exception as e:
        print(f"Error processing media file: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    parser = argparse.ArgumentParser(description='TMDB Episode Image Matcher using CLIP')
    parser.add_argument('media_path', nargs='?', help='Path to the media file')
    parser.add_argument('--threshold', type=float, default=SIMILARITY_THRESHOLD, 
                        help=f'Similarity threshold (default: {SIMILARITY_THRESHOLD})')
    parser.add_argument('--cpu', action='store_true', help='Force CPU usage even if GPU is available')
    parser.add_argument('--max-stills', type=int, default=2, help='Maximum number of stills to process (default: 2)')
    parser.add_argument('--strict', action='store_true', help='Strict mode: require ALL stills to match above threshold')
    args = parser.parse_args()
    
    if not args.media_path:
        parser.print_help()
        print("\nNotes:")
        print("- Runs ~2 minutes per 40-min episode on a base M1 (1 fps sample, CPU)")
        print("- Default similarity threshold is 0.40")
        print("- Raise to 0.50 for stricter matching, lower to 0.30 for looser matching")
        print("- Use --strict to require ALL stills to match (prevents false positives)")
        print("- Verification images are saved to the 'verification' directory")
        print("- Requires FFmpeg for frame extraction")
        print("- Requires PyTorch and Transformers libraries")
        sys.exit(0)
    
    # Force CPU if requested
    if args.cpu:
        global device
        device = torch.device('cpu')
        print(f"Forcing CPU usage: {device}")
    
    # Pass the parameters to the function
    is_match = process_media_file(
        args.media_path, 
        threshold=args.threshold, 
        max_stills=args.max_stills,
        strict_mode=args.strict
    )
    sys.exit(0 if is_match else 1)

if __name__ == "__main__":
    main() 