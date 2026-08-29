import { useState, useCallback } from 'react';
import { ipcService } from '../services/ipcService';
import type { Client } from '../types';

export function useSearch() {
  const [results, setResults] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await ipcService.clients.search(query);
      setResults(data);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, search };
}
