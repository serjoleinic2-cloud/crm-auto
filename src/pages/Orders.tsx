import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import type { Order, Client } from '../types';
import { formatDate, formatPrice } from '../utils/formatters';
import { ArrowLeft } from 'lucide-react';

interface OrderWithClient extends Order {
  client_name?: string;
}

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderWithClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const clients: Client[] = await ipcService.clients.getAll({ archived: false });
      const allOrders: OrderWithClient[] = [];
      for (const c of clients) {
        const clientOrders = await ipcService.orders.getByClientId(c.id);
        clientOrders.forEach(o => allOrders.push({ ...o, client_name: c.full_name }));
      }
      setOrders(allOrders.sort((a, b) => b.id - a.id));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-900">Заказы в пути</h1>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Заказы не найдены</div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="card cursor-pointer hover:shadow-md" onClick={() => navigate(`/clients/${order.client_id}`)}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{order.brand} {order.model} {order.year ? `(${order.year})` : ''}</div>
                  <div className="text-sm text-gray-500 mt-1">{order.client_name}</div>
                  {order.contract_number && <div className="text-xs text-gray-400 mt-0.5">Договор № {order.contract_number}</div>}
                </div>
                <div className="text-right">
                  {order.price && <div className="font-semibold text-primary-600">{formatPrice(order.price)}</div>}
                  {order.delivery_date_est && <div className="text-xs text-gray-500 mt-1">Ожидается: {formatDate(order.delivery_date_est)}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
