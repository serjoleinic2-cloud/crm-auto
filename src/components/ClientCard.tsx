import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client } from '../types';
import StatusBadge from './StatusBadge';
import { formatDate } from '../utils/formatters';
import { Phone, Calendar, AlertCircle, Clock, X, Plus, Check } from 'lucide-react';
import { ipcService } from '../services/ipcService';

interface Props {
  client: Client;
  onReminderCreated?: () => void;
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

const PAYMENT_LABEL: Record<string, { label: string; color: string }> = {
  paid:      { label: 'Оплачен',    color: '#10b981' },
  not_paid:  { label: 'Не оплачен', color: '#ef4444' },
  pending:   { label: 'Ожидает',    color: '#f59e0b' },
  partial:   { label: 'Частично',   color: '#f59e0b' },
  cancelled: { label: 'Отменён',    color: '#9ca3af' },
};

// ── Inline popup ──────────────────────────────────────────────────────────────

interface PopupProps {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

function CallPopup({ client, onClose, onSaved }: PopupProps) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    try {
      await ipcService.reminders.create({
        client_id: client.id,
        title: 'Позвонить',
        description: comment || undefined,
        due_date: date || undefined,
        due_time: time || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">Запланировать звонок</span>
        <button onClick={e => { e.stopPropagation(); onClose(); }} className="text-gray-400 hover:text-gray-600">
          <X size={13}/>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Дата</label>
          <input
            type="date"
            className="input text-xs py-1 px-2 w-full"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Время</label>
          <input
            type="time"
            className="input text-xs py-1 px-2 w-full"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Комментарий</label>
        <textarea
          className="input text-xs resize-none w-full"
          rows={2}
          placeholder="О чём поговорить..."
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-primary-600 hover:bg-primary-700 text-white text-xs py-1.5 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
      >
        {saving ? 'Сохранение...' : <><Plus size={11}/> Создать задачу</>}
      </button>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function ClientCard({ client, onReminderCreated }: Props) {
  const navigate = useNavigate();
  const [showPopup, setShowPopup] = useState(false);
  const [saved, setSaved] = useState(false);
  const isOverdue = client.next_action_date && client.next_action_date < todayISO();
  const payment = client.payment_status ? PAYMENT_LABEL[client.payment_status] : null;

  const handleSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onReminderCreated?.();
  };

  return (
    <div
      onClick={() => navigate(`/clients/${client.id}`)}
      className="card cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 truncate">{client.full_name}</h3>
        <StatusBadge status={client.status_id ? { name: client.status_name || '', color: client.status_color || '', id: client.status_id, sort_order: 0, is_active: 1, category: 'pipeline' } : null} />
      </div>

      <div className="space-y-1 text-sm text-gray-600">
        {client.phone && (
          <div className="flex items-center gap-2">
            <Phone size={14} />
            <span>{client.phone}</span>
          </div>
        )}

        {/* Payment status */}
        {payment && (
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ color: payment.color, backgroundColor: payment.color + '18' }}
            >
              {payment.label}
            </span>
            {client.car && client.car.trim() && (
              <span className="text-xs text-gray-400 truncate">{client.car.trim()}</span>
            )}
          </div>
        )}

        {/* Next action — кликабельная кнопка */}
        {client.next_action && (
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowPopup(v => !v); }}
              className={`flex items-center gap-1.5 text-sm rounded-md px-2 py-0.5 -mx-2 transition-colors w-full text-left ${
                isOverdue
                  ? 'text-red-600 font-medium hover:bg-red-50'
                  : 'text-amber-600 hover:bg-amber-50'
              }`}
            >
              {isOverdue ? <AlertCircle size={13} /> : <Calendar size={13} />}
              <span className="flex-1 truncate">
                {client.next_action}
                {client.next_action_date && ` (${formatDate(client.next_action_date)})`}
              </span>
              {saved
                ? <Check size={12} className="text-green-500 shrink-0"/>
                : <Clock size={12} className="opacity-40 shrink-0"/>}
            </button>

            {showPopup && (
              <CallPopup
                client={client}
                onClose={() => setShowPopup(false)}
                onSaved={handleSaved}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
