import { useState, useEffect, useRef, useCallback } from 'react';

type ScanStatus = {
  isScanning: boolean;
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  startTime: number | null;
  errors: string[];
  stopRequested: boolean;
};

export function useScan(baseUrl: string = 'http://localhost:5000') {
  const [scanStatus, setScanStatus] = useState<ScanStatus>({
    isScanning: false,
    totalFiles: 0,
    processedFiles: 0,
    currentFile: '',
    startTime: null,
    errors: [],
    stopRequested: false
  });
  const [error, setError] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/scan/status`);
      const data: ScanStatus & { latestMatch?: any } = await res.json();
      setScanStatus(prev => ({ ...prev, ...data }));
    } catch {
      setError('Failed to fetch initial scan status.');
    }
  }, [baseUrl]);

  const startScan = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/scan`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data as any).error || `HTTP ${res.status}`);
      }
      setScanStatus((data as any).status);
      pollRef.current = setInterval(fetchStatus, 2000);
    } catch (e: any) {
      setError(`Failed to start scan: ${e.message}`);
    }
  }, [baseUrl, fetchStatus]);

  const stopScan = useCallback(async () => {
    if (!scanStatus.isScanning || isStopping) return;
    setIsStopping(true);
    setStopMessage(null);
    try {
      const res = await fetch(`${baseUrl}/api/scan/stop`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setStopMessage(data.message);
    } catch (e: any) {
      setError(`Failed to stop scan: ${e.message}`);
    } finally {
      setIsStopping(false);
    }
  }, [baseUrl, scanStatus.isScanning, isStopping]);

  useEffect(() => {
    // initial fetch and polling cleanup
    fetchStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  return {
    scanStatus,
    error,
    isStopping,
    stopMessage,
    startScan,
    stopScan
  };
} 