import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import type { Order } from '../types';
import { formatDate, formatPrice } from '../utils/formatters';
import { Truck, Clock, AlertTriangle } from 'lucide-react';

interface OrderWithClient extends Order { client_name?: string; }

const TRANSIT_STATUSES = ['Автомобиль в пути', 'На таможне', 'Таможенное оформление', 'Едет по РФ'];
const ALL_ACTIVE = [...TRANSIT_STATUSES, 'Автомобиль заказан', 'Прибыл в офис'];

type Filter = 'active' | 'transit' | 'customs' | 'office';

function todayISO() { return new Date().toISOString().split('T')[0]; }

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');

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
    if (filter === 'transit')  return orders.filter(o => TRANSIT_STATUSES.includes(o.order_status_name ?? ''));
    if (filter === 'customs')  return orders.filter(o => ['На таможне','Таможенное оформление'].includes(o.order_status_name ?? ''));
    if (filter === 'office')   return orders.filter(o => o.order_status_name === 'Прибыл в офис');
    return orders.filter(o => ALL_ACTIVE.includes(o.order_status_name ?? ''));
  }, [orders, filter]);

  const tabs: { key: Filter; label: string }[] = [
    { key: 'active',  label: 'Все активные' },
    { key: 'transit', label: '🚗 В пути' },
    { key: 'customs', label: '📦 На таможне' },
    { key: 'office',  label: '🏢 В офисе' },
  ];

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Заказы</h1>

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
        <div className="text-center py-8 text-gray-400">Заказов нет</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const days = order.delivery_date_est
              ? Math.ceil((new Date(order.delivery_date_est).getTime() - new Date(todayISO()).getTime()) / 86400000)
              : null;
            const overdue = days !== null && days < 0;
            const payDeadlineOverdue = order.payment_deadline && order.payment_status !== 'paid' && order.payment_deadline < todayISO();

            return (
              <div
                key={order.id}
                onClick={() => navigate(`/clients/${order.client_id}`)}
                className={`card cursor-pointer hover:shadow-md transition-shadow ${overdue ? 'border-red-200' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{order.brand} {order.model} {order.year ? `(${order.year})` : ''}</span>
                      {order.order_status_name && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (order.order_status_color ?? '#6b7280') + '20', color: order.order_status_color ?? '#6b7280' }}>
                          {order.order_status_name}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">{order.client_name}</div>
                    {order.contract_number && <div className="text-xs text-gray-400 mt-0.5">№ {order.contract_number}</div>}
                  </div>

                  <div className="text-right shrink-0">
                    {order.price && <div className="font-semibold text-primary-600 text-sm">{formatPrice(order.price)}</div>}
                    {order.delivery_date_est && (
                      <div className={`text-xs mt-0.5 flex items-center gap-1 justify-end ${overdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                        {overdue ? <AlertTriangle size={11}/> : <Truck size={11}/>}
                        {formatDate(order.delivery_date_est)}
                        {days !== null && days >= 0 && <span className="text-gray-400">({days} дн.)</span>}
                        {overdue && <span>({Math.abs(days!)} дн. просрочено)</span>}
                      </div>
                    )}
                    {payDeadlineOverdue && (
                      <div className="text-xs text-red-500 font-medium flex items-center gap-1 justify-end mt-0.5">
                        <Clock size={10}/> Оплата просрочена
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
