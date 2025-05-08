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
}); 