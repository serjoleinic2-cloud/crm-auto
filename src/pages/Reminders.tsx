import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import { useReminders } from '../hooks/useReminders';
import { formatDate } from '../utils/formatters';
import {
  Check, CheckCircle, Circle, Trash2, AlertTriangle,
  Calendar, Clock, User, Plus, X, Phone, ChevronRight,
} from 'lucide-react';
import type { Reminder, Client } from '../types';

type FilterType = 'all' | 'today' | 'overdue' | 'upcoming';

// ── helpers ──────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().split('T')[0]; }

function formatDateTime(date: string | null, time: string | null): string {
  if (!date) return '';
  const d = formatDate(date);
  return time ? `${d} в ${time}` : d;
}

function isOverdue(r: Reminder): boolean {
  if (r.is_completed || !r.due_date) return false;
  const today = todayISO();
  if (r.due_date < today) return true;
  if (r.due_date === today && r.due_time) {
    const now = new Date();
    const [h, m] = r.due_time.split(':').map(Number);
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
  }
  return false;
}

function isToday(r: Reminder): boolean {
  return !r.is_completed && r.due_date === todayISO();
}

// ── ClientSearch ──────────────────────────────────────────────────────────────

interface ClientSearchProps {
  value: Client | null;
  onChange: (c: Client | null) => void;
}

function ClientSearch({ value, onChange }: ClientSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const res = await ipcService.clients.suggest(q);
      setResults(res.slice(0, 8));
      setOpen(true);
    }, 200);
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-sm">
        <User size={13} className="text-blue-600 shrink-0" />
        <span className="text-blue-800 font-medium flex-1">{value.full_name}</span>
        <button onClick={() => onChange(null)} className="text-blue-400 hover:text-blue-700"><X size={13} /></button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="input text-sm w-full"
        placeholder="Поиск клиента..."
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => query && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              onMouseDown={() => { onChange(c); setQuery(''); setOpen(false); }}
            >
              <User size={12} className="text-gray-400 shrink-0" />
              <span>{c.full_name}</span>
              {c.phone && <span className="text-gray-400 text-xs ml-auto">{c.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CreateForm ────────────────────────────────────────────────────────────────

interface CreateFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

function CreateForm({ onCreated, onCancel }: CreateFormProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [title, setTitle] = useState('Позвонить');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  const quickTitles = ['Позвонить', 'Написать', 'Встреча', 'Документы', 'Другое'];

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);
    try {
      await ipcService.reminders.create({
        client_id: client.id,
        title,
        description: description || undefined,
        due_date: date || undefined,
        due_time: time || undefined,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card border-2 border-primary-200 bg-primary-50/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">Новая задача</span>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
      </div>

      {/* Client */}
      <div>
        <label className="label text-xs">Клиент <span className="text-red-500">*</span></label>
        <ClientSearch value={client} onChange={setClient} />
      </div>

      {/* Quick title buttons */}
      <div>
        <label className="label text-xs">Тип задачи</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {quickTitles.map(t => (
            <button
              key={t}
              onClick={() => setTitle(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                title === t
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary-400'
              }`}
            >
              {t === 'Позвонить' && <Phone size={10} className="inline mr-1" />}
              {t}
            </button>
          ))}
        </div>
        {!quickTitles.includes(title) || title === 'Другое' ? (
          <input
            className="input text-sm"
            placeholder="Название задачи"
            value={title === 'Другое' ? '' : title}
            onChange={e => setTitle(e.target.value)}
          />
        ) : null}
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-xs">Дата</label>
          <input type="date" className="input text-sm" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">Время (необязательно)</label>
          <input type="time" className="input text-sm" value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>

      {/* Comment */}
      <div>
        <label className="label text-xs">Комментарий</label>
        <textarea
          className="input text-sm resize-none"
          rows={2}
          placeholder="Что нужно сделать или обсудить..."
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !client || !title.trim()}
          className="btn-primary text-sm flex-1 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Создать задачу'}
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">Отмена</button>
      </div>
    </div>
  );
}

// ── ReminderCard ──────────────────────────────────────────────────────────────

interface PostponePopupProps {
  onSave: (date: string, time: string, comment: string) => void;
  onClose: () => void;
}

function PostponePopup({ onSave, onClose }: PostponePopupProps) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [comment, setComment] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 right-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">Перенести на</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={13}/></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Дата</label>
          <input type="date" className="input text-xs py-1 px-2 w-full" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Время</label>
          <input type="time" className="input text-xs py-1 px-2 w-full" value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Комментарий</label>
        <textarea
          className="input text-xs resize-none w-full"
          rows={2}
          placeholder="Причина переноса..."
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
      </div>
      <button
        onClick={() => { if (date) { onSave(date, time, comment); onClose(); } }}
        disabled={!date}
        className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40"
      >
        Перенести
      </button>
    </div>
  );
}

interface ReminderCardProps {
  r: Reminder;
  onDone: () => void;
  onPostpone: (date: string, time: string, comment: string) => void;
  onDelete: () => void;
  onClientClick: () => void;
}

function ReminderCard({ r, onDone, onPostpone, onDelete, onClientClick }: ReminderCardProps) {
  const overdue = isOverdue(r);
  const today = isToday(r);
  const [showPostpone, setShowPostpone] = useState(false);

  return (
    <div className={`card py-3 px-4 transition-all ${
      r.is_completed ? 'opacity-50' : overdue ? 'border-red-200 bg-red-50/40' : today ? 'border-amber-200 bg-amber-50/30' : ''
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Title + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${r.is_completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {r.title}
            </span>
            {overdue && (
              <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full flex items-center gap-0.5 font-medium">
                <AlertTriangle size={9}/> просрочено
              </span>
            )}
            {today && !overdue && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">сегодня</span>
            )}
            {r.auto_created ? (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">авто</span>
            ) : null}
          </div>

          {r.description && (
            <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
            {r.client_name && (
              <button onClick={onClientClick} className="flex items-center gap-1 hover:text-primary-600 transition-colors font-medium text-gray-600">
                <User size={11}/> {r.client_name} <ChevronRight size={10}/>
              </button>
            )}
            {r.client_phone && (
              <span className="flex items-center gap-1 text-gray-500">
                <Phone size={11}/> {r.client_phone}
              </span>
            )}
            {r.contract_number && <span>№ {r.contract_number}</span>}
            {r.car && r.car.trim() && <span>{r.car.trim()}</span>}
            {r.due_date && (
              <span className={`flex items-center gap-1 ${overdue ? 'text-red-500 font-medium' : ''}`}>
                {r.due_time ? <Clock size={11}/> : <Calendar size={11}/>}
                {formatDateTime(r.due_date, r.due_time)}
              </span>
            )}
          </div>
        </div>

        {/* Delete */}
        <button onClick={onDelete} className="shrink-0 text-gray-200 hover:text-red-500 transition-colors p-1 mt-0.5">
          <Trash2 size={14}/>
        </button>
      </div>

      {/* Action buttons */}
      {!r.is_completed && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100 relative">
          <button
            onClick={onDone}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
          >
            <Check size={13}/> Сделано
          </button>
          <button
            onClick={() => setShowPostpone(v => !v)}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <Calendar size={13}/> Перенести
          </button>
          {showPostpone && (
            <PostponePopup
              onSave={onPostpone}
              onClose={() => setShowPostpone(false)}
            />
          )}
        </div>
      )}

      {r.is_completed && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100">
          <button
            onClick={onDone}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Circle size={13}/> Восстановить
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Reminders() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { reminders, loading, fetchReminders, updateReminder, deleteReminder } = useReminders();
  const [filter, setFilter] = useState<FilterType>((searchParams.get('filter') as FilterType) || 'all');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { load(); }, [filter]);

  const load = () => {
    if (filter === 'today')    fetchReminders({ today: true });
    else if (filter === 'overdue')   fetchReminders({ overdue: true });
    else if (filter === 'upcoming')  fetchReminders({ upcoming: true });
    else fetchReminders();
  };

  const setFilterNav = (f: FilterType) => {
    setFilter(f);
    setSearchParams({ filter: f });
  };

  const handleDone = async (r: Reminder) => {
    await updateReminder(r.id, { is_completed: r.is_completed ? 0 : 1 });
    load();
  };

  const handlePostpone = async (r: Reminder, date: string, time: string, comment: string) => {
    await updateReminder(r.id, {
      due_date: date,
      due_time: time || undefined,
      description: comment ? (r.description ? `${r.description}\n${comment}` : comment) : r.description ?? undefined,
    });
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить задачу?')) return;
    await deleteReminder(id);
    load();
  };

  // counts for badges
  const overdueCount = reminders.filter(isOverdue).length;
  const todayCount   = reminders.filter(isToday).length;

  const filters: { key: FilterType; label: string; badge?: number }[] = [
    { key: 'all',      label: 'Все' },
    { key: 'today',    label: 'Сегодня',       badge: filter !== 'today'    ? undefined : todayCount },
    { key: 'overdue',  label: 'Просроченные',  badge: filter !== 'overdue'  ? undefined : overdueCount },
    { key: 'upcoming', label: 'Предстоящие' },
  ];

  const grouped = (() => {
    if (filter !== 'all') return null;
    const overdue  = reminders.filter(r => isOverdue(r) && !r.is_completed);
    const today    = reminders.filter(r => isToday(r) && !isOverdue(r) && !r.is_completed);
    const upcoming = reminders.filter(r => !r.is_completed && r.due_date && r.due_date > todayISO());
    const done     = reminders.filter(r => r.is_completed);
    const noDate   = reminders.filter(r => !r.is_completed && !r.due_date);
    return { overdue, today, upcoming, done, noDate };
  })();

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Задачи</h1>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="btn-primary text-sm flex items-center gap-1.5"
        >
          <Plus size={15}/> Новая задача
        </button>
      </div>

      {showCreate && (
        <CreateForm
          onCreated={() => { setShowCreate(false); load(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterNav(f.key)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              filter === f.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
            {f.badge !== undefined && f.badge > 0 && (
              <span className="bg-white/30 text-xs px-1.5 py-0.5 rounded-full leading-none">{f.badge}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Загрузка...</div>
      ) : grouped ? (
        // "All" — grouped view
        <div className="space-y-4">
          {grouped.overdue.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                <AlertTriangle size={12}/> Просроченные ({grouped.overdue.length})
              </h2>
              <div className="space-y-2">
                {grouped.overdue.map(r => (
                  <ReminderCard key={r.id} r={r}
                    onDone={() => handleDone(r)}
                    onPostpone={(date, time, comment) => handlePostpone(r, date, time, comment)}
                    onDelete={() => handleDelete(r.id)}
                    onClientClick={() => navigate(`/clients/${r.client_id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {grouped.today.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Calendar size={12}/> Сегодня ({grouped.today.length})
              </h2>
              <div className="space-y-2">
                {grouped.today.map(r => (
                  <ReminderCard key={r.id} r={r}
                    onDone={() => handleDone(r)}
                    onPostpone={(date, time, comment) => handlePostpone(r, date, time, comment)}
                    onDelete={() => handleDelete(r.id)}
                    onClientClick={() => navigate(`/clients/${r.client_id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {grouped.noDate.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Без даты</h2>
              <div className="space-y-2">
                {grouped.noDate.map(r => (
                  <ReminderCard key={r.id} r={r}
                    onDone={() => handleDone(r)}
                    onPostpone={(date, time, comment) => handlePostpone(r, date, time, comment)}
                    onDelete={() => handleDelete(r.id)}
                    onClientClick={() => navigate(`/clients/${r.client_id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {grouped.upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Предстоящие</h2>
              <div className="space-y-2">
                {grouped.upcoming.map(r => (
                  <ReminderCard key={r.id} r={r}
                    onDone={() => handleDone(r)}
                    onPostpone={(date, time, comment) => handlePostpone(r, date, time, comment)}
                    onDelete={() => handleDelete(r.id)}
                    onClientClick={() => navigate(`/clients/${r.client_id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {grouped.done.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Check size={12}/> Выполнено ({grouped.done.length})
              </h2>
              <div className="space-y-2">
                {grouped.done.map(r => (
                  <ReminderCard key={r.id} r={r}
                    onDone={() => handleDone(r)}
                    onPostpone={(date, time, comment) => handlePostpone(r, date, time, comment)}
                    onDelete={() => handleDelete(r.id)}
                    onClientClick={() => navigate(`/clients/${r.client_id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {reminders.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Calendar size={32} className="mx-auto mb-3 opacity-30" />
              <p>Задач нет</p>
              <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-primary-600 hover:underline flex items-center gap-1 mx-auto">
                <Plus size={13}/> Создать первую задачу
              </button>
            </div>
          )}
        </div>
      ) : (
        // Filtered view — flat list
        <div className="space-y-2">
          {reminders.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Calendar size={32} className="mx-auto mb-3 opacity-30" />
              <p>{filter === 'overdue' ? 'Просроченных задач нет' : filter === 'today' ? 'Задач на сегодня нет' : 'Задач нет'}</p>
            </div>
          ) : reminders.map(r => (
            <ReminderCard key={r.id} r={r}
              onDone={() => handleDone(r)}
                    onPostpone={(date, time, comment) => handlePostpone(r, date, time, comment)}
              onDelete={() => handleDelete(r.id)}
              onClientClick={() => navigate(`/clients/${r.client_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
