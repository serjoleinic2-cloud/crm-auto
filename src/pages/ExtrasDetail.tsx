import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import type { Client, Extra, Order, Status } from '../types';
import { ArrowLeft, Plus, Trash2, Check, X, Calendar, Clock } from 'lucide-react';

export default function ExtrasDetail() {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', price: '' });
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');

  const load = async () => {
    if (!clientId) { setLoading(false); return; }
    const id = parseInt(clientId);
    const c = await ipcService.clients.getById(id);
    setClient(c ?? null);
    const o = await ipcService.orders.getByClientId(id);
    setOrders(o);
    const s = await ipcService.statuses.getAll();
    setStatuses(s);

    // Load extras for all orders of this client
    const allExtras: Extra[] = [];
    for (const order of o) {
      const e = await ipcService.extras.getByOrder(order.id);
      allExtras.push(...e);
    }
    setExtras(allExtras);
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  const total = extras.reduce((sum, e) => sum + (e.price || 0), 0);

  const handleAdd = async () => {
    if (!form.name.trim() || !orders.length) return;
    await ipcService.extras.create({
      order_id: orders[0].id,
      name: form.name.trim(),
      price: parseFloat(form.price) || 0,
    });
    setForm({ name: '', price: '' });
    setEditing(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить доп?')) return;
    await ipcService.extras.delete(id);
    load();
  };

  const handleStatusChange = async (statusName: string) => {
    const status = statuses.find(s => s.name === statusName);
    if (status && client) {
      await ipcService.clients.update(client.id, { status_id: status.id });
      if (statusName === 'На площадке') {
        navigate('/clients');
      } else {
        load();
      }
    }
  };

  const handleSetReminder = async () => {
    if (!client || !reminderDate) return;
    await ipcService.reminders.create({
      client_id: client.id,
      title: 'Допы готовы',
      description: 'Проверить готовность дополнительного оборудования',
      due_date: reminderDate,
      due_time: reminderTime || undefined,
    });
    alert('Напоминание установлено');
  };

  if (loading) return <div className="p-4 text-center">Загрузка...</div>;
  if (!client) return <div className="p-4 text-center">Клиент не найден</div>;

  const carName = orders.length > 0 ? `${orders[0].brand || ''} ${orders[0].model || ''}`.trim() : '';

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm">
        <ArrowLeft size={16} /> Назад
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{client.full_name}</h1>
          {carName && <p className="text-sm text-gray-600">{carName}</p>}
        </div>
        <span className="text-sm font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-lg">Допы</span>
      </div>

      {/* Extras table */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Дополнительное оборудование</h2>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              <Plus size={12}/> Добавить
            </button>
          )}
        </div>

        {extras.length > 0 ? (
          <div className="space-y-2">
            {extras.map(e => (
              <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-gray-800">{e.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-900">
                    {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(e.price)}
                  </span>
                  <button onClick={() => handleDelete(e.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-gray-200 pt-2 mt-2">
              <span className="text-sm font-bold text-gray-700">Итого:</span>
              <span className="text-sm font-bold text-primary-700">
                {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(total)}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-400 text-sm">Нет допов</div>
        )}

        {editing && (
          <div className="flex items-center gap-2 mt-3">
            <input className="input text-sm flex-1" placeholder="Наименование" value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus />
            <input className="input text-sm w-28" type="number" placeholder="Цена" value={form.price} onChange={e => setForm({...form, price: e.target.value})} />
            <button onClick={handleAdd} className="text-green-600 hover:text-green-700"><Check size={18}/></button>
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
          </div>
        )}
      </div>

      {/* Reminder */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Напоминание по готовности</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label text-xs">Дата</label>
            <input type="date" className="input text-sm" value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Время</label>
            <input type="time" className="input text-sm" value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
          </div>
        </div>
        <button onClick={handleSetReminder} disabled={!reminderDate} className="btn-primary text-sm w-full disabled:opacity-50">
          <Calendar size={14} className="inline mr-1"/> Установить напоминание
        </button>
      </div>

      {/* Status actions */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Статус</h2>
        <div className="flex gap-2">
          <button onClick={() => handleStatusChange('На площадке')} className="btn-primary flex-1 text-sm">
            <Check size={14} className="inline mr-1"/> Готов → На площадку
          </button>
        </div>
      </div>
    </div>
  );
}
