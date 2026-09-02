export interface Status {
  id: number;
  name: string;
  color: string;
  category: string;
  sort_order: number;
  is_active: number;
}

export interface OrderStatus {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  is_active: number;
}

export interface Client {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  comment: string | null;
  status_id: number | null;
  next_action: string | null;
  next_action_date: string | null;
  is_archived: number;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  status_name?: string;
  status_color?: string;
  contract_number?: string | null;
  car?: string | null;
  payment_status?: string | null;
  payment_date?: string | null;
  delivery_date_est?: string | null;
  payment_deadline?: string | null;
  price?: number | null;
  consent_status?: ConsentStatus;
  next_action_time?: string | null;
  next_reminder_id?: number | null;
  reminders_count?: number;
  reminders_overdue?: number;
}

export type ConsentStatus = 'not_requested' | 'sent' | 'received' | 'verified';

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  not_requested: 'Не запрашивалось',
  sent:          'Отправлено клиенту',
  received:      'Получено',
  verified:      'Проверено',
};

export const CONSENT_STATUS_COLORS: Record<ConsentStatus, string> = {
  not_requested: '#9ca3af',
  sent:          '#f59e0b',
  received:      '#3b82f6',
  verified:      '#10b981',
};

export interface Consent {
  id: number;
  client_id: number;
  status: ConsentStatus;
  received_date: string | null;
  scan_path: string | null;
  comment: string | null;
  updated_at: string;
}

export interface Order {
  id: number;
  client_id: number;
  contract_number: string | null;
  contract_date: string | null;
  deal_amount: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  body_type: string | null;
  engine: string | null;
  engine_type: string | null;
  drive: string | null;
  transmission: string | null;
  configuration: string | null;
  color: string | null;
  mileage: string | null;
  car_other: string | null;
  description: string | null;
  price: number | null;
  comment: string | null;
  delivery_date_est: string | null;
  delivery_date_actual: string | null;
  payment_date: string | null;
  payment_status: string | null;
  order_status_id: number | null;
  broker_name: string | null;
  broker_phone: string | null;
  broker_comment: string | null;
  broker_date: string | null;
  inspection_done: number;
  inspection_comment: string | null;
  issue_date: string | null;
  delivery_term: number | null;
  delivery_term_unit: 'days' | 'weeks' | 'months' | null;
  payment_deadline: string | null;
  signed_contract_date: string | null;
  created_at: string;
  updated_at: string;
  // joined
  order_status_name?: string;
  order_status_color?: string;
}

export interface ClientPassportData {
  id?: number;
  client_id: number;
  birth_date: string | null;
  inn: string | null;
  passport_number: string | null;
  passport_issued_by: string | null;
  passport_issue_date: string | null;
  passport_code: string | null;
  registration_address: string | null;
  updated_at?: string;
}

export interface ContractGenerateData {
  clientId: number;
  orderId: number;
  contractNumber: string;
  contractDate: string;
  dealAmount: string;
  agentFee: string;
}

export interface Contact {
  id: number;
  client_id: number;
  type: 'phone' | 'telegram' | 'max' | 'whatsapp' | 'email' | 'other';
  value: string;
  label: string | null;
  is_primary: number;
  created_at: string;
}

export interface HistoryEntry {
  id: number;
  client_id: number;
  action: string;
  description: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface Reminder {
  id: number;
  client_id: number;
  client_name?: string;
  client_phone?: string | null;
  contract_number?: string | null;
  car?: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  is_completed: number;
  completed_at: string | null;
  auto_created: number;
  created_at: string;
}

export interface DashboardStats {
  activeClients: number;
  needsAttention: number;
  todayTasks: number;
  carsInTransit: number;
  newClientsThisWeek: number;
  pendingConsent: number;
  trashCount: number;
  overdueReminders: number;
  pendingPayment: number;
  overduePayment: number;
  atCustoms: number;
  inOffice: number;
}

export interface CarBrand {
  id: number;
  name: string;
  sort_order: number;
}

export interface CustomField {
  id: number;
  entity_type: 'client' | 'order';
  name: string;
  label: string;
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'url';
  options: string | null;
  sort_order: number;
  is_active: number;
  created_at: string;
}

export interface CustomFieldValue {
  id: number;
  field_id: number;
  entity_id: number;
  value: string | null;
  updated_at: string;
}

export type DocumentStatus = 'not_required' | 'not_requested' | 'requested' | 'sent' | 'received' | 'verified';

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  not_required:  'Не требуется',
  not_requested: 'Не запрошен',
  requested:     'Запрошен',
  sent:          'Отправлен клиенту',
  received:      'Получен',
  verified:      'Проверен',
};

export interface DocumentType {
  id: number;
  code: string;
  name: string;
  folder_name: string;
  sort_order: number;
  is_system: number;
  is_active: number;
  created_at: string;
}

export interface DocumentFile {
  id: number;
  document_id: number;
  file_path: string;
  file_name: string;
  original_name: string;
  size: number | null;
  created_at: string;
}

export interface ClientDocument {
  document_type_id: number;
  code: string;
  name: string;
  folder_name: string;
  sort_order: number;
  is_system: number;
  document_id: number | null;
  status: DocumentStatus;
  requested_date: string | null;
  received_date: string | null;
  comment: string | null;
  order_id: number | null;
  files: DocumentFile[];
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_paid:  'Не оплачено',
  pending:   'Ожидается оплата',
  paid:      'Оплачено',
  partial:   'Частично оплачено',
  cancelled: 'Отменено',
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface ElectronAPI {
  clients: {
    getAll:  (filters?: { statusId?: number; archived?: boolean; overdue?: boolean; trash?: boolean; statusCategory?: string }) => Promise<Client[]>;
    getById: (id: number) => Promise<Client | undefined>;
    create:  (data: Omit<Client, 'id'|'created_at'|'updated_at'|'status_name'|'status_color'|'contract_number'|'car'|'consent_status'>) => Promise<number>;
    update:  (id: number, data: Partial<Client>) => Promise<boolean>;
    archive:       (id: number) => Promise<boolean>;
    trash:         (id: number) => Promise<boolean>;
    restore:       (id: number) => Promise<boolean>;
    deleteForever: (id: number) => Promise<boolean>;
    suggest:       (query: string) => Promise<Client[]>;
    delete:  (id: number) => Promise<boolean>;
    search:  (query: string) => Promise<Client[]>;
  };
  orders: {
    getAll:        () => Promise<(Order & { client_name?: string })[]>;
    getByClientId: (clientId: number) => Promise<Order[]>;
    getById:       (id: number) => Promise<Order | undefined>;
    create:        (data: Omit<Order, 'id'|'created_at'|'updated_at'|'order_status_name'|'order_status_color'>) => Promise<number>;
    update:        (id: number, data: Partial<Order>) => Promise<boolean>;
    delete:        (id: number) => Promise<boolean>;
  };
  contacts: {
    getByClientId: (clientId: number) => Promise<Contact[]>;
    create:        (data: Omit<Contact, 'id'|'created_at'>) => Promise<number>;
    delete:        (id: number) => Promise<boolean>;
    setPrimary:    (clientId: number, contactId: number) => Promise<boolean>;
  };
  consent: {
    getByClientId: (clientId: number) => Promise<Consent | undefined>;
    update:        (clientId: number, data: Partial<Consent>) => Promise<boolean>;
  };
  history: {
    getByClientId: (clientId: number) => Promise<HistoryEntry[]>;
  };
  statuses: {
    getAll: () => Promise<Status[]>;
  };
  orderStatuses: {
    getAll: () => Promise<OrderStatus[]>;
  };
  dashboard: {
    getStats: () => Promise<DashboardStats>;
  };
  carBrands: {
    getAll: () => Promise<CarBrand[]>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<boolean>;
  };
  files: {
    openClientFolder: (clientId: number, clientName: string) => Promise<string>;
    openFile:         (filePath: string) => Promise<true | { error: string }>;
    pickFiles:        (opts?: { multi?: boolean }) => Promise<string[]>;
    pickFolder:       () => Promise<string | null>;
    getBasePath:      () => Promise<string>;
    setBasePath:      (newPath: string) => Promise<boolean>;
  };
  documentTypes: {
    getAll: () => Promise<DocumentType[]>;
    create: (data: { name: string; folder_name?: string }) => Promise<number | { error: string }>;
    delete: (id: number) => Promise<true | { error: string }>;
  };
  documents: {
    getByClientId: (clientId: number) => Promise<ClientDocument[]>;
    updateStatus:  (clientId: number, documentTypeId: number, status: DocumentStatus) => Promise<boolean>;
    updateComment: (clientId: number, documentTypeId: number, comment: string) => Promise<boolean>;
    addFiles:      (clientId: number, documentTypeId: number, filePaths: string[], orderId?: number | null) =>
      Promise<{ document_id: number; files: DocumentFile[] } | { error: string }>;
    addFilesBulk:  (clientId: number, entries: { documentTypeId: number; filePaths: string[] }[]) =>
      Promise<{ document_type_id: number; document_id: number; files: DocumentFile[] }[]>;
    deleteFile:    (fileId: number) => Promise<true | { error: string }>;
    generate:      () => Promise<{ error: string }>;
  };
  reminders: {
    getAll:   (filters?: { clientId?: number; overdue?: boolean; today?: boolean; upcoming?: boolean }) => Promise<Reminder[]>;
    getById:  (id: number) => Promise<Reminder | undefined>;
    create:   (data: { client_id: number; title: string; description?: string; due_date?: string; due_time?: string; auto_created?: number }) => Promise<number>;
    update:   (id: number, data: Partial<Reminder>) => Promise<boolean>;
    delete:   (id: number) => Promise<boolean>;
    getStats: () => Promise<{ overdue: number; today: number; total: number }>;
  };
  customFields: {
    getAll:    (entityType: string) => Promise<CustomField[]>;
    getValues: (fieldIds: number[], entityId: number) => Promise<CustomFieldValue[]>;
    setValue:  (fieldId: number, entityId: number, value: string) => Promise<boolean>;
  };
  contracts: {
    getNextNumber:    () => Promise<string>;
    getPassportData:  (clientId: number) => Promise<ClientPassportData | null>;
    savePassportData: (clientId: number, data: Partial<ClientPassportData>) => Promise<boolean>;
    generate:         (data: ContractGenerateData) => Promise<{ success: true; filePath: string; fileName: string } | { error: string }>;
    openFile:         (filePath: string) => Promise<true | { error: string }>;
  };
}
