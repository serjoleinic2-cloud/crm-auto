import { useState, useCallback } from 'react';
import { ipcService } from '../services/ipcService';
import type { Reminder } from '../types';

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReminders = useCallback(async (filters?: { clientId?: number; overdue?: boolean; today?: boolean; upcoming?: boolean }) => {
    setLoading(true);
    try {
      const data = await ipcService.reminders.getAll(filters);
      setReminders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const createReminder = useCallback(async (data: { client_id: number; title: string; description?: string; due_date?: string; auto_created?: number }) => {
    try {
      const id = await ipcService.reminders.create(data);
      return id;
    } catch {
      return null;
    }
  }, []);

  const updateReminder = useCallback(async (id: number, data: Partial<Reminder>) => {
    try {
      return await ipcService.reminders.update(id, data);
    } catch {
      return false;
    }
  }, []);

  const deleteReminder = useCallback(async (id: number) => {
    try {
      return await ipcService.reminders.delete(id);
    } catch {
      return false;
    }
  }, []);

  return { reminders, loading, fetchReminders, createReminder, updateReminder, deleteReminder };
}
