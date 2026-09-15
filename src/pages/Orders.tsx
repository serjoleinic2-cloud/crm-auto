import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import type { Order } from '../types';
import { formatDate, formatPrice } from '../utils/formatters';
import { Truck, AlertTriangle, ChevronRight, Search, ClipboardCheck } from 'lucide-react';

interface OrderWithClient extends Order {
  client_name?: string;
  client_phone?: string | null;
}

const PAID_STATUSES = ['Оплачен', 'Автомобиль в пути', 'Автомобиль прибыл', 'Допы', 'Подготовка к выдаче'];
const TRANSIT_STATUSES = ['Оплачен', 'Автомобиль в пути'];
const ARRIVED_STATUSES = ['Автомобиль прибыл', 'Допы'];
const DELIVERY_FINISHED_STATUSES = ['Автомобиль прибыл', 'Допы', 'Подготовка к выдаче', 'Выдан'];

type Filter = 'paid' | 'transit' | 'arrived' | 'ready';

function todayISO() { return new Date().toISOString().split('T')[0]; }

function daysBetween(from: string, to: string): number {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

function normalizeVin(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function extractVins(value: string): string[] {
  // In supplier messages the identifier is often the six-digit internal VIN
  // (for example: "Аутлендер 036331 2022 Заказной Ясенево"), not a 17-char VIN.
  return [...new Set((value.toUpperCase().match(/\b(?:[A-HJ-NPR-Z0-9]{17}|\d{6})\b/g) || []).map(normalizeVin))];
}

function deliveryTermLabel(order: OrderWithClient): string {
  if (order.delivery_term) {
    const unit = order.delivery_term_unit === 'months' ? 'мес.'
      : order.delivery_term_unit === 'weeks' ? 'нед.' : 'дн.';
    return `${order.delivery_term} ${unit}`;
  }
  if (order.payment_date && order.delivery_date_est) {
    const days = daysBetween(order.payment_date, order.delivery_date_est);
    return days >= 0 ? `${days} дн.` : '—';
  }
  return 'Не указан';
}

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('paid');
  const [query, setQuery] = useState('');
  const [carFilter, setCarFilter] = useState('');
  const [vinBatch, setVinBatch] = useState('');
  const [showVinCheck, setShowVinCheck] = useState(false);
  const [savingVinMatches, setSavingVinMatches] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const all = await ipcService.orders.getAll() as OrderWithClient[];
      setOrders(all);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    // Delivery starts only after a real payment is recorded. The order status
    // is used to split the paid cars into stages, but must not put old/test
    // cars here on its own.
    const paidOrders = orders.filter(o => o.payment_status === 'paid');
    let stageOrders = paidOrders.filter(o => PAID_STATUSES.includes(o.order_status_name ?? ''));
    if (filter === 'transit') stageOrders = paidOrders.filter(o => TRANSIT_STATUSES.includes(o.order_status_name ?? ''));
    if (filter === 'arrived') stageOrders = paidOrders.filter(o => ARRIVED_STATUSES.includes(o.order_status_name ?? ''));
    if (filter === 'ready') stageOrders = paidOrders.filter(o => o.order_status_name === 'Подготовка к выдаче');

    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
    return stageOrders
      .filter(order => {
        const carName = [order.brand, order.model].filter(Boolean).join(' ') || 'Без автомобиля';
        const searchable = [
          order.brand, order.model, order.configuration, order.color,
          order.client_name, order.client_phone, order.contract_number,
        ].filter(Boolean).join(' ').toLocaleLowerCase('ru-RU');

        if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
        if (carFilter && carName !== carFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const byPaymentDate = new Date(b.payment_date ?? 0).getTime() - new Date(a.payment_date ?? 0).getTime();
        return byPaymentDate || b.id - a.id;
      });
  }, [orders, filter, query, carFilter]);

  const carOptions = useMemo(() => {
    const names = orders
      .filter(order => order.payment_status === 'paid')
      .map(order => [order.brand, order.model].filter(Boolean).join(' ') || 'Без автомобиля');
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [orders]);

  const tabCounts = useMemo(() => {
    const paidOrders = orders.filter(order => order.payment_status === 'paid');
    return {
      paid: paidOrders.filter(order => PAID_STATUSES.includes(order.order_status_name ?? '')).length,
      transit: paidOrders.filter(order => TRANSIT_STATUSES.includes(order.order_status_name ?? '')).length,
      arrived: paidOrders.filter(order => ARRIVED_STATUSES.includes(order.order_status_name ?? '')).length,
      ready: paidOrders.filter(order => order.order_status_name === 'Подготовка к выдаче').length,
    } satisfies Record<Filter, number>;
  }, [orders]);

  const batchVins = useMemo(() => extractVins(vinBatch), [vinBatch]);
  const vinMatches = useMemo(() => {
    const batch = new Set(batchVins);
    return orders.filter(order => order.vin && batch.has(normalizeVin(order.vin)));
  }, [orders, batchVins]);

  const confirmVinMatches = async () => {
    if (!vinMatches.length) return;
    setSavingVinMatches(true);
    try {
      const date = todayISO();
      await Promise.all(vinMatches.map(order => ipcService.orders.update(order.id, {
        vin_moscow_confirmed: 1,
        vin_moscow_confirmed_date: order.vin_moscow_confirmed_date || date,
        moscow_arrival_date: order.moscow_arrival_date || date,
      })));
      await load();
    } finally {
      setSavingVinMatches(false);
    }
  };

  const tabs: { key: Filter; label: string }[] = [
    { key: 'paid',    label: 'После оплаты' },
    { key: 'transit', label: '🚗 Покупка и доставка' },
    { key: 'arrived', label: '🏢 На площадке' },
    { key: 'ready',   label: '✅ К выдаче' },
  ];

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Заказы после оплаты</h1>
        <p className="text-sm text-gray-500 mt-1">Покупка, доставка автомобиля и подготовка к выдаче. Сделки до оплаты остаются в разделе «В работе».</p>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${filter === t.key ? 'opacity-80' : 'text-gray-500'}`}>
              ({tabCounts[t.key]})
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск: марка, модель, клиент, номер договора"
          />
        </div>
        <select
          className="input"
          value={carFilter}
          onChange={e => setCarFilter(e.target.value)}
          aria-label="Фильтр по автомобилю"
        >
          <option value="">Все автомобили</option>
          {carOptions.map(car => <option key={car} value={car}>{car}</option>)}
        </select>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <button onClick={() => setShowVinCheck(!showVinCheck)} className="flex w-full items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-800"><ClipboardCheck size={17} className="text-primary-600"/> Проверить номера авто из московской партии</span>
          <span className="text-xs text-primary-700">{showVinCheck ? 'Скрыть' : 'Вставить сообщение'}</span>
        </button>
        {showVinCheck && <div className="mt-3">
          <p className="mb-2 text-xs text-gray-500">Скопируйте сообщение или список из Telegram. Подойдут номера из 6 цифр, например «Аутлендер 036331 2022 Заказной Ясенево», и полные VIN из 17 символов.</p>
          <textarea className="input min-h-24 text-xs font-mono" value={vinBatch} onChange={e => setVinBatch(e.target.value)} placeholder="Вставьте сюда сообщение Telegram" />
          <div className="mt-2 text-xs text-gray-600">Найдено номеров в сообщении: {batchVins.length}. Совпадений с вашими заказами: <b>{vinMatches.length}</b>.</div>
          {vinMatches.length > 0 && <div className="mt-2 space-y-1.5">
            {vinMatches.map(order => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2.5 py-2 text-xs shadow-sm">
              <span><b>{[order.brand, order.model].filter(Boolean).join(' ') || 'Авто'}</b> · {order.client_name || 'Клиент'} · <span className="font-mono">{order.vin}</span></span>
              <button className="text-primary-700 hover:underline" onClick={() => navigate(`/clients/${order.client_id}?tab=orders`)}>Открыть карточку</button>
            </div>)}
            <button disabled={savingVinMatches} onClick={confirmVinMatches} className="btn-save mt-1 text-xs disabled:opacity-60">{savingVinMatches ? 'Сохраняем…' : 'Подтвердить: VIN найдены в Москве'}</button>
            <p className="text-[11px] text-gray-500">Дата прибытия в Москву будет поставлена сегодняшней, если её ещё не указали. После звонка отметьте это в карточке клиента.</p>
          </div>}
        </div>}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          {query || carFilter ? 'По заданному фильтру заказы не найдены' : 'В этом разделе заказов нет'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const arrived = DELIVERY_FINISHED_STATUSES.includes(order.order_status_name ?? '');
            const remainingDays = !arrived && order.delivery_date_est
              ? daysBetween(todayISO(), order.delivery_date_est)
              : null;
            const overdue = remainingDays !== null && remainingDays < 0;
            const car = [order.brand, order.model, order.configuration, order.color].filter(Boolean).join(' ');
            const remaining = remainingDays === null
              ? <span className="text-gray-400">Дата не указана</span>
              : overdue
                ? <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={14}/>{Math.abs(remainingDays)} дн. просрочено</span>
                : <span className="inline-flex items-center gap-1 text-primary-700"><Truck size={14}/>{remainingDays} дн.</span>;
            const arrival = order.delivery_date_actual
              ? <span className="text-emerald-700">Прибыл: {formatDate(order.delivery_date_actual)}</span>
              : <span className="text-emerald-700">Автомобиль прибыл</span>;
            return (
              <button
                key={order.id}
                onClick={() => navigate(`/clients/${order.client_id}?tab=orders`)}
                className={`card w-full p-2.5 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 ${overdue ? 'border-red-200 bg-red-50/30' : ''}`}
              >
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.35fr)_minmax(150px,1fr)_minmax(130px,0.8fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900 truncate">{car || 'Авто не указано'}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{order.contract_number ? `Договор № ${order.contract_number}` : 'Номер договора не указан'}{order.year ? ` · ${order.year} г.` : ''}</div>
                    {order.vin && <div className="mt-0.5 text-[11px] font-mono text-gray-500">VIN: {order.vin}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900 truncate">{order.client_name || '—'}</div>
                    <div className="mt-0.5 text-xs text-gray-500 truncate">{order.client_phone || 'Телефон не указан'}</div>
                  </div>
                  <div className="text-xs">
                    <div className="text-[11px] text-gray-500">Доставка</div>
                    <div className="mt-0.5 text-gray-800">{deliveryTermLabel(order)}</div>
                    {order.delivery_date_est && <div className="text-xs text-gray-500">до {formatDate(order.delivery_date_est)}</div>}
                  </div>
                  {(order.vin_moscow_confirmed || order.client_notified_moscow) && <div className="text-[11px] text-gray-600 lg:col-span-1">
                    {order.vin_moscow_confirmed ? <div className="text-emerald-700">VIN найден в Москве</div> : null}
                    {order.client_notified_moscow ? <div className="text-blue-700">Клиенту сообщено</div> : null}
                  </div>}
                  <div className="text-xs">
                    <div className="text-[11px] text-gray-500">{arrived ? 'Прибытие' : 'Осталось'}</div>
                    <div className="mt-0.5">{arrived ? arrival : remaining}</div>
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 lg:col-span-1 lg:border-0 lg:pt-0">
                    <div>
                      <div className="text-xs text-gray-500">Оплата: {order.payment_date ? formatDate(order.payment_date) : 'не указана'}</div>
                      <div className="mt-0.5 text-sm text-primary-700 whitespace-nowrap">{formatPrice(order.price) || '—'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.order_status_name && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: (order.order_status_color ?? '#6b7280') + '20', color: order.order_status_color ?? '#6b7280' }}>
                          {order.order_status_name}
                        </span>
                      )}
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
