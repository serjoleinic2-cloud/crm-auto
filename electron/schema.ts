export const SCHEMA_VERSION = 2;

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
`;

export const DEFAULT_STATUSES = [
  { name: 'Новый клиент',     color: '#3b82f6', category: 'pipeline', sort_order: 1 },
  { name: 'В переговорах',    color: '#8b5cf6', category: 'pipeline', sort_order: 2 },
  { name: 'Договор подписан', color: '#f59e0b', category: 'pipeline', sort_order: 3 },
  { name: 'Автомобиль в пути',color: '#06b6d4', category: 'pipeline', sort_order: 4 },
  { name: 'Готов к выдаче',   color: '#10b981', category: 'pipeline', sort_order: 5 },
  { name: 'Завершён',         color: '#6b7280', category: 'done',     sort_order: 6 },
  { name: 'Отказ',            color: '#ef4444', category: 'lost',     sort_order: 7 },
];
