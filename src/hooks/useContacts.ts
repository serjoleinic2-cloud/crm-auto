import { useState, useCallback } from 'react';
import { ipcService } from '../services/ipcService';
import type { Contact } from '../types';

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchContacts = useCallback(async (clientId: number) => {
    setLoading(true);
    try {
      const data = await ipcService.contacts.getByClientId(clientId);
      setContacts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const createContact = useCallback(async (data: Omit<Contact, 'id' | 'created_at'>) => {
    try {
      const id = await ipcService.contacts.create(data);
      return id;
    } catch {
      return null;
    }
  }, []);

  const deleteContact = useCallback(async (id: number) => {
    try {
      return await ipcService.contacts.delete(id);
    } catch {
      return false;
    }
  }, []);

  const setPrimary = useCallback(async (clientId: number, contactId: number) => {
    try {
      return await ipcService.contacts.setPrimary(clientId, contactId);
    } catch {
      return false;
    }
  }, []);

  return { contacts, loading, fetchContacts, createContact, deleteContact, setPrimary };
}