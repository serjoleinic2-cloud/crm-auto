export interface User {
  id: number;
  pin_hash: string;
  created_at: string;
}

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
  created_at: string;
  updated_at: string;
  // joined fields
  status_name?: string;
  status_color?: string;
  contract_number?: string | null;
  car?: string | null;
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

// Extend window with electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface ElectronAPI {
  auth: {
    isFirstRun: () => Promise<boolean>;
    setPin:     (pin: string) => Promise<boolean>;
    verifyPin:  (pin: string) => Promise<boolean>;
  };
  clients: {
    getAll:  (filters?: { statusId?: number; archived?: boolean; overdue?: boolean }) => Promise<Client[]>;
    getById: (id: number) => Promise<Client | undefined>;
    create:  (data: Omit<Client, 'id'|'created_at'|'updated_at'|'is_archived'|'status_name'|'status_color'|'contract_number'|'car'>) => Promise<number>;
    update:  (id: number, data: Partial<Client>) => Promise<boolean>;
    archive: (id: number) => Promise<boolean>;
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
  customFields: {
    getAll:    (entityType: string) => Promise<CustomField[]>;
    getValues: (fieldIds: number[], entityId: number) => Promise<CustomFieldValue[]>;
    setValue:  (fieldId: number, entityId: number, value: string) => Promise<boolean>;
  };
}
