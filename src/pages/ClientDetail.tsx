import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import { useOrders } from '../hooks/useOrders';
import { useContacts } from '../hooks/useContacts';
import { useHistory } from '../hooks/useHistory';
import StatusBadge from '../components/StatusBadge';
import { formatDate, formatPrice, getContactLink, getContactIcon } from '../utils/formatters';
import { ArrowLeft, ExternalLink, Plus, Trash2, Star } from 'lucide-react';
import type { Client, Status, Contact } from '../types';
import ConsentCard from '../components/ConsentCard';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clientId = parseInt(id || '0');
  
  const [client, setClient] = useState<Client | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [activeTab, setActiveTab] = useState<'main' | 'contacts' | 'orders' | 'documents' | 'history'>('main');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Client>>({});
  
  const { orders, fetchOrders, createOrder } = useOrders();
  const { contacts, fetchContacts, createContact, deleteContact, setPrimary } = useContacts();
  const { entries, fetchHistory } = useHistory();

  useEffect(() => {
    if (!clientId) return;
    loadClient();
    ipcService.statuses.getAll().then(setStatuses);
    fetchOrders(clientId);
    fetchContacts(clientId);
    fetchHistory(clientId);
  }, [clientId]);

  const loadClient = async () => {
    const data = await ipcService.clients.getById(clientId);
    setClient(data ?? null);
    if (data) setEditData(data);
  };

  const handleSave = async () => {
    const success = await ipcService.clients.update(clientId, editData);
    if (success) {
      setIsEditing(false);
      loadClient();
    }
  };

  const handleAddContact = async () => {
    const type = prompt('Тип (phone/telegram/max/whatsapp/other):', 'phone') as Contact['type'];
    const value = prompt('Значение:');
    if (!type || !value) return;
    await createContact({ client_id: clientId, type, value, label: null, is_primary: contacts.length === 0 ? 1 : 0 });
    fetchContacts(clientId);
  };

  const handleAddOrder = async () => {
    const brand = prompt('Марка:') || '';
    const model = prompt('Модель:') || '';
    const contract = prompt('Номер договора:') || '';
    await createOrder({ client_id: clientId, brand, model, contract_number: contract, year: null, configuration: null, description: null, price: null, comment: null, delivery_date_est: null, delivery_date_actual: null, payment_date: null, payment_status: null });
    fetchOrders(clientId);
  };

  if (!client) return <div className="p-4">Загрузка...</div>;

  const status = statuses.find(s => s.id === client.status_id);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft size={18} /> Назад
      </button>

      <div className="card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{client.full_name}</h1>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={status || null} />
              {client.phone && <span className="text-sm text-gray-600">{client.phone}</span>}
            </div>
            {client.next_action && (
              <div className="mt-2 text-sm text-gray-600">
                <span className="font-medium">Следующее действие:</span> {client.next_action} {formatDate(client.next_action_date)}
              </div>
            )}
          </div>
          <button onClick={() => setIsEditing(!isEditing)} className="btn-secondary text-sm">
            {isEditing ? 'Отмена' : 'Редактировать'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto border-b border-gray-200">
        {(['main', 'contacts', 'orders', 'documents', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'main' && 'Основное'}
            {tab === 'contacts' && 'Контакты'}
            {tab === 'orders' && 'Заказы'}
            {tab === 'documents' && 'Документы'}
            {tab === 'history' && 'История'}
          </button>
        ))}
      </div>

      {activeTab === 'main' && (
        <div className="card space-y-4">
          {isEditing ? (
            <>
              <div>
                <label className="label">ФИО</label>
                <input className="input" value={editData.full_name || ''} onChange={e => setEditData({...editData, full_name: e.target.value})} />
              </div>
              <div>
                <label className="label">Телефон</label>
                <input className="input" value={editData.phone || ''} onChange={e => setEditData({...editData, phone: e.target.value})} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" value={editData.email || ''} onChange={e => setEditData({...editData, email: e.target.value})} />
              </div>
              <div>
                <label className="label">Источник</label>
                <input className="input" value={editData.source || ''} onChange={e => setEditData({...editData, source: e.target.value})} />
              </div>
              <div>
                <label className="label">Статус</label>
                <select className="input" value={editData.status_id || ''} onChange={e => setEditData({...editData, status_id: parseInt(e.target.value) || null})}>
                  <option value="">—</option>
                  {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Следующее действие</label>
                <input className="input" value={editData.next_action || ''} onChange={e => setEditData({...editData, next_action: e.target.value})} />
              </div>
              <div>
                <label className="label">Дата следующего контакта</label>
                <input type="date" className="input" value={editData.next_action_date?.split('T')[0] || ''} onChange={e => setEditData({...editData, next_action_date: e.target.value})} />
              </div>
              <div>
                <label className="label">Комментарий</label>
                <textarea className="input" rows={3} value={editData.comment || ''} onChange={e => setEditData({...editData, comment: e.target.value})} />
              </div>
              <button onClick={handleSave} className="btn-primary">Сохранить</button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">Телефон:</span> {client.phone || '—'}</div>
                <div><span className="text-gray-500">Email:</span> {client.email || '—'}</div>
                <div><span className="text-gray-500">Источник:</span> {client.source || '—'}</div>
                <div><span className="text-gray-500">Создан:</span> {formatDate(client.created_at)}</div>
              </div>
              {client.comment && (
                <div className="bg-gray-50 p-3 rounded-md text-sm">
                  <span className="text-gray-500">Комментарий:</span>
                  <p className="mt-1 text-gray-700">{client.comment}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Контакты</h3>
            <button onClick={handleAddContact} className="btn-primary text-sm flex items-center gap-1">
              <Plus size={16} /> Добавить
            </button>
          </div>
          <div className="space-y-2">
            {contacts.map(contact => (
              <div key={contact.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getContactIcon(contact.type)}</span>
                  <div>
                    <div className="font-medium text-sm">{contact.value}</div>
                    <div className="text-xs text-gray-500 capitalize">{contact.type}</div>
                  </div>
                  {contact.is_primary && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
                </div>
                <div className="flex items-center gap-2">
                  <a href={getContactLink(contact.type, contact.value)} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-primary-600">
                    <ExternalLink size={16} />
                  </a>
                  {!contact.is_primary && (
                    <button onClick={() => { setPrimary(clientId, contact.id); fetchContacts(clientId); }} className="p-1.5 text-gray-400 hover:text-yellow-500">
                      <Star size={16} />
                    </button>
                  )}
                  <button onClick={() => { deleteContact(contact.id); fetchContacts(clientId); }} className="p-1.5 text-gray-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {contacts.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Контакты не добавлены</p>}
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Заказы</h3>
            <button onClick={handleAddOrder} className="btn-primary text-sm flex items-center gap-1">
              <Plus size={16} /> Добавить заказ
            </button>
          </div>
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order.id} className="p-3 bg-gray-50 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{order.brand} {order.model}</div>
                  {order.contract_number && <div className="text-xs text-gray-500">№ {order.contract_number}</div>}
                </div>
                {order.year && <div className="text-xs text-gray-500 mt-1">{order.year} г.</div>}
                {order.price && <div className="text-sm font-medium text-primary-600 mt-1">{formatPrice(order.price)}</div>}
                {order.comment && <div className="text-xs text-gray-600 mt-1">{order.comment}</div>}
              </div>
            ))}
            {orders.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Заказы не добавлены</p>}
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-4">
          <ConsentCard clientId={clientId} />
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <h3 className="font-semibold mb-4">История</h3>
          <div className="space-y-3">
            {entries.map(entry => (
              <div key={entry.id} className="flex gap-3 text-sm">
                <div className="text-gray-400 whitespace-nowrap w-32">{formatDate(entry.created_at)}</div>
                <div className="text-gray-700">{entry.description}</div>
              </div>
            ))}
            {entries.length === 0 && <p className="text-sm text-gray-500 text-center py-4">История пуста</p>}
          </div>
        </div>
      )}
    </div>
  );
}