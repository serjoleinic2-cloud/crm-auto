import { useState, useEffect, useRef } from 'react';
import { ipcService } from '../services/ipcService';
import type { Consent, ConsentStatus } from '../types';
import { CONSENT_STATUS_LABELS, CONSENT_STATUS_COLORS } from '../types';
import { ShieldCheck, Trash2, AlertTriangle } from 'lucide-react';
import { formatDate } from '../utils/formatters';

interface Props { clientId: number; }

export default function ConsentCard({ clientId }: Props) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanSelected, setScanSelected] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const commentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { load(); }, [clientId]);

  const load = async () => {
    const data = await ipcService.consent.getByClientId(clientId);
    const c = data ?? null;
    setConsent(c);
    setComment(c?.comment ?? '');
    setScanSelected(false);
  };

  const save = async (patch: Partial<Omit<Consent, 'id' | 'client_id' | 'updated_at'>>) => {
    setSaving(true);
    try {
      await ipcService.consent.update(clientId, patch);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: ConsentStatus) => {
    if (saving) return;
    const patch: Partial<Consent> = { status };
    if (status === 'received' && !consent?.received_date) {
      patch.received_date = new Date().toISOString().split('T')[0];
    }
    await save(patch);
  };

  const handleCommentChange = (value: string) => {
    setComment(value);
    if (commentSaveTimer.current) clearTimeout(commentSaveTimer.current);
    commentSaveTimer.current = setTimeout(() => save({ comment: value }), 800);
  };

  const handleCommentBlur = () => {
    if (commentSaveTimer.current) clearTimeout(commentSaveTimer.current);
    save({ comment });
  };

  const handleDeleteScan = async () => {
    await save({ scan_path: null });
    setScanSelected(false);
    setDeleteConfirm(false);
  };

  const currentStatus: ConsentStatus = consent?.status ?? 'not_requested';
  const color = CONSENT_STATUS_COLORS[currentStatus];
  const showDateScan = currentStatus === 'received' || currentStatus === 'verified';

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={18} style={{ color }} />
        <h3 className="font-semibold text-gray-900 text-sm">Согласие на обработку персональных данных</h3>
        {saving && <span className="text-xs text-gray-400 ml-auto">Сохранение...</span>}
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: color }}>
          {CONSENT_STATUS_LABELS[currentStatus]}
        </span>
        {consent?.received_date && (
          <span className="text-xs text-gray-500">Получено: {formatDate(consent.received_date)}</span>
        )}
      </div>

      {/* Status buttons */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(Object.keys(CONSENT_STATUS_LABELS) as ConsentStatus[]).map((val) => (
          <button
            key={val}
            disabled={saving}
            onClick={() => handleStatusChange(val)}
            className={`text-xs px-3 py-2 rounded-lg border font-medium transition-all ${
              currentStatus === val
                ? 'border-transparent text-white shadow-sm'
                : 'border-gray-200 text-gray-600 hover:border-gray-400 bg-white hover:bg-gray-50'
            }`}
            style={currentStatus === val ? { backgroundColor: CONSENT_STATUS_COLORS[val] } : {}}
          >
            {CONSENT_STATUS_LABELS[val]}
          </button>
        ))}
      </div>

      {showDateScan && (
        <div className="mb-3">
          <label className="label">Дата получения</label>
          <input type="date" className="input"
            value={consent?.received_date ?? ''}
            onChange={e => save({ received_date: e.target.value })} />
        </div>
      )}

      {/* Scan file with checkbox delete */}
      {showDateScan && (
        <div className="mb-3">
          <label className="label">Скан подписанного согласия</label>
          {consent?.scan_path ? (
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
              <input
                type="checkbox"
                id="scan-check"
                checked={scanSelected}
                onChange={e => setScanSelected(e.target.checked)}
                className="w-4 h-4 rounded accent-red-500"
              />
              <label htmlFor="scan-check" className="flex-1 text-sm text-gray-700 cursor-pointer truncate">
                {consent.scan_path}
              </label>
              {scanSelected && (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md transition-colors"
                >
                  <Trash2 size={12} /> Удалить
                </button>
              )}
            </div>
          ) : (
            <input
              className="input text-xs"
              placeholder="Например: согласие_иванов.pdf"
              defaultValue=""
              onBlur={e => { if (e.target.value) save({ scan_path: e.target.value }); }}
            />
          )}
        </div>
      )}

      {/* Comment */}
      <div>
        <label className="label">Примечание</label>
        <textarea
          className="input resize-none"
          rows={2}
          placeholder="Дополнительная информация..."
          value={comment}
          onChange={e => handleCommentChange(e.target.value)}
          onBlur={handleCommentBlur}
        />
      </div>

      {/* Delete scan confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div className="font-semibold text-gray-900">Удалить файл?</div>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium">{consent?.scan_path}</span>
            </p>
            <p className="text-sm text-gray-500 mb-5">
              Вы действительно хотите удалить прикреплённый файл? После удаления восстановить его будет невозможно.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDeleteScan} className="flex-1 btn-danger font-semibold">Удалить</button>
              <button onClick={() => { setDeleteConfirm(false); setScanSelected(false); }} className="flex-1 btn-secondary">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

