import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import type { DashboardStats, Reminder } from '../types';
import { formatDate } from '../utils/formatters';
import { Users, AlertTriangle, Calendar, Truck, CreditCard, Building, Package, UserPlus, Bell } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        ipcService.dashboard.getStats(),
        ipcService.reminders.getAll({ today: true }),
      ]);
      setStats(s);
      setReminders(r);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Загрузка...</div>;
  if (!stats) return <div className="p-6 text-center text-gray-500">Ошибка загрузки</div>;

  const statCards = [
    { label: 'Активные клиенты', value: stats.activeClients, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', onClick: () => navigate('/clients') },
    { label: 'Просроченные задачи', value: stats.needsAttention, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', onClick: () => navigate('/reminders?filter=overdue') },
    { label: 'Задачи на сегодня', value: stats.todayTasks, icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50', onClick: () => navigate('/reminders?filter=today') },
    { label: 'Авто в пути', value: stats.carsInTransit, icon: Truck, color: 'text-cyan-600', bg: 'bg-cyan-50', onClick: () => navigate('/orders') },
  ];

  const orderCards = [
    { label: 'Ожидают оплаты', value: stats.pendingPayment, icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50', onClick: () => navigate('/orders') },
    { label: 'На таможне', value: stats.atCustoms, icon: Package, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', onClick: () => navigate('/orders') },
    { label: 'В офисе', value: stats.inOffice, icon: Building, color: 'text-green-600', bg: 'bg-green-50', onClick: () => navigate('/orders') },
    { label: 'Новые клиенты (неделя)', value: stats.newClientsThisWeek, icon: UserPlus, color: 'text-indigo-600', bg: 'bg-indigo-50', onClick: () => navigate('/clients') },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Главная</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <button key={card.label} onClick={card.onClick} className={`${card.bg} rounded-xl p-4 text-left hover:shadow-md transition-shadow`}>
            <div className="flex items-center justify-between mb-2">
              <card.icon size={20} className={card.color} />
              <span className="text-2xl font-bold text-gray-900">{card.value}</span>
            </div>
            <div className="text-sm text-gray-600">{card.label}</div>
          </button>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Заказы</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {orderCards.map(card => (
            <button key={card.label} onClick={card.onClick} className={`${card.bg} rounded-xl p-4 text-left hover:shadow-md transition-shadow`}>
              <div className="flex items-center justify-between mb-2">
                <card.icon size={20} className={card.color} />
                <span className="text-2xl font-bold text-gray-900">{card.value}</span>
              </div>
              <div className="text-sm text-gray-600">{card.label}</div>
            </button>
          ))}
        </div>
      </div>

      {reminders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Bell size={18} /> Задачи на сегодня
          </h2>
          <div className="space-y-2">
            {reminders.map(r => (
              <button key={r.id} onClick={() => navigate(`/clients/${r.client_id}`)} className="w-full text-left card py-3 px-4 hover:shadow-md transition-shadow flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{r.title}</div>
                  <div className="text-xs text-gray-500">{r.client_name} {r.due_date ? `· ${formatDate(r.due_date)}` : ''}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
