// src/app/__tests__/Dashboard.test.tsx
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page'; // Adjust path if your page.tsx is elsewhere

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));

// Mock global fetch with a default implementation
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Dashboard Page Image Display', () => {
  beforeEach(() => {
    // Reset mocks and provide a default implementation before each test
    mockFetch.mockReset();
    // Default mock returns idle status initially
    mockFetch.mockResolvedValue({ 
      ok: true,
      json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }),
    });
  });

  test('displays verification image when available', async () => {
    const latestMatchPromise = Promise.resolve({
      ok: true,
      json: async () => ({
        found: true,
        verification_image_path: '/test_assets/frontend_test_image.jpg',
        match_score: 0.99,
        is_verified: true,
        episode_info: 'Test Episode',
        file_path: 'test/file.mkv',
        timestamp: Date.now()
      }),
    });
    // Set up specific mock for the latest match call
    mockFetch.mockImplementation(async (url) => {
      if (url === 'http://localhost:5000/api/latest-match') {
        return latestMatchPromise;
      }
      // Default for initial status check
      return { ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) };
    });

    render(<Dashboard />);
    
    // Wait specifically for the latestMatch fetch to resolve *after* initial render and effects
    await act(async () => {
        await latestMatchPromise; // Ensure the promise our mock returns is resolved
    });
    
    // Now check for the image
    const image = await screen.findByAltText('Verification');
    expect(image).toBeInTheDocument();
    
    // Check that src starts with the expected path, ignoring any query parameters
    const src = image.getAttribute('src');
    expect(src).toMatch(/^\/test_assets\/frontend_test_image\.jpg/);
  });
});