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
    expect(src).toContain('/test_assets/frontend_test_image.jpg');
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

describe('Dashboard initial scan status error handling', () => {
  let setIntervalSpy: jest.SpyInstance;

  beforeAll(() => {
    jest.useFakeTimers();
    setIntervalSpy = jest.spyOn(global, 'setInterval');
  });

  beforeEach(() => {
    // Mock fetch to reject for the initial status call
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('fetch failed'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
    setIntervalSpy.mockRestore();
  });

  it('displays error banner and schedules latest match polling when initial fetch fails', async () => {
    render(<Dashboard />);

    // Wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch initial scan status.')).toBeInTheDocument();
    });

    // Verify that polling for latest match is scheduled
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
  });
});

describe('Dashboard polling when scan is running', () => {
  let setIntervalSpy: jest.SpyInstance;

  beforeAll(() => {
    jest.useFakeTimers();
    setIntervalSpy = jest.spyOn(global, 'setInterval');
  });

  afterAll(() => {
    jest.useRealTimers();
    setIntervalSpy.mockRestore();
  });

  it('sets up latest match polling when initial status is scanning', async () => {
    // Mock fetch to return isScanning=true for scan status, and stub latest-match
    mockFetch.mockImplementation(async (url) => {
      if (url.includes('/api/scan/status')) {
        return {
          ok: true,
          json: async () => ({ isScanning: true, totalFiles: 1, processedFiles: 0, currentFile: 'file' }),
        };
      }
      if (url.includes('/api/latest-match')) {
        return { ok: true, json: async () => ({ found: false }) };
      }
      // Default stub for other calls
      return { ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) };
    });

    render(<Dashboard />);
    // Verify that polling for latest match (3000ms) is scheduled
    await waitFor(() => {
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
    });
  });
});

describe('Dashboard initial idle polling', () => {
  let setIntervalSpy: jest.SpyInstance;

  beforeAll(() => {
    jest.useFakeTimers();
    setIntervalSpy = jest.spyOn(global, 'setInterval');
  });

  afterAll(() => {
    jest.useRealTimers();
    setIntervalSpy.mockRestore();
  });

  it('schedules latest match polling only when initial status is idle', async () => {
    mockFetch.mockImplementation(async (url) => {
      if (url.includes('/api/scan/status')) {
        return { ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) };
      }
      if (url.includes('/api/latest-match')) {
        return { ok: true, json: async () => ({ found: false }) };
      }
      return { ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) };
    });

    render(<Dashboard />);
    await waitFor(() => {
      // Only one polling interval for latest match should be set
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });
    // Verify that the interval was set for latest match (3000ms)
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
  });
});