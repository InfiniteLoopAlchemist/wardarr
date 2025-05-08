import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

describe('Dashboard Fetch Behavior', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('shows placeholder when latest-match response is not ok', async () => {
    // Stub other fetches
    fetchMock.mockImplementation((url: string) => {
      if (url === 'http://localhost:5000/api/latest-match') {
        return Promise.resolve({ ok: false, status: 500 });
      }
      if (url === 'http://localhost:5000/api/scan/status') {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      }
      if (url === 'http://localhost:5000/api/libraries') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
    });

    await act(async () => {
      render(<Dashboard />);
    });

    // Placeholder should appear despite non-ok latest-match
    expect(screen.getByText('No verification images available yet. Run a scan to generate verification images.')).toBeInTheDocument();
  });

  it('auto-selects first season and displays episodes without clicking season', async () => {
    const shows = [{ id: 1, title: 'Show X', path: '/showX', type: 'tv' }];
    const seasons = [{ name: 'Season 1', path: '/showX/season1' }];
    const episodes = [{ filename: 'Ep1', path: '/showX/season1/ep1.mkv', season: 1, episode: 1, name: 'Episode One' }];

    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'http://localhost:5000/api/libraries') {
        return { ok: true, json: async () => shows };
      }
      if (url === 'http://localhost:5000/api/scan/status') {
        return { ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) };
      }
      if (url === 'http://localhost:5000/api/latest-match') {
        return { ok: true, json: async () => ({ found: false }) };
      }
      if (url.startsWith('http://localhost:5000/api/browse/seasons')) {
        return { ok: true, json: async () => seasons };
      }
      if (url.startsWith('http://localhost:5000/api/browse/episodes')) {
        return { ok: true, json: async () => episodes };
      }
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      render(<Dashboard />);
    });

    // Wait for shows to render
    const showItem = await screen.findByText('Show X');
    fireEvent.click(showItem);

    // Season list should render and auto-select first season
    const seasonItems = await screen.findAllByText('Season 1');
    expect(seasonItems.length).toBeGreaterThan(0);

    // Without clicking season, episode should appear due to auto-selection
    const episodeItem = await screen.findByText('Episode One');
    expect(episodeItem).toBeInTheDocument();
  });

  it('does not render seasons section when no seasons found', async () => {
    const shows = [{ id: 1, title: 'Show Y', path: '/showY', type: 'tv' }];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'http://localhost:5000/api/libraries') {
        return { ok: true, json: async () => shows };
      }
      if (url.startsWith('http://localhost:5000/api/browse/seasons')) {
        return { ok: true, json: async () => [] };
      }
      if (url === 'http://localhost:5000/api/scan/status' || url === 'http://localhost:5000/api/latest-match') {
        return { ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    
    await act(async () => {
      render(<Dashboard />);
    });
    const showItem = await screen.findByText('Show Y');
    fireEvent.click(showItem);
    // No Seasons header should render
    expect(screen.queryByText('Seasons')).toBeNull();
  });
}); 