import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../hooks/useClients';
import ClientCard from '../components/ClientCard';
import { ArrowLeft, Bell } from 'lucide-react';

export default function Reminders() {
  const navigate = useNavigate();
  const { clients, loading, fetchClients } = useClients();

  useEffect(() => { fetchClients({ overdue: true }); }, [fetchClients]);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-900">Напоминания</h1>
        {clients.length > 0 && <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">{clients.length}</span>}
      </div>
      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : clients.length === 0 ? (
        <div className="card text-center py-12">
          <Bell size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Просроченных задач нет</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(c => <ClientCard key={c.id} client={c} />)}
        </div>
      )}
    </div>
  );
}
