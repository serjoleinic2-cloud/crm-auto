import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import { useClients } from '../hooks/useClients';
import type { CarBrand } from '../types';
import { ArrowLeft } from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 15 }, (_, i) => CURRENT_YEAR - i);

export default function QuickAdd() {
  const navigate = useNavigate();
  const { createClient } = useClients();
  const [brands, setBrands] = useState<CarBrand[]>([]);
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '',
    messenger: 'phone' as 'phone' | 'telegram' | 'max' | 'whatsapp' | 'other',
    messengerValue: '',
    brand: '', model: '', year: '', configuration: '', description: '', price: '',
    comment: '', next_action: '', next_action_date: '',
  });

  useEffect(() => {
    ipcService.carBrands.getAll().then(setBrands).catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;

    const clientId = await createClient({
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      comment: form.comment || null,
      source: null,
      status_id: 1,
      next_action: form.next_action || null,
      next_action_date: form.next_action_date || null,
      is_archived: 0,
      is_deleted: 0,
      deleted_at: null,
    });

    if (clientId) {
      if (form.messengerValue) {
        await ipcService.contacts.create({
          client_id: clientId, type: form.messenger,
          value: form.messengerValue, label: null, is_primary: 1,
        });
      }
      if (form.brand || form.model) {
        await ipcService.orders.create({
          client_id: clientId,
          contract_number: null,
          brand: form.brand || null,
          model: form.model || null,
          year: form.year ? parseInt(form.year) : null,
          configuration: form.configuration || null,
          description: form.description || null,
          price: form.price ? parseFloat(form.price) : null,
          comment: null,
          delivery_date_est: null, delivery_date_actual: null,
          payment_date: null, payment_status: null,
        });
      }
      navigate(`/clients/${clientId}`);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm">
        <ArrowLeft size={16} /> Назад
      </button>
      <h1 className="text-lg font-bold text-gray-900 mb-4">Новый клиент</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Client info */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">Клиент</h2>

          <div>
            <label className="label">ФИО *</label>
            <input className="input" value={form.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="Иван Петров" required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Телефон</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+373 xxx xx xx" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="email@example.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Мессенджер</label>
              <select className="input" value={form.messenger}
                onChange={e => set('messenger', e.target.value as typeof form.messenger)}>
                <option value="phone">Телефон</option>
                <option value="telegram">Telegram</option>
                <option value="max">MAX</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <div>
              <label className="label">Username / номер</label>
              <input className="input" value={form.messengerValue} onChange={e => set('messengerValue', e.target.value)}
                placeholder="@username или номер" />
            </div>
          </div>
        </div>

        {/* Car info */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">Автомобиль</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Марка</label>
              <select className="input" value={form.brand} onChange={e => set('brand', e.target.value)}>
                <option value="">— не выбрано —</option>
                {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Модель</label>
              <input className="input" value={form.model} onChange={e => set('model', e.target.value)}
                placeholder="Camry, X5, Polo..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Год выпуска</label>
              <select className="input" value={form.year} onChange={e => set('year', e.target.value)}>
                <option value="">— не выбрано —</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Цена (₽)</label>
              <input className="input" type="number" value={form.price} onChange={e => set('price', e.target.value)}
                placeholder="0" min="0" />
            </div>
          </div>

          <div>
            <label className="label">Комплектация</label>
            <input className="input" value={form.configuration} onChange={e => set('configuration', e.target.value)}
              placeholder="Comfort, Premium, Sport..." />
          </div>

          <div>
            <label className="label">Описание / пожелания</label>
            <textarea className="input resize-none" rows={2} value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Цвет, опции, особые пожелания..." />
          </div>
        </div>

        {/* Task */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">Задача и комментарий</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Следующее действие</label>
              <input className="input" value={form.next_action} onChange={e => set('next_action', e.target.value)}
                placeholder="Позвонить, выслать КП..." />
            </div>
            <div>
              <label className="label">Дата напоминания</label>
              <input type="date" className="input" value={form.next_action_date}
                onChange={e => set('next_action_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Комментарий</label>
            <textarea className="input resize-none" rows={2} value={form.comment}
              onChange={e => set('comment', e.target.value)} placeholder="Любые заметки..." />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1">Сохранить клиента</button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Отмена</button>
        </div>
      </form>
    </div>
  );
}
