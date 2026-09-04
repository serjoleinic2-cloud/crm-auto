import Database from 'better-sqlite3';
import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { CREATE_TABLES_SQL, DEFAULT_STATUSES, DEFAULT_DOCUMENT_TYPES, DEFAULT_ORDER_STATUSES } from '../schema';

let db: Database.Database;

export function getDb(): Database.Database { return db; }

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value);
}

function safeAlter(table: string, col: string, def: string) {
  const cols = (db.pragma(`table_info(${table})`) as { name: string }[]).map(c => c.name);
  if (!cols.includes(col)) {
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
      console.log(`[migrate] Added ${table}.${col}`);
    } catch (e) {
      console.error(`[migrate] Failed to add ${table}.${col}:`, e);
    }
  }
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'crm-auto.db');
  console.log('[DB] Opening database at:', dbPath);
  db = new Database(dbPath);
  console.log('[DB] Setting pragmas...');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log('[DB] Running CREATE_TABLES_SQL...');
  db.exec(CREATE_TABLES_SQL);
  console.log('[DB] Tables created.');

  // ── Migrations (safe, idempotent) ─────────────────────────────────────────

  safeAlter('clients', 'is_deleted',  'INTEGER NOT NULL DEFAULT 0');
  safeAlter('clients', 'deleted_at',  'TEXT');

  // Orders new fields (no REFERENCES in ALTER TABLE)
  safeAlter('orders', 'order_status_id',    'INTEGER');
  safeAlter('orders', 'broker_name',          'TEXT');
  safeAlter('orders', 'broker_phone',         'TEXT');
  safeAlter('orders', 'broker_comment',       'TEXT');
  safeAlter('orders', 'broker_date',          'TEXT');
  safeAlter('orders', 'inspection_done',      'INTEGER NOT NULL DEFAULT 0');
  safeAlter('orders', 'inspection_comment',   'TEXT');
  safeAlter('orders', 'issue_date',           'TEXT');

  // Delivery term fields
  safeAlter('orders', 'delivery_term',       'INTEGER');
  safeAlter('orders', 'delivery_term_unit',  'TEXT DEFAULT \'days\'');

  // Reminder time field
  safeAlter('reminders', 'due_time', 'TEXT');

  // Make reminders.client_id nullable (for personal tasks without client)
  console.log('[DB] Checking reminders.client_id nullability...');
  const reminderInfo = db.prepare("PRAGMA table_info(reminders)").all() as {name: string; notnull: number}[];
  const clientIdCol = reminderInfo.find(c => c.name === 'client_id');
  if (clientIdCol && clientIdCol.notnull === 1) {
    console.log('[DB] Migrating reminders table (making client_id nullable)...');
    db.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE reminders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT,
        due_time TEXT,
        is_completed INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        auto_created INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO reminders_new SELECT id,client_id,title,description,due_date,due_time,is_completed,completed_at,auto_created,created_at FROM reminders;
      DROP TABLE reminders;
      ALTER TABLE reminders_new RENAME TO reminders;
      PRAGMA foreign_keys=ON;
    `);
    console.log('[DB] reminders migration done.');
  } else {
    console.log('[DB] reminders.client_id already nullable, skipping migration.');
  }

  // Payment deadline and signed contract date
  safeAlter('orders', 'payment_deadline', 'TEXT');
  safeAlter('orders', 'signed_contract_date', 'TEXT');

  // Migrate order statuses
  const existingOrderStatuses = (db.prepare('SELECT name FROM order_statuses').all() as {name:string}[]).map(s => s.name);
  const newOrderStatuses = [
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
  for (const s of newOrderStatuses) {
    if (!existingOrderStatuses.includes(s.name)) {
      db.prepare('INSERT INTO order_statuses (name,color,sort_order,is_active) VALUES (?,?,?,1)').run(s.name, s.color, s.sort_order);
    }
  }
  // Hide obsolete "Ожидает доверенность" and "Готов к выдаче" order status
  db.prepare("UPDATE order_statuses SET is_active=0 WHERE name IN ('Ожидает доверенность','Готов к выдаче') AND is_active=1").run();

  // Migrate statuses to match real process (v5)
  // Rename old statuses
  db.prepare("UPDATE statuses SET name='Договор подписан' WHERE name='Договор отправлен' AND is_active=1").run();
  db.prepare("UPDATE statuses SET name='На площадке' WHERE name='Готов к выдаче' AND is_active=1").run();

  // Remove broker_poa and customs-related document types
  // First delete documents with broker_poa type (via document_type_id)
  db.prepare(`DELETE FROM documents WHERE document_type_id IN (SELECT id FROM document_types WHERE code='broker_poa')`).run();
  db.prepare("DELETE FROM document_types WHERE code='broker_poa'").run();
  db.prepare("DELETE FROM document_types WHERE name LIKE '%таможн%' OR name LIKE '%ТАМОЖН%' OR folder_name LIKE '%таможн%' OR folder_name LIKE '%ТАМОЖН%'").run();

  const existingStatuses = (db.prepare('SELECT name FROM statuses').all() as {name:string}[]).map(s => s.name);
  const newStatuses = [
    { name: 'Думает',             color: '#94a3b8', category: 'lead',     sort_order: 0 },
    { name: 'Документы получены', color: '#3b82f6', category: 'pipeline', sort_order: 1 },
    { name: 'Договор подписан',   color: '#8b5cf6', category: 'pipeline', sort_order: 2 },
    { name: 'Ожидает оплату',     color: '#f59e0b', category: 'pipeline', sort_order: 3 },
    { name: 'Оплачен',            color: '#3b82f6', category: 'pipeline', sort_order: 4 },
    { name: 'На таможне',         color: '#d946ef', category: 'pipeline', sort_order: 5 },
    { name: 'Едет по РФ',         color: '#14b8a6', category: 'pipeline', sort_order: 6 },
    { name: 'На площадке',        color: '#22c55e', category: 'pipeline', sort_order: 7 },
    { name: 'Допы',               color: '#f97316', category: 'pipeline', sort_order: 8 },
    { name: 'Выдан',              color: '#10b981', category: 'done',     sort_order: 9 },
    { name: 'Завершён',           color: '#6b7280', category: 'done',     sort_order: 10 },
    { name: 'Отказ',              color: '#ef4444', category: 'lost',     sort_order: 11 },
  ];
  for (const s of newStatuses) {
    if (!existingStatuses.includes(s.name)) {
      db.prepare('INSERT INTO statuses (name,color,category,sort_order,is_active) VALUES (?,?,?,?,1)')
        .run(s.name, s.color, s.category, s.sort_order);
    }
  }

  // Contract & car detail fields
  safeAlter('orders', 'contract_date',    'TEXT');
  safeAlter('orders', 'deal_amount',      'TEXT');
  safeAlter('orders', 'body_type',        'TEXT');
  safeAlter('orders', 'engine',           'TEXT');
  safeAlter('orders', 'engine_type',      'TEXT');
  safeAlter('orders', 'drive',            'TEXT');
  safeAlter('orders', 'transmission',     'TEXT');
  safeAlter('orders', 'color',            'TEXT');
  safeAlter('orders', 'mileage',          'TEXT');
  safeAlter('orders', 'car_other',        'TEXT');

  // Client passport data (separate table, safe to create)
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_passport_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
      birth_date TEXT,
      inn TEXT,
      passport_number TEXT,
      passport_issued_by TEXT,
      passport_issue_date TEXT,
      passport_code TEXT,
      registration_address TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_passport_client ON client_passport_data(client_id);
  `);

  // Create missing index for order_status_id
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status_id)').run(); } catch (e) { /* ignore */ }

  // Create extras table
  db.exec(`
    CREATE TABLE IF NOT EXISTS extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_extras_order ON extras(order_id);
  `);

  // ── Seed data ──────────────────────────────────────────────────────────────

  const statusCount = (db.prepare('SELECT COUNT(*) as c FROM statuses').get() as { c: number }).c;
  if (statusCount === 0) {
    const ins = db.prepare('INSERT INTO statuses (name,color,category,sort_order) VALUES (?,?,?,?)');
    for (const s of DEFAULT_STATUSES) ins.run(s.name, s.color, s.category, s.sort_order);
  }

  const orderStatusCount = (db.prepare('SELECT COUNT(*) as c FROM order_statuses').get() as { c: number }).c;
  if (orderStatusCount === 0) {
    const ins = db.prepare('INSERT INTO order_statuses (name,color,sort_order) VALUES (?,?,?)');
    for (const s of DEFAULT_ORDER_STATUSES) ins.run(s.name, s.color, s.sort_order);
  }

  // Всегда синхронизируем марки с car_brands.txt (заменяем старый список)
  const brandsFile = path.join(app.getAppPath(), 'car_brands.txt');
  if (fs.existsSync(brandsFile)) {
    const lines = fs.readFileSync(brandsFile, 'utf-8')
      .split('\n').map(l => l.trim()).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'ru'));
    db.prepare('DELETE FROM car_brands').run();
    const ins = db.prepare('INSERT INTO car_brands (name,sort_order) VALUES (?,?)');
    lines.forEach((name, i) => ins.run(name, i));
    console.log('[DB] car_brands synced:', lines.length, 'марок');
  }

  const docTypeCount = (db.prepare('SELECT COUNT(*) as c FROM document_types').get() as { c: number }).c;
  if (docTypeCount === 0) {
    const ins = db.prepare(
      'INSERT INTO document_types (code,name,folder_name,sort_order,is_system) VALUES (@code,@name,@folder_name,@sort_order,@is_system)'
    );
    for (const t of DEFAULT_DOCUMENT_TYPES) ins.run({ ...t, is_system: t.is_system });
  }

  if (getSetting('base_data_path') === null) {
    setSetting('base_data_path', path.join(app.getPath('documents'), 'CRM-Auto Data'));
  }

  console.log('[DB] initDatabase() completed successfully.');
}

export function registerDatabaseHandlers(): void {
  console.log('[DB] Registering IPC handlers...');

  // ── STATUSES ──────────────────────────────────────────────────────────────

  ipcMain.handle('statuses:getAll', () =>
    db.prepare('SELECT * FROM statuses WHERE is_active=1 ORDER BY sort_order').all()
  );

  // ── CLIENTS ───────────────────────────────────────────────────────────────

  ipcMain.handle('clients:getAll', (_e, filters: {
    statusId?: number; archived?: boolean; overdue?: boolean; trash?: boolean; statusCategory?: string; paymentOverdue?: boolean; excludeStatusNames?: string[]
  } = {}) => {
    let sql = `
      SELECT c.*,
             s.name  AS status_name,
             s.color AS status_color,
             (SELECT o.contract_number FROM orders o WHERE o.client_id=c.id ORDER BY o.id LIMIT 1) AS contract_number,
             (SELECT trim(IFNULL(o.brand,'')||' '||IFNULL(o.model,'')) FROM orders o WHERE o.client_id=c.id ORDER BY o.id LIMIT 1) AS car,
             (SELECT o.payment_status FROM orders o WHERE o.client_id=c.id ORDER BY o.id DESC LIMIT 1) AS payment_status,
             (SELECT o.payment_date FROM orders o WHERE o.client_id=c.id ORDER BY o.id DESC LIMIT 1) AS payment_date,
             (SELECT o.delivery_date_est FROM orders o WHERE o.client_id=c.id ORDER BY o.id DESC LIMIT 1) AS delivery_date_est,
             (SELECT o.payment_deadline FROM orders o WHERE o.client_id=c.id AND o.payment_deadline IS NOT NULL AND o.payment_status != 'paid' ORDER BY o.id DESC LIMIT 1) AS payment_deadline,
             (SELECT o.price FROM orders o WHERE o.client_id=c.id ORDER BY o.id DESC LIMIT 1) AS price,
             (SELECT COUNT(*) FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0) AS reminders_count,
             (SELECT COUNT(*) FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 AND (r.due_date < date('now') OR (r.due_date = date('now') AND r.due_time IS NOT NULL AND r.due_time < strftime('%H:%M','now','localtime')))) AS reminders_overdue,
             (SELECT r.title FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 ORDER BY r.due_date ASC, r.id ASC LIMIT 1) AS next_action,
             (SELECT r.due_date FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 ORDER BY r.due_date ASC, r.id ASC LIMIT 1) AS next_action_date,
             (SELECT r.due_time FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 ORDER BY r.due_date ASC, r.id ASC LIMIT 1) AS next_action_time,
             (SELECT r.id FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 ORDER BY r.due_date ASC, r.id ASC LIMIT 1) AS next_reminder_id,
             IFNULL(cn.status,'not_requested') AS consent_status
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      LEFT JOIN consent cn ON cn.client_id=c.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.trash) {
      sql += ' AND c.is_deleted=1';
    } else {
      sql += ' AND c.is_deleted=0';
      if (filters.archived !== undefined) { sql += ' AND c.is_archived=?'; params.push(filters.archived ? 1 : 0); }
      if (filters.statusId !== undefined) { sql += ' AND c.status_id=?'; params.push(filters.statusId); }
      if (filters.statusCategory !== undefined) { sql += ' AND s.category=?'; params.push(filters.statusCategory); }
      if (filters.excludeStatusNames?.length) {
        sql += ` AND (s.name IS NULL OR s.name NOT IN (${filters.excludeStatusNames.map(() => '?').join(',')}))`;
        params.push(...filters.excludeStatusNames);
      }
      if (filters.overdue) {
        sql += ` AND c.is_archived=0 AND EXISTS (
          SELECT 1 FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0
          AND (r.due_date < date('now') OR (r.due_date = date('now') AND r.due_time IS NOT NULL AND r.due_time < strftime('%H:%M','now','localtime')))
        )`;
      }
      if (filters.paymentOverdue) {
        sql += ` AND c.is_archived=0 AND c.is_deleted=0 AND EXISTS (
          SELECT 1 FROM orders o WHERE o.client_id=c.id
          AND o.payment_deadline < date('now')
          AND o.payment_status != 'paid'
          AND o.payment_deadline IS NOT NULL
        )`;
      }
    }
    sql += ' ORDER BY c.updated_at DESC';
    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('clients:getById', (_e, id: number) =>
    db.prepare(`
      SELECT c.*, s.name AS status_name, s.color AS status_color,
             IFNULL(cn.status,'not_requested') AS consent_status,
             (SELECT r.title FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 ORDER BY r.due_date ASC, r.id ASC LIMIT 1) AS next_action,
             (SELECT r.due_date FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 ORDER BY r.due_date ASC, r.id ASC LIMIT 1) AS next_action_date,
             (SELECT r.due_time FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 ORDER BY r.due_date ASC, r.id ASC LIMIT 1) AS next_action_time,
             (SELECT r.id FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 ORDER BY r.due_date ASC, r.id ASC LIMIT 1) AS next_reminder_id,
             (SELECT COUNT(*) FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0) AS reminders_count,
             (SELECT COUNT(*) FROM reminders r WHERE r.client_id=c.id AND r.is_completed=0 AND (r.due_date < date('now') OR (r.due_date = date('now') AND r.due_time IS NOT NULL AND r.due_time < strftime('%H:%M','now','localtime')))) AS reminders_overdue
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      LEFT JOIN consent cn ON cn.client_id=c.id
      WHERE c.id=?
    `).get(id)
  );

  ipcMain.handle('clients:create', (_e, data: Record<string, unknown>) => {
    const result = db.prepare(`
      INSERT INTO clients (full_name,phone,email,source,comment,status_id,next_action,next_action_date,is_archived,is_deleted)
      VALUES (@full_name,@phone,@email,@source,@comment,@status_id,@next_action,@next_action_date,0,0)
    `).run({
      full_name: data.full_name ?? '',
      phone: data.phone ?? null, email: data.email ?? null,
      source: data.source ?? null, comment: data.comment ?? null,
      status_id: data.status_id ?? 1,
      next_action: data.next_action ?? null, next_action_date: data.next_action_date ?? null,
    });
    const clientId = result.lastInsertRowid as number;
    db.prepare("INSERT OR IGNORE INTO consent (client_id, status) VALUES (?, 'not_requested')").run(clientId);
    _writeHistory(clientId, 'create', 'Клиент создан');
    return clientId;
  });

  ipcMain.handle('clients:update', (_e, id: number, data: Record<string, unknown>) => {
    const old = db.prepare('SELECT * FROM clients WHERE id=?').get(id) as Record<string, unknown> | undefined;
    const skip = ['id','created_at','updated_at','status_name','status_color','contract_number','car','consent_status','is_deleted','deleted_at'];
    const fields = Object.keys(data).filter(k => !skip.includes(k));
    if (!fields.length) return false;
    const set = fields.map(f => `${f}=@${f}`).join(', ');
    db.prepare(`UPDATE clients SET ${set}, updated_at=datetime('now') WHERE id=@__id`).run({ ...data, __id: id });
    for (const f of fields) {
      if (old && String(old[f]) !== String(data[f])) {
        _writeHistory(id, 'update', `Изменено «${f}»`, String(old[f] ?? ''), String(data[f] ?? ''));
      }
    }
    return true;
  });

  ipcMain.handle('clients:archive', (_e, id: number) => {
    db.prepare("UPDATE clients SET is_archived=1, updated_at=datetime('now') WHERE id=?").run(id);
    _writeHistory(id, 'archive', 'Клиент перемещён в архив');
    return true;
  });

  ipcMain.handle('clients:trash', (_e, id: number) => {
    db.prepare("UPDATE clients SET is_deleted=1, deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id);
    _writeHistory(id, 'trash', 'Клиент перемещён в корзину');
    return true;
  });

  ipcMain.handle('clients:restore', (_e, id: number) => {
    db.prepare("UPDATE clients SET is_deleted=0, deleted_at=NULL, updated_at=datetime('now') WHERE id=?").run(id);
    _writeHistory(id, 'restore', 'Клиент восстановлен из корзины');
    return true;
  });

  ipcMain.handle('clients:deleteForever', (_e, id: number) => {
    db.prepare('DELETE FROM clients WHERE id=? AND is_deleted=1').run(id);
    return true;
  });

  ipcMain.handle('clients:search', (_e, q: string) => {
    const like = `%${q}%`;
    return db.prepare(`
      SELECT DISTINCT c.*, s.name AS status_name, s.color AS status_color,
             IFNULL(cn.status,'not_requested') AS consent_status,
             (SELECT o.price FROM orders o WHERE o.client_id=c.id ORDER BY o.id DESC LIMIT 1) AS price
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      LEFT JOIN orders o ON o.client_id=c.id
      LEFT JOIN contacts ct ON ct.client_id=c.id
      LEFT JOIN consent cn ON cn.client_id=c.id
      WHERE c.is_deleted=0
        AND (c.full_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?
             OR o.contract_number LIKE ? OR o.brand LIKE ? OR o.model LIKE ?
             OR ct.value LIKE ?)
      ORDER BY c.updated_at DESC LIMIT 50
    `).all(like, like, like, like, like, like, like);
  });

  ipcMain.handle('clients:suggest', (_e, q: string) => {
    if (!q || q.trim().length < 1) return [];
    const like = `%${q}%`;
    return db.prepare(`
      SELECT DISTINCT c.id, c.full_name, c.phone,
             s.name AS status_name, s.color AS status_color,
             trim(IFNULL(o.brand,'')||' '||IFNULL(o.model,'')) AS car,
             o.contract_number,
             (SELECT o2.price FROM orders o2 WHERE o2.client_id=c.id ORDER BY o2.id DESC LIMIT 1) AS price
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      LEFT JOIN orders o ON o.client_id=c.id
      LEFT JOIN contacts ct ON ct.client_id=c.id
      WHERE c.is_deleted=0
        AND (c.full_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?
             OR o.contract_number LIKE ? OR o.brand LIKE ? OR o.model LIKE ?
             OR ct.value LIKE ?)
      ORDER BY c.updated_at DESC LIMIT 8
    `).all(like, like, like, like, like, like, like);
  });

  // ── ORDERS ────────────────────────────────────────────────────────────────

  ipcMain.handle('orders:getAll', () => {
    return db.prepare(`
      SELECT o.*, c.full_name as client_name,
             os.name as order_status_name, os.color as order_status_color
      FROM orders o
      JOIN clients c ON c.id=o.client_id
      LEFT JOIN order_statuses os ON os.id=o.order_status_id
      WHERE c.is_deleted=0 AND c.is_archived=0
      ORDER BY o.id DESC
    `).all();
  });

  ipcMain.handle('orders:getByClientId', (_e, clientId: number) =>
    db.prepare(`
      SELECT o.*, os.name as order_status_name, os.color as order_status_color
      FROM orders o
      LEFT JOIN order_statuses os ON os.id=o.order_status_id
      WHERE o.client_id=?
      ORDER BY o.id
    `).all(clientId)
  );

  ipcMain.handle('orders:getById', (_e, id: number) =>
    db.prepare(`
      SELECT o.*, os.name as order_status_name, os.color as order_status_color
      FROM orders o
      LEFT JOIN order_statuses os ON os.id=o.order_status_id
      WHERE o.id=?
    `).get(id)
  );

  ipcMain.handle('orders:create', (_e, data: Record<string, unknown>) => {
    const result = db.prepare(`
      INSERT INTO orders (client_id,contract_number,brand,model,year,configuration,description,price,comment,delivery_date_est,delivery_date_actual,payment_date,payment_status,order_status_id,broker_name,broker_phone,broker_comment,broker_date,inspection_done,inspection_comment,issue_date,delivery_term,delivery_term_unit,payment_deadline,signed_contract_date)
      VALUES (@client_id,@contract_number,@brand,@model,@year,@configuration,@description,@price,@comment,@delivery_date_est,@delivery_date_actual,@payment_date,@payment_status,@order_status_id,@broker_name,@broker_phone,@broker_comment,@broker_date,@inspection_done,@inspection_comment,@issue_date,@delivery_term,@delivery_term_unit,@payment_deadline,@signed_contract_date)
    `).run({
      client_id: data.client_id, contract_number: data.contract_number ?? null,
      brand: data.brand ?? null, model: data.model ?? null, year: data.year ?? null,
      configuration: data.configuration ?? null, description: data.description ?? null,
      price: data.price ?? null, comment: data.comment ?? null,
      delivery_date_est: data.delivery_date_est ?? null, delivery_date_actual: data.delivery_date_actual ?? null,
      payment_date: data.payment_date ?? null, payment_status: data.payment_status ?? null,
      order_status_id: data.order_status_id ?? null,
      broker_name: data.broker_name ?? null, broker_phone: data.broker_phone ?? null,
      broker_comment: data.broker_comment ?? null, broker_date: data.broker_date ?? null,
      inspection_done: data.inspection_done ?? 0, inspection_comment: data.inspection_comment ?? null,
      issue_date: data.issue_date ?? null,
      delivery_term: data.delivery_term ?? null,
      delivery_term_unit: data.delivery_term_unit ?? null,
      payment_deadline: data.payment_deadline ?? null,
      signed_contract_date: data.signed_contract_date ?? null,
    });
    const orderId = result.lastInsertRowid as number;
    _writeHistory(data.client_id as number, 'order_create',
      `Создан заказ: ${[data.brand, data.model].filter(Boolean).join(' ')}`);
    return orderId;
  });

  ipcMain.handle('orders:update', (_e, id: number, data: Record<string, unknown>) => {
    const old = db.prepare('SELECT * FROM orders WHERE id=?').get(id) as Record<string, unknown> | undefined;
    const skip = ['id','created_at','updated_at','client_id','order_status_name','order_status_color'];
    const fields = Object.keys(data).filter(k => !skip.includes(k));
    if (!fields.length) return false;
    const set = fields.map(f => `${f}=@${f}`).join(', ');
    db.prepare(`UPDATE orders SET ${set}, updated_at=datetime('now') WHERE id=@__id`).run({ ...data, __id: id });

    if (old) {
      const clientId = old.client_id as number;
      if ('contract_number' in data && old.contract_number !== data.contract_number) {
        _writeHistory(clientId, 'contract_change',
          'Номер договора изменён', String(old.contract_number ?? ''), String(data.contract_number ?? ''));
      }
      if ('price' in data && old.price !== data.price) {
        _writeHistory(clientId, 'price_change',
          'Цена изменена', String(old.price ?? ''), String(data.price ?? ''));
      }
      if ('payment_status' in data && old.payment_status !== data.payment_status) {
        const labels: Record<string, string> = { not_paid: 'Не оплачено', pending: 'Ожидается оплата', paid: 'Оплачено', partial: 'Частично оплачено', cancelled: 'Отменено' };
        _writeHistory(clientId, 'payment_status',
          `Статус оплаты: ${labels[old.payment_status as string] ?? old.payment_status} → ${labels[data.payment_status as string] ?? data.payment_status}`);
      }
      if ('order_status_id' in data && old.order_status_id !== data.order_status_id) {
        const oldStatus = db.prepare('SELECT name FROM order_statuses WHERE id=?').get(old.order_status_id as number) as { name: string } | undefined;
        const newStatus = db.prepare('SELECT name FROM order_statuses WHERE id=?').get(data.order_status_id as number) as { name: string } | undefined;
        _writeHistory(clientId, 'order_status',
          `Статус заказа: ${oldStatus?.name ?? '—'} → ${newStatus?.name ?? '—'}`);

        if (newStatus?.name === 'На таможне') {
          db.prepare(`INSERT INTO reminders (client_id, title, description, due_date, auto_created) VALUES (?, ?, ?, date('now'), 1)`)
            .run(clientId, 'Позвонить клиенту — авто на таможне', `Связать клиента с брокером`);
        }
        if (newStatus?.name === 'Прибыл в офис') {
          db.prepare(`INSERT INTO reminders (client_id, title, description, due_date, auto_created) VALUES (?, ?, ?, date('now'), 1)`)
            .run(clientId, 'Позвонить клиенту', 'Сообщить о прибытии автомобиля в офис');
        }
      }
      if ('delivery_date_actual' in data && !old.delivery_date_actual && data.delivery_date_actual) {
        _writeHistory(clientId, 'arrival', 'Автомобиль прибыл в офис');
      }
      if ('issue_date' in data && !old.issue_date && data.issue_date) {
        _writeHistory(clientId, 'issue', 'Автомобиль выдан клиенту');
      }
    }
    return true;
  });

  ipcMain.handle('orders:delete', (_e, id: number) => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id) as Record<string, unknown> | undefined;
    db.prepare('DELETE FROM orders WHERE id=?').run(id);
    if (order) _writeHistory(order.client_id as number, 'order_delete',
      `Заказ удалён: ${[order.brand, order.model].filter(Boolean).join(' ')}`);
    return true;
  });

  // ── CONTACTS ──────────────────────────────────────────────────────────────

  ipcMain.handle('contacts:getByClientId', (_e, clientId: number) =>
    db.prepare('SELECT * FROM contacts WHERE client_id=? ORDER BY is_primary DESC, id').all(clientId)
  );

  ipcMain.handle('contacts:create', (_e, data: Record<string, unknown>) => {
    const result = db.prepare(
      'INSERT INTO contacts (client_id,type,value,label,is_primary) VALUES (@client_id,@type,@value,@label,@is_primary)'
    ).run({ client_id: data.client_id, type: data.type, value: data.value, label: data.label ?? null, is_primary: data.is_primary ?? 0 });
    _writeHistory(data.client_id as number, 'contact_add', `Добавлен контакт ${data.type}: ${data.value}`);
    return result.lastInsertRowid;
  });

  ipcMain.handle('contacts:delete', (_e, id: number) => {
    const c = db.prepare('SELECT * FROM contacts WHERE id=?').get(id) as Record<string, unknown> | undefined;
    db.prepare('DELETE FROM contacts WHERE id=?').run(id);
    if (c) _writeHistory(c.client_id as number, 'contact_delete', `Удалён контакт ${c.type}: ${c.value}`);
    return true;
  });

  ipcMain.handle('contacts:setPrimary', (_e, clientId: number, contactId: number) => {
    db.prepare('UPDATE contacts SET is_primary=0 WHERE client_id=?').run(clientId);
    db.prepare('UPDATE contacts SET is_primary=1 WHERE id=?').run(contactId);
    return true;
  });

  // ── CONSENT ───────────────────────────────────────────────────────────────

  ipcMain.handle('consent:getByClientId', (_e, clientId: number) =>
    db.prepare('SELECT * FROM consent WHERE client_id=?').get(clientId)
  );

  ipcMain.handle('consent:update', (_e, clientId: number, data: Record<string, unknown>) => {
    const existing = db.prepare('SELECT * FROM consent WHERE client_id=?').get(clientId) as Record<string, unknown> | undefined;

    if (!existing) {
      db.prepare("INSERT INTO consent (client_id,status,received_date,scan_path,comment) VALUES (?,?,?,?,?)")
        .run(clientId, data.status ?? 'not_requested', data.received_date ?? null, data.scan_path ?? null, data.comment ?? null);
    } else {
      const fields: string[] = [];
      const vals: Record<string, unknown> = { __id: clientId };
      const allowed = ['status','received_date','scan_path','comment'];
      for (const f of allowed) {
        if (f in data) { fields.push(`${f}=@${f}`); vals[f] = data[f]; }
      }
      if (fields.length) {
        db.prepare(`UPDATE consent SET ${fields.join(',')}, updated_at=datetime('now') WHERE client_id=@__id`).run(vals);
      }
    }

    const statusLabels: Record<string, string> = {
      not_requested:'Не запрашивалось', sent:'Отправлено клиенту', received:'Получено', verified:'Проверено',
    };
    if ('status' in data) {
      _writeHistory(clientId, 'consent_update', `Согласие на ПД: ${statusLabels[data.status as string] ?? data.status}`);
    }
    return true;
  });

  // ── HISTORY ───────────────────────────────────────────────────────────────

  ipcMain.handle('history:getByClientId', (_e, clientId: number) =>
    db.prepare('SELECT * FROM history WHERE client_id=? ORDER BY id DESC LIMIT 100').all(clientId)
  );

  // ── DASHBOARD ─────────────────────────────────────────────────────────────

  ipcMain.handle('dashboard:getStats', () => {
    const now = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    return {
      activeClients:     (db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_archived=0 AND is_deleted=0").get() as { c: number }).c,
      needsAttention:    (db.prepare(`SELECT COUNT(*) as c FROM reminders WHERE is_completed=0 AND (due_date < ? OR (due_date = ? AND due_time IS NOT NULL AND due_time < strftime('%H:%M','now','localtime')))`).get(now, now) as { c: number }).c,
      todayTasks:        (db.prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0 AND due_date=?").get(now) as { c: number }).c,
      carsInTransit:     (db.prepare(`SELECT COUNT(*) as c FROM clients c JOIN statuses s ON s.id=c.status_id WHERE c.is_archived=0 AND c.is_deleted=0 AND s.name IN ('Едет по РФ','На таможне','Автомобиль в пути')`).get() as { c: number }).c,
      newClientsThisWeek:(db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_deleted=0 AND date(created_at)>=?").get(weekAgo) as { c: number }).c,
      pendingConsent:    (db.prepare("SELECT COUNT(*) as c FROM consent WHERE status='not_requested'").get() as { c: number }).c,
      trashCount:        (db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_deleted=1").get() as { c: number }).c,
      overdueReminders:  (db.prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0 AND due_date < ?").get(now) as { c: number }).c,
      pendingPayment:    (db.prepare("SELECT COUNT(*) as c FROM orders o JOIN clients c ON c.id=o.client_id WHERE c.is_deleted=0 AND o.payment_status='pending'").get() as { c: number }).c,
      overduePayment:    (db.prepare("SELECT COUNT(*) as c FROM orders o JOIN clients c ON c.id=o.client_id WHERE c.is_deleted=0 AND o.payment_deadline < ? AND o.payment_status != 'paid' AND o.payment_deadline IS NOT NULL").get(now) as { c: number }).c,
      atCustoms:         (db.prepare(`SELECT COUNT(*) as c FROM clients c JOIN statuses s ON s.id=c.status_id WHERE c.is_deleted=0 AND c.is_archived=0 AND s.name='На таможне'`).get() as { c: number }).c,
      inOffice:          (db.prepare(`SELECT COUNT(*) as c FROM clients c JOIN statuses s ON s.id=c.status_id WHERE c.is_deleted=0 AND c.is_archived=0 AND s.name='На площадке'`).get() as { c: number }).c,
      extrasCount:       (db.prepare("SELECT COUNT(*) as c FROM clients c JOIN statuses s ON s.id=c.status_id WHERE c.is_deleted=0 AND c.is_archived=0 AND s.name='Допы'").get() as { c: number }).c,
      leadClients:       (db.prepare("SELECT COUNT(*) as c FROM clients c JOIN statuses s ON s.id=c.status_id WHERE c.is_deleted=0 AND c.is_archived=0 AND s.category='lead'").get() as { c: number }).c,
    };
  });

  // ── CAR BRANDS ────────────────────────────────────────────────────────────

  ipcMain.handle('carBrands:getAll', () =>
    db.prepare('SELECT * FROM car_brands ORDER BY name').all()
  );

  // ── SETTINGS ──────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key));
  ipcMain.handle('settings:set', (_e, key: string, value: string) => { setSetting(key, value); return true; });

  // ── CUSTOM FIELDS ─────────────────────────────────────────────────────────

  ipcMain.handle('customFields:getAll', (_e, entityType: string) =>
    db.prepare('SELECT * FROM custom_fields WHERE entity_type=? AND is_active=1 ORDER BY sort_order').all(entityType)
  );

  ipcMain.handle('customFields:getValues', (_e, fieldIds: number[], entityId: number) => {
    if (!fieldIds.length) return [];
    const ph = fieldIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM custom_field_values WHERE field_id IN (${ph}) AND entity_id=?`).all(...fieldIds, entityId);
  });

  ipcMain.handle('customFields:setValue', (_e, fieldId: number, entityId: number, value: string) => {
    const existing = db.prepare('SELECT id FROM custom_field_values WHERE field_id=? AND entity_id=?').get(fieldId, entityId);
    if (existing) {
      db.prepare("UPDATE custom_field_values SET value=?, updated_at=datetime('now') WHERE field_id=? AND entity_id=?").run(value, fieldId, entityId);
    } else {
      db.prepare('INSERT INTO custom_field_values (field_id,entity_id,value) VALUES (?,?,?)').run(fieldId, entityId, value);
    }
    return true;
  });

  // ── EXTRAS ────────────────────────────────────────────────────────────────

  ipcMain.handle('extras:getByOrder', (_e, orderId: number) =>
    db.prepare('SELECT * FROM extras WHERE order_id=? ORDER BY id').all(orderId)
  );

  ipcMain.handle('extras:create', (_e, data: { order_id: number; name: string; price: number }) => {
    const r = db.prepare('INSERT INTO extras (order_id,name,price) VALUES (?,?,?)').run(data.order_id, data.name, data.price);
    return r.lastInsertRowid;
  });

  ipcMain.handle('extras:update', (_e, id: number, data: { name?: string; price?: number }) => {
    const fields = Object.keys(data).filter(k => ['name','price'].includes(k));
    if (!fields.length) return false;
    db.prepare(`UPDATE extras SET ${fields.map(f => `${f}=@${f}`).join(',')} WHERE id=@id`).run({ ...data, id });
    return true;
  });

  ipcMain.handle('extras:delete', (_e, id: number) => {
    db.prepare('DELETE FROM extras WHERE id=?').run(id);
    return true;
  });
}

export function writeHistory(clientId: number, action: string, description: string, oldValue?: string, newValue?: string) {
  _writeHistory(clientId, action, description, oldValue, newValue);
}

function _writeHistory(clientId: number, action: string, description: string, oldValue?: string, newValue?: string) {
  try {
    db.prepare('INSERT INTO history (client_id,action,description,old_value,new_value) VALUES (?,?,?,?,?)')
      .run(clientId, action, description, oldValue ?? null, newValue ?? null);
  } catch { /* ignore history errors */ }
}
