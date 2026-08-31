import { useState, useRef, useEffect } from 'react';
import { ipcService } from '../services/ipcService';
import type { ClientDocument, DocumentStatus } from '../types';
import { DOCUMENT_STATUS_LABELS } from '../types';
import { formatDate } from '../utils/formatters';
import { Paperclip, ExternalLink, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import ConfirmDeleteFilesModal from './ConfirmDeleteFilesModal';

interface Props {
  clientId: number;
  doc: ClientDocument;
  onChanged: () => void;
  onDeleteType?: () => void;
}

const STATUS_COLORS: Record<DocumentStatus, string> = {
  not_required:  '#9ca3af',
  not_requested: '#9ca3af',
  requested:     '#f59e0b',
  sent:          '#3b82f6',
  received:      '#10b981',
  verified:      '#059669',
};

export default function DocumentTypeCard({ clientId, doc, onChanged, onDeleteType }: Props) {
  const [comment, setComment] = useState(doc.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ ids: number[]; name?: string } | null>(null);
  const [expanded, setExpanded] = useState(doc.status !== 'not_required' && doc.status !== 'not_requested');
  const commentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setComment(doc.comment ?? ''); }, [doc.comment, doc.document_type_id]);

  const flashSaved = () => {
    setSavedTick(true);
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    savedFlashTimer.current = setTimeout(() => setSavedTick(false), 1500);
  };

  const handleStatusChange = async (status: DocumentStatus) => {
    setSaving(true);
    try {
      await ipcService.documents.updateStatus(clientId, doc.document_type_id, status);
      flashSaved();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const commitComment = async (value: string) => {
    setSaving(true);
    try {
      await ipcService.documents.updateComment(clientId, doc.document_type_id, value);
      flashSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleCommentChange = (value: string) => {
    setComment(value);
    if (commentTimer.current) clearTimeout(commentTimer.current);
    commentTimer.current = setTimeout(() => commitComment(value), 700);
  };

  const handleCommentBlur = () => {
    if (commentTimer.current) { clearTimeout(commentTimer.current); commentTimer.current = null; }
    commitComment(comment);
  };

  const handleAttach = async () => {
    const paths = await ipcService.files.pickFiles({ multi: true });
    if (!paths.length) return;
    setSaving(true);
    try {
      await ipcService.documents.addFiles(clientId, doc.document_type_id, paths);
      setExpanded(true);
      flashSaved();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFile = (filePath: string) => ipcService.files.openFile(filePath);

  const toggleFileSelected = (fileId: number) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return next;
    });
  };

  const doDelete = async (ids: number[]) => {
    setSaving(true);
    try {
      for (const id of ids) await ipcService.documents.deleteFile(id);
      setSelectedFiles(new Set());
      setDeleteTarget(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const color = STATUS_COLORS[doc.status];

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600 shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <span className="text-sm font-medium text-gray-900 flex-1 truncate">{doc.name}</span>
        {onDeleteType && (
          <button
            onClick={e => { e.stopPropagation(); onDeleteType(); }}
            title="Удалить тип документа"
            className="text-gray-300 hover:text-red-500 shrink-0 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
        {doc.files.length > 0 && (
          <span className="text-xs text-gray-400 shrink-0">{doc.files.length} файл{doc.files.length > 1 ? 'а' : ''}</span>
        )}
        {savedTick && <span className="text-xs text-green-600 shrink-0">✓ Сохранено</span>}
        {saving && !savedTick && <span className="text-xs text-gray-400 shrink-0">Сохранение…</span>}
        <select
          className="text-xs border border-gray-200 rounded-md px-2 py-1 font-medium shrink-0"
          style={{ color, borderColor: color }}
          value={doc.status}
          disabled={saving}
          onChange={e => handleStatusChange(e.target.value as DocumentStatus)}
        >
          {(Object.keys(DOCUMENT_STATUS_LABELS) as DocumentStatus[]).map(s => (
            <option key={s} value={s}>{DOCUMENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 pl-6">
          {doc.received_date && (
            <div className="text-xs text-gray-500">Получен: {formatDate(doc.received_date)}</div>
          )}
          {doc.requested_date && !doc.received_date && (
            <div className="text-xs text-gray-500">Запрошен: {formatDate(doc.requested_date)}</div>
          )}

          {doc.files.length > 0 && (
            <div className="space-y-1">
              {doc.files.map(f => (
                <div key={f.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-md px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 rounded accent-red-500 shrink-0"
                    checked={selectedFiles.has(f.id)}
                    onChange={() => toggleFileSelected(f.id)}
                  />
                  <Paperclip size={12} className="text-gray-400 shrink-0" />
                  <span className="flex-1 truncate text-gray-700" title={f.original_name}>{f.original_name}</span>
                  <button onClick={() => handleOpenFile(f.file_path)} className="text-primary-600 hover:underline flex items-center gap-0.5 shrink-0">
                    <ExternalLink size={11} /> Открыть
                  </button>
                  <button onClick={() => setDeleteTarget({ ids: [f.id], name: f.original_name })} className="text-red-500 hover:underline flex items-center gap-0.5 shrink-0">
                    <Trash2 size={11} /> Удалить
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedFiles.size > 0 && (
            <button
              onClick={() => setDeleteTarget({ ids: [...selectedFiles] })}
              className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
            >
              <Trash2 size={12} /> Удалить выбранные ({selectedFiles.size})
            </button>
          )}

          <div className="flex items-center gap-2">
            <button onClick={handleAttach} disabled={saving} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              <Paperclip size={12} /> {doc.files.length > 0 ? 'Прикрепить ещё' : '+ Прикрепить файл'}
            </button>
          </div>

          <textarea
            className="input text-xs resize-none"
            rows={2}
            placeholder="Комментарий..."
            value={comment}
            onChange={e => handleCommentChange(e.target.value)}
            onBlur={handleCommentBlur}
          />
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteFilesModal
          count={deleteTarget.ids.length}
          fileName={deleteTarget.name}
          onConfirm={() => doDelete(deleteTarget.ids)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
