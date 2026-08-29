import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import { useClients } from '../hooks/useClients';
import { ArrowLeft } from 'lucide-react';

export default function QuickAdd() {
  const navigate = useNavigate();
  const { createClient } = useClients();
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    car: '',
    messenger: 'phone' as 'phone' | 'telegram' | 'max' | 'whatsapp' | 'other',
    messengerValue: '',
    comment: '',
    next_action: '',
    next_action_date: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;

    const clientId = await createClient({
      full_name: form.full_name,
      phone: form.phone || null,
      email: null,
      comment: form.comment || null,
      source: null,
      status_id: 1, // "Новый клиент"
      next_action: form.next_action || null,
      next_action_date: form.next_action_date || null,
      is_archived: 0,
    });

    if (clientId) {
      // Add contact
      if (form.messengerValue) {
        await ipcService.contacts.create({
          client_id: clientId,
          type: form.messenger,
          value: form.messengerValue,
          label: null,
          is_primary: 1,
        });
      }

      // Add order if car specified
      if (form.car) {
        const [brand, ...modelParts] = form.car.split(' ');
        await ipcService.orders.create({
          client_id: clientId,
          contract_number: null,
          brand: brand || null,
          model: modelParts.join(' ') || null,
          year: null,
          configuration: null,
          description: null,
          price: null,
          comment: null,
          delivery_date_est: null,
          delivery_date_actual: null,
          payment_date: null,
          payment_status: null,
        });
      }

      navigate(`/clients/${clientId}`);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft size={18} /> Назад
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-4">Экспресс-добавление клиента</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">ФИО *</label>
          <input
            className="input"
            value={form.full_name}
            onChange={e => setForm({...form, full_name: e.target.value})}
            placeholder="Иван Петров"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="label">Телефон</label>
          <input
            className="input"
            value={form.phone}
            onChange={e => setForm({...form, phone: e.target.value})}
            placeholder="+7 999 123-45-67"
          />
        </div>

        <div>
          <label className="label">Интересующий автомобиль</label>
          <input
            className="input"
            value={form.car}
            onChange={e => setForm({...form, car: e.target.value})}
            placeholder="Toyota Camry"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Мессенджер</label>
            <select
              className="input"
              value={form.messenger}
              onChange={e => setForm({...form, messenger: e.target.value as typeof form.messenger})}
            >
              <option value="phone">Телефон</option>
              <option value="telegram">Telegram</option>
              <option value="max">MAX</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="other">Другое</option>
            </select>
          </div>
          <div>
            <label className="label">Значение</label>
            <input
              className="input"
              value={form.messengerValue}
              onChange={e => setForm({...form, messengerValue: e.target.value})}
              placeholder="username или номер"
            />
          </div>
        </div>

        <div>
          <label className="label">Следующее действие</label>
          <input
            className="input"
            value={form.next_action}
            onChange={e => setForm({...form, next_action: e.target.value})}
            placeholder="Позвонить, отправить предложение..."
          />
        </div>

        <div>
          <label className="label">Дата следующего контакта</label>
          <input
            type="date"
            className="input"
            value={form.next_action_date}
            onChange={e => setForm({...form, next_action_date: e.target.value})}
          />
        </div>

        <div>
          <label className="label">Комментарий</label>
          <textarea
            className="input"
            rows={2}
            value={form.comment}
            onChange={e => setForm({...form, comment: e.target.value})}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary flex-1">Сохранить клиента</button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Отмена</button>
        </div>
      </form>
    </div>
  );
}