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

  it('handles fetchStatus failure and sets error', async () => {
    // Simulate fetchStatus throwing
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('network fail'));
    await act(async () => {
      render(<Harness />);
    });
    expect(hookResult.error).toBe('Failed to fetch initial scan status.');
  });

  it('startScan failure sets error and does not start polling', async () => {
    const initialStatus = { isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' };
    const errorBody = { error: 'bad start' };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => initialStatus })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => errorBody });
    global.fetch = fetchMock;
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    await act(async () => {
      render(<Harness />);
    });
    await act(async () => {
      await hookResult.startScan();
    });
    expect(hookResult.error).toBe('Failed to start scan: bad start');
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('stopScan early exit when not scanning', async () => {
    // fetchStatus returns not scanning by default
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' }) });
    await act(async () => {
      render(<Harness />);
    });
    // Call stopScan should early return
    await act(async () => {
      await hookResult.stopScan();
    });
    expect(hookResult.stopMessage).toBeNull();
    expect(hookResult.error).toBeNull();
  });

  it('stopScan failure sets error and resets isStopping', async () => {
    const initialStatus = { isScanning: true, totalFiles: 0, processedFiles: 0, currentFile: '' };
    const errorBody = { message: 'stop fail' };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => initialStatus })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => errorBody });
    await act(async () => {
      render(<Harness />);
    });
    // Before stop, isStopping false
    expect(hookResult.isStopping).toBe(false);
    await act(async () => {
      await hookResult.stopScan();
    });
    expect(hookResult.error).toBe('Failed to stop scan: stop fail');
    expect(hookResult.isStopping).toBe(false);
  });

  it('fetchStatus success merges status without error', async () => {
    const initialStatus = { isScanning: true, totalFiles: 3, processedFiles: 1, currentFile: 'fileX' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => initialStatus });
    await act(async () => {
      render(<Harness />);
    });
    expect(hookResult.scanStatus.isScanning).toBe(true);
    expect(hookResult.scanStatus.processedFiles).toBe(1);
    expect(hookResult.error).toBeNull();
  });

  it('startScan HTTP status error uses status code when no error field', async () => {
    const initialStatus = { isScanning: false, totalFiles: 0, processedFiles: 0, currentFile: '' };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => initialStatus })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    global.fetch = fetchMock;
    await act(async () => {
      render(<Harness />);
    });
    await act(async () => {
      await hookResult.startScan();
    });
    expect(hookResult.error).toBe('Failed to start scan: HTTP 401');
  });
}); 