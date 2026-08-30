export interface Status {
  id: number;
  name: string;
  color: string;
  category: string;
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
  consent_status?: ConsentStatus;
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
  brand: string | null;
  model: string | null;
  year: number | null;
  configuration: string | null;
  description: string | null;
  price: number | null;
  comment: string | null;
  delivery_date_est: string | null;
  delivery_date_actual: string | null;
  payment_date: string | null;
  payment_status: string | null;
  created_at: string;
  updated_at: string;
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

export interface DashboardStats {
  activeClients: number;
  needsAttention: number;
  todayTasks: number;
  carsInTransit: number;
  newClientsThisWeek: number;
  pendingConsent: number;
  trashCount: number;
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
  document_id: number | null;
  status: DocumentStatus;
  requested_date: string | null;
  received_date: string | null;
  comment: string | null;
  order_id: number | null;
  files: DocumentFile[];
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface ElectronAPI {
  clients: {
    getAll:  (filters?: { statusId?: number; archived?: boolean; overdue?: boolean; trash?: boolean }) => Promise<Client[]>;
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
    getByClientId: (clientId: number) => Promise<Order[]>;
    create:        (data: Omit<Order, 'id'|'created_at'|'updated_at'>) => Promise<number>;
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
  customFields: {
    getAll:    (entityType: string) => Promise<CustomField[]>;
    getValues: (fieldIds: number[], entityId: number) => Promise<CustomFieldValue[]>;
    setValue:  (fieldId: number, entityId: number, value: string) => Promise<boolean>;
  };
}

// Extend Client with trash fields
// (added via migration, already reflected below in ElectronAPI)
