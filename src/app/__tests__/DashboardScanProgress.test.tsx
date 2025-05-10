import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';

// Mock next/image to simple img
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

describe('Dashboard scan progress updates', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('updates percentage, file count and progress bar width over time', async () => {
    // Prepare two responses: initial and after one polling interval
    const statusSequence = [
      { ok: true, json: async () => ({ isScanning: true, totalFiles: 5, processedFiles: 1, currentFile: 'file1' }) },
      { ok: true, json: async () => ({ isScanning: true, totalFiles: 5, processedFiles: 3, currentFile: 'file3' }) },
    ];
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/scan/status')) {
        // Return next scan status in sequence
        const resp = statusSequence[callCount] || statusSequence[statusSequence.length - 1];
        callCount += 1;
        return Promise.resolve(resp);
      }
      // Stub other API calls (libraries, latest-match) to succeed harmlessly
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    // Initial render triggers first fetchStatus
    await act(async () => {
      render(<Dashboard />);
    });
    // Wait for initial scanning UI (20%) to appear
    await waitFor(() => {
      expect(screen.getByText('Scanning... 20%')).toBeInTheDocument();
    });

    // Advance timers by polling interval (2000ms) to trigger second fetchStatus
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // Wait for the UI to reflect updated progress: 3/5 → 60%
    await waitFor(() => {
      expect(screen.getByText('Scanning... 60%')).toBeInTheDocument();
    });
    expect(screen.getByText('3 / 5 files')).toBeInTheDocument();
    expect(document.querySelector('div[style*="width: 60%"]')).toBeInTheDocument();
  });
}); 