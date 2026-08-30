import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import { useReminders } from '../hooks/useReminders';
import { formatDate } from '../utils/formatters';
import { Check, CheckCircle, Circle, Trash2, AlertTriangle, Calendar, Clock, User } from 'lucide-react';
import type { Reminder } from '../types';

type FilterType = 'all' | 'today' | 'overdue' | 'upcoming';

export default function Reminders() {
  const navigate = useNavigate();
  const { reminders, loading, fetchReminders, updateReminder, deleteReminder } = useReminders();
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    loadReminders();
  }, [filter]);

  const loadReminders = () => {
    if (filter === 'today') fetchReminders({ today: true });
    else if (filter === 'overdue') fetchReminders({ overdue: true });
    else if (filter === 'upcoming') fetchReminders({ upcoming: true });
    else fetchReminders();
  };

  const toggleComplete = async (r: Reminder) => {
    await updateReminder(r.id, { is_completed: r.is_completed ? 0 : 1 });
    loadReminders();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить задачу?')) return;
    await deleteReminder(id);
    loadReminders();
  };

  const isOverdue = (r: Reminder) => !r.is_completed && r.due_date && r.due_date < new Date().toISOString().split('T')[0];

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'today', label: 'Сегодня' },
    { key: 'overdue', label: 'Просроченные' },
    { key: 'upcoming', label: 'Предстоящие' },
  ];

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Задачи и напоминания</h1>

      <div className="flex gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === f.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Нет задач</div>
      ) : (
        <div className="space-y-2">
          {reminders.map(r => (
            <div key={r.id} className={`card flex items-start gap-3 py-3 px-4 ${r.is_completed ? 'opacity-60' : ''}`}>
              <button onClick={() => toggleComplete(r)} className="shrink-0 mt-0.5">
                {r.is_completed ? <CheckCircle size={18} className="text-green-500" /> : <Circle size={18} className="text-gray-400 hover:text-primary-600" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${r.is_completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</span>
                  {r.auto_created ? <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">авто</span> : null}
                  {isOverdue(r) && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full flex items-center gap-0.5"><AlertTriangle size={9}/> просрочено</span>}
                </div>
                {r.description && <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {r.client_name && (
                    <button onClick={() => navigate(`/clients/${r.client_id}`)} className="flex items-center gap-1 hover:text-primary-600">
                      <User size={11}/> {r.client_name}
                    </button>
                  )}
                  {r.due_date && (
                    <span className="flex items-center gap-1">
                      <Calendar size={11}/> {formatDate(r.due_date)}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => handleDelete(r.id)} className="shrink-0 text-gray-300 hover:text-red-500 p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
