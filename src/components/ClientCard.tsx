import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client } from '../types';
import StatusBadge from './StatusBadge';
import { formatDate } from '../utils/formatters';
import { X, Plus, Check } from 'lucide-react';
import { ipcService } from '../services/ipcService';

interface Props {
  client: Client;
  onReminderCreated?: () => void;
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

const PAYMENT_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  paid:      { label: 'Оплачен',    color: '#059669', bg: '#d1fae5' },
  not_paid:  { label: 'Не оплачен', color: '#dc2626', bg: '#fee2e2' },
  pending:   { label: 'Ожидает',    color: '#d97706', bg: '#fef3c7' },
  partial:   { label: 'Частично',   color: '#d97706', bg: '#fef3c7' },
  cancelled: { label: 'Отменён',    color: '#6b7280', bg: '#f3f4f6' },
};

// ── Popup ─────────────────────────────────────────────────────────────────────

interface PopupProps {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

function CallPopup({ client, onClose, onSaved }: PopupProps) {
  const existingId = client.next_reminder_id ?? null;
  const [date, setDate] = useState(client.next_action_date || todayISO());
  const [time, setTime] = useState(client.next_action_time || '');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
      if (existingId) {
        await ipcService.reminders.update(existingId, {
          due_date: date || undefined,
          due_time: time || undefined,
          ...(comment ? { description: comment } : {}),
        });
      } else {
        await ipcService.reminders.create({
          client_id: client.id,
          title: 'Позвонить',
          description: comment || undefined,
          due_date: date || undefined,
          due_time: time || undefined,
        });
      }
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  const handleDone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!existingId) return;
    setSaving(true);
    try {
      await ipcService.reminders.update(existingId, { is_completed: 1 });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div ref={ref} onClick={e => e.stopPropagation()}
      className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {existingId ? 'Перенести задачу' : 'Запланировать звонок'}
        </span>
        <button onClick={e => { e.stopPropagation(); onClose(); }} className="text-gray-400 hover:text-gray-600">
          <X size={13}/>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Дата</label>
          <input type="date" className="input text-xs py-1 px-2 w-full" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Время</label>
          <input type="time" className="input text-xs py-1 px-2 w-full" value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Комментарий</label>
        <textarea className="input text-xs resize-none w-full" rows={2} placeholder="О чём поговорить..." value={comment} onChange={e => setComment(e.target.value)} />
      </div>
      <div className="flex gap-1.5">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 bg-primary-600 hover:bg-primary-700 text-white text-xs py-1.5 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : existingId ? 'Перенести' : 'Создать задачу'}
        </button>
        {existingId && (
          <button onClick={handleDone} disabled={saving} title="Отметить выполненной"
            className="px-2.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Check size={13}/>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function ClientCard({ client, onReminderCreated }: Props) {
  const navigate = useNavigate();
  const [showPopup, setShowPopup] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasReminder = !!client.next_action;
  const isOverdue = hasReminder && client.next_action_date && client.next_action_date < todayISO();
  const payment = client.payment_status ? PAYMENT_LABEL[client.payment_status] : null;

  const daysUntil = (() => {
    if (!client.delivery_date_est) return null;
    const diff = Math.ceil((new Date(client.delivery_date_est).getTime() - new Date(todayISO()).getTime()) / 86400000);
    return diff;
  })();

  const handleSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onReminderCreated?.();
  };

  const reminderLabel = (() => {
    if (!client.next_action) return null;
    const parts: string[] = [client.next_action];
    if (client.next_action_date) {
      parts.push(formatDate(client.next_action_date));
      if (client.next_action_time) parts.push(`в ${client.next_action_time}`);
    }
    return parts.join(' · ');
  })();

  const handleClick = () => {
    if (client.status_name === 'Допы') {
      navigate(`/extras/${client.id}`);
    } else {
      navigate(`/clients/${client.id}`);
    }
  };

  return (
    <div onClick={handleClick}
      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
    >
      {/* ROW 1: Contract + Status */}
      <div className="flex items-center justify-between mb-3">
        <div>
          {client.contract_number ? (
            <span className="text-sm font-bold text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg">
              № {client.contract_number}
            </span>
          ) : (
            <span className="text-sm font-medium text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">
              Без договора
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(client.reminders_count ?? 0) > 0 && (
            <span title={`Задач: ${client.reminders_count}`}
              className={`text-xs font-bold px-2 py-0.5 rounded-full leading-none ${
                (client.reminders_overdue ?? 0) > 0 ? 'bg-red-500 text-white' : 'bg-amber-400 text-white'
              }`}
            >
              {client.reminders_count}
            </span>
          )}
          <StatusBadge status={client.status_id ? { name: client.status_name || '', color: client.status_color || '', id: client.status_id, sort_order: 0, is_active: 1, category: 'pipeline' } : null} />
        </div>
      </div>

      {/* ROW 2: Full name */}
      <h3 className="font-bold text-gray-900 text-base leading-snug truncate mb-3">{client.full_name}</h3>

      {/* ROW 3: Phone (left) | Payment+date (right) */}
      <div className="flex items-start justify-between mb-2">
        <div className="text-sm font-medium text-gray-800">
          {client.phone || ''}
        </div>
        <div className="text-right">
          {payment && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ color: payment.color, backgroundColor: payment.bg }}
              >
                {payment.label}
              </span>
              {client.payment_date && (
                <span className="text-xs text-gray-600">{formatDate(client.payment_date)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: Car (left) | Price (right) */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-sm font-semibold text-gray-900 truncate flex-1">
          {client.car && client.car.trim() ? client.car.trim() : ''}
        </div>
        {client.price !== undefined && client.price !== null && (
          <div className="text-sm font-bold text-primary-700 shrink-0">
            {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(client.price)}
          </div>
        )}
      </div>

      {/* ROW 5: Delivery */}
      {client.delivery_date_est && (
        <div className={`text-sm mb-2 ${
          daysUntil !== null && daysUntil < 0 ? 'text-red-600 font-bold' :
          daysUntil !== null && daysUntil <= 3 ? 'text-amber-600 font-bold' : 'text-gray-700'
        }`}>
          Прибытие: {formatDate(client.delivery_date_est)}
          {daysUntil !== null && daysUntil >= 0 && (
            <span className="ml-1.5 text-xs bg-gray-100 px-1.5 py-0.5 rounded">{daysUntil} дн.</span>
          )}
          {daysUntil !== null && daysUntil < 0 && (
            <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Просрочено</span>
          )}
        </div>
      )}

      {/* ROW 7: Task */}
      <div className="relative border-t border-gray-200 pt-2 mt-1">
        {hasReminder ? (
          <button onClick={e => { e.stopPropagation(); setShowPopup(v => !v); }}
            className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1 -mx-2 w-full text-left transition-colors ${
              isOverdue ? 'text-red-600 font-semibold hover:bg-red-50' : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            <span className="flex-1 truncate">{reminderLabel}</span>
            {saved ? <Check size={14} className="text-green-600 shrink-0"/> : <span className="text-gray-400 text-xs shrink-0">⏰</span>}
          </button>
        ) : (
          <button onClick={e => { e.stopPropagation(); setShowPopup(v => !v); }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors px-2 py-1 -mx-2"
          >
            <Plus size={14}/> Запланировать звонок
          </button>
        )}
        {showPopup && (
          <CallPopup client={client} onClose={() => setShowPopup(false)} onSaved={handleSaved} />
        )}
      </div>
    </div>
  );
}
