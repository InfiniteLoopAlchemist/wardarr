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

    await act(async () => {
      render(<Dashboard />);
      await latestMatchPromise;
    });
    
    // Now check for the image
    const image = await screen.findByAltText('Verification');
    expect(image).toBeInTheDocument();
    
    // Check that src starts with the expected path, ignoring any query parameters
    const src = image.getAttribute('src');
    expect(src).toMatch(/^\/test_assets\/frontend_test_image\.jpg/);
  });

  test('appends cache-busting timestamp to image src', async () => {
    const timestamp = 12345;
    const latestMatchPromise = Promise.resolve({
      ok: true,
      json: async () => ({
        found: true,
        verification_image_path: '/test_assets/frontend_test_image.jpg',
        match_score: 0.5,
        is_verified: true,
        episode_info: 'Test Episode',
        file_path: 'test/file.mkv',
        last_scanned_time: timestamp
      }),
    });
    
    mockFetch.mockImplementation(async (url) => {
      if (url === 'http://localhost:5000/api/latest-match') return latestMatchPromise;
      return { ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) };
    });

    await act(async () => {
      render(<Dashboard />);
      await latestMatchPromise;
    });

    const image = await screen.findByAltText('Verification');
    const src = image.getAttribute('src')!;
    // Assert that the src ends with the proper timestamp query
    expect(src.endsWith(`?t=${timestamp}`)).toBe(true);
  });

  test('shows placeholder when no latest verification image', async () => {
    const latestMatchPromise = Promise.resolve({
      ok: true,
      json: async () => ({ found: false }),
    });
    mockFetch.mockImplementation(async (url) => {
      if (url === 'http://localhost:5000/api/latest-match') return latestMatchPromise;
      return { ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) };
    });
    await act(async () => {
      render(<Dashboard />);
      await latestMatchPromise;
    });
    expect(screen.getByText('No verification images available yet. Run a scan to generate verification images.')).toBeInTheDocument();
  });

  test('renders ShowSelector placeholder when no shows exist', async () => {
    // Dashboard always renders ShowSelector with empty shows by default
    await act(async () => {
      render(<Dashboard />);
    });
    expect(screen.getByText('No shows found')).toBeInTheDocument();
  });
});

describe('Dashboard Scan Controls', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('enables Scan All Libraries button when not scanning', async () => {
    // Simulate initial scan status idle
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ isScanning: false, totalFiles: 5, processedFiles: 0, currentFile: '' }),
    });
    await act(async () => {
      render(<Dashboard />);
    });
    const scanBtn = screen.getByRole('button', { name: 'Scan All Libraries' });
    expect(scanBtn).toBeEnabled();
  });

  it('disables scan button and shows progress when scanning', async () => {
    const statusPromise = Promise.resolve({
      ok: true,
      json: async () => ({ isScanning: true, totalFiles: 10, processedFiles: 2, currentFile: 'file1' }),
    });
    mockFetch.mockImplementation(async (url) => statusPromise);

    await act(async () => {
      render(<Dashboard />);
      await statusPromise;
    });

    const scanningBtn = screen.getByRole('button', { name: 'Scanning...' });
    expect(scanningBtn).toBeDisabled();
    // Progress text should reflect 20%
    expect(screen.getByText('Scanning... 20%')).toBeInTheDocument();
    // Check progress bar width style
    const progressBar = document.querySelector('div[style*="width: 20%"]');
    expect(progressBar).toBeInTheDocument();
  });
});