import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useScan } from '../useScan';

let hookResult: ReturnType<typeof useScan>;

function Harness() {
  hookResult = useScan('http://localhost:5000');
  return null;
}

describe('useScan hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    hookResult = undefined!;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('startScan success sets scanStatus and starts polling', async () => {
    // Initial fetchStatus in useEffect
    const initialStatus = { isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' };
    const startResp = { status: { isScanning: true, totalFiles: 5, processedFiles: 0, currentFile: 'file1' } };

    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => initialStatus })
      .mockResolvedValueOnce({ ok: true, json: async () => startResp });

    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    await act(async () => {
      render(<Harness />);
    });

    // Call startScan
    await act(async () => {
      await hookResult.startScan();
    });

    expect(hookResult.scanStatus.isScanning).toBe(true);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
  });

  it('stopScan success sets stopMessage', async () => {
    // Initial fetchStatus returns scanning state
    const initialStatus = { isScanning: true, totalFiles: 0, processedFiles: 0, currentFile: '' };
    const stopResp = { message: 'Stopped OK' };

    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => initialStatus })
      .mockResolvedValueOnce({ ok: true, json: async () => stopResp });

    await act(async () => {
      render(<Harness />);
    });

    // Call stopScan
    await act(async () => {
      await hookResult.stopScan();
    });

    expect(hookResult.stopMessage).toBe('Stopped OK');
  });
}); 