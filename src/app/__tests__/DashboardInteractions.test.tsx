import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';

describe('Dashboard interaction handlers', () => {
  const mockShows = [
    { name: 'Show 1', path: '/show1' },
    { name: 'Show 2', path: '/show2' }
  ];

  beforeEach(() => {
    // Mock fetch responses including libraries
    (global.fetch as jest.Mock) = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/libraries')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockShows.map((show, idx) => ({
            id: idx + 1,
            title: show.name,
            path: show.path,
            type: 'tv'
          }))
        });
      }
      if (url.includes('/api/scan/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      }
      if (url.includes('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
      }
      if (url.includes('/api/browse/seasons')) {
        return Promise.resolve({ ok: true, json: async () => ([{ name: 'Season A', path: '/seasonA' }]) });
      }
      if (url.includes('/api/browse/episodes')) {
        return Promise.resolve({ ok: true, json: async () => ([{ filename: 'Ep1', path: '/ep1', season: 1, episode: 1, name: 'Episode 1' }]) });
      }
      // Default stub
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders ShowSelector items and handles show selection', async () => {
    render(<Dashboard />);

    // Wait for ShowSelector to render show items
    const showItem = await screen.findByText('Show 1');
    expect(showItem).toBeInTheDocument();

    // Click on the show
    fireEvent.click(showItem);

    // Season 'Season A' should appear
    const seasonItem = await screen.findByText('Season A');
    expect(seasonItem).toBeInTheDocument();

    // Click on the season
    fireEvent.click(seasonItem);

    // Episode 'Episode 1' should appear
    const episodeItem = await screen.findByText('Episode 1');
    expect(episodeItem).toBeInTheDocument();
  });

  it('displays error banner when fetching seasons fails for show selection', async () => {
    // Stub fetch: libraries, scan status, latest-match succeed; seasons fetch fails
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/libraries')) {
        return Promise.resolve({ ok: true, json: async () => mockShows.map((show, idx) => ({ id: idx + 1, title: show.name, path: show.path, type: 'tv' })) });
      }
      if (url.includes('/api/scan/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      }
      if (url.includes('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
      }
      if (url.includes('/api/browse/seasons')) {
        return Promise.reject(new Error('seasons fetch failed'));
      }
      // Default stub for episodes or others
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    render(<Dashboard />);
    const showItem = await screen.findByText('Show 1');
    fireEvent.click(showItem);

    const errorBanner = await screen.findByText('Failed to fetch episodes. Please check if the show path is correct.');
    expect(errorBanner).toBeInTheDocument();
  });

  it('displays error banner when fetching episodes fails for season selection', async () => {
    // Stub fetch: libraries, scan status, latest-match succeed; seasons fetch succeeds; episodes fetch returns non-ok
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/libraries')) {
        return Promise.resolve({ ok: true, json: async () => mockShows.map((show, idx) => ({ id: idx + 1, title: show.name, path: show.path, type: 'tv' })) });
      }
      if (url.includes('/api/scan/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      }
      if (url.includes('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
      }
      if (url.includes('/api/browse/seasons')) {
        return Promise.resolve({ ok: true, json: async () => ([{ name: 'Season A', path: '/seasonA' }]) });
      }
      if (url.includes('/api/browse/episodes')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    render(<Dashboard />);
    const showItem = await screen.findByText('Show 1');
    fireEvent.click(showItem);

    // SeasonSelector rendered?
    const seasonItem = await screen.findByText('Season A');
    expect(seasonItem).toBeInTheDocument();

    // Trigger manual season selection error
    fireEvent.click(seasonItem);
    const seasonErrorBanner = await screen.findByText('Failed to fetch episodes. Please check if the season path is correct.');
    expect(seasonErrorBanner).toBeInTheDocument();
  });
}); 