import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from 'react';

// ── Диагностический экран загрузки ──────────────────────────────────────────
function LoadingDiag({ clientId }: { clientId: number }) {
  const [log, setLog] = useState<{ name: string; status: 'pending' | 'ok' | 'error' | 'timeout'; detail?: string }[]>([]);

  useEffect(() => {
    const checks = [
      { name: 'electronAPI доступен', fn: async () => {
        if (!window.electronAPI) throw new Error('window.electronAPI = undefined');
        return 'ok';
      }},
      { name: 'clients:getById(' + clientId + ')', fn: async () => {
        const r = await ipcService.clients.getById(clientId);
        return r ? `найден: ${(r as {full_name?:string}).full_name}` : 'null (клиент не найден)';
      }},
      { name: 'statuses:getAll', fn: async () => {
        const r = await ipcService.statuses.getAll();
        return `${r.length} статусов`;
      }},
      { name: 'orders:getByClientId', fn: async () => {
        const r = await ipcService.orders.getByClientId(clientId);
        return `${r.length} заказов`;
      }},
      { name: 'reminders:getAll', fn: async () => {
        const r = await ipcService.reminders.getAll({ clientId });
        return `${r.length} напоминаний`;
      }},
      { name: 'contacts:getByClientId', fn: async () => {
        const r = await ipcService.contacts.getByClientId(clientId);
        return `${r.length} контактов`;
      }},
      { name: 'documents:getByClientId', fn: async () => {
        const r = await ipcService.documents.getByClientId(clientId);
        return `${r.length} документов`;
      }},
    ];

    setLog(checks.map(c => ({ name: c.name, status: 'pending' as const })));

    checks.forEach((check, i) => {
      const timer = setTimeout(() => {
        setLog(prev => prev.map((l, idx) => idx === i && l.status === 'pending'
          ? { ...l, status: 'timeout', detail: 'не ответил за 6 сек — IPC завис!' }
          : l
        ));
      }, 6000);

      check.fn()
        .then(detail => {
          clearTimeout(timer);
          setLog(prev => prev.map((l, idx) => idx === i ? { ...l, status: 'ok', detail: String(detail) } : l));
        })
        .catch(err => {
          clearTimeout(timer);
          setLog(prev => prev.map((l, idx) => idx === i ? { ...l, status: 'error', detail: String(err) } : l));
        });
    });
  }, [clientId]);

  const icon = (s: string) => s === 'ok' ? '✅' : s === 'error' ? '❌' : s === 'timeout' ? '⏰' : '⏳';
  const color = (s: string) => s === 'ok' ? 'text-green-700' : s === 'error' ? 'text-red-700 font-bold' : s === 'timeout' ? 'text-orange-700 font-bold' : 'text-gray-500';

  return (
    <div className="p-6 max-w-xl">
      <h2 className="text-lg font-bold mb-4 text-gray-800">Диагностика загрузки клиента #{clientId}</h2>
      <div className="space-y-2 font-mono text-sm">
        {log.map((l, i) => (
          <div key={i} className={`flex gap-2 ${color(l.status)}`}>
            <span>{icon(l.status)}</span>
            <div>
              <div>{l.name}</div>
              {l.detail && <div className="text-xs opacity-75 ml-2">→ {l.detail}</div>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-gray-400">Скриншот этого экрана поможет найти проблему</p>
    </div>
  );
}
// ────────────────────────────────────────────────────────────────────────────
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import { useOrders } from '../hooks/useOrders';
import { useContacts } from '../hooks/useContacts';
import { useHistory } from '../hooks/useHistory';
import { useReminders } from '../hooks/useReminders';
import { useDocuments } from '../hooks/useDocuments';
import StatusBadge from '../components/StatusBadge';
import DocumentsPanel from '../components/DocumentsPanel';
import { formatDate, formatPrice, formatMoneyInput, parseMoneyInput, getContactLink, getContactIcon } from '../utils/formatters';
import { ArrowLeft, ExternalLink, Plus, Trash2, Star, AlertTriangle, FolderOpen, FileText, Check, X, Calendar, Truck } from 'lucide-react';
import ContractTab from '../components/ContractTab';
import ExtrasPanel from '../components/ExtrasPanel';
import ErrorBoundary from '../components/ErrorBoundary';
import type { Client, Status, Contact, Order, CarBrand, Reminder, Extra } from '../types';
import { PAYMENT_STATUS_LABELS } from '../types';
import { modelSuggestions } from '../constants/carCatalog';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = parseInt(id || '0');

  const [client, setClient] = useState<Client | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [carBrands, setCarBrands] = useState<CarBrand[]>([]);
  const [activeTab, setActiveTab] = useState<'main' | 'contacts' | 'orders' | 'documents' | 'history' | 'contract' | 'extras'>(
    (searchParams.get('tab') as 'main' | 'contacts' | 'orders' | 'documents' | 'history' | 'contract' | 'extras') || 'main'
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [trashConfirm, setTrashConfirm] = useState(false);
  const [contactModal, setContactModal] = useState<{ type: Contact['type']; value: string } | null>(null);

  // Order editing
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderForm, setOrderForm] = useState<Partial<Order>>({});
  const [nextContractNum, setNextContractNum] = useState('');
  const [orderEditorTab, setOrderEditorTab] = useState<'car' | 'contract' | 'delivery' | 'vin'>('car');
  const [customModel, setCustomModel] = useState(false);

  const { orders, fetchOrders, createOrder, updateOrder, deleteOrder } = useOrders();
  const { contacts, fetchContacts, createContact, deleteContact, setPrimary } = useContacts();
  const { entries, fetchHistory } = useHistory();
  const { reminders, fetchReminders, createReminder } = useReminders();
  const { documents, fetchDocuments } = useDocuments();
  const [extras, setExtras] = useState<Extra[]>([]);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [newExtra, setNewExtra] = useState({ name: '', price: '' });

  useEffect(() => {
    if (!clientId || isNaN(clientId) || clientId <= 0) { setLoadError(true); setIsLoading(false); return; }

    loadClient();
    ipcService.statuses.getAll().then(setStatuses);
    ipcService.carBrands.getAll().then(setCarBrands);
    fetchOrders(clientId);
    fetchContacts(clientId);
    fetchHistory(clientId);
    fetchReminders({ clientId });
    fetchDocuments(clientId);
  }, [clientId]);

  const fetchExtras = async (cid: number) => {
    setExtrasLoading(true);
    try {
      const ords = await ipcService.orders.getByClientId(cid);
      const all: Extra[] = [];
      for (const o of ords) {
        const e = await ipcService.extras.getByOrder(o.id);
        all.push(...e);
      }
      setExtras(all);
    } finally {
      setExtrasLoading(false);
    }
  };

  // Загружаем extras когда переключаемся на вкладку
  useEffect(() => {
    if (activeTab === 'extras' && clientId) fetchExtras(clientId);
  }, [activeTab, clientId]);

  const loadClient = async () => {
    setIsLoading(true);
    try {
      const data = await ipcService.clients.getById(clientId) as Client | undefined;
      setClient(data ?? null);
      if (!data) setLoadError(true);
    } catch (e) {
      console.error('loadClient error:', e);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

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

    
    const success = await ipcService.clients.update(clientId, cleanData);
    if (success) {
      // "Следующее действие" is the same task that must appear on the main
      // dashboard. Client fields are derived from reminders, so keep exactly
      // one reminder in sync instead of saving an unrelated, invisible value.
      const reminderId = Number(next_reminder_id);
      const hasExistingReminder = Number.isFinite(reminderId) && reminderId > 0;
      const reminderTitle = next_action?.trim();
      const dueDate = next_action_date?.split('T')[0] || null;
      const dueTime = next_action_time || null;

      if (reminderTitle) {
        if (hasExistingReminder) {
          await ipcService.reminders.update(reminderId, {
            title: reminderTitle,
            due_date: dueDate,
            due_time: dueTime,
            is_completed: 0,
          });
        } else {
          await ipcService.reminders.create({
            client_id: clientId,
            title: reminderTitle,
            due_date: dueDate || undefined,
            due_time: dueTime || undefined,
          });
        }
      } else if (hasExistingReminder) {
        // Clearing the action also removes the pending task, so it will not
        // unexpectedly stay on the main dashboard.
        await ipcService.reminders.delete(reminderId);
      }

      setIsEditing(false);
      await Promise.all([loadClient(), fetchReminders({ clientId })]);
      // A completed or lost client is always moved to the visible Archive.
      // This avoids a card disappearing from the working list with no place to find it.
      const newStatus = statuses.find(s => s.id === (cleanData.status_id as number));
      if (newStatus && (newStatus.category === 'done' || newStatus.category === 'lost')) {
        await ipcService.clients.update(clientId, { is_archived: 1 });
        navigate('/archive');
      }
    }
  };

  const toggleClientEditing = () => {
    setActiveTab('main');
    if (isEditing) {
      setIsEditing(false);
      setEditData({});
      return;
    }
    // Start with the values already saved in the client card. Without this,
    // the edit form looks empty and a manager can accidentally overwrite data.
    setEditData({ ...client });
    setIsEditing(true);
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
      payment_status: 'pending',
      payment_date: null,
      delivery_date_est: null,
      delivery_date_actual: null,
      vin: '',
      vin_received_date: null,
      moscow_arrival_date: null,
      vin_moscow_confirmed: 0,
      vin_moscow_confirmed_date: null,
      client_notified_moscow: 0,
      client_notified_moscow_date: null,
      order_status_id: null,
      inspection_done: 0,
      inspection_comment: '',
      issue_date: null,
      planned_issue_date: null,
      delivery_term: 2,
      delivery_term_unit: 'weeks',
      payment_deadline: null,
      signed_contract_date: null,
    });
    setOrderEditorTab('car');
    setCustomModel(false);
    setEditingOrder({ id: 0 } as Order);
  };

  const startEditOrder = (order: Order) => {
    setOrderForm({ ...order });
    setCustomModel(Boolean(order.model && !modelSuggestions(order.brand).includes(order.model)));
    setOrderEditorTab(order.payment_status === 'paid' ? 'delivery' : order.signed_contract_date ? 'contract' : 'car');
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

    const currentOrderStatus = statuses.find(s => s.id === orderForm.order_status_id)?.name;
    const prePaymentStatuses = ['Думает', 'Документы получены', 'Договор подписан', 'Ожидает оплату'];
    if (orderForm.payment_status === 'paid' && (!currentOrderStatus || prePaymentStatuses.includes(currentOrderStatus))) {
      orderForm.order_status_id = statuses.find(s => s.name === 'Автомобиль в пути')?.id ?? orderForm.order_status_id;
    }

    // Auto-set payment deadline (+3 days) when signed_contract_date is set for first time
    const prevOrder = editingOrder && editingOrder.id > 0 ? orders.find(o => o.id === editingOrder.id) : null;
    const signedContractJustSet = orderForm.signed_contract_date &&
      (!prevOrder || prevOrder.signed_contract_date !== orderForm.signed_contract_date);

    if (signedContractJustSet && orderForm.signed_contract_date) {
      const deadline = new Date(orderForm.signed_contract_date);
      deadline.setDate(deadline.getDate() + 3);
      orderForm.payment_deadline = deadline.toISOString().split('T')[0];
      if (orderForm.payment_status !== 'paid') {
        orderForm.order_status_id = statuses.find(s => s.name === 'Ожидает оплату')?.id ?? orderForm.order_status_id;
      }
    }

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

    // Auto-task when signed_contract_date set → remind about payment deadline
    if (signedContractJustSet && orderForm.signed_contract_date && client) {
      const deadline = new Date(orderForm.signed_contract_date);
      deadline.setDate(deadline.getDate() + 3);
      await createReminder({
        client_id: clientId,
        title: `Дедлайн оплаты — ${client.full_name}`,
        description: `Клиент подписал договор ${formatDate(orderForm.signed_contract_date)}. Оплата до ${formatDate(deadline.toISOString().split('T')[0])}`,
        due_date: deadline.toISOString().split('T')[0],
        auto_created: 1,
      });
    }

    const finalOrderStatus = statuses.find(s => s.id === orderForm.order_status_id);
    setEditingOrder(null);
    setOrderForm({});
    await loadClient();
    fetchOrders(clientId);
    fetchReminders({ clientId });
    if (finalOrderStatus && (finalOrderStatus.category === 'done' || finalOrderStatus.category === 'lost')) {
      navigate('/archive');
    }
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

  const showInspectionBlock = (statusName?: string) => {
    return ['Автомобиль прибыл', 'Допы', 'Подготовка к выдаче', 'Выдан'].includes(statusName || '');
  };

  const showIssueDate = (statusName?: string) => {
    return statusName === 'Выдан';
  };

  if (loadError) return <div className="p-4 text-red-500">Ошибка загрузки клиента. Проверьте консоль.</div>;
  if (isLoading) return <LoadingDiag clientId={clientId} />;
  if (!client) return <div className="p-4 text-gray-500">Клиент не найден.</div>;

  const status = statuses.find(s => s.id === client.status_id);
  const hasOrderWorkflow = orders.length > 0;

  return (
    <div className="p-3 max-w-6xl mx-auto">
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
            <button onClick={toggleClientEditing} className={isEditing ? 'btn-cancel text-sm' : 'btn-secondary text-sm'}>
              {isEditing ? 'Отмена' : 'Редактировать'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('documents')}
            className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              activeTab === 'documents' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'
            }`}
          >
            <span className="block text-xs text-gray-500">1. Собрать</span>
            <span className="font-medium">Документы</span>
          </button>
          <button
            onClick={() => setActiveTab('contract')}
            className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              activeTab === 'contract' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'
            }`}
          >
            <span className="block text-xs text-gray-500">2. Оформить</span>
            <span className="font-medium">Договор</span>
          </button>
          <button
            onClick={() => navigate('/orders')}
            className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:border-primary-300"
          >
            <span className="block text-xs text-gray-500">3. Контролировать</span>
            <span className="font-medium">Доставку</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto border-b border-gray-200">
        {(['main', 'contacts', 'orders', 'documents', 'contract', 'extras', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'main' && 'Основное'}
            {tab === 'contacts' && 'Контакты'}
            {tab === 'orders' && 'Заказы'}
            {tab === 'documents' && 'Документы'}
            {tab === 'contract' && '📄 Договор'}
            {tab === 'extras' && (
              <span className="flex items-center gap-1">
                🔧 Допы
                {extras.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs rounded-full px-1.5 leading-5">{extras.length}</span>}
              </span>
            )}
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
                    {hasOrderWorkflow ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                        {status?.name || '—'}
                        <span className="block mt-0.5 text-xs text-gray-500">Меняется в заказе — в поле «Этап автомобиля».</span>
                      </div>
                    ) : (
                      <select className="input" value={editData.status_id || ''} onChange={e => {
                        const val = e.target.value;
                        setEditData({...editData, status_id: val ? parseInt(val) : null});
                      }}>
                        <option value="">—</option>
                        {statuses.filter(s => s.name !== 'Оплачен').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
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
                <button onClick={handleSave} className="btn-save">Сохранить</button>
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
              <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2">
                <h4 className="font-semibold text-sm">{editingOrder.id > 0 ? 'Редактирование заказа' : 'Новый заказ'}</h4>

                <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-2">
                  {([
                    ['car', '1. Автомобиль'],
                    ['contract', '2. Договор'],
                    ['delivery', '3. Контролировать доставку'],
                    ['vin', '4. VIN присвоение'],
                  ] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setOrderEditorTab(tab)}
                      className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
                        orderEditorTab === tab ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {orderEditorTab === 'car' && <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="label text-xs">Номер договора</label>
                    <input className="input text-sm" value={orderForm.contract_number || ''} onChange={e => setOrderForm({...orderForm, contract_number: e.target.value})} placeholder={nextContractNum} />
                  </div>
                  <div>
                    <label className="label text-xs">Марка</label>
                    <select className="input text-sm" value={orderForm.brand || ''} onChange={e => { setOrderForm({...orderForm, brand: e.target.value || null, model: null}); setCustomModel(false); }}>
                      <option value="">—</option>
                      {carBrands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Модель</label>
                    {!customModel ? <select
                      className="input text-sm"
                      value={orderForm.model || ''}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setOrderForm({...orderForm, model: null});
                          setCustomModel(true);
                        } else {
                          setOrderForm({...orderForm, model: e.target.value || null});
                        }
                      }}
                    >
                      <option value="">{orderForm.brand ? '— выберите модель —' : 'Сначала выберите марку'}</option>
                      {(orderForm.brand ? modelSuggestions(orderForm.brand) : []).map(model => <option key={model} value={model}>{model}</option>)}
                      <option value="__custom__">+ Другая модель</option>
                    </select> : <div className="flex gap-2">
                      <input className="input text-sm" autoFocus value={orderForm.model || ''} onChange={e => setOrderForm({...orderForm, model: e.target.value || null})} placeholder="Введите модель" />
                      <button type="button" className="btn-cancel text-xs whitespace-nowrap" onClick={() => { setOrderForm({...orderForm, model: null}); setCustomModel(false); }}>К списку</button>
                    </div>}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="label text-xs">Год</label>
                    <input type="number" className="input text-sm" value={orderForm.year || ''} onChange={e => setOrderForm({...orderForm, year: e.target.value ? parseInt(e.target.value) : null})} />
                  </div>
                  <div>
                    <label className="label text-xs">Комплектация</label>
                    <input className="input text-sm" value={orderForm.configuration || ''} onChange={e => setOrderForm({...orderForm, configuration: e.target.value || null})} />
                  </div>
                  <div>
                    <label className="label text-xs">Цена</label>
                    <input type="text" inputMode="numeric" className="input text-sm" value={formatMoneyInput(orderForm.price)} onChange={e => setOrderForm({...orderForm, price: parseMoneyInput(e.target.value)})} />
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="label text-xs">Цвет</label>
                    <input className="input text-sm" value={orderForm.color || ''} onChange={e => setOrderForm({...orderForm, color: e.target.value || null})} placeholder="Белый" />
                  </div>
                  <div>
                    <label className="label text-xs">Описание</label>
                    <input className="input text-sm" value={orderForm.description || ''} onChange={e => setOrderForm({...orderForm, description: e.target.value || null})} />
                  </div>
                  <div>
                    <label className="label text-xs">Комментарий</label>
                    <input className="input text-sm" value={orderForm.comment || ''} onChange={e => setOrderForm({...orderForm, comment: e.target.value || null})} />
                  </div>
                </div>
                </>}

                {/* Contract block. Payment is confirmed only in «Документы» by the dated receipt. */}
                {orderEditorTab === 'contract' && <>
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
                </>}

                {/* Delivery block */}
                {(orderEditorTab === 'delivery' || orderEditorTab === 'vin') && <>
                {orderEditorTab === 'delivery' && <>
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
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
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
                    <div>
                      <label className="label text-xs">Плановая дата выдачи</label>
                      <input type="date" className="input text-sm" value={orderForm.planned_issue_date?.split('T')[0] || ''} onChange={e => setOrderForm({...orderForm, planned_issue_date: e.target.value || null})} />
                      <p className="text-[10px] text-gray-400 mt-0.5">Проверка авто будет поставлена за 2 дня</p>
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
                </>}
                {orderEditorTab === 'vin' && <div className="border-t border-gray-200 pt-3">
                  <h5 className="text-xs font-semibold text-gray-600 mb-2">VIN присвоение</h5>
                  <p className="mb-3 text-xs text-gray-500">После таможни внесите последние 6 цифр VIN. Затем в списке VIN из Telegram можно быстро найти свой автомобиль и позвонить клиенту.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label text-xs">Последние 6 цифр VIN</label>
                      <input
                        className="input text-sm font-mono uppercase"
                        maxLength={6}
                        placeholder="Например: 036331"
                        value={orderForm.vin || ''}
                        onChange={e => setOrderForm({...orderForm, vin: e.target.value.replace(/\D/g, '').slice(0, 6)})}
                      />
                      <p className="mt-0.5 text-[10px] text-gray-400">Введите последние цифры VIN из сообщения после таможни, например 036331</p>
                    </div>
                    <div>
                      <label className="label text-xs">VIN получен после таможни</label>
                      <input type="date" className="input text-sm" value={orderForm.vin_received_date?.split('T')[0] || ''} onChange={e => setOrderForm({...orderForm, vin_received_date: e.target.value || null})} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
                      <input type="checkbox" checked={Boolean(orderForm.client_notified_moscow)} onChange={e => setOrderForm({...orderForm, client_notified_moscow: e.target.checked ? 1 : 0, client_notified_moscow_date: e.target.checked ? (orderForm.client_notified_moscow_date || new Date().toISOString().split('T')[0]) : null})} />
                      Клиенту сообщено о прибытии
                    </label>
                  </div>
                  {orderForm.client_notified_moscow_date && <p className="mt-1 text-[10px] text-gray-500">Клиенту сообщено: {formatDate(orderForm.client_notified_moscow_date)}</p>}
                </div>}

                {orderEditorTab === 'delivery' && <>
                {/* Единый статус заказа и клиента; сохранение происходит только по кнопке. */}
                <div className="border-t border-gray-200 pt-3">
                  <label className="label text-xs">Этап автомобиля</label>
                  <select
                    className="input text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    value={orderForm.order_status_id || ''}
                    disabled={orderForm.payment_status !== 'paid'}
                    onChange={e => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setOrderForm({...orderForm, order_status_id: val});
                    }}
                  >
                    <option value="">—</option>
                    {statuses
                      .filter(s => ['Автомобиль в пути', 'Автомобиль прибыл', 'Допы', 'Подготовка к выдаче', 'Выдан'].includes(s.name))
                      .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {orderForm.payment_status !== 'paid' && (
                    <p className="mt-1 text-xs text-amber-600">Этап станет доступен после подтверждения полной оплаты во вкладке «Договор».</p>
                  )}
                </div>

                {/* Inspection block */}
                {showInspectionBlock(statuses.find(s => s.id === orderForm.order_status_id)?.name) && (
                  <div className="border-t border-gray-200 pt-3">
                    <h5 className="text-xs font-semibold text-gray-600 mb-2">Осмотр автомобиля</h5>
                    <div>
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
                {showIssueDate(statuses.find(s => s.id === orderForm.order_status_id)?.name) && (
                  <div className="border-t border-gray-200 pt-3">
                    <label className="label text-xs">Дата выдачи клиенту</label>
                    <input type="date" className="input text-sm" value={orderForm.issue_date?.split('T')[0] || ''} onChange={e => setOrderForm({...orderForm, issue_date: e.target.value || null})} />
                  </div>
                )}
                </>}
                </>}

                <div className="flex gap-2 pt-2">
                  <button onClick={saveOrder} className="btn-save text-sm">Сохранить</button>
                  <button onClick={() => { setEditingOrder(null); setOrderForm({}); }} className="btn-cancel text-sm">Отмена</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {orders.map(order => {
                const os = statuses.find(s => s.id === order.order_status_id);
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
                    {order.payment_deadline && order.payment_status !== 'paid' && (() => {
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
                      {os?.name !== 'Допы' && (
                        <button onClick={async e => {
                          e.stopPropagation();
                          const extrasStatus = statuses.find(s => s.name === 'Допы');
                          if (extrasStatus) {
                            await updateOrder(order.id, { order_status_id: extrasStatus.id });
                            loadClient();
                            fetchOrders(clientId);
                          }
                        }} className="text-xs text-orange-600 hover:underline">На допы</button>
                      )}
                      {os?.name === 'Допы' && (
                        <button onClick={async e => {
                          e.stopPropagation();
                          const arrivedStatus = statuses.find(s => s.name === 'Автомобиль прибыл');
                          if (arrivedStatus) {
                            await updateOrder(order.id, { order_status_id: arrivedStatus.id });
                            loadClient();
                            fetchOrders(clientId);
                          }
                        }} className="text-xs text-green-600 hover:underline">С допов → Автомобиль прибыл</button>
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
          <DocumentsPanel
            clientId={clientId}
            orders={orders}
            onOrdersRefresh={() => fetchOrders(clientId)}
            onHistoryRefresh={() => fetchHistory(clientId)}
            onClientRefresh={loadClient}
          />
        </div>
      )}

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

      {activeTab === 'extras' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">🔧 Дополнительное оборудование</h3>
            {extras.length > 0 && (
              <span className="text-sm text-gray-500">
                Итого: <span className="font-bold text-gray-900">
                  {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(
                    extras.reduce((s, e) => s + (e.price || 0), 0)
                  )}
                </span>
              </span>
            )}
          </div>

          {/* Список позиций */}
          {extrasLoading ? (
            <p className="text-sm text-gray-400 text-center py-4">Загрузка...</p>
          ) : extras.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Доп. оборудование не добавлено</p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Заголовок таблицы */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase">
                <div>Наименование / описание</div>
                <div className="text-right w-28">Цена работы (₽)</div>
                <div className="w-8"></div>
              </div>
              {/* Строки */}
              {extras.map((ex, idx) => (
                <div key={ex.id} className={`grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2.5 items-center text-sm ${idx % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                  <div className="text-gray-900">{ex.name}</div>
                  <div className="text-right w-28 font-medium text-gray-800">
                    {ex.price ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(ex.price) + ' ₽' : '—'}
                  </div>
                  <div className="w-8 flex justify-end">
                    <button
                      onClick={async () => {
                        if (!confirm(`Удалить "${ex.name}"?`)) return;
                        await ipcService.extras.delete(ex.id);
                        fetchExtras(clientId);
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Удалить"
                    >✕</button>
                  </div>
                </div>
              ))}
              {/* Итого */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2.5 bg-amber-50 border-t border-amber-200 text-sm font-bold">
                <div className="text-amber-800">Итого</div>
                <div className="text-right w-28 text-amber-900">
                  {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
                    extras.reduce((s, e) => s + (e.price || 0), 0)
                  )} ₽
                </div>
                <div className="w-8"></div>
              </div>
            </div>
          )}

          {/* Форма добавления новой позиции */}
          {orders.length > 0 ? (
            <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Добавить позицию</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="label">Доп. оборудование / описание работы</label>
                  <input
                    className="input text-sm"
                    placeholder="Например: Тонировка задних стёкол"
                    value={newExtra.name}
                    onChange={e => setNewExtra(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && newExtra.name.trim()) {
                        await ipcService.extras.create({
                          order_id: orders[0].id,
                          name: newExtra.name.trim(),
                          price: parseMoneyInput(newExtra.price) ?? 0,
                        });
                        setNewExtra({ name: '', price: '' });
                        fetchExtras(clientId);
                      }
                    }}
                  />
                </div>
                <div className="w-36">
                  <label className="label">Цена за работу (₽)</label>
                  <input
                    className="input text-sm"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    min="0"
                    value={newExtra.price}
                    onChange={e => setNewExtra(p => ({ ...p, price: formatMoneyInput(e.target.value) }))}
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!newExtra.name.trim()) return;
                    await ipcService.extras.create({
                      order_id: orders[0].id,
                      name: newExtra.name.trim(),
                      price: parseMoneyInput(newExtra.price) ?? 0,
                    });
                    setNewExtra({ name: '', price: '' });
                    fetchExtras(clientId);
                  }}
                  className="btn-primary mb-0.5"
                  disabled={!newExtra.name.trim()}
                >
                  + Добавить
                </button>
              </div>
              <p className="text-xs text-gray-400">Enter или кнопка — добавляет позицию. Можно добавлять сколько угодно.</p>
            </div>
          ) : (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
              ⚠️ Сначала создайте заказ на вкладке «Заказы» — допы привязываются к заказу.
            </p>
          )}
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
              <button onClick={() => setTrashConfirm(false)} className="flex-1 btn-cancel">Отмена</button>
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
