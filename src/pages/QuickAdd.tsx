import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import { useClients } from '../hooks/useClients';
import type { CarBrand, Status } from '../types';
import { ArrowLeft } from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 15 }, (_, i) => CURRENT_YEAR - i);

const DRIVE_OPTIONS = ['Передний', 'Задний', 'Полный'];
const TRANSMISSION_OPTIONS = ['АКПП', 'МКПП', 'Вариатор', 'Робот'];
const ENGINE_TYPE_OPTIONS = ['Бензин', 'Дизель', 'Гибрид', 'Электро'];
const SEATS_OPTIONS = ['2', '4', '5', '6', '7', '8', '9'];

export default function QuickAdd() {
  const navigate = useNavigate();
  const { createClient } = useClients();
  const [brands, setBrands] = useState<CarBrand[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [brandInputMode, setBrandInputMode] = useState<'select' | 'custom'>('select');
  const [taskInputMode, setTaskInputMode] = useState<'select' | 'custom'>('select');

  const [form, setForm] = useState({
    // Client - left column
    status_id: '',
    full_name: '',
    phone: '',
    messenger: 'phone' as 'phone' | 'telegram' | 'max' | 'whatsapp' | 'other',
    messengerValue: '',
    email: '',
    // Car - right column
    brand: '',
    brandCustom: '',
    model: '',
    year: '',
    price: '',
    configuration: '',
    drive: '',
    transmission: '',
    color: '',
    seats: '',
    engine_type: '',
    // Task - bottom
    task: '',
    taskCustom: '',
    next_action_date: '',
    next_action_time: '',
    comment: '',
  });

  useEffect(() => {
    ipcService.carBrands.getAll().then(setBrands).catch(() => {});
    ipcService.statuses.getAll().then(s => setStatuses(s.filter(st => st.category === 'lead' || st.category === 'pipeline'))).catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;

    const statusId = form.status_id ? parseInt(form.status_id) : statuses.find(s => s.name === 'Думает')?.id ?? 1;

    const clientId = await createClient({
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      comment: form.comment || null,
      source: null,
      status_id: statusId,
      next_action: (form.task === 'custom' ? form.taskCustom : form.task) || null,
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

      const brandValue = brandInputMode === 'custom' ? form.brandCustom : form.brand;
      if (brandValue || form.model) {
        await ipcService.orders.create({
          client_id: clientId,
          contract_number: null,
          brand: brandValue || null,
          model: form.model || null,
          year: form.year ? parseInt(form.year) : null,
          configuration: form.configuration || null,
          description: null,
          price: form.price ? parseFloat(form.price) : null,
          comment: null,
          delivery_date_est: null, delivery_date_actual: null,
          payment_date: null, payment_status: null,
          order_status_id: null,
          broker_name: null, broker_phone: null, broker_comment: null, broker_date: null,
          inspection_done: 0, inspection_comment: null, issue_date: null,
          contract_date: null, deal_amount: null,
          body_type: null,
          engine: null,
          engine_type: form.engine_type || null,
          drive: form.drive || null,
          transmission: form.transmission || null,
          color: form.color || null,
          mileage: null,
          car_other: form.seats ? `${form.seats} мест` : null,
          delivery_term: null, delivery_term_unit: null,
          payment_deadline: null, signed_contract_date: null,
        });
      }

      // Create reminder if date is set
      if (form.next_action_date && (form.task || form.taskCustom)) {
        await ipcService.reminders.create({
          client_id: clientId,
          title: form.task === 'custom' ? form.taskCustom : form.task,
          description: form.comment || undefined,
          due_date: form.next_action_date || undefined,
          due_time: form.next_action_time || undefined,
        });
      }

      navigate(`/clients/${clientId}`);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm">
        <ArrowLeft size={16} /> Назад
      </button>
      <h1 className="text-lg font-bold text-gray-900 mb-4">Новый клиент</h1>

      <form onSubmit={handleSubmit}>
        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* LEFT COLUMN — Client data */}
          <div className="card space-y-3 bg-slate-50 border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs">👤</span>
              Данные клиента
            </h2>

            <div>
              <label className="label">Статус <span className="text-red-500">*</span></label>
              <select
                className="input bg-white"
                value={form.status_id}
                onChange={e => set('status_id', e.target.value)}
                required
              >
                <option value="">— выберите —</option>
                {statuses.filter(s => s.category === 'lead').map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option disabled>──────────</option>
                {statuses.filter(s => s.category === 'pipeline').map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">ФИО <span className="text-red-500">*</span></label>
              <input
                className="input bg-white"
                value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                placeholder="Иванов Иван Иванович"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Телефон <span className="text-red-500">*</span></label>
              <input
                className="input bg-white"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+7 900 000-00-00"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Мессенджер</label>
                <select
                  className="input bg-white"
                  value={form.messenger}
                  onChange={e => set('messenger', e.target.value as typeof form.messenger)}
                >
                  <option value="phone">Телефон</option>
                  <option value="telegram">Telegram</option>
                  <option value="max">MAX</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="other">Другое</option>
                </select>
              </div>
              <div>
                <label className="label">Контакт</label>
                <input
                  className="input bg-white"
                  value={form.messengerValue}
                  onChange={e => set('messengerValue', e.target.value)}
                  placeholder="@ник или номер"
                />
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <input
                className="input bg-white"
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="email@example.com"
              />
            </div>
          </div>

          {/* RIGHT COLUMN — Car data */}
          <div className="card space-y-3 bg-stone-50 border-stone-200">
            <h2 className="text-sm font-semibold text-stone-700 border-b border-stone-200 pb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center text-xs">🚗</span>
              Автомобиль
            </h2>

            {/* Brand: select or custom input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Марка</label>
                <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setBrandInputMode('select')}
                    className={`px-2 py-1 transition-colors ${brandInputMode === 'select' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    Выбор
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrandInputMode('custom')}
                    className={`px-2 py-1 transition-colors ${brandInputMode === 'custom' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    Своя
                  </button>
                </div>
              </div>
              {brandInputMode === 'select' ? (
                <select
                  className="input bg-white"
                  value={form.brand}
                  onChange={e => set('brand', e.target.value)}
                >
                  <option value="">— не выбрано —</option>
                  {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              ) : (
                <input
                  className="input bg-white"
                  value={form.brandCustom}
                  onChange={e => set('brandCustom', e.target.value)}
                  placeholder="Введите марку"
                />
              )}
            </div>

            <div>
              <label className="label">Модель</label>
              <input
                className="input bg-white"
                value={form.model}
                onChange={e => set('model', e.target.value)}
                placeholder="Camry, X5, Polo..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Год</label>
                <select
                  className="input bg-white"
                  value={form.year}
                  onChange={e => set('year', e.target.value)}
                >
                  <option value="">—</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Цена (₽)</label>
                <input
                  className="input bg-white"
                  type="number"
                  value={form.price}
                  onChange={e => set('price', e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            <div>
              <label className="label">Комплектация</label>
              <input
                className="input bg-white"
                value={form.configuration}
                onChange={e => set('configuration', e.target.value)}
                placeholder="Comfort, Premium, Sport..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Привод</label>
                <select
                  className="input bg-white"
                  value={form.drive}
                  onChange={e => set('drive', e.target.value)}
                >
                  <option value="">—</option>
                  {DRIVE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">КПП</label>
                <select
                  className="input bg-white"
                  value={form.transmission}
                  onChange={e => set('transmission', e.target.value)}
                >
                  <option value="">—</option>
                  {TRANSMISSION_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Цвет</label>
                <input
                  className="input bg-white"
                  value={form.color}
                  onChange={e => set('color', e.target.value)}
                  placeholder="Чёрный, белый..."
                />
              </div>
              <div>
                <label className="label">Кол-во мест</label>
                <select
                  className="input bg-white"
                  value={form.seats}
                  onChange={e => set('seats', e.target.value)}
                >
                  <option value="">—</option>
                  {SEATS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Тип двигателя</label>
              <select
                className="input bg-white"
                value={form.engine_type}
                onChange={e => set('engine_type', e.target.value)}
              >
                <option value="">—</option>
                {ENGINE_TYPE_OPTIONS.map(et => <option key={et} value={et}>{et}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* BOTTOM — Task & Comment */}
        <div className="card space-y-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs">📋</span>
            Задача и комментарий
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Задача</label>
                <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setTaskInputMode('select')}
                    className={`px-2 py-1 transition-colors ${taskInputMode === 'select' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    Выбор
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskInputMode('custom')}
                    className={`px-2 py-1 transition-colors ${taskInputMode === 'custom' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    Своя
                  </button>
                </div>
              </div>
              {taskInputMode === 'select' ? (
                <select
                  className="input"
                  value={form.task}
                  onChange={e => set('task', e.target.value)}
                >
                  <option value="">— не выбрано —</option>
                  <option value="Позвонить">Позвонить</option>
                  <option value="Связь мессенджер">Связь мессенджер</option>
                </select>
              ) : (
                <input
                  className="input"
                  value={form.taskCustom}
                  onChange={e => set('taskCustom', e.target.value)}
                  placeholder="Введите задачу"
                />
              )}
            </div>

            <div>
              <label className="label">Дата напоминания</label>
              <input
                type="date"
                className="input"
                value={form.next_action_date}
                onChange={e => set('next_action_date', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Время</label>
              <input
                type="time"
                className="input"
                value={form.next_action_time}
                onChange={e => set('next_action_time', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Комментарий</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.comment}
              onChange={e => set('comment', e.target.value)}
              placeholder="Любые заметки..."
            />
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
