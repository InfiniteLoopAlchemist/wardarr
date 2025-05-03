# Wardarr: TV Show Library Manager

Wardarr is a simple web application for managing and streaming TV show libraries, particularly designed for libraries in the format used by Sonarr, Radarr, and similar media management tools.

## Features

- **Library Management**: Add and manage multiple TV show libraries
- **Directory Browser**: Easily browse your file system to find TV show libraries
- **Show Discovery**: Automatically detect TV shows in your libraries
- **Episode Browsing**: Browse episodes by season
- **Video Streaming**: Stream video files directly in the browser

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **File Handling**: Node.js fs module, glob pattern matching

## Prerequisites

- Node.js 16.x or higher
- npm or yarn

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/wardarr.git
   cd wardarr
   ```

2. Install dependencies:
   ```
   npm install
   ```

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

MIT

## Author

Your Name
