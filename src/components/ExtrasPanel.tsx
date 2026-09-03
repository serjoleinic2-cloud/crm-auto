import { useState, useEffect } from 'react';
import { ipcService } from '../services/ipcService';
import type { Extra } from '../types';
import { Plus, Trash2, Check, X } from 'lucide-react';

interface Props {
  orderId: number;
}

export default function ExtrasPanel({ orderId }: Props) {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', price: '' });

  const load = async () => {
    const data = await ipcService.extras.getByOrder(orderId);
    setExtras(data);
  };

  useEffect(() => { load(); }, [orderId]);

  const total = extras.reduce((sum, e) => sum + (e.price || 0), 0);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await ipcService.extras.create({
      order_id: orderId,
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

  return (
    <div className="border-t border-gray-200 pt-3 mt-3 bg-blue-900/5 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-xs font-semibold text-blue-900">🔧 Дополнительное оборудование</h5>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-blue-700 hover:underline flex items-center gap-1">
            <Plus size={12}/> Добавить
          </button>
        )}
      </div>

      {extras.length > 0 && (
        <div className="space-y-1 mb-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] font-semibold text-blue-800 uppercase tracking-wide px-2">
            <span>Наименование</span>
            <span className="text-right">Цена</span>
            <span></span>
          </div>
          {extras.map(e => (
            <div key={e.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-sm bg-white/60 rounded px-2 py-1">
              <span className="font-medium text-gray-800">{e.name}</span>
              <span className="font-medium text-gray-900 text-right">
                {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(e.price)}
              </span>
              <button onClick={() => handleDelete(e.id)} className="text-gray-400 hover:text-red-500 ml-1">
                <Trash2 size={12}/>
              </button>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center text-sm font-bold border-t border-blue-200/50 pt-1 mt-1 px-2">
            <span className="text-blue-900">Итого:</span>
            <span className="text-blue-900 text-right">
              {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(total)}
            </span>
          </div>
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="text-[10px] font-semibold text-blue-800 uppercase tracking-wide">Наименование</label>
              <input
                className="input text-sm w-full"
                placeholder="Например: сигнализация"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-blue-800 uppercase tracking-wide">Цена (₽)</label>
              <input
                className="input text-sm w-28"
                type="number"
                placeholder="0"
                value={form.price}
                onChange={e => setForm({...form, price: e.target.value})}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="btn-primary text-xs flex-1">Добавить</button>
            <button onClick={() => setEditing(false)} className="btn-secondary text-xs">Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
