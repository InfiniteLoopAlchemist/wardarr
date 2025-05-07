// src/app/history/__tests__/HistoryPage.test.tsx
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import HistoryPage from '../page'; // Adjust path if your page.tsx is elsewhere

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('History Page Image Display', () => {
  beforeEach(() => {
    // Reset mocks before each test and set default response
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
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
    const files = [mockScannedFile(1, '/test_assets/frontend_test_image.jpg')];
    const historyPromise = Promise.resolve({
        ok: true,
      json: async () => files,
    });
    mockFetch.mockImplementation(async (url) => {
      if (url === 'http://localhost:5000/api/history') {
        return historyPromise;
      }
      return { ok: true, json: async () => [] };
    });

    render(<HistoryPage />);

    // Wait for the history fetch effect
    await act(async () => {
      await historyPromise;
    });

    const image = await screen.findByAltText('Verification'); 
    expect(image).toBeInTheDocument();
    expect(image.getAttribute('src')).toMatch(/^\/test_assets\/frontend_test_image\.jpg/);
  });

  test('renders an image for each scanned file in history', async () => {
    const files = [
      mockScannedFile(1, '/test_assets/img1.jpg'),
      mockScannedFile(2, '/test_assets/img2.jpg'),
      mockScannedFile(3, '/test_assets/img3.jpg'),
    ];
    const historyPromise = Promise.resolve({
        ok: true,
      json: async () => files,
    });
    mockFetch.mockImplementation(async (url) => {
      if (url === 'http://localhost:5000/api/history') {
        return historyPromise;
      }
      return { ok: true, json: async () => [] };
    });

    render(<HistoryPage />);
    // Wait for the history fetch to resolve
    await act(async () => {
      await historyPromise;
    });

    const images = await screen.findAllByAltText('Verification');
    expect(images).toHaveLength(files.length);
    files.forEach((file, idx) => {
      const src = images[idx].getAttribute('src')!;
      expect(src).toMatch(new RegExp(`^${file.verification_image_path}`));
    });
  });
}); 