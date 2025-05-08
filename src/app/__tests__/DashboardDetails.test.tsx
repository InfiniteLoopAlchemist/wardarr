import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

describe('Dashboard Detailed UI Branches', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('displays file name and scanned timestamp when latest match found', async () => {
    const timestamp = 1609459200000; // Jan 1, 2021
    const latestMatchPromise = Promise.resolve({
      ok: true,
      json: async () => ({
        found: true,
        verification_image_path: '/img.jpg',
        match_score: 0.75,
        is_verified: true,
        episode_info: 'E1',
        file_path: '/media/show/episode1.mkv',
        last_scanned_time: timestamp,
      }),
    });

    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/latest-match')) return latestMatchPromise;
      if (url.endsWith('/api/scan/status'))
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      if (url.endsWith('/api/libraries'))
        return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
    });

    await act(async () => {
      render(<Dashboard />);
      await latestMatchPromise;
    });

    // File name should display
    expect(screen.getByText('File: episode1.mkv')).toBeInTheDocument();
    // Scanned timestamp label should display (value may vary by locale)
    expect(screen.getByText(/^Scanned:/)).toBeInTheDocument();
  });

  it('displays Not Verified status when latest match is not verified', async () => {
    const latestMatchPromise = Promise.resolve({
      ok: true,
      json: async () => ({
        found: true,
        verification_image_path: '/img.jpg',
        match_score: 0.33,
        is_verified: false,
        episode_info: '',
        file_path: '/media/a.mkv',
        last_scanned_time: 1,
      }),
    });

    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/latest-match')) return latestMatchPromise;
      if (url.endsWith('/api/scan/status'))
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      if (url.endsWith('/api/libraries'))
        return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await act(async () => {
      render(<Dashboard />);
      await latestMatchPromise;
    });

    expect(screen.getByText(/Not Verified/)).toBeInTheDocument();
  });

  it('displays error banner when fetching seasons fails', async () => {
    const shows = [{ id: 1, title: 'ShowZ', path: '/showZ', type: 'tv' }];
    fetchMock.mockImplementation((url: string, options?: any) => {
      if (url.endsWith('/api/libraries')) {
        return Promise.resolve({ ok: true, json: async () => shows });
      }
      if (url.startsWith('http://localhost:5000/api/browse/seasons')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      if (url.endsWith('/api/scan/status') || url.endsWith('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await act(async () => {
      render(<Dashboard />);
    });
    // Select the show to trigger season fetch
    const showItem = await screen.findByText('ShowZ');
    fireEvent.click(showItem);

    expect(await screen.findByText('Failed to fetch episodes. Please check if the show path is correct.')).toBeInTheDocument();
  });

  it('highlights selected season in the media browser', async () => {
    const shows = [{ id: 1, title: 'ShowTest', path: '/test', type: 'tv' }];
    const seasons = [{ name: 'Season A', path: '/test/seasonA' }];
    const episodes: any[] = [];
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/libraries')) {
        return Promise.resolve({ ok: true, json: async () => shows });
      }
      if (url.startsWith('http://localhost:5000/api/browse/seasons')) {
        return Promise.resolve({ ok: true, json: async () => seasons });
      }
      if (url.startsWith('http://localhost:5000/api/browse/episodes')) {
        return Promise.resolve({ ok: true, json: async () => episodes });
      }
      if (url.endsWith('/api/scan/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      }
      if (url.endsWith('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await act(async () => {
      render(<Dashboard />);
    });
    // Click the show to load seasons
    const showItem = await screen.findByText('ShowTest');
    fireEvent.click(showItem);
    // Season A should be selected (auto-selected)
    const seasonItem = await screen.findByText('Season A');
    const seasonElement = seasonItem.parentElement!;
    expect(seasonElement).toHaveClass('bg-gray-700', 'border-blue-500');
  });

  it('does not highlight unselected seasons', async () => {
    const shows = [{ id: 1, title: 'ShowMulti', path: '/multi', type: 'tv' }];
    const seasons = [
      { name: 'Season 1', path: '/multi/season1' },
      { name: 'Season 2', path: '/multi/season2' }
    ];
    const episodes: any[] = [];
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/libraries')) {
        return Promise.resolve({ ok: true, json: async () => shows });
      }
      if (url.startsWith('http://localhost:5000/api/browse/seasons')) {
        return Promise.resolve({ ok: true, json: async () => seasons });
      }
      if (url.startsWith('http://localhost:5000/api/browse/episodes')) {
        return Promise.resolve({ ok: true, json: async () => episodes });
      }
      if (url.endsWith('/api/scan/status') || url.endsWith('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '', found: false }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await act(async () => {
      render(<Dashboard />);
    });
    // Click the show to load multiple seasons
    const showItem = await screen.findByText('ShowMulti');
    fireEvent.click(showItem);
    // Season 1 auto-selected
    const season1Item = await screen.findByText('Season 1');
    const season1El = season1Item.parentElement!;
    expect(season1El).toHaveClass('bg-gray-700', 'border-blue-500');
    // Season 2 should not have active classes
    const season2Item = await screen.findByText('Season 2');
    const season2El = season2Item.parentElement!;
    expect(season2El).not.toHaveClass('bg-gray-700', 'border-blue-500');
  });
}); 