import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import type { Order } from '../types';
import { formatDate, formatPrice } from '../utils/formatters';
import { Truck, AlertTriangle, ChevronRight } from 'lucide-react';

interface OrderWithClient extends Order {
  client_name?: string;
  client_phone?: string | null;
}

const PAID_STATUSES = ['Оплачен', 'Автомобиль в пути', 'Автомобиль прибыл', 'Допы', 'Подготовка к выдаче'];
const TRANSIT_STATUSES = ['Оплачен', 'Автомобиль в пути'];
const ARRIVED_STATUSES = ['Автомобиль прибыл', 'Допы'];

type Filter = 'paid' | 'transit' | 'arrived' | 'ready';

function todayISO() { return new Date().toISOString().split('T')[0]; }

function daysBetween(from: string, to: string): number {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
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
    const paidOrders = orders.filter(o =>
      o.payment_status === 'paid' || PAID_STATUSES.includes(o.order_status_name ?? '')
    );
    if (filter === 'transit')  return paidOrders.filter(o => TRANSIT_STATUSES.includes(o.order_status_name ?? ''));
    if (filter === 'arrived')  return paidOrders.filter(o => ARRIVED_STATUSES.includes(o.order_status_name ?? ''));
    if (filter === 'ready')    return orders.filter(o => o.order_status_name === 'Подготовка к выдаче');
    return paidOrders;
  }, [orders, filter]);

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

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
            {filter === t.key && <span className="ml-1.5 text-xs opacity-70">({filtered.length})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">В этом разделе заказов нет</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const remainingDays = order.delivery_date_est ? daysBetween(todayISO(), order.delivery_date_est) : null;
            const overdue = remainingDays !== null && remainingDays < 0;
            const car = [order.brand, order.model, order.configuration, order.color].filter(Boolean).join(' ');
            const remaining = remainingDays === null
              ? <span className="text-gray-400">Дата не указана</span>
              : overdue
                ? <span className="inline-flex items-center gap-1 text-red-600 font-medium"><AlertTriangle size={14}/>{Math.abs(remainingDays)} дн. просрочено</span>
                : <span className="inline-flex items-center gap-1 text-primary-700 font-medium"><Truck size={14}/>{remainingDays} дн.</span>;
            return (
              <button
                key={order.id}
                onClick={() => navigate(`/clients/${order.client_id}?tab=orders`)}
                className={`card w-full p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 ${overdue ? 'border-red-200 bg-red-50/30' : ''}`}
              >
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.35fr)_minmax(150px,1fr)_minmax(130px,0.8fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{car || 'Авто не указано'}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{order.contract_number ? `Договор № ${order.contract_number}` : 'Номер договора не указан'}{order.year ? ` · ${order.year} г.` : ''}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{order.client_name || '—'}</div>
                    <div className="mt-0.5 text-xs text-gray-500 truncate">{order.client_phone || 'Телефон не указан'}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-gray-500">Доставка</div>
                    <div className="font-medium text-gray-800">{deliveryTermLabel(order)}</div>
                    {order.delivery_date_est && <div className="text-xs text-gray-500">до {formatDate(order.delivery_date_est)}</div>}
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-gray-500">Осталось</div>
                    <div className="mt-0.5">{remaining}</div>
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 lg:col-span-1 lg:border-0 lg:pt-0">
                    <div>
                      <div className="text-xs text-gray-500">Оплата: {order.payment_date ? formatDate(order.payment_date) : 'не указана'}</div>
                      <div className="mt-0.5 font-semibold text-primary-700 whitespace-nowrap">{formatPrice(order.price) || '—'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.order_status_name && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: (order.order_status_color ?? '#6b7280') + '20', color: order.order_status_color ?? '#6b7280' }}>
                          {order.order_status_name}
                        </span>
                      )}
                      <ChevronRight size={18} className="text-gray-400" />
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
