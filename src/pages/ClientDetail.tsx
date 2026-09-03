import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import { useOrders } from '../hooks/useOrders';
import { useContacts } from '../hooks/useContacts';
import { useHistory } from '../hooks/useHistory';
import { useReminders } from '../hooks/useReminders';
import { useDocuments } from '../hooks/useDocuments';
import StatusBadge from '../components/StatusBadge';
import DocumentsPanel from '../components/DocumentsPanel';
import { formatDate, formatPrice, getContactLink, getContactIcon } from '../utils/formatters';
import { ArrowLeft, ExternalLink, Plus, Trash2, Star, AlertTriangle, FolderOpen, FileText, Check, X, Calendar, Truck, Phone, ClipboardCheck } from 'lucide-react';
import ContractTab from '../components/ContractTab';
import ExtrasPanel from '../components/ExtrasPanel';
import ErrorBoundary from '../components/ErrorBoundary';
import type { Client, Status, Contact, Order, OrderStatus, CarBrand, Reminder } from '../types';
import { PAYMENT_STATUS_LABELS } from '../types';

const INSPECTION_ITEMS = [
  { key: 'body', label: 'Кузов' },
  { key: 'glass', label: 'Стёкла' },
  { key: 'lights', label: 'Фары' },
  { key: 'wheels', label: 'Колёса' },
  { key: 'interior', label: 'Салон' },
  { key: 'equipment', label: 'Комплектация' },
  { key: 'documents', label: 'Документы' },
  { key: 'defects', label: 'Другие дефекты' },
];

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clientId = parseInt(id || '0');

  const [client, setClient] = useState<Client | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<OrderStatus[]>([]);
  const [carBrands, setCarBrands] = useState<CarBrand[]>([]);
  const [activeTab, setActiveTab] = useState<'main' | 'contacts' | 'orders' | 'documents' | 'history' | 'contract'>('main');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [trashConfirm, setTrashConfirm] = useState(false);
  const [contactModal, setContactModal] = useState<{ type: Contact['type']; value: string } | null>(null);

  // Order editing
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderForm, setOrderForm] = useState<Partial<Order>>({});
  const [nextContractNum, setNextContractNum] = useState('');

  const { orders, fetchOrders, createOrder, updateOrder, deleteOrder } = useOrders();
  const { contacts, fetchContacts, createContact, deleteContact, setPrimary } = useContacts();
  const { entries, fetchHistory } = useHistory();
  const { reminders, fetchReminders, createReminder } = useReminders();
  const { documents, fetchDocuments } = useDocuments();

  useEffect(() => {
    if (!clientId) return;
    loadClient();
    ipcService.statuses.getAll().then(setStatuses);
    ipcService.orderStatuses.getAll().then(setOrderStatuses);
    ipcService.carBrands.getAll().then(setCarBrands);
    fetchOrders(clientId);
    fetchContacts(clientId);
    fetchHistory(clientId);
    fetchReminders({ clientId });
    fetchDocuments(clientId);
  }, [clientId]);

  const loadClient = async () => {
    const data = await ipcService.clients.getById(clientId);
    setClient(data ?? null);
    if (data) setEditData(data);
  };

  const [archivePrompt, setArchivePrompt] = useState(false);

  const handleSave = async () => {
    // Strip computed fields from getById that don't exist in clients table
    const {
      next_action, next_action_date, next_action_time, next_reminder_id,
      reminders_count, reminders_overdue, status_name, status_color,
      consent_status, payment_status, payment_date, delivery_date_est,
      payment_deadline, price, car, contract_number,
      ...cleanData
    } = editData;

    // Ensure status_id is a proper number, not NaN
    if (cleanData.status_id !== undefined && cleanData.status_id !== null) {
      cleanData.status_id = Number(cleanData.status_id);
      if (isNaN(cleanData.status_id)) cleanData.status_id = null;
    }

    console.log('Saving client data:', cleanData);
    const success = await ipcService.clients.update(clientId, cleanData);
    if (success) {
      setIsEditing(false);
      loadClient();
      // Suggest archive when status is done or lost
      const newStatus = statuses.find(s => s.id === (cleanData.status_id as number));
      if (newStatus && (newStatus.category === 'done' || newStatus.category === 'lost')) {
        setArchivePrompt(true);
      }
    }
  };

  const handleArchive = async () => {
    await ipcService.clients.update(clientId, { is_archived: 1 });
    setArchivePrompt(false);
    navigate('/clients');
  };

  const handleAddContact = () => {
    setContactModal({ type: 'phone', value: '' });
  };

  const handleSaveContact = async () => {
    if (!contactModal || !contactModal.value.trim()) return;
    await createContact({
      client_id: clientId,
      type: contactModal.type,
      value: contactModal.value.trim(),
      label: null,
      is_primary: contacts.length === 0 ? 1 : 0,
    });
    setContactModal(null);
    fetchContacts(clientId);
  };

  // ── Orders ───────────────────────────────────────────────────────────────

  const getNextContractNumber = useCallback(async () => {
    const allClients = await ipcService.clients.getAll();
    let max = 0;
    for (const c of allClients) {
      const clientOrders = await ipcService.orders.getByClientId(c.id);
      for (const o of clientOrders) {
        if (o.contract_number) {
          const num = parseInt(o.contract_number.replace(/\D/g, ''), 10);
          if (!isNaN(num) && num > max) max = num;
        }
      }
    }
    setNextContractNum(String(max + 1));
  }, []);

  const startNewOrder = async () => {
    await getNextContractNumber();
    const pendingStatus = orderStatuses.find(s => s.name === 'Ожидает оплату');
    setOrderForm({
      client_id: clientId,
      contract_number: String(parseInt(nextContractNum || '1')),
      brand: '',
      model: '',
      year: null,
      configuration: '',
      description: '',
      price: null,
      comment: '',
      payment_status: 'not_paid',
      payment_date: null,
      delivery_date_est: null,
      delivery_date_actual: null,
      order_status_id: pendingStatus?.id ?? null,
      broker_name: '',
      broker_phone: '',
      broker_comment: '',
      broker_date: null,
      inspection_done: 0,
      inspection_comment: '',
      issue_date: null,
      delivery_term: 2,
      delivery_term_unit: 'weeks',
      payment_deadline: null,
      signed_contract_date: null,
    });
    setEditingOrder({ id: 0 } as Order);
  };

  const startEditOrder = (order: Order) => {
    setOrderForm({ ...order });
    setEditingOrder(order);
  };

  const saveOrder = async () => {
    if (!orderForm.brand && !orderForm.model) {
      alert('Укажите марку или модель');
      return;
    }

    // Auto-set payment date when status becomes paid
    if (orderForm.payment_status === 'paid' && !orderForm.payment_date) {
      orderForm.payment_date = new Date().toISOString().split('T')[0];
    }

    // Auto-set payment deadline (+3 days) when signed_contract_date is set for first time
    const prevOrder = editingOrder && editingOrder.id > 0 ? orders.find(o => o.id === editingOrder.id) : null;
    const signedContractJustSet = orderForm.signed_contract_date &&
      (!prevOrder || prevOrder.signed_contract_date !== orderForm.signed_contract_date);

    if (signedContractJustSet && orderForm.signed_contract_date) {
      const deadline = new Date(orderForm.signed_contract_date);
      deadline.setDate(deadline.getDate() + 3);
      orderForm.payment_deadline = deadline.toISOString().split('T')[0];
    }

    const newOrderStatusName = orderStatuses.find(s => s.id === orderForm.order_status_id)?.name;
    const prevOrderStatusName = prevOrder ? orderStatuses.find(s => s.id === prevOrder.order_status_id)?.name : null;
    const orderStatusChanged = newOrderStatusName !== prevOrderStatusName;

    if (editingOrder && editingOrder.id > 0) {
      await updateOrder(editingOrder.id, orderForm);
    } else {
      const newId = await createOrder(orderForm as Omit<Order, 'id'|'created_at'|'updated_at'|'order_status_name'|'order_status_color'>);
      if (newId && orderForm.payment_status === 'pending') {
        const due = new Date();
        due.setDate(due.getDate() + 3);
        await createReminder({
          client_id: clientId,
          title: `Проверить оплату — ${client?.full_name || 'Клиент'}`,
          description: `Заказ: ${orderForm.brand} ${orderForm.model}`,
          due_date: due.toISOString().split('T')[0],
          auto_created: 1,
        });
      }
    }

    // Auto-tasks on order status change — создаются в backend (orders:update)
    // Здесь только синхронизация статуса клиента
    if (orderStatusChanged && newOrderStatusName && client) {
      if (newOrderStatusName === 'Автомобиль в пути') {
        const inTransitStatus = statuses.find(s => s.name === 'Автомобиль в пути');
        if (inTransitStatus && client.status_id !== inTransitStatus.id) {
          await ipcService.clients.update(clientId, { status_id: inTransitStatus.id });
          setClient(prev => prev ? { ...prev, status_id: inTransitStatus.id } : prev);
        }
      }
      if (newOrderStatusName === 'Прибыл в офис') {
        const readyStatus = statuses.find(s => s.name === 'Готов к выдаче');
        if (readyStatus && client.status_id !== readyStatus.id) {
          await ipcService.clients.update(clientId, { status_id: readyStatus.id });
          setClient(prev => prev ? { ...prev, status_id: readyStatus.id } : prev);
        }
      }
      if (newOrderStatusName === 'Выдан клиенту') {
        const doneStatus = statuses.find(s => s.name === 'Завершён');
        if (doneStatus) {
          await ipcService.clients.update(clientId, { status_id: doneStatus.id });
          setClient(prev => prev ? { ...prev, status_id: doneStatus.id } : prev);
          setArchivePrompt(true);
        }
      }
    }

    // Auto-task when signed_contract_date set → remind about payment deadline
    if (signedContractJustSet && orderForm.signed_contract_date && client) {
      const deadline = new Date(orderForm.signed_contract_date);
      deadline.setDate(deadline.getDate() + 3);
      // Set client status to "Ожидает оплату"
      const awaitPayStatus = statuses.find(s => s.name === 'Ожидает оплату');
      if (awaitPayStatus && client.status_id !== awaitPayStatus.id) {
        await ipcService.clients.update(clientId, { status_id: awaitPayStatus.id });
        setClient(prev => prev ? { ...prev, status_id: awaitPayStatus.id } : prev);
      }
      await createReminder({
        client_id: clientId,
        title: `Дедлайн оплаты — ${client.full_name}`,
        description: `Клиент подписал договор ${formatDate(orderForm.signed_contract_date)}. Оплата до ${formatDate(deadline.toISOString().split('T')[0])}`,
        due_date: deadline.toISOString().split('T')[0],
        auto_created: 1,
      });
    }

    setEditingOrder(null);
    setOrderForm({});
    fetchOrders(clientId);
    fetchReminders({ clientId });
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!confirm('Удалить заказ?')) return;
    await deleteOrder(orderId);
    fetchOrders(clientId);
  };

  const calcDeliveryDate = (
    paymentDate: string | null,
    term: number | null,
    unit: 'days' | 'weeks' | 'months' | null
  ): string | null => {
    if (!term || !unit) return null;
    const base = paymentDate || new Date().toISOString().split('T')[0];
    const d = new Date(base);
    if (unit === 'days')   d.setDate(d.getDate() + term);
    if (unit === 'weeks')  d.setDate(d.getDate() + term * 7);
    if (unit === 'months') d.setMonth(d.getMonth() + term);
    return d.toISOString().split('T')[0];
  };

  const applyDeliveryTerm = (
    term: number | null,
    unit: 'days' | 'weeks' | 'months' | null,
    paymentDate?: string | null
  ) => {
    const pd = paymentDate !== undefined ? paymentDate : orderForm.payment_date;
    const newDate = calcDeliveryDate(pd ?? null, term, unit);
    setOrderForm(prev => ({
      ...prev,
      delivery_term: term,
      delivery_term_unit: unit,
      delivery_date_est: newDate ?? prev.delivery_date_est,
    }));
  };

  // Default: 2 weeks
  const applyDefaultTerm = () => applyDeliveryTerm(2, 'weeks');

  const daysUntil = (dateStr: string | null): number | null => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const showBrokerBlock = (statusName?: string) => {
    const brokerStatuses = ['На таможне', 'Ожидает доверенность', 'Таможенное оформление', 'Едет по РФ', 'Прибыл в офис', 'Готов к выдаче', 'Выдан клиенту'];
    return brokerStatuses.includes(statusName || '');
  };

  const showInspectionBlock = (statusName?: string) => {
    const inspectionStatuses = ['Прибыл в офис', 'Готов к выдаче', 'Выдан клиенту'];
    return inspectionStatuses.includes(statusName || '');
  };

  const showIssueDate = (statusName?: string) => {
    return statusName === 'Выдан клиенту';
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
          <div className="flex items-center gap-2">
            <button onClick={() => ipcService.files.openClientFolder(clientId, client.full_name)}
              title="Открыть папку клиента"
              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
              <FolderOpen size={16} />
            </button>
            <button onClick={() => setTrashConfirm(true)}
              title="В корзину"
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={16} />
            </button>
            <button onClick={() => { setActiveTab('main'); setIsEditing(!isEditing); }} className="btn-secondary text-sm">
              {isEditing ? 'Отмена' : 'Редактировать'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto border-b border-gray-200">
        {(['main', 'contacts', 'orders', 'documents', 'contract', 'history'] as const).map(tab => (
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
            {tab === 'contract' && '📄 Договор'}
            {tab === 'history' && 'История'}
          </button>
        ))}
      </div>

      {activeTab === 'main' && (
        <div className="card space-y-4">
          {isEditing ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* LEFT COLUMN */}
                <div className="space-y-3">
                  <div>
                    <label className="label">Статус</label>
                    <select className="input" value={editData.status_id || ''} onChange={e => {
                      const val = e.target.value;
                      setEditData({...editData, status_id: val ? parseInt(val) : null});
                    }}>
                      <option value="">—</option>
                      {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
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
                </div>

                {/* RIGHT COLUMN — Task block (unified) */}
                <div className="space-y-3">
                  <div>
                    <label className="label">Следующее действие</label>
                    <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden text-xs mb-2">
                      <button
                        type="button"
                        onClick={() => setEditData({...editData, next_action: 'Позвонить'})}
                        className={`flex-1 px-2 py-1 transition-colors ${editData.next_action === 'Позвонить' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        Позвонить
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditData({...editData, next_action: 'Связь мессенджер'})}
                        className={`flex-1 px-2 py-1 transition-colors ${editData.next_action === 'Связь мессенджер' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        Связь мессенджер
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditData({...editData, next_action: ''})}
                        className={`flex-1 px-2 py-1 transition-colors ${editData.next_action && editData.next_action !== 'Позвонить' && editData.next_action !== 'Связь мессенджер' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        Своя
                      </button>
                    </div>
                    <input
                      className="input"
                      value={editData.next_action || ''}
                      onChange={e => setEditData({...editData, next_action: e.target.value})}
                      placeholder={editData.next_action === 'Позвонить' || editData.next_action === 'Связь мессенджер' ? editData.next_action : 'Введите задачу'}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Дата контакта</label>
                      <input type="date" className="input" value={editData.next_action_date?.split('T')[0] || ''} onChange={e => setEditData({...editData, next_action_date: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Время</label>
                      <input type="time" className="input" value={editData.next_action_time || ''} onChange={e => setEditData({...editData, next_action_time: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <label className="label">Источник</label>
                <input className="input" value={editData.source || ''} onChange={e => setEditData({...editData, source: e.target.value})} />
              </div>
              <div className="mt-4">
                <label className="label">Комментарий</label>
                <textarea className="input" rows={3} value={editData.comment || ''} onChange={e => setEditData({...editData, comment: e.target.value})} />
              </div>
              <div className="mt-4">
                <button onClick={handleSave} className="btn-primary">Сохранить</button>
              </div>
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

          {/* Client's main contacts from client record */}
          {(client.phone || client.email) && (
            <div className="mb-4 pb-3 border-b border-gray-200">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Основные</h4>
              {client.phone && (
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📞</span>
                    <div>
                      <div className="font-medium text-sm">{client.phone}</div>
                      <div className="text-xs text-gray-500">Телефон (из карточки)</div>
                    </div>
                  </div>
                </div>
              )}
              {client.email && (
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">✉️</span>
                    <div>
                      <div className="font-medium text-sm">{client.email}</div>
                      <div className="text-xs text-gray-500">Email (из карточки)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional contacts */}
          <div className="space-y-2">
            {contacts.length > 0 && (
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Дополнительные</h4>
            )}
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
            {contacts.length === 0 && !client.phone && !client.email && (
              <p className="text-sm text-gray-500 text-center py-4">Контакты не добавлены</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Заказы</h3>
              <button onClick={startNewOrder} className="btn-primary text-sm flex items-center gap-1">
                <Plus size={16} /> Добавить заказ
              </button>
            </div>

            {editingOrder && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                <h4 className="font-semibold text-sm">{editingOrder.id > 0 ? 'Редактирование заказа' : 'Новый заказ'}</h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Номер договора</label>
                    <input className="input text-sm" value={orderForm.contract_number || ''} onChange={e => setOrderForm({...orderForm, contract_number: e.target.value})} placeholder={nextContractNum} />
                  </div>
                  <div>
                    <label className="label text-xs">Марка</label>
                    <select className="input text-sm" value={orderForm.brand || ''} onChange={e => setOrderForm({...orderForm, brand: e.target.value || null})}>
                      <option value="">—</option>
                      {carBrands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Модель</label>
                    <input className="input text-sm" value={orderForm.model || ''} onChange={e => setOrderForm({...orderForm, model: e.target.value || null})} />
                  </div>
                  <div>
                    <label className="label text-xs">Год</label>
                    <input type="number" className="input text-sm" value={orderForm.year || ''} onChange={e => setOrderForm({...orderForm, year: e.target.value ? parseInt(e.target.value) : null})} />
                  </div>
                </div>

                <div>
                  <label className="label text-xs">Комплектация</label>
                  <input className="input text-sm" value={orderForm.configuration || ''} onChange={e => setOrderForm({...orderForm, configuration: e.target.value || null})} />
                </div>
                <div>
                  <label className="label text-xs">Описание</label>
                  <textarea className="input text-sm" rows={2} value={orderForm.description || ''} onChange={e => setOrderForm({...orderForm, description: e.target.value || null})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Цена</label>
                    <input type="number" className="input text-sm" value={orderForm.price || ''} onChange={e => setOrderForm({...orderForm, price: e.target.value ? parseFloat(e.target.value) : null})} />
                  </div>
                  <div>
                    <label className="label text-xs">Комментарий</label>
                    <input className="input text-sm" value={orderForm.comment || ''} onChange={e => setOrderForm({...orderForm, comment: e.target.value || null})} />
                  </div>
                </div>

                {/* Payment block */}
                <div className="border-t border-gray-200 pt-3">
                  <h5 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><FileText size={12}/> Оплата</h5>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Статус оплаты</label>
                      <select className="input text-sm" value={orderForm.payment_status || 'not_paid'} onChange={e => {
                        const status = e.target.value;
                        setOrderForm(prev => ({
                          ...prev,
                          payment_status: status,
                          payment_date: status === 'paid' && !prev.payment_date ? new Date().toISOString().split('T')[0] : prev.payment_date,
                        }));
                      }}>
                        {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Дата оплаты</label>
                      <input type="date" className="input text-sm" value={orderForm.payment_date?.split('T')[0] || ''} onChange={e => {
                        const pd = e.target.value || null;
                        const newEst = orderForm.delivery_term
                          ? calcDeliveryDate(pd, orderForm.delivery_term, orderForm.delivery_term_unit ?? 'days')
                          : orderForm.delivery_date_est;
                        setOrderForm(prev => ({ ...prev, payment_date: pd, delivery_date_est: newEst ?? prev.delivery_date_est }));
                      }} />
                    </div>
                  </div>
                </div>

                {/* Contract signing block */}
                <div className="border-t border-gray-200 pt-3">
                  <h5 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">📝 Подписание договора</h5>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Договор подписан клиентом</label>
                      <input
                        type="date"
                        className="input text-sm"
                        value={orderForm.signed_contract_date?.split('T')[0] || ''}
                        onChange={e => setOrderForm({...orderForm, signed_contract_date: e.target.value || null})}
                      />
                      <p className="text-[10px] text-gray-400 mt-0.5">С этого дня — 3 дня на оплату</p>
                    </div>
                    <div>
                      <label className="label text-xs">Дедлайн оплаты</label>
                      <input
                        type="date"
                        className={`input text-sm ${orderForm.payment_deadline && orderForm.payment_deadline < new Date().toISOString().split('T')[0] ? 'border-red-400 bg-red-50' : ''}`}
                        value={orderForm.payment_deadline?.split('T')[0] || ''}
                        onChange={e => setOrderForm({...orderForm, payment_deadline: e.target.value || null})}
                      />
                      {orderForm.payment_deadline && orderForm.payment_deadline < new Date().toISOString().split('T')[0] && (
                        <p className="text-[10px] text-red-500 font-medium mt-0.5">⚠ Просрочен</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delivery block */}
                <div className="border-t border-gray-200 pt-3">
                  <h5 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><Truck size={12}/> Срок доставки</h5>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <button
                      onClick={applyDefaultTerm}
                      className="btn-secondary text-xs"
                    >
                      Стандарт (2 недели)
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        className="input text-xs w-16"
                        placeholder="14"
                        value={orderForm.delivery_term ?? ''}
                        onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          applyDeliveryTerm(val, orderForm.delivery_term_unit ?? 'days');
                        }}
                      />
                      <select
                        className="input text-xs"
                        value={orderForm.delivery_term_unit ?? 'days'}
                        onChange={e => {
                          const unit = e.target.value as 'days' | 'weeks' | 'months';
                          applyDeliveryTerm(orderForm.delivery_term ?? null, unit);
                        }}
                      >
                        <option value="days">дней</option>
                        <option value="weeks">недель</option>
                        <option value="months">месяцев</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Ориентировочная дата прибытия</label>
                      <input
                        type="date"
                        className="input text-sm"
                        value={orderForm.delivery_date_est?.split('T')[0] || ''}
                        onChange={e => setOrderForm({...orderForm, delivery_date_est: e.target.value || null})}
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Фактическая дата прибытия</label>
                      <input type="date" className="input text-sm" value={orderForm.delivery_date_actual?.split('T')[0] || ''} onChange={e => setOrderForm({...orderForm, delivery_date_actual: e.target.value || null})} />
                    </div>
                  </div>
                  {orderForm.delivery_date_est && (() => {
                    const days = daysUntil(orderForm.delivery_date_est);
                    const overdue = days !== null && days < 0;
                    return (
                      <div className={`text-xs mt-1 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {overdue
                          ? `⚠ Просрочено на ${Math.abs(days!)} дн.`
                          : `До прибытия: ${days ?? '—'} дней`}
                      </div>
                    );
                  })()}
                </div>

                {/* Order status */}
                <div className="border-t border-gray-200 pt-3">
                  <label className="label text-xs">Статус заказа</label>
                  <select className="input text-sm" value={orderForm.order_status_id || ''} onChange={e => setOrderForm({...orderForm, order_status_id: e.target.value ? parseInt(e.target.value) : null})}>
                    <option value="">—</option>
                    {orderStatuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {/* Broker block */}
                {showBrokerBlock(orderStatuses.find(s => s.id === orderForm.order_status_id)?.name) && (
                  <div className="border-t border-gray-200 pt-3">
                    <h5 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><Phone size={12}/> Брокер</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label text-xs">ФИО / название</label>
                        <input className="input text-sm" value={orderForm.broker_name || ''} onChange={e => setOrderForm({...orderForm, broker_name: e.target.value || null})} />
                      </div>
                      <div>
                        <label className="label text-xs">Телефон</label>
                        <input className="input text-sm" value={orderForm.broker_phone || ''} onChange={e => setOrderForm({...orderForm, broker_phone: e.target.value || null})} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="label text-xs">Комментарий</label>
                      <textarea className="input text-sm" rows={2} value={orderForm.broker_comment || ''} onChange={e => setOrderForm({...orderForm, broker_comment: e.target.value || null})} />
                    </div>
                    <div className="mt-2">
                      <label className="label text-xs">Дата передачи брокеру</label>
                      <input type="date" className="input text-sm" value={orderForm.broker_date?.split('T')[0] || ''} onChange={e => setOrderForm({...orderForm, broker_date: e.target.value || null})} />
                    </div>
                  </div>
                )}

                {/* Inspection block */}
                {showInspectionBlock(orderStatuses.find(s => s.id === orderForm.order_status_id)?.name) && (
                  <div className="border-t border-gray-200 pt-3">
                    <h5 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><ClipboardCheck size={12}/> Осмотр автомобиля</h5>
                    <div className="grid grid-cols-2 gap-2">
                      {INSPECTION_ITEMS.map(item => (
                        <label key={item.key} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary-600" />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2">
                      <label className="label text-xs">Комментарий / дефекты</label>
                      <textarea className="input text-sm" rows={2} value={orderForm.inspection_comment || ''} onChange={e => setOrderForm({...orderForm, inspection_comment: e.target.value || null})} />
                    </div>
                    <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded accent-primary-600" checked={!!orderForm.inspection_done} onChange={e => setOrderForm({...orderForm, inspection_done: e.target.checked ? 1 : 0})} />
                      <span className="font-medium">Осмотр завершён</span>
                      {orderForm.inspection_done ? <Check size={14} className="text-green-600"/> : null}
                    </label>
                  </div>
                )}

                {/* Issue date */}
                {showIssueDate(orderStatuses.find(s => s.id === orderForm.order_status_id)?.name) && (
                  <div className="border-t border-gray-200 pt-3">
                    <label className="label text-xs">Дата выдачи клиенту</label>
                    <input type="date" className="input text-sm" value={orderForm.issue_date?.split('T')[0] || ''} onChange={e => setOrderForm({...orderForm, issue_date: e.target.value || null})} />
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button onClick={saveOrder} className="btn-primary text-sm">Сохранить</button>
                  <button onClick={() => { setEditingOrder(null); setOrderForm({}); }} className="btn-secondary text-sm">Отмена</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {orders.map(order => {
                const os = orderStatuses.find(s => s.id === order.order_status_id);
                const days = daysUntil(order.delivery_date_est);
                return (
                  <div key={order.id} className="p-3 bg-gray-50 rounded-md cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => startEditOrder(order)}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{order.brand} {order.model}</span>
                          {os && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: os.color + '20', color: os.color }}>{os.name}</span>}
                        </div>
                        {order.contract_number && <div className="text-xs text-gray-500 mt-0.5">№ {order.contract_number}</div>}
                        {order.year && <div className="text-xs text-gray-500 mt-0.5">{order.year} г.</div>}
                      </div>
                      <div className="text-right">
                        {order.price && <div className="font-semibold text-primary-600 text-sm">{formatPrice(order.price)}</div>}
                        {order.payment_status && (
                          <div className="text-xs mt-0.5" style={{ color: order.payment_status === 'paid' ? '#10b981' : order.payment_status === 'pending' ? '#f59e0b' : '#6b7280' }}>
                            {PAYMENT_STATUS_LABELS[order.payment_status]}
                          </div>
                        )}
                      </div>
                    </div>
                    {order.signed_contract_date && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Подписан клиентом: {formatDate(order.signed_contract_date)}
                      </div>
                    )}
                    {order.payment_deadline && (() => {
                      const overdue = order.payment_deadline < new Date().toISOString().split('T')[0];
                      return (
                        <div className={`text-xs mt-0.5 font-medium ${overdue ? 'text-red-600' : 'text-amber-600'}`}>
                          {overdue ? '⚠ Дедлайн оплаты просрочен: ' : '⏰ Оплатить до: '}{formatDate(order.payment_deadline)}
                        </div>
                      );
                    })()}
                    {order.payment_date && (
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        Оплата: {formatDate(order.payment_date)}
                        {order.delivery_term && (
                          <span className="ml-1">
                            · Срок: {order.delivery_term} {order.delivery_term_unit === 'days' ? 'дн.' : order.delivery_term_unit === 'weeks' ? 'нед.' : 'мес.'}
                          </span>
                        )}
                      </div>
                    )}
                    {order.delivery_date_est && (
                      <div className={`text-xs mt-0.5 flex items-center gap-1 ${days !== null && days < 0 ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                        <Calendar size={11}/> Прибытие: {formatDate(order.delivery_date_est)}
                        {days !== null && days > 0 && <span className="text-primary-600">({days} дн.)</span>}
                        {days !== null && days === 0 && <span className="text-amber-500">(сегодня)</span>}
                        {days !== null && days < 0 && <span>(просрочено на {Math.abs(days)} дн.)</span>}
                      </div>
                    )}
                    {order.delivery_date_actual && (
                      <div className="text-xs text-green-600 mt-0.5">Прибыл: {formatDate(order.delivery_date_actual)}</div>
                    )}
                    {order.comment && <div className="text-xs text-gray-600 mt-1">{order.comment}</div>}
                    <ExtrasPanel orderId={order.id} />
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button onClick={e => { e.stopPropagation(); startEditOrder(order); }} className="text-xs text-primary-600 hover:underline">Редактировать</button>
                      <button onClick={e => { e.stopPropagation(); handleDeleteOrder(order.id); }} className="text-xs text-red-500 hover:underline">Удалить</button>
                      {status?.name !== 'Допы' && (
                        <button onClick={async e => {
                          e.stopPropagation();
                          const extrasStatus = statuses.find(s => s.name === 'Допы');
                          if (extrasStatus) {
                            await ipcService.clients.update(clientId, { status_id: extrasStatus.id });
                            loadClient();
                          }
                        }} className="text-xs text-orange-600 hover:underline">На допы</button>
                      )}
                      {status?.name === 'Допы' && (
                        <button onClick={async e => {
                          e.stopPropagation();
                          const yardStatus = statuses.find(s => s.name === 'На площадке');
                          if (yardStatus) {
                            await ipcService.clients.update(clientId, { status_id: yardStatus.id });
                            loadClient();
                          }
                        }} className="text-xs text-green-600 hover:underline">С допов → На площадке</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {orders.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Заказы не добавлены</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-4">
          <DocumentsPanel clientId={clientId} />
        </div>
      )}

      {activeTab === 'officers' && client && (() => {
        // Documents needed by officers
        const officerDocs = [
          { code: 'inn',             label: 'ИНН' },
          { code: 'snils',           label: 'СНИЛС' },
          { code: 'contract_signed', label: 'Договор (скан подписанный клиентом)' },
          { code: 'contract',        label: 'Договор (файл Word)' },
          { code: 'consent',         label: 'Согласие на обработку ПД' },
        ];
        return (
          <div className="card space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">📋 Пакет документов для оформителей</h3>
              <p className="text-sm text-gray-500">Документы которые нужно передать оформителям для оформления сделки</p>
            </div>

            <div className="space-y-2">
              {officerDocs.map(d => {
                const docInStore = (documents as {code: string; status: string; files: unknown[]}[]).find(doc => doc.code === d.code);
                const hasFile = docInStore && docInStore.files && (docInStore.files as unknown[]).length > 0;
                const isReceived = docInStore && (docInStore.status === 'received' || docInStore.status === 'verified');
                return (
                  <div key={d.code} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                    hasFile ? 'border-green-200 bg-green-50' : isReceived ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'
                  }`}>
                    <span className="text-lg">{hasFile ? '✅' : isReceived ? '📄' : '❌'}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{d.label}</div>
                      <div className="text-xs text-gray-500">
                        {hasFile ? 'Файл загружен' : isReceived ? 'Получен (файл не загружен)' : 'Отсутствует'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Client data for broker */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="font-semibold text-gray-800 mb-2 text-sm">📞 Данные клиента для брокера</h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                <div><span className="text-gray-500">ФИО:</span> <span className="font-medium">{client.full_name}</span></div>
                {client.phone && <div><span className="text-gray-500">Телефон:</span> <span className="font-medium">{client.phone}</span></div>}
                {client.email && <div><span className="text-gray-500">Email:</span> <span className="font-medium">{client.email}</span></div>}
                {orders[0]?.contract_number && <div><span className="text-gray-500">№ договора:</span> <span className="font-medium">{orders[0].contract_number}</span></div>}
                {orders[0]?.brand && <div><span className="text-gray-500">Авто:</span> <span className="font-medium">{orders[0].brand} {orders[0].model} {orders[0].year}</span></div>}
              </div>
              <button
                onClick={() => {
                  const text = [
                    `ФИО: ${client.full_name}`,
                    client.phone ? `Телефон: ${client.phone}` : '',
                    client.email ? `Email: ${client.email}` : '',
                    orders[0]?.contract_number ? `№ договора: ${orders[0].contract_number}` : '',
                    orders[0]?.brand ? `Авто: ${orders[0].brand} ${orders[0].model} ${orders[0].year || ''}` : '',
                  ].filter(Boolean).join('\n');
                  navigator.clipboard.writeText(text);
                }}
                className="mt-2 text-xs text-primary-600 hover:underline"
              >
                📋 Скопировать данные
              </button>
            </div>
          </div>
        );
      })()}

      {activeTab === 'contract' && client && (
        <ErrorBoundary label="Договор">
          <ContractTab
            client={client}
            orders={orders}
            onHistoryRefresh={() => fetchHistory(clientId)}
            onDocumentsRefresh={() => fetchDocuments(clientId)}
          />
        </ErrorBoundary>
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

      {trashConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Переместить в корзину?</div>
                <div className="text-sm text-gray-500 mt-0.5">{client?.full_name}</div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Клиент исчезнет из основного списка. Все данные сохранятся — его можно восстановить из корзины.
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  await ipcService.clients.trash(clientId);
                  setTrashConfirm(false);
                  navigate('/clients');
                }}
                className="flex-1 btn-danger font-semibold">
                В корзину
              </button>
              <button onClick={() => setTrashConfirm(false)} className="flex-1 btn-secondary">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {archivePrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-xl">🏁</div>
              <div>
                <div className="font-semibold text-gray-900">Переместить в Архив?</div>
                <div className="text-sm text-gray-500 mt-0.5">{client?.full_name}</div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Клиент завершил работу с вами. Переместить его в Архив? Все данные сохранятся — при необходимости можно вернуть в работу.
            </p>
            <div className="flex gap-3">
              <button onClick={handleArchive} className="flex-1 bg-gray-700 hover:bg-gray-800 text-white py-2 rounded-lg font-semibold text-sm transition-colors">
                В Архив
              </button>
              <button onClick={() => setArchivePrompt(false)} className="flex-1 btn-secondary">Не сейчас</button>
            </div>
          </div>
        </div>
      )}
      {contactModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Добавить контакт</h2>
              <button onClick={() => setContactModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Тип</label>
                <select
                  className="input"
                  value={contactModal.type}
                  onChange={e => setContactModal(m => m && { ...m, type: e.target.value as Contact['type'] })}
                >
                  <option value="phone">Телефон</option>
                  <option value="telegram">Telegram</option>
                  <option value="max">MAX</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="other">Другое</option>
                </select>
              </div>
              <div>
                <label className="label">Значение</label>
                <input
                  className="input"
                  autoFocus
                  value={contactModal.value}
                  onChange={e => setContactModal(m => m && { ...m, value: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleSaveContact()}
                  placeholder="+7 900 000-00-00"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSaveContact}
                disabled={!contactModal.value.trim()}
                className="flex-1 btn-primary font-semibold disabled:opacity-50"
              >
                Добавить
              </button>
              <button onClick={() => setContactModal(null)} className="flex-1 btn-secondary">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
