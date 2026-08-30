import { useState } from 'react';
import type { DocumentType } from '../types';
import { guessDocumentTypeId } from '../utils/guessDocumentType';
import { X } from 'lucide-react';

interface Props {
  filePaths: string[];
  documentTypes: DocumentType[];
  onConfirm: (entries: { documentTypeId: number; filePaths: string[] }[]) => void;
  onCancel: () => void;
  submitting: boolean;
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

export default function BulkUploadAssignModal({ filePaths, documentTypes, onConfirm, onCancel, submitting }: Props) {
  const [assignments, setAssignments] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of filePaths) init[p] = guessDocumentTypeId(baseName(p), documentTypes);
    return init;
  });

  const handleConfirm = () => {
    const byType = new Map<number, string[]>();
    for (const p of filePaths) {
      const typeId = assignments[p];
      const arr = byType.get(typeId) ?? [];
      arr.push(p);
      byType.set(typeId, arr);
    }
    onConfirm([...byType.entries()].map(([documentTypeId, paths]) => ({ documentTypeId, filePaths: paths })));
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-5 max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Добавленные файлы ({filePaths.length})</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto space-y-2 mb-4 flex-1">
          {filePaths.map(p => (
            <div key={p} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-gray-700" title={p}>{baseName(p)}</span>
              <select
                className="text-xs border border-gray-300 rounded-md px-2 py-1 shrink-0"
                value={assignments[p]}
                onChange={e => setAssignments(a => ({ ...a, [p]: parseInt(e.target.value) }))}
              >
                {documentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={handleConfirm} disabled={submitting} className="flex-1 btn-primary font-semibold">
            {submitting ? 'Добавление...' : 'Добавить документы'}
          </button>
          <button onClick={onCancel} className="flex-1 btn-secondary">Отмена</button>
        </div>
      </div>
    </div>
  );
}
