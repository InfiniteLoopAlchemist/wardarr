# Wardarr

A Next.js application with Express backend for media processing, featuring NSFW content detection, image hashing, and SQLite storage.

## Tech Stack

- **Frontend**: Next.js with TypeScript and Tailwind CSS
- **Backend**: Express.js 
- **Database**: SQLite (via better-sqlite3)
- **AI**: NSFWJS for content detection
- **Media Processing**: FFmpeg for video processing
- **Image Analysis**: Sharp, Jimp, and BlurHash for image processing and perceptual hashing

## Prerequisites

- Node.js (v18+)
- FFmpeg installed on your system
- (Optional) Visual Studio Code

## Getting Started

1. Clone the repository
```bash
git clone https://github.com/yourusername/wardarr.git
cd wardarr
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm run dev:server
```

4. Open your browser and navigate to http://localhost:3000

## Scripts

- `npm run dev` - Run Next.js development server only
- `npm run dev:server` - Run the complete application with Express backend (using nodemon)
- `npm run build` - Build the Next.js application
- `npm run start` - Start the Next.js production server
- `npm run server` - Start the Express server (production mode)
- `npm run lint` - Run ESLint

## Project Structure

- `/pages` - Next.js pages
- `/components` - React components
- `/public` - Static assets
- `/styles` - CSS and Tailwind styles
- `/server.js` - Express server setup
- `/lib` - Utility functions and shared code

## License

MIT
