import { useState, useEffect } from 'react';
import { ipcService } from '../services/ipcService';
import type { Consent, ConsentStatus } from '../types';
import { CONSENT_STATUS_LABELS, CONSENT_STATUS_COLORS } from '../types';
import { ShieldCheck } from 'lucide-react';
import { formatDate } from '../utils/formatters';

interface Props {
  clientId: number;
}

export default function ConsentCard({ clientId }: Props) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [clientId]);

  const load = async () => {
    const data = await ipcService.consent.getByClientId(clientId);
    setConsent(data ?? null);
  };

  const update = async (patch: Partial<Consent>) => {
    setSaving(true);
    await ipcService.consent.update(clientId, patch);
    await load();
    setSaving(false);
  };

  const handleStatusChange = (status: ConsentStatus) => {
    const patch: Partial<Consent> = { status };
    if (status === 'received' && !consent?.received_date) {
      patch.received_date = new Date().toISOString().split('T')[0];
    }
    update(patch);
  };

  const currentStatus: ConsentStatus = consent?.status ?? 'not_requested';
  const color = CONSENT_STATUS_COLORS[currentStatus];

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={18} style={{ color }} />
        <h3 className="font-semibold text-gray-900 text-sm">Согласие на обработку персональных данных</h3>
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

      {/* Status selector */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(Object.entries(CONSENT_STATUS_LABELS) as [ConsentStatus, string][]).map(([val, label]) => (
          <button
            key={val}
            disabled={saving}
            onClick={() => handleStatusChange(val)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              currentStatus === val
                ? 'border-transparent text-white'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
            }`}
            style={currentStatus === val ? { backgroundColor: CONSENT_STATUS_COLORS[val] } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Received date */}
      {(currentStatus === 'received' || currentStatus === 'verified') && (
        <div className="mb-3">
          <label className="label">Дата получения</label>
          <input
            type="date"
            className="input"
            value={consent?.received_date ?? ''}
            onChange={e => update({ received_date: e.target.value })}
          />
        </div>
      )}

      {/* Scan path — text field (file picker Phase 2) */}
      {(currentStatus === 'received' || currentStatus === 'verified') && (
        <div className="mb-3">
          <label className="label">Путь к скану (или имя файла)</label>
          <input
            className="input text-xs"
            placeholder="Например: согласие_иванов.pdf"
            value={consent?.scan_path ?? ''}
            onChange={e => update({ scan_path: e.target.value })}
          />
        </div>
      )}

      {/* Comment */}
      <div>
        <label className="label">Примечание</label>
        <input
          className="input"
          placeholder="Дополнительная информация..."
          value={consent?.comment ?? ''}
          onBlur={e => update({ comment: e.target.value })}
          onChange={e => setConsent(c => c ? { ...c, comment: e.target.value } : c)}
        />
      </div>
    </div>
  );
}
