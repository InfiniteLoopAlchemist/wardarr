#!/bin/bash

# Match episode video file against TMDB stills using CLIP
# Usage: ./match-episode.sh <path-to-video-file> [similarity-threshold] [--cpu] [--max-stills=N] [--strict]

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
REPO_DIR="$( dirname "$SCRIPT_DIR" )"

# Check if first arg is provided
if [ -z "$1" ]; then
  echo "Usage: ./match-episode.sh <path-to-video-file> [similarity-threshold] [--cpu] [--max-stills=N] [--strict]"
  exit 1
fi

# Activate virtual environment
source "$REPO_DIR/venv/bin/activate"

# Set default parameters
THRESHOLD=${1:-0.9}
CPU_FLAG=""
MAX_STILLS="--max-stills=2"
STRICT_FLAG=""

# Check if second arg is a number (threshold) or a flag
if [[ "$2" =~ ^[0-9.]+$ ]]; then
  THRESHOLD="$2"
  # Start parsing from third argument
  ARGS=("${@:3}")
else
  # Start parsing from second argument
  ARGS=("${@:2}")
fi

# Parse all remaining arguments
for arg in "${ARGS[@]}"; do
  if [[ "$arg" == "--cpu" ]]; then
    CPU_FLAG="--cpu"
  elif [[ "$arg" == "--strict" ]]; then
    STRICT_FLAG="--strict"
  elif [[ "$arg" == --max-stills=* ]]; then
    MAX_STILLS="$arg"
  fi
done

# Run the Python script
echo "Running: python \"$SCRIPT_DIR/clip-matcher.py\" \"$1\" --threshold \"$THRESHOLD\" $CPU_FLAG $MAX_STILLS $STRICT_FLAG"
python "$SCRIPT_DIR/clip-matcher.py" "$1" --threshold "$THRESHOLD" $CPU_FLAG $MAX_STILLS $STRICT_FLAG

# Get the exit code
EXIT_CODE=$?

# Deactivate virtual environment
deactivate

# Exit with the same code as the Python script
exit $EXIT_CODE 