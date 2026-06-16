import { useState, useEffect } from 'react';
import { type ConnectionStatus } from '@/components/animations/sections/connection-status-indicator';

export function useConnectionStatus(inView: boolean): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    if (!inView) {
      const resetTimer = setTimeout(() => setStatus('idle'), 0);
      cleanups.push(() => clearTimeout(resetTimer));
    } else {
      const showTimer = setTimeout(() => setStatus('connecting'), 0);
      const connectTimer = setTimeout(() => setStatus('connected'), 2000);
      cleanups.push(() => clearTimeout(showTimer));
      cleanups.push(() => clearTimeout(connectTimer));
    }
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [inView]);

  return status;
}
