import { useState, useCallback } from 'react';
import { ipcService } from '../services/ipcService';
import type { HistoryEntry } from '../types';

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (clientId: number) => {
    setLoading(true);
    try {
      const data = await ipcService.history.getByClientId(clientId);
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, []);

  return { entries, loading, fetchHistory };
}