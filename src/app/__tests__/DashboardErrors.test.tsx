import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Dashboard Error Cases', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('displays error when startScan fails', async () => {
    mockFetch.mockImplementation((url) => {
      if (url === 'http://localhost:5000/api/scan') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'scan error' }) });
      }
      // Default stub for other fetches
      return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
    });

    render(<Dashboard />);
    const scanBtn = await screen.findByRole('button', { name: 'Scan All Libraries' });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Failed to start scan: scan error/)).toBeInTheDocument();
    });
  });

  it('displays error when stopScan fails', async () => {
    mockFetch.mockImplementation((url) => {
      if (url === 'http://localhost:5000/api/scan/stop') {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'stop error' }) });
      }
      // Stub initial status as scanning to render Stop button
      if (url.includes('/api/scan/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: true, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
    });

    render(<Dashboard />);
    const stopBtn = await screen.findByRole('button', { name: 'Stop Scan' });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(screen.getByText(/Failed to stop scan: stop error/)).toBeInTheDocument();
    });
  });

  it('displays error when fetching libraries fails', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/libraries')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch libraries')).toBeInTheDocument();
    });
  });

  it('renders episode info when provided', async () => {
    const episodeInfo = 'Test Episode';
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/latest-match')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            found: true,
            verification_image_path: '/img.jpg',
            match_score: 0.5,
            is_verified: true,
            episode_info: episodeInfo,
            file_path: 'file.mkv',
            last_scanned_time: 11111
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
    });

    render(<Dashboard />);
    const image = await screen.findByAltText('Verification'); // wait for image to appear
    expect(screen.getByText(`Episode: ${episodeInfo}`)).toBeInTheDocument();
  });

  it('does not render episode info on Processing Error', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/latest-match')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            found: true,
            verification_image_path: '/img.jpg',
            match_score: 0.5,
            is_verified: true,
            episode_info: 'Processing Error',
            file_path: 'file.mkv',
            last_scanned_time: 22222
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
    });

    render(<Dashboard />);
    // image appears
    await screen.findByAltText('Verification');
    expect(screen.queryByText(/^Episode:/)).toBeNull();
  });
}); 