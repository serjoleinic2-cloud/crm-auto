import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../hooks/useClients';
import ClientCard from '../components/ClientCard';
import SearchBar from '../components/SearchBar';

export default function Clients() {
  const navigate = useNavigate();
  const { clients, loading, fetchClients, searchClients } = useClients();
  const [filter, setFilter] = useState<'all' | 'active' | 'overdue' | 'archived'>('active');

  useEffect(() => {
    if (filter === 'all') fetchClients();
    else if (filter === 'active') fetchClients({ archived: false });
    else if (filter === 'overdue') fetchClients({ overdue: true });
    else if (filter === 'archived') fetchClients({ archived: true });
  }, [filter, fetchClients]);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Клиенты</h1>
        <button onClick={() => navigate('/quick-add')} className="btn-primary">
          + Новый клиент
        </button>
      </div>

      <div className="mb-4">
        <SearchBar onSearch={searchClients} placeholder="Поиск по имени, телефону, договору, автомобилю..." />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {(['active', 'all', 'overdue', 'archived'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === f ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f === 'all' && 'Все'}
            {f === 'active' && 'В работе'}
            {f === 'overdue' && 'Просрочено'}
            {f === 'archived' && 'Архив'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Клиенты не найдены</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}