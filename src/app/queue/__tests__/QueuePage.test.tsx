// src/app/history/__tests__/HistoryPage.test.tsx
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import QueuePage from '../page'; // Adjust path if your page.tsx is elsewhere

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to generate a mock ScannedFile object for all tests
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

describe('History Page Image Display', () => {
  beforeEach(() => {
    // Reset mocks before each test and set default response
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  test('displays verification image when available for a scanned file', async () => {
    const files = [mockScannedFile(1, '/test_assets/frontend_test_image.jpg')];
    const historyPromise = Promise.resolve({
        ok: true,
      json: async () => files,
    });
    mockFetch.mockImplementation(async (url) => {
      if (url === 'http://localhost:5000/api/queue') {
        return historyPromise;
      }
      return { ok: true, json: async () => [] };
    });

    await act(async () => {
      render(<QueuePage />);
      await historyPromise;
    });

    const image = await screen.findByAltText('Verification'); 
    expect(image).toBeInTheDocument();
    expect(image.getAttribute('src')).toContain('/test_assets/frontend_test_image.jpg');
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
      if (url === 'http://localhost:5000/api/queue') {
        return historyPromise;
      }
      return { ok: true, json: async () => [] };
    });

    await act(async () => {
      render(<QueuePage />);
      await historyPromise;
    });

    const images = await screen.findAllByAltText('Verification');
    expect(images).toHaveLength(files.length);
    // The component sorts history by last_scanned_time (newest first), so sort files likewise
    const sortedFiles = [...files].sort((a, b) => b.last_scanned_time - a.last_scanned_time);
    sortedFiles.forEach((file, idx) => {
      const src = images[idx].getAttribute('src')!;
      // Use non-null assertion since mock files have a verification_image_path
      expect(src).toContain(file.verification_image_path!);
    });
  });
});

// Additional tests for HistoryPage
describe('History Page - loading and error states', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('shows loading spinner initially', () => {
    // Make fetch never resolve to keep loading state
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<QueuePage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  test('displays error message on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<QueuePage />);
    });
    expect(
      await screen.findByText(
        'Failed to fetch scan queue. Please check if the backend server is running.'
      )
    ).toBeInTheDocument();
  });

  test('displays error message on HTTP error response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => [] });
    await act(async () => {
      render(<QueuePage />);
    });
    expect(
      await screen.findByText(
        'Failed to fetch scan queue. Please check if the backend server is running.'
      )
    ).toBeInTheDocument();
  });
});

describe('History Page - empty and filter states', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  test('shows empty state message for all filter', async () => {
    await act(async () => {
      render(<QueuePage />);
    });
    expect(
      await screen.findByText(
        'No scan queue found. Run a scan to generate verification images.'
      )
    ).toBeInTheDocument();
  });

  test('shows empty state for verified filter', async () => {
    await act(async () => {
      render(<QueuePage />);
    });
    fireEvent.click(screen.getByText('Verified'));
    expect(
      await screen.findByText('No verified files found in scan queue.')
    ).toBeInTheDocument();
  });

  test('shows empty state for unverified filter', async () => {
    await act(async () => {
      render(<QueuePage />);
    });
    fireEvent.click(screen.getByText('Unverified'));
    expect(
      await screen.findByText('No unverified files found in scan queue.')
    ).toBeInTheDocument();
  });
});

describe('History Page - data branches', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('renders placeholder when no image and displays correct fields', async () => {
    const fileNoImage = mockScannedFile(1, null, false);
    fileNoImage.match_score = 0;
    fileNoImage.episode_info = 'Processing Error';
    fileNoImage.last_scanned_time = new Date('2022-01-01T12:00:00Z').getTime();
    mockFetch.mockResolvedValue({ ok: true, json: async () => [fileNoImage] });
    jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('TestTime');
    await act(async () => {
      render(<QueuePage />);
    });
    expect(screen.queryByAltText('Verification')).toBeNull();
    expect(screen.getByText('No image available')).toBeInTheDocument();
    expect(screen.queryByText('Processing Error')).toBeNull();
    expect(screen.getByText('TestTime')).toBeInTheDocument();
    (Date.prototype.toLocaleString as jest.Mock).mockRestore();
  });

  test('filter buttons have correct active style', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    await act(async () => {
      render(<QueuePage />);
    });
    const allBtn = screen.getByText('All');
    const verifiedBtn = screen.getByText('Verified');
    const unverifiedBtn = screen.getByText('Unverified');
    expect(allBtn).toHaveClass('bg-blue-600');
    expect(verifiedBtn).toHaveClass('bg-gray-700');
    expect(unverifiedBtn).toHaveClass('bg-gray-700');
    fireEvent.click(verifiedBtn);
    expect(verifiedBtn).toHaveClass('bg-blue-600');
    expect(allBtn).toHaveClass('bg-gray-700');
    fireEvent.click(unverifiedBtn);
    expect(unverifiedBtn).toHaveClass('bg-blue-600');
    expect(allBtn).toHaveClass('bg-gray-700');
  });

  test('filters data correctly based on filter selection', async () => {
    const verifiedFile = mockScannedFile(1, '/img1.jpg', true);
    const unverifiedFile = mockScannedFile(2, '/img2.jpg', false);
    mockFetch.mockResolvedValue({ ok: true, json: async () => [verifiedFile, unverifiedFile] });
    await act(async () => {
      render(<QueuePage />);
    });
    // Filter verified
    fireEvent.click(screen.getByText('Verified'));
    expect(screen.getByText('file-1.mkv')).toBeInTheDocument();
    expect(screen.queryByText('file-2.mkv')).toBeNull();
    // Filter unverified
    fireEvent.click(screen.getByText('Unverified'));
    expect(screen.getByText('file-2.mkv')).toBeInTheDocument();
    expect(screen.queryByText('file-1.mkv')).toBeNull();
    // Filter all
    fireEvent.click(screen.getByText('All'));
    expect(screen.getByText('file-1.mkv')).toBeInTheDocument();
    expect(screen.getByText('file-2.mkv')).toBeInTheDocument();
  });
});

// Test fallback filter branch to cover line 63 in page.tsx
describe('History Page - fallback filter branch', () => {
  test('includes all scanned files when filter is invalid', async () => {
    // Mock useState to set filter initial state to an invalid value
    const originalUseState = React.useState;
    const useStateSpy = jest.spyOn(React, 'useState');
    // @ts-ignore: mock useState to override filter initial value
    useStateSpy.mockImplementation((initial: any) =>
      // Only override when initializing filter (initial === 'all')
      initial === 'all'
        ? ['invalid' as any, jest.fn()]
        : originalUseState(initial)
    );

    // Prepare two files: one verified, one unverified
    const files = [
      mockScannedFile(1, '/img1.jpg', true),
      mockScannedFile(2, '/img2.jpg', false),
    ];
    const historyPromise = Promise.resolve({ ok: true, json: async () => files });
    mockFetch.mockImplementation(async url => {
      if (url === 'http://localhost:5000/api/queue') return historyPromise;
      return { ok: true, json: async () => [] };
    });

    // Render and wait for fetch
    await act(async () => {
      render(<QueuePage />);
      await historyPromise;
    });

    // Fallback filter should include all files
    expect(screen.getByText('file-1.mkv')).toBeInTheDocument();
    expect(screen.getByText('file-2.mkv')).toBeInTheDocument();

    // Restore original useState
    useStateSpy.mockRestore();
  });
}); 