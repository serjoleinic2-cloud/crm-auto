import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../hooks/useClients';
import ClientCard from '../components/ClientCard';
import SearchBar from '../components/SearchBar';
import { ArrowLeft } from 'lucide-react';

export default function Archive() {
  const navigate = useNavigate();
  const { clients, loading, fetchClients, searchClients } = useClients();

  useEffect(() => { fetchClients({ archived: true }); }, [fetchClients]);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-900">Архив</h1>
      </div>
      <div className="mb-4">
        <SearchBar onSearch={searchClients} placeholder="Поиск в архиве..." />
      </div>
      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Архив пуст</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(c => <ClientCard key={c.id} client={c} statuses={[]} />)}
        </div>
      )}
    </div>
  );
}
