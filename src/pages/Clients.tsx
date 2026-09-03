import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../hooks/useClients';
import { ipcService } from '../services/ipcService';
import type { Status } from '../types';
import ClientCard from '../components/ClientCard';
import SearchBar from '../components/SearchBar';

type Filter = 'leads' | 'active' | 'extras' | 'payment_overdue' | 'overdue' | 'archived';

export default function Clients() {
  const navigate = useNavigate();
  const { clients, loading, fetchClients, searchClients } = useClients();
  const [filter, setFilter] = useState<Filter>('active');
  const [statuses, setStatuses] = useState<Status[]>([]);

  useEffect(() => {
    ipcService.statuses.getAll().then(setStatuses);
  }, []);

  useEffect(() => { load(); }, [filter, statuses]);

  const load = () => {
    const extrasStatus = statuses.find(s => s.name === 'Допы');
    const awaitPayStatus = statuses.find(s => s.name === 'Ожидает оплату');

    if (filter === 'leads')          fetchClients({ statusCategory: 'lead' });
    else if (filter === 'active')    fetchClients({ archived: false });
    else if (filter === 'extras')    fetchClients({ statusId: extrasStatus?.id });
    else if (filter === 'payment_overdue') fetchClients({ paymentOverdue: true });
    else if (filter === 'overdue')   fetchClients({ overdue: true });
    else                             fetchClients({ archived: true });
  };

  const tabs: { key: Filter; label: string; hint?: string }[] = [
    { key: 'leads',          label: 'Думают',     hint: 'Потенциальные клиенты' },
    { key: 'active',         label: 'В работе' },
    { key: 'extras',         label: 'Допы',       hint: 'Авто на дополнительном оборудовании' },
    { key: 'payment_overdue',label: 'Просрочена оплата', hint: 'Дедлайн оплаты прошёл' },
    { key: 'overdue',        label: 'Просрочено', hint: 'Просроченные задачи' },
    { key: 'archived',       label: 'Архив' },
  ];

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Клиенты</h1>
        <button onClick={() => navigate('/quick-add')} className="btn-primary">+ Новый клиент</button>
      </div>

      <div className="mb-3">
        <SearchBar onSearch={searchClients} placeholder="Поиск по имени, телефону, договору, автомобилю..." />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            title={t.hint}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              filter === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
            {filter === t.key && clients.length > 0 && (
              <span className="ml-1.5 text-xs opacity-70">({clients.length})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          {filter === 'leads'          ? 'Нет потенциальных клиентов' :
           filter === 'extras'         ? 'Нет авто на допах' :
           filter === 'payment_overdue'? 'Нет просроченных оплат' :
           filter === 'overdue'        ? 'Просроченных задач нет' : 'Клиенты не найдены'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {clients.map(client => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}
