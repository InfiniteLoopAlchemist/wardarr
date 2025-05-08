import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/database';
import { validatePath } from '@/lib/fileUtils';

// Force Node.js runtime so we can use fs APIs
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const stmt = db.prepare('SELECT * FROM libraries');
    const libraries = stmt.all();
    return NextResponse.json(libraries);
  } catch (error: any) {
    console.error('[API /api/libraries GET] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch libraries' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, path: libPath, type } = body;

    // Basic validation
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid title' }, { status: 400 });
    }
    if (!libPath || typeof libPath !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid path' }, { status: 400 });
    }
    if (!type || !['movie', 'tv'].includes(type)) {
      return NextResponse.json({ error: 'Missing or invalid type (must be "movie" or "tv")' }, { status: 400 });
    }

    // Verify the directory exists and is readable
    const exists = await validatePath(libPath);
    if (!exists) {
      return NextResponse.json({ error: 'Library path does not exist or is not accessible' }, { status: 400 });
    }

    // Insert into database
    const stmt = db.prepare('INSERT INTO libraries (title, path, type) VALUES (?, ?, ?)');
    const result = stmt.run(title, libPath, type);

    return NextResponse.json(
      { message: 'Library added successfully', id: (result as any).lastInsertRowid }
    );
  } catch (error: any) {
    console.error('[API /api/libraries POST] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to add library' },
      { status: 500 }
    );
  }
} 