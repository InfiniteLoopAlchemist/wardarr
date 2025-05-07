# Wardarr: TV Show Library Manager & Verification

Wardarr is a web application for managing TV show libraries and verifying episodes using TMDB stills.

## Project Status (Alpha)

**This is a work in progress and currently in an alpha state. Use at your own risk. Other developers are welcome. I'll eventually get around to making a CONTRIBUTING.md file.**

*   **Started:** May 2025 (Just a few days ago!)
*   **Motivation:** This is my first "vibe code" project.
*   **Known Issues:** Expect rough edges and incomplete features.
*   **Future Plans:** Finish this README, release a Docker Compose setup for easier deployment and use. Also, make a pHash of the verified content so you don't have to process the whole CLIP model again. Additionally, make it work with Radarr and Sonarr so you can quickly blacklist wrong content and run the check again. I might make a DB of pHashes for quicker verification and more.

## Requirements

*   **Node.js:** 20.x or higher
*   **npm or yarn**
*   **Python 3:** For the verification script (`scripts/clip-matcher.py`)
*   **Python Dependencies:** See `requirements.txt` (install via `pip install -r requirements.txt`)
*   **FFmpeg:** Must be installed and available in your system's PATH for frame extraction.
*   **TMDB API Key:** You **MUST** create a `.env` file in the project root with your The Movie Database (TMDB) API key:
    ```.env
    TMDB_API_KEY=YOUR_ACTUAL_API_KEY_HERE
    ```
*   **GPU (Recommended):** While the verification script can run on a CPU, processing will be **significantly faster** with a dedicated GPU. 
    *   **NVIDIA GPUs (CUDA):** Generally provide the best performance.
    *   **Apple Silicon (MPS):** May work (was tested previously on my M1), but primary development is now Linux/NVIDIA, so MPS support might vary.

## Features

*   Library Management: Add TV show libraries.
*   Directory Browser: Browse file system.
*   Show/Season/Episode Browsing: Navigate library structure.
*   **Episode Verification:** Uses TMDB stills and CLIP image similarity to verify episodes.
*   Scan History & Status: Track scanned files and view current scan progress.
*   Settings: Manage application settings (e.g., reset scan history).

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **File Handling**: Node.js fs module, glob pattern matching

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/wardarr.git # Replace with your actual repo URL
    cd wardarr
    ```

2.  Install Node.js dependencies:
    ```bash
    npm install 
    # or
    # yarn install
    ```

3.  Install Python dependencies (preferably in a virtual environment):
    ```bash
    # python -m venv .venv # Optional: Create virtual env
    # source .venv/bin/activate # Optional: Activate virtual env
    pip install -r requirements.txt
    ```

4.  **Create `.env` file:** Create a file named `.env` in the project root and add your TMDB API key as shown in the Requirements section.

5.  **Ensure FFmpeg is installed** and accessible in your PATH.

## Running the Application

1. Start the backend server:
   ```
   npm run server
   ```
   This will start the Express server on port 5000.

2. In a new terminal, start the Next.js frontend:
   ```
   npm run dev
   ```
   This will start the Next.js dev server on port 3000.

3. Access the application at [http://localhost:3000](http://localhost:3000)

## Development

- **Frontend Development**: Run `npm run dev` to start the Next.js development server with hot reloading
- **Backend Development**: Run `npm run dev:server` to start the Express server with nodemon for auto-reloading

## API Endpoints

- `GET /api/libraries`: Get all libraries
- `POST /api/libraries`: Add a new library
- `GET /api/shows?path=...`: Get all shows in a library
- `GET /api/episodes?path=...`: Get all episodes for a show
- `GET /api/browse?path=...`: Browse directories
- `GET /api/stream?path=...`: Stream video files

## License

[MIT](LICENSE)

## Author

John "InfiniteLoopAlchemist" Floyd
