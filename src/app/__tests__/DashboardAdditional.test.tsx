import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';

// Mock next/image
jest.mock('next/image', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => React.createElement('img', props),
  };
});

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('Dashboard start scan error handling', () => {
  it('displays error when startScan fails (non-ok)', async () => {
    fetchMock.mockImplementation((url: string, options?: any) => {
      if (url.endsWith('/api/libraries')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.endsWith('/api/scan/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
      }
      if (url.endsWith('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
      }
      if (url.endsWith('/api/scan') && options?.method === 'POST') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Scan failed' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await act(async () => {
      render(<Dashboard />);
    });

    const scanBtn = screen.getByRole('button', { name: 'Scan All Libraries' });
    fireEvent.click(scanBtn);

    const errorMessage = await screen.findByText(/Failed to start scan: Scan failed/);
    expect(errorMessage).toBeInTheDocument();
  });
});

describe('Dashboard stop scan error handling', () => {
  it('displays error when stopScan fails', async () => {
    fetchMock.mockImplementation((url: string, options?: any) => {
      if (url.endsWith('/api/libraries')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.endsWith('/api/scan/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: true, totalFiles: 1, processedFiles: 0, currentFile: 'file1' }) });
      }
      if (url.endsWith('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
      }
      if (url.endsWith('/api/scan/stop') && options?.method === 'POST') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ message: 'Stop failed' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await act(async () => {
      render(<Dashboard />);
    });

    const stopBtn = screen.getByRole('button', { name: 'Stop Scan' });
    fireEvent.click(stopBtn);

    const errorMessage = await screen.findByText(/Failed to stop scan: Stop failed/);
    expect(errorMessage).toBeInTheDocument();
  });
});

describe('Dashboard library fetch error handling', () => {
  it('displays error when fetching libraries fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/libraries')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Lib error' }) });
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

    const errorMessage = await screen.findByText('Failed to fetch libraries');
    expect(errorMessage).toBeInTheDocument();
  });
});

describe('Dashboard scanning UI current file display', () => {
  it('displays current file when scanning', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/libraries')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.endsWith('/api/scan/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ isScanning: true, totalFiles: 2, processedFiles: 1, currentFile: 'file1' }) });
      }
      if (url.endsWith('/api/latest-match')) {
        return Promise.resolve({ ok: true, json: async () => ({ found: false }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await act(async () => {
      render(<Dashboard />);
    });

    const currentFile = await screen.findByText('Current file: file1');
    expect(currentFile).toBeInTheDocument();
  });
}); 