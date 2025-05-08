import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';

// Mock next/image to avoid Next.js image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

// Mock useScan hook
jest.mock('@/hooks/useScan', () => ({
  useScan: () => ({
    scanStatus: { isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '', startTime: null, errors: [], stopRequested: false },
    error: null,
    isStopping: false,
    stopMessage: '',
    startScan: jest.fn(),
    stopScan: jest.fn(),
  }),
}));

// Mock useLatestMatch hook
jest.mock('@/hooks/useLatestMatch', () => ({
  useLatestMatch: () => ({ latest: null, error: null, refresh: jest.fn() }),
}));

// Mock useLibraries hook
jest.mock('@/hooks/useLibraries', () => ({
  useLibraries: () => ({ shows: [], error: null, loading: false, refresh: jest.fn() }),
}));

// Mock useMediaBrowser hook to supply a selectedShow and seasons but no selectedSeason
jest.mock('@/hooks/useMediaBrowser', () => ({
  useMediaBrowser: () => ({
    selectedShow: { name: 'Show A', path: '/showA' },
    seasons: [{ name: 'Season One', path: '/showA/seasonOne' }],
    selectedSeason: null,
    episodes: [],
    error: null,
    selectShow: jest.fn(),
    selectSeason: jest.fn(),
  }),
}));

describe('Dashboard Seasons - no season selected', () => {
  it('renders season card with base classes and no highlight', () => {
    render(<Dashboard />);
    const seasonItem = screen.getByText('Season One');
    const seasonEl = seasonItem.parentElement;
    expect(seasonEl).toHaveClass(
      'border',
      'border-gray-700',
      'rounded',
      'p-3',
      'hover:bg-gray-700',
      'cursor-pointer'
    );
    expect(seasonEl).not.toHaveClass('bg-gray-700', 'border-blue-500');
  });
}); 