import { useEffect, useState } from 'react';
import { useDocuments } from '../hooks/useDocuments';
import { ipcService } from '../services/ipcService';
import DocumentTypeCard from './DocumentTypeCard';
import BulkUploadAssignModal from './BulkUploadAssignModal';
import { Upload, Plus } from 'lucide-react';
import type { ClientDocument } from '../types';

interface Props { clientId: number; }

const GROUP_CODES: { title: string; codes: string[] }[] = [
  { title: 'Обязательные / основные', codes: ['consent', 'passport', 'snils', 'inn', 'contract', 'contract_signed'] },
  { title: 'Оплата', codes: ['payment_proof'] },
  { title: 'Таможня', codes: ['broker_poa'] },
];

function groupDocuments(docs: ClientDocument[]) {
  const used = new Set<string>();
  const groups = GROUP_CODES.map(g => {
    const items = docs.filter(d => g.codes.includes(d.code));
    items.forEach(i => used.add(i.code));
    return { title: g.title, items };
  }).filter(g => g.items.length > 0);

  const rest = docs.filter(d => !used.has(d.code));
  if (rest.length) groups.push({ title: 'Другие', items: rest });
  return groups;
}

export default function DocumentsPanel({ clientId }: Props) {
  const { documents, documentTypes, fetchDocuments } = useDocuments();
  const [bulkFiles, setBulkFiles] = useState<string[] | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [savingType, setSavingType] = useState(false);

  useEffect(() => { if (clientId) fetchDocuments(clientId); }, [clientId, fetchDocuments]);

  const receivedCount = documents.filter(d => d.status === 'received' || d.status === 'verified').length;
  const applicableCount = documents.filter(d => d.status !== 'not_required').length;

  const handleBulkPick = async () => {
    const paths = await ipcService.files.pickFiles({ multi: true });
    if (!paths.length) return;
    setBulkFiles(paths);
  };

  const handleBulkConfirm = async (entries: { documentTypeId: number; filePaths: string[] }[]) => {
    setBulkSubmitting(true);
    try {
      await ipcService.documents.addFilesBulk(clientId, entries);
      setBulkFiles(null);
      fetchDocuments(clientId);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleCreateType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    setSavingType(true);
    try {
      const result = await ipcService.documentTypes.create({ name });
      if (result && typeof result === 'object' && 'error' in result) {
        alert(result.error);
        return;
      }
      setNewTypeName('');
      setAddingType(false);
      fetchDocuments(clientId);
    } finally {
      setSavingType(false);
    }
  };

  const groups = groupDocuments(documents);

  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between">
        <div className="text-sm text-gray-700">
          <span className="font-semibold text-gray-900">Документы:</span>{' '}
          {receivedCount} из {applicableCount} получено
        </div>
        <button onClick={handleBulkPick} className="btn-primary text-sm flex items-center gap-1.5 shrink-0">
          <Upload size={15} /> Добавить документы
        </button>
      </div>

      {groups.map(group => (
        <div key={group.title} className="card">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.title}</h3>
          <div className="space-y-2">
            {group.items.map(doc => (
              <DocumentTypeCard
                key={doc.document_type_id}
                clientId={clientId}
                doc={doc}
                onChanged={() => fetchDocuments(clientId)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="card">
        {addingType ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className="input text-sm flex-1"
              placeholder="Например: Акт приёма-передачи"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateType(); if (e.key === 'Escape') setAddingType(false); }}
            />
            <button onClick={handleCreateType} disabled={savingType || !newTypeName.trim()} className="btn-primary text-sm shrink-0">
              {savingType ? 'Создание...' : 'Создать'}
            </button>
            <button onClick={() => { setAddingType(false); setNewTypeName(''); }} className="btn-secondary text-sm shrink-0">Отмена</button>
          </div>
        ) : (
          <button onClick={() => setAddingType(true)} className="text-sm text-primary-600 hover:underline flex items-center gap-1">
            <Plus size={14} /> Добавить тип документа
          </button>
        )}
      </div>

      {bulkFiles && (
        <BulkUploadAssignModal
          filePaths={bulkFiles}
          documentTypes={documentTypes}
          submitting={bulkSubmitting}
          onConfirm={handleBulkConfirm}
          onCancel={() => setBulkFiles(null)}
        />
      )}
    </div>
  );
}
