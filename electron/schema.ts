export const SCHEMA_VERSION = 5;

export const CREATE_TABLES_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  category TEXT NOT NULL DEFAULT 'pipeline',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS car_brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,
  comment TEXT,
  status_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL,
  next_action TEXT,
  next_action_date TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK(status IN ('not_requested','sent','received','verified')),
  received_date TEXT,
  scan_path TEXT,
  comment TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_number TEXT,
  brand TEXT,
  model TEXT,
  year INTEGER,
  configuration TEXT,
  description TEXT,
  price REAL,
  comment TEXT,
  delivery_date_est TEXT,
  delivery_date_actual TEXT,
  payment_date TEXT,
  payment_status TEXT,
  order_status_id INTEGER,
  broker_name TEXT,
  broker_phone TEXT,
  broker_comment TEXT,
  broker_date TEXT,
  inspection_done INTEGER NOT NULL DEFAULT 0,
  inspection_comment TEXT,
  issue_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('phone','telegram','max','whatsapp','email','other')),
  value TEXT NOT NULL,
  label TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('client','order')),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK(field_type IN ('text','textarea','number','date','select','checkbox','url')),
  options TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS document_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  document_type_id INTEGER NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK(status IN ('not_required','not_requested','requested','sent','received','verified')),
  requested_date TEXT,
  received_date TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(client_id, document_type_id)
);

CREATE TABLE IF NOT EXISTS document_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  auto_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_order ON documents(order_id);
CREATE INDEX IF NOT EXISTS idx_document_files_document ON document_files(document_id);

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status_id);
CREATE INDEX IF NOT EXISTS idx_clients_archived ON clients(is_archived);
CREATE INDEX IF NOT EXISTS idx_clients_deleted ON clients(is_deleted);
CREATE INDEX IF NOT EXISTS idx_clients_next_action_date ON clients(next_action_date);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_contract ON orders(contract_number);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_history_client ON history(client_id);
CREATE INDEX IF NOT EXISTS idx_consent_client ON consent(client_id);
CREATE INDEX IF NOT EXISTS idx_cfv_field_entity ON custom_field_values(field_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_reminders_client ON reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(is_completed);

CREATE TABLE IF NOT EXISTS extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_extras_order ON extras(order_id);

-- Migration v4 → v5: rename statuses
UPDATE statuses SET name='Договор подписан' WHERE name='Договор отправлен';
UPDATE statuses SET name='На площадке' WHERE name='Готов к выдаче';
`;

export const DEFAULT_DOCUMENT_TYPES = [
  { code: 'consent',        name: 'Согласие на обработку ПД',  folder_name: 'Согласие',           sort_order: 1, is_system: 1 },
  { code: 'passport',       name: 'Паспорт',                    folder_name: 'Паспорт',             sort_order: 2, is_system: 1 },
  { code: 'snils',          name: 'СНИЛС',                      folder_name: 'СНИЛС',               sort_order: 3, is_system: 1 },
  { code: 'inn',            name: 'ИНН',                        folder_name: 'ИНН',                 sort_order: 4, is_system: 1 },
  { code: 'contract',       name: 'Договор',                    folder_name: 'Договор',              sort_order: 5, is_system: 1 },
  { code: 'contract_signed',name: 'Подписанный договор',        folder_name: 'Договор',              sort_order: 6, is_system: 1 },
  { code: 'payment_proof',  name: 'Документ/чек об оплате',     folder_name: 'Оплата',               sort_order: 7, is_system: 1 },
  { code: 'other',          name: 'Другой документ',            folder_name: 'Прочее',               sort_order: 9, is_system: 1 },
];

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  not_required:  'Не требуется',
  not_requested: 'Не запрошен',
  requested:     'Запрошен',
  sent:          'Отправлен клиенту',
  received:      'Получен',
  verified:      'Проверен',
};

export const DEFAULT_ORDER_STATUSES = [
  { name: 'Новый заказ',           color: '#6b7280', sort_order: 1 },
  { name: 'Ожидает оплату',        color: '#f59e0b', sort_order: 2 },
  { name: 'Оплачен',               color: '#3b82f6', sort_order: 3 },
  { name: 'Автомобиль заказан',    color: '#8b5cf6', sort_order: 4 },
  { name: 'Автомобиль в пути',     color: '#06b6d4', sort_order: 5 },
  { name: 'На таможне',            color: '#d946ef', sort_order: 6 },
  { name: 'Таможенное оформление', color: '#ec4899', sort_order: 7 },
  { name: 'Едет по РФ',            color: '#14b8a6', sort_order: 8 },
  { name: 'Прибыл в офис',         color: '#22c55e', sort_order: 9 },
  { name: 'Выдан клиенту',         color: '#10b981', sort_order: 10 },
  { name: 'Отменён',               color: '#ef4444', sort_order: 11 },
];

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_paid:  'Не оплачено',
  pending:   'Ожидается оплата',
  paid:      'Оплачено',
  partial:   'Частично оплачено',
  cancelled: 'Отменено',
};

export const DEFAULT_STATUSES = [
  { name: 'Думает',              color: '#94a3b8', category: 'lead',     sort_order: 0 },
  { name: 'Документы получены',  color: '#3b82f6', category: 'pipeline', sort_order: 1 },
  { name: 'Договор подписан',    color: '#8b5cf6', category: 'pipeline', sort_order: 2 },
  { name: 'Ожидает оплату',      color: '#f59e0b', category: 'pipeline', sort_order: 3 },
  { name: 'Оплачен',             color: '#3b82f6', category: 'pipeline', sort_order: 4 },
  { name: 'На таможне',          color: '#d946ef', category: 'pipeline', sort_order: 5 },
  { name: 'Едет по РФ',          color: '#14b8a6', category: 'pipeline', sort_order: 6 },
  { name: 'На площадке',         color: '#22c55e', category: 'pipeline', sort_order: 7 },
  { name: 'Допы',                color: '#f97316', category: 'pipeline', sort_order: 8 },
  { name: 'Выдан',               color: '#10b981', category: 'done',     sort_order: 9 },
  { name: 'Завершён',            color: '#6b7280', category: 'done',     sort_order: 10 },
  { name: 'Отказ',               color: '#ef4444', category: 'lost',     sort_order: 11 },
];
