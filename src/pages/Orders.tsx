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
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">№ договора</th>
                <th className="text-left px-4 py-3 font-medium">Оплачен</th>
                <th className="text-left px-4 py-3 font-medium">Автомобиль</th>
                <th className="text-left px-4 py-3 font-medium">Срок доставки</th>
                <th className="text-left px-4 py-3 font-medium">Осталось</th>
                <th className="text-left px-4 py-3 font-medium">Клиент</th>
                <th className="text-left px-4 py-3 font-medium">Телефон</th>
                <th className="text-right px-4 py-3 font-medium">Сумма авто</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="px-3 py-3" aria-label="Открыть карточку" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(order => {
                const remainingDays = order.delivery_date_est ? daysBetween(todayISO(), order.delivery_date_est) : null;
                const overdue = remainingDays !== null && remainingDays < 0;
                const car = [order.brand, order.model, order.configuration, order.color].filter(Boolean).join(' ');
                return (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/clients/${order.client_id}?tab=orders`)}
                    className={`cursor-pointer hover:bg-primary-50/40 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{order.contract_number ? `№ ${order.contract_number}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{order.payment_date ? formatDate(order.payment_date) : 'Не указана'}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[240px]">
                      <div className="font-medium text-gray-900 truncate">{car || 'Авто не указано'}</div>
                      {order.year && <div className="text-xs text-gray-400 mt-0.5">{order.year} год</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{deliveryTermLabel(order)}</td>
                    <td className="px-4 py-3">
                      {remainingDays === null ? (
                        <span className="text-gray-400">Дата не указана</span>
                      ) : overdue ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium"><AlertTriangle size={14}/>{Math.abs(remainingDays)} дн. просрочено</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-primary-700 font-medium"><Truck size={14}/>{remainingDays} дн.<span className="text-gray-400 font-normal">до {formatDate(order.delivery_date_est)}</span></span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{order.client_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{order.client_phone || '—'}</td>
                    <td className="px-4 py-3 text-right text-primary-700 font-semibold whitespace-nowrap">{formatPrice(order.price) || '—'}</td>
                    <td className="px-4 py-3">
                      {order.order_status_name ? (
                        <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: (order.order_status_color ?? '#6b7280') + '20', color: order.order_status_color ?? '#6b7280' }}>
                          {order.order_status_name}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-400"><ChevronRight size={18}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
