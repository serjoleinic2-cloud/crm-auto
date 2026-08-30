import { useState, useCallback } from 'react';
import { ipcService } from '../services/ipcService';
import type { ClientDocument, DocumentType } from '../types';

export function useDocuments() {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDocuments = useCallback(async (clientId: number) => {
    setLoading(true);
    try {
      const [docs, types] = await Promise.all([
        ipcService.documents.getByClientId(clientId),
        ipcService.documentTypes.getAll(),
      ]);
      setDocuments(docs);
      setDocumentTypes(types);
    } finally {
      setLoading(false);
    }
  }, []);

  return { documents, documentTypes, loading, fetchDocuments };
}
