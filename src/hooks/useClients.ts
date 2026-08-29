import { useState, useEffect, useCallback } from 'react';
import { ipcService } from '../services/ipcService';
import type { Client } from '../types';

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async (filters?: { statusId?: number; archived?: boolean; overdue?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipcService.clients.getAll(filters);
      setClients(data);
    } catch (err) {
      setError('Ошибка загрузки клиентов');
    } finally {
      setLoading(false);
    }
  }, []);

  const createClient = useCallback(async (data: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const id = await ipcService.clients.create(data);
      return id;
    } catch (err) {
      setError('Ошибка создания клиента');
      return null;
    }
  }, []);

  const updateClient = useCallback(async (id: number, data: Partial<Client>) => {
    try {
      return await ipcService.clients.update(id, data);
    } catch (err) {
      setError('Ошибка обновления клиента');
      return false;
    }
  }, []);

  const searchClients = useCallback(async (query: string) => {
    if (!query.trim()) {
      fetchClients();
      return;
    }
    setLoading(true);
    try {
      const data = await ipcService.clients.search(query);
      setClients(data);
    } catch (err) {
      setError('Ошибка поиска');
    } finally {
      setLoading(false);
    }
  }, [fetchClients]);

  return { clients, loading, error, fetchClients, createClient, updateClient, searchClients };
}