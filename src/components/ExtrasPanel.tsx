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
    <div className="border-t border-gray-200 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-xs font-semibold text-gray-600">🔧 Дополнительное оборудование</h5>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
            <Plus size={12}/> Добавить
          </button>
        )}
      </div>

      {extras.length > 0 && (
        <div className="space-y-1 mb-2">
          {extras.map(e => (
            <div key={e.id} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
              <span className="flex-1">{e.name}</span>
              <span className="font-medium text-gray-900">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(e.price)}</span>
              <button onClick={() => handleDelete(e.id)} className="ml-2 text-gray-400 hover:text-red-500">
                <Trash2 size={12}/>
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm font-bold border-t border-gray-200 pt-1 mt-1">
            <span>Итого:</span>
            <span className="text-primary-700">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(total)}</span>
          </div>
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2">
          <input
            className="input text-xs flex-1"
            placeholder="Наименование"
            value={form.name}
            onChange={e => setForm({...form, name: e.target.value})}
            autoFocus
          />
          <input
            className="input text-xs w-24"
            type="number"
            placeholder="Цена"
            value={form.price}
            onChange={e => setForm({...form, price: e.target.value})}
          />
          <button onClick={handleAdd} className="text-green-600 hover:text-green-700">
            <Check size={16}/>
          </button>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
            <X size={16}/>
          </button>
        </div>
      )}
    </div>
  );
}
