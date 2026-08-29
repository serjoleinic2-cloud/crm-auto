import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import type { DashboardStats } from '../types';
import { Users, AlertTriangle, Calendar, Truck, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    ipcService.dashboard.getStats().then(setStats);
  }, []);

  const cards = [
    { title: 'Требуют внимания', value: stats?.needsAttention || 0, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { title: 'Задачи на сегодня', value: stats?.todayTasks || 0, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Клиенты в работе', value: stats?.activeClients || 0, icon: Users, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Автомобили в пути', value: stats?.carsInTransit || 0, icon: Truck, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { title: 'Новые за неделю', value: stats?.newClientsThisWeek || 0, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Мой рабочий день</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/quick-add')} className="btn-primary">
            + Новый клиент
          </button>
          <button onClick={() => navigate('/clients')} className="btn-secondary">
            Все клиенты
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {cards.map((card) => (
          <div key={card.title} className="card">
            <div className={`inline-flex p-2 rounded-lg ${card.bg} ${card.color} mb-3`}>
              <card.icon size={20} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
            <div className="text-xs text-gray-500 mt-1">{card.title}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Быстрые действия</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/quick-add')} className="btn-primary">
            Экспресс-добавление клиента
          </button>
          <button onClick={() => navigate('/clients')} className="btn-secondary">
            Поиск клиента
          </button>
        </div>
      </div>
    </div>
  );
}