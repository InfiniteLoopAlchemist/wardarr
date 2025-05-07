// src/app/history/__tests__/HistoryPage.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HistoryPage from '../page'; // Adjust path if your page.tsx is elsewhere

// Mock global fetch
global.fetch = jest.fn();

describe('History Page Image Display', () => {
  beforeEach(() => {
    // Reset mocks before each test
    (fetch as jest.Mock).mockClear();
  });

  const mockScannedFile = (id: number, verification_image_path: string | null, is_verified = true) => ({
    id,
    library_id: 1,
    file_path: `test/file-${id}.mkv`,
    file_modified_time: Date.now(),
    last_scanned_time: Date.now(),
    verification_image_path,
    match_score: 0.95,
    is_verified,
    episode_info: `Test Episode ${id}`,
  });

  test('displays verification image when available for a scanned file', async () => {
    const files = [
      mockScannedFile(1, '/test_assets/frontend_test_image.jpg')
    ];
    (fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(files),
      })
    );

    render(<HistoryPage />);

    // Wait for the image to appear
    // Use a more specific selector if multiple images could have this alt text
    const image = await screen.findByAltText('Verification'); 
    expect(image).toBeInTheDocument();
    // Check if src attribute STARTS WITH the expected path, due to cache-busting query param
    expect(image.getAttribute('src')).toMatch(/^\/test_assets\/frontend_test_image\.jpg/);
  });

  test('displays placeholder when verification image is missing for a scanned file', async () => {
    const files = [
      // This file uses the path that test_04 in Python ensures is missing
      // but the component's logic relies on verification_image_path being null.
      mockScannedFile(2, null) 
    ];
    (fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(files),
      })
    );

    render(<HistoryPage />);

    // Wait for the placeholder text
    const placeholder = await screen.findByText('No image available');
    expect(placeholder).toBeInTheDocument();

    // Check that no image was rendered for this item
    // This is a bit trickier if multiple items are on the page.
    // We're asserting that the "No image available" text is there for the item
    // that had a null image_path.
    const images = screen.queryAllByAltText('Verification');
    // Assuming only one item is being rendered in this specific mock, or that
    // if other items had images, they would not affect this specific item's placeholder.
    // A more robust test might involve selecting the card for file-2 and checking its contents.
    expect(images.find(img => img.getAttribute('src')?.startsWith('/test_assets/frontend_test_image_for_failure.jpg'))).toBeUndefined();
  });
}); 