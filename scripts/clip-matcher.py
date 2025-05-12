#!/usr/bin/env python3

import os
import sys
import json
import argparse
import subprocess
import requests
import shutil
import traceback
import warnings
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from pathlib import Path
import re
import torch
from transformers import ViTImageProcessor, ViTModel
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
import time
import sqlite3
import math

# Filter out the specific HuggingFace warning about resume_download
warnings.filterwarnings("ignore", message=".*resume_download.*", category=FutureWarning)

# Load environment variables from .env (verbose override)
load_dotenv(verbose=True, override=True)

# Check for GPU availability
device = torch.device('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
print(f"Using device: {device}")

# TMDB API key - Read from environment variable
TMDB_API_KEY = os.getenv('TMDB_API_KEY')
if not TMDB_API_KEY:
    print("ERROR: TMDB_API_KEY not found in environment variables or .env file.")
    sys.exit(1) # Exit if key is missing

# TheTVDB API key - Read from environment variable
TVDB_API_KEY = os.getenv('TVDB_API_KEY')
if not TVDB_API_KEY:
    print("WARNING: TVDB_API_KEY not found; TVDB integration disabled.")
TVDB_API_BASE_URL = 'https://api4.thetvdb.com/v4'
TVDB_IMAGE_BASE_URL = 'https://artworks.thetvdb.com/banners/'

# OMDb API key - Read from environment variable
OMDB_API_KEY = os.getenv('OMDB_API_KEY')
if not OMDB_API_KEY:
    print("WARNING: OMDB_API_KEY not found; Omdb integration disabled.")
OMDB_BASE_URL = 'http://www.omdbapi.com/'

TMDB_BASE_URL = 'https://api.themoviedb.org/3'
TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original'

# Early stopping threshold (stop processing more stills if a match exceeds this)
EARLY_STOP_THRESHOLD = 0.79

# Temp directory
TEMP_DIR = 'temp'

# Output directory for verification images
VERIFY_DIR = 'verification'

# Frame extraction rate (1 frame per second)
FRAME_RATE = 1

# Initialize SQLite DB connection for TVDB token caching
DB_PATH = Path(__file__).parent.parent / 'libraries.db'
_conn = sqlite3.connect(str(DB_PATH))
wardarr = _conn.cursor()
wardarr.execute('CREATE TABLE IF NOT EXISTS tvdb_token_cache (token TEXT, timestamp REAL)')
_conn.commit()

def get_tvdb_token():
    """Fetch or retrieve cached TVDB v4 API JWT token."""
    try:
        # Attempt to read cached token from DB
        wardarr.execute('SELECT token, timestamp FROM tvdb_token_cache LIMIT 1')
        row = wardarr.fetchone()
        if row:
            token, ts = row
            if token and ts and time.time() - ts < 30 * 24 * 3600:
                print(f"[TVDB] Using cached token {(time.time()-ts)/3600:.1f}h ago")
                return token
        print("[TVDB] Fetching new token")
        res = requests.post(f"{TVDB_API_BASE_URL}/login", json={"apikey": TVDB_API_KEY})
        res.raise_for_status()
        tok = res.json().get('data', {}).get('token')
        if tok:
            # Store new token in DB
            wardarr.execute('DELETE FROM tvdb_token_cache')
            wardarr.execute(
                'INSERT INTO tvdb_token_cache (token, timestamp) VALUES (?, ?)',
                (tok, time.time())
            )
            _conn.commit()
        return tok
    except Exception as e:
        print(f"[TVDB] Token error: {e}")
        return None

def search_tvdb_series(show_name: str):
    """Search TheTVDB v4 for a series by name."""
    # Normalize whitespace in show name
    show_name = ' '.join(show_name.split())
    token = get_tvdb_token()
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    try:
        print(f"[TVDB] Searching for series: {show_name}")
        # Use the /search endpoint with type=series and q param
        res = requests.get(
            f"{TVDB_API_BASE_URL}/search",
            params={"type": "series", "q": show_name},
            headers=headers
        )
        res.raise_for_status()
        data = res.json().get('data', [])
        if data:
            sid = data[0].get('id')
            print(f"[TVDB] Found series ID: {sid}")
            return sid
    except Exception as e:
        print(f"[TVDB] Error searching series: {e}")
    return None

def search_tmdb_for_show(show_name, year=None):
    """Search TMDB for a show by name and optionally year."""
    try:
        print(f"Searching TMDB for show: {show_name}" + (f" ({year})" if year else ""))
        
        query_params = {
            "api_key": TMDB_API_KEY,
            "query": show_name,
            "language": "en-US",
            "page": 1,
            "include_adult": "false"
        }
        
        if year:
            query_params["first_air_date_year"] = year
            
        response = requests.get(f"{TMDB_BASE_URL}/search/tv", params=query_params)
        
        if response.status_code != 200:
            print(f"TMDB API Error: HTTP {response.status_code} - {response.text}")
            return None
            
        data = response.json()
        
        if not data.get('results') or len(data['results']) == 0:
            print(f"No TV shows found for '{show_name}'")
            return None
            
        # Return the first result's ID
        show = data['results'][0]
        tmdb_id = show['id']
        print(f"Found show: {show['name']} (ID: {tmdb_id})")
        return tmdb_id
        
    except Exception as e:
        print(f"Error searching TMDB: {str(e)}")
        traceback.print_exc()
        return None

def parse_filename(filepath):
    """Extract show, season and episode information from filename."""
    filename = os.path.basename(filepath)
    
    print(f"Analyzing filename: {filename}")
    
    # Extract season and episode information
    match = re.search(r'S(\d+)E(\d+)', filename, re.IGNORECASE)
    
    if match:
        season = int(match.group(1))
        episode = int(match.group(2))
        
        # Try to extract show name before the season/episode info
        show_match = re.search(r'^(.+?)(?:\s*\(|\s*-\s*S\d+|\s*S\d+)', filename, re.IGNORECASE)
        show_name = show_match.group(1).strip() if show_match else "Unknown Show"
        
        # Clean up show name (remove any trailing spaces, dots, or underscores)
        show_name = re.sub(r'[._]+$', '', show_name.strip())
        # Replace dots and underscores with spaces
        show_name = re.sub(r'[._]+', ' ', show_name).strip()
        
        # Look for year in parentheses
        year_match = re.search(r'\((\d{4})\)', filename)
        year = year_match.group(1) if year_match else None
        
        # Look for episode title after S00E00 and before brackets/parentheses
        episode_title_match = re.search(r'S\d+E\d+\s*-\s*([^[\]()]+)', filename, re.IGNORECASE)
        episode_title = episode_title_match.group(1).strip() if episode_title_match else None
        
        # Check for TVDB or IMDB IDs in brackets
        id_match = re.search(r'\[(?:tvdbid|imdb)-(\w+)\]', filename, re.IGNORECASE)
        media_id = id_match.group(1) if id_match else None
        
        # Determine TMDB ID by searching for the show
        tmdb_id = search_tmdb_for_show(show_name, year)
        if not tmdb_id:
            print(f"WARNING: Could not find TMDB ID for '{show_name}'. Using fallback search.")
            # Try searching with just the first part of the show name (before any special characters)
            simplified_name = re.sub(r'[^\w\s].*', '', show_name).strip()
            if simplified_name and simplified_name != show_name:
                tmdb_id = search_tmdb_for_show(simplified_name)
        
        # If we still can't find it, use a safer fallback than hardcoding South Park
        if not tmdb_id:
            print(f"WARNING: Could not find TMDB ID for '{show_name}'. Using internal ID 12345.")
            tmdb_id = 12345  # Use a neutral internal ID that won't match anything
        
        result = {
            "show": show_name,
            "year": year,
            "season": season,
            "episode": episode,
            "episode_title": episode_title,
            "tvdbId": media_id if media_id else None,
            "tmdbId": tmdb_id,
            "original_filename": filename
        }
        
        # Create a formatted display name for the episode
        if episode_title:
            result["display_name"] = f"{show_name} - S{season:02d}E{episode:02d} - {episode_title}"
        else:
            result["display_name"] = f"{show_name} - S{season:02d}E{episode:02d}"
            
        return result
    
    print(f"WARNING: Could not extract season and episode from filename: {filename}")
    return None

def get_episode_images(series_id, season, episode):
    """Get episode images from TMDB."""
    try:
        print(f"Getting images for S{season}E{episode} from series ID {series_id}")
        url = f"{TMDB_BASE_URL}/tv/{series_id}/season/{season}/episode/{episode}/images"
        response = requests.get(url, params={"api_key": TMDB_API_KEY})
        
        if response.status_code != 200:
            print(f"TMDB API Error: HTTP {response.status_code} - {response.text}")
            return None
            
        data = response.json()
        
        if 'stills' not in data or len(data['stills']) == 0:
            print(f"No stills found for S{season}E{episode}")
            return None
            
        return data
    except Exception as e:
        print(f"Error getting episode images: {str(e)}")
        traceback.print_exc()
        return None

def get_tvdb_episode_images(series_id, season, episode):
    '''Get episode images from TheTVDB v4.'''  
    # Normalize series_id: strip 'series-' prefix if present
    series_id_str = str(series_id)
    if series_id_str.startswith("series-"):
        series_id_str = series_id_str.split('-', 1)[1]
    try:
        token = get_tvdb_token()
        if not token:
            return None
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        print(f"[TVDB] Fetching episode via series default endpoint (series_id={series_id_str})")
        res = requests.get(
            f"{TVDB_API_BASE_URL}/series/{series_id_str}/episodes/default",
            params={"season": season, "episodeNumber": episode},
            headers=headers
        )
        res.raise_for_status()
        ep_data = res.json().get('data', {})
        eps = ep_data.get('episodes', [])
        if eps and eps[0].get('image'):
            return [{ 'file_path': eps[0]['image'] }]
        print("[TVDB] No episode image found.")
        return None
    except Exception as e:
        print(f"[TVDB] Error fetching episode stills: {e}")
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
        
        # Check if the video file exists
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file does not exist: {video_path}")
        
        # Extract frames using FFmpeg
        # Resize frames to 720p height for faster processing
        ffmpeg_cmd = f'ffmpeg -y -nostdin -hide_banner -loglevel error -i "{video_path}" -vf "fps={frame_rate},scale=-2:720" -q:v 2 "{output_dir}/frame-%04d.jpg"'
        print(f"Running ffmpeg command: {ffmpeg_cmd}")
        process = subprocess.run(ffmpeg_cmd, shell=True, capture_output=True, text=True)
        print(f"FFmpeg exited with code {process.returncode}")
        print(f"FFmpeg stderr: {process.stderr}")
        
        if process.returncode != 0:
            print(f"FFmpeg error: {process.stderr}")
            raise Exception(f"FFmpeg failed with code {process.returncode}: {process.stderr}")
        
        # Get list of extracted frames
        frame_files = [f for f in os.listdir(output_dir) if f.startswith('frame-')]
        frame_paths = [os.path.join(output_dir, f) for f in sorted(frame_files)]
        
        if not frame_paths:
            print("Warning: No frames were extracted")
            
        print(f"Extracted {len(frame_paths)} frames")
        return frame_paths
    except Exception as e:
        print(f"Error extracting frames: {str(e)}")
        traceback.print_exc()
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
            image = Image.open(frame_path)
            inputs = processor(images=image, return_tensors="pt")
            pixel_values = inputs["pixel_values"].to(device)
            with torch.no_grad():
                outputs = model(pixel_values=pixel_values)
            # Use CLS token embedding only
            frame_embedding = outputs.last_hidden_state[:, 0, :].squeeze().cpu().numpy()
            similarity = cosine_similarity(still_embedding, frame_embedding)
            results.append({"path": frame_path, "similarity": similarity})
        except Exception as e:
            print(f"Error processing frame {frame_path}: {str(e)}")
    return results

def create_comparison_image(still_path, frame_path, output_path, similarity, episode_info=None, source='TMDB'):
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
        comparison = Image.new('RGB', (still_width + frame_width + 10, height + 70), color=(255, 255, 255))
        comparison.paste(still_img, (0, 0))
        comparison.paste(frame_img, (still_width + 10, 0))
        
        # Add text
        draw = ImageDraw.Draw(comparison)
        
        # Try to load a nice font, fall back to default if not available
        try:
            # Use a common font that's likely to be available
            font = ImageFont.truetype("Arial", 14)
            small_font = ImageFont.truetype("Arial", 12)
        except:
            # Fall back to default
            font = ImageFont.load_default()
            small_font = ImageFont.load_default()
        
        draw.text((10, height + 10), f"{source} Still", fill=(0, 0, 0), font=font)
        draw.text((still_width + 20, height + 10), f"Video Frame - Similarity: {similarity:.3f}", fill=(0, 0, 0), font=font)
        
        # Add episode info if available
        if episode_info and episode_info.get('display_name'):
            draw.text((10, height + 35), f"Episode: {episode_info['display_name']}", fill=(0, 0, 0), font=small_font)
            
        # Save comparison image
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        comparison.save(output_path)
        print(f"Saved comparison image: {output_path}")
        return output_path
    except Exception as e:
        print(f"Error creating comparison image: {str(e)}")
        traceback.print_exc()
        return None

def process_media_file(media_path, max_stills=20, strict_mode=False, early_stop_threshold=EARLY_STOP_THRESHOLD, force_still_path=None, model_name_override=None):
    """Main function to process a media file."""
    try:
        import time
        start_time = time.time()
        
        print(f"Processing file: {media_path}")
        print(f"Early stopping threshold: {early_stop_threshold}")
        print(f"Maximum stills to process: {max_stills}")
        print(f"Strict mode: {strict_mode}")
        
        # Parse filename to extract metadata
        file_info = parse_filename(media_path)
        
        if not file_info:
            print("Failed to parse filename")
            return False
        
        print(f"Detected: {file_info['show']} S{file_info['season']}E{file_info['episode']}")
        
        # Create a unique directory for this verification based on the filename
        file_basename = os.path.basename(media_path)
        file_name_without_ext = os.path.splitext(file_basename)[0]
        
        # Create a safe directory name
        safe_dirname = re.sub(r'[^\w\-_]', '_', file_name_without_ext)
        verify_path = os.path.join(VERIFY_DIR, safe_dirname)
        os.makedirs(verify_path, exist_ok=True)
        
        # FETCH STILL IMAGES BEFORE EXTRACTION; gather from all providers and bail if none
        stills_to_process_list = []
        if force_still_path:
            if not os.path.exists(force_still_path):
                print(f"ERROR: Forced still file not found: {force_still_path}")
                return False
            stills_to_process_list.append({ 'file_path': force_still_path, 'source': 'forced' })
        else:
            # OMDb
            if OMDB_API_KEY:
                omdb_images = get_omdb_episode_images(file_info['show'], file_info['season'], file_info['episode'])
                if omdb_images and len(omdb_images) > 0:
                    stills_to_process_list.extend([{ 'file_path': img['file_path'], 'source': 'OMDB' } for img in omdb_images])
            # TVDB
            tvdb_images = None
            tvdb_series_id = file_info.get('tvdbId')
            if not tvdb_series_id:
                tvdb_series_id = search_tvdb_series(file_info['show'])
            if tvdb_series_id and TVDB_API_KEY:
                print(f"[TVDB] Fetching stills for series {tvdb_series_id}")
                tvdb_images = get_tvdb_episode_images(tvdb_series_id, file_info['season'], file_info['episode'])
                if tvdb_images and len(tvdb_images) > 0:
                    stills_to_process_list.extend([{ 'file_path': img['file_path'], 'source': 'TVDB' } for img in tvdb_images])
            # TMDB
            episode_images = get_episode_images(file_info['tmdbId'], file_info['season'], file_info['episode'])
            if episode_images and 'stills' in episode_images and len(episode_images['stills']) > 0:
                stills_to_process_list.extend([{ 'file_path': img['file_path'], 'source': 'TMDB' } for img in episode_images['stills']])
        if not stills_to_process_list:
            print("No episode stills available from any provider")
            return False
        stills_to_process = min(len(stills_to_process_list), max_stills)
        print(f"Found {len(stills_to_process_list)} total stills (will process up to {stills_to_process})")

        # For strict mode, track matches for each still
        still_matches = []

        # Copy media locally for faster I/O (cache in temp)
        os.makedirs(TEMP_DIR, exist_ok=True)
        media_ext = os.path.splitext(media_path)[1]
        local_media_path = os.path.join(TEMP_DIR, safe_dirname + media_ext)
        if not os.path.exists(local_media_path):
            print(f"Copying media to local temp: {local_media_path}")
            try:
                shutil.copy2(media_path, local_media_path)
            except Exception as e:
                print(f"Warning: Failed to copy media to temp: {e}")
                local_media_path = media_path
        else:
            print(f"Local media already cached: {local_media_path}")
        # Extract frames from video (using local copy)
        frames_dir = os.path.join(TEMP_DIR, safe_dirname + "_frames")
        frame_paths = extract_frames(local_media_path, frames_dir, FRAME_RATE)
        
        if len(frame_paths) == 0:
            print("Failed to extract frames from video")
            return False
        
        # Initialize DINO vision transformer model for embeddings
        print("Loading DINO model...")
        MODEL_NAME = model_name_override if model_name_override else "facebook/dino-vitb16"
        model = ViTModel.from_pretrained(MODEL_NAME, add_pooling_layer=False).to(device)
        processor = ViTImageProcessor.from_pretrained(MODEL_NAME)
        print(f"Using DINO model: {MODEL_NAME}")
        
        # Process the specified number of stills
        max_similarity = 0.0
        best_match_frame = None
        best_match_still = None
        best_match_still_path = None
        best_match_source = None
        
        for still_index, still_info in enumerate(stills_to_process_list[:stills_to_process]):
            source = still_info.get('source')
            if source == 'forced':
                still_path = still_info['file_path']
                print(f"\nProcessing forced still #{still_index + 1} (Path: {still_path})")
            else:
                if source == 'TVDB':
                    path_or_url = still_info['file_path']
                    still_url = path_or_url if path_or_url.startswith('http') else f"{TVDB_IMAGE_BASE_URL}{path_or_url}"
                elif source == 'OMDB':
                    still_url = still_info['file_path']
                elif source == 'TMDB':
                    still_url = f"{TMDB_IMAGE_BASE_URL}{still_info['file_path']}"
                else:
                    print(f"Unknown still source '{source}', skipping")
                    continue
                still_path = os.path.join(TEMP_DIR, f"{safe_dirname}_still_{still_index + 1}.jpg")
                print(f"\nProcessing still #{still_index + 1} of {stills_to_process} (source: {source}) URL: {still_url}")
                if not download_image(still_url, still_path):
                    print(f"Failed to download still: {still_url}")
                    continue
            # Get embedding for the reference still
            print(f"Getting embedding for still #{still_index + 1}...")
            # Skip invalid still images that cannot be opened
            try:
                still_image = Image.open(still_path)
            except Exception as e:
                print(f"Warning: Could not open still image {still_path}: {e}")
                # Skip to next still
                continue
            inputs = processor(images=still_image, return_tensors="pt")
            pixel_values = inputs["pixel_values"].to(device)
            with torch.no_grad():
                outputs = model(pixel_values=pixel_values)
            # Use CLS token embedding only
            still_embedding = outputs.last_hidden_state[:, 0, :].squeeze().cpu().numpy()
            
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
                        best_match_source = source
                        print(f"New overall best match: {similarity:.3f} (frame: {os.path.basename(frame_path)}, still: #{still_index + 1})")
                        
                        # Early stopping if we hit the early stop threshold
                        if similarity >= early_stop_threshold:
                            print(f"Early stopping at similarity {similarity:.3f} (≥ {early_stop_threshold})")
                
                # Early stopping after batch if we hit the threshold
                if max_similarity >= early_stop_threshold:
                    print(f"Early stopping processing of frames at similarity {max_similarity:.3f}")
            
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
                create_comparison_image(still_path, still_best_match, comparison_path, still_max_similarity, file_info, source=source)
            
            # Early stopping after processing this still if its best match meets the threshold
            if still_max_similarity >= early_stop_threshold:
                print(f"Early stopping at still #{still_index + 1} - found match with similarity {still_max_similarity:.3f} (≥ {early_stop_threshold})")
                break
        
        # Determine if this is a match based solely on early-stop threshold
        if strict_mode:
            # In strict mode, require all stills to match above threshold
            all_matched = all(match["max_similarity"] >= early_stop_threshold for match in still_matches)
            is_match = all_matched
            print(f"\nStrict mode: Requiring all {len(still_matches)} stills to match above threshold {early_stop_threshold}")
            for match in still_matches:
                print(f"Still #{match['still_index']}: Similarity {match['max_similarity']:.3f} - {'✓' if match['max_similarity'] >= early_stop_threshold else '✗'}")
        else:
            # In normal mode, just need the best match to be above threshold
            is_match = max_similarity >= early_stop_threshold
        
        end_time = time.time()
        total_duration = end_time - start_time
        
        # Create final verification image for the best match
        if best_match_frame and best_match_still_path:
            final_comparison_path = os.path.join(verify_path, "best_match.jpg")
            create_comparison_image(best_match_still_path, best_match_frame, final_comparison_path, max_similarity, file_info, source=best_match_source)
        
        print("\nResults:")
        print("---------")
        print(f"File: {os.path.basename(media_path)}")
        if file_info.get('display_name'):
            print(f"Episode: {file_info['display_name']}")
        else:
            print(f"Episode: {file_info['show']} S{file_info['season']}E{file_info['episode']}")
        print(f"Best match: {max_similarity:.3f} (threshold: {early_stop_threshold})")
        print(f"Match: {'✓ VERIFIED' if is_match else '✗ WRONG EPISODE'}")
        if best_match_frame:
            print(f"Best matching frame: {os.path.basename(best_match_frame)}")
            if best_match_still:
                print(f"Best matching still: #{best_match_still}")
        print(f"Total processing time: {total_duration:.2f} seconds")
        
        # Display path to verification images
        print(f"\nVerification images saved to: {verify_path}")
        print("Please check these images to manually confirm the match.")
        # Cleanup temporary frames directory
        try:
            shutil.rmtree(frames_dir)
            print(f"Deleted temporary frames directory: {frames_dir}")
        except Exception as e:
            print(f"Warning: Failed to delete temporary frames directory {frames_dir}: {e}")
        # Delete local media copy if one was made
        if 'local_media_path' in locals() and local_media_path != media_path:
            try:
                os.remove(local_media_path)
                print(f"Deleted local media copy: {local_media_path}")
            except Exception as e:
                print(f"Warning: Failed to delete local media copy {local_media_path}: {e}")
        # Cleanup temporary stills
        try:
            for fpath in Path(TEMP_DIR).glob(f"{safe_dirname}_still_*.jpg"):
                fpath.unlink()
            print(f"Deleted temporary stills for {safe_dirname}")
        except Exception as e:
            print(f"Warning: Failed to delete temporary stills for {safe_dirname}: {e}")
        return is_match
    
    except Exception as e:
        print(f"Error processing media file: {str(e)}")
        traceback.print_exc()
        return False

def get_omdb_episode_images(show_name: str, season: int, episode: int):
    """Get episode poster from OMDb."""
    try:
        print(f"[OMDB] Fetching episode info: {show_name} S{season}E{episode}")
        res = requests.get(OMDB_BASE_URL, params={"apikey": OMDB_API_KEY, "t": show_name, "Season": season, "Episode": episode})
        res.raise_for_status()
        data = res.json()
        poster = data.get("Poster")
        if poster and poster != "N/A":
            print(f"[OMDB] Found poster: {poster}")
            return [{"file_path": poster}]
        print("[OMDB] No poster found for this episode.")
    except Exception as e:
        print(f"[OMDB] Error fetching episode poster: {e}")
    return None

def main():
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Match TV show episodes with stills')
    parser.add_argument('media_path', help='Path to the media file')
    parser.add_argument('--early-stop', '--threshold', dest='early_stop', type=float, default=EARLY_STOP_THRESHOLD,
                        help=f'Early stopping threshold (default: {EARLY_STOP_THRESHOLD})')
    parser.add_argument('--max-stills', type=int, default=20,
                        help='Maximum number of stills to use from TVDB/TMDB')
    parser.add_argument('--strict', action='store_true',
                        help='Strict mode - only verify if similarity exceeds threshold')
    parser.add_argument('--cpu', action='store_true',
                        help='Force CPU mode even if GPU is available')
    parser.add_argument('--force-still', type=str, default=None,
                        help='Path to a specific still image to use, bypassing TMDB lookup for stills.')
    parser.add_argument('--model-name', type=str, default="facebook/dino-vitb16",
                        help='Name of the CLIP model to use from HuggingFace Transformers.')
    
    # Parse arguments
    args = parser.parse_args()
    
    # If threshold is below default, round up by one hundredth (but not above default)
    if args.early_stop < EARLY_STOP_THRESHOLD:
        bumped = (math.floor(args.early_stop * 100) + 1) / 100.0
        if bumped > EARLY_STOP_THRESHOLD:
            bumped = EARLY_STOP_THRESHOLD
        print(f"[WARNING] Provided threshold {args.early_stop:.2f} is below default {EARLY_STOP_THRESHOLD:.2f}, rounding up to {bumped:.2f}")
        args.early_stop = bumped
    
    # Force CPU if specified
    global device
    if args.cpu:
        device = torch.device('cpu')
        print(f"Forcing CPU mode")
    
    # Process the media file with error handling
    try:
        is_match = process_media_file(args.media_path, args.max_stills, args.strict, args.early_stop, args.force_still, args.model_name)
        # Exit with 0 if match, 1 if no match (standard non-error exit)
        sys.exit(0 if is_match else 1)
    except Exception as e:
        print(f"ERROR: Unhandled exception in main execution: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr) # Print full traceback to stderr
        sys.exit(2) # Use a different exit code for unexpected errors

if __name__ == '__main__':
    # Removed sys.exit(main()) call from here, handled inside main()
    main() 