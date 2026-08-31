import { useEffect, useState } from 'react';
import { useDocuments } from '../hooks/useDocuments';
import { ipcService } from '../services/ipcService';
import DocumentTypeCard from './DocumentTypeCard';
import BulkUploadAssignModal from './BulkUploadAssignModal';
import { Upload, Plus, Trash2, X } from 'lucide-react';
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

interface DeleteTypeConfirmProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function DeleteTypeConfirm({ name, onConfirm, onCancel, deleting }: DeleteTypeConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">Удалить тип документа «{name}»?</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0"><X size={16}/></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Тип документа будет скрыт из списка. Уже загруженные файлы клиента не будут автоматически удалены.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-secondary text-sm">Отмена</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50"
          >
            {deleting ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPanel({ clientId }: Props) {
  const { documents, documentTypes, fetchDocuments } = useDocuments();
  const [bulkFiles, setBulkFiles] = useState<string[] | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [savingType, setSavingType] = useState(false);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<{ id: number; name: string } | null>(null);
  const [deletingType, setDeletingType] = useState(false);

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

  const handleDeleteTypeConfirm = async () => {
    if (!deleteTypeTarget) return;
    setDeletingType(true);
    try {
      const result = await ipcService.documentTypes.delete(deleteTypeTarget.id);
      if (result && typeof result === 'object' && 'error' in result) {
        alert(result.error);
        return;
      }
      setDeleteTypeTarget(null);
      fetchDocuments(clientId);
    } finally {
      setDeletingType(false);
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
          <div className="grid grid-cols-2 gap-2">
            {group.items.map(doc => (
              <DocumentTypeCard
                key={doc.document_type_id}
                clientId={clientId}
                doc={doc}
                onChanged={() => fetchDocuments(clientId)}
                onDeleteType={
                  !doc.is_system
                    ? () => setDeleteTypeTarget({ id: doc.document_type_id, name: doc.name })
                    : undefined
                }
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

      {deleteTypeTarget && (
        <DeleteTypeConfirm
          name={deleteTypeTarget.name}
          onConfirm={handleDeleteTypeConfirm}
          onCancel={() => setDeleteTypeTarget(null)}
          deleting={deletingType}
        />
      )}
    </div>
  );
}
