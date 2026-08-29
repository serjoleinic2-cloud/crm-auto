import Database from 'better-sqlite3';
import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { CREATE_TABLES_SQL, DEFAULT_STATUSES } from '../schema';

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'crm-auto.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(CREATE_TABLES_SQL);

  // Seed statuses if empty
  const statusCount = (db.prepare('SELECT COUNT(*) as c FROM statuses').get() as { c: number }).c;
  if (statusCount === 0) {
    const insertStatus = db.prepare(
      'INSERT INTO statuses (name, color, category, sort_order) VALUES (?, ?, ?, ?)'
    );
    for (const s of DEFAULT_STATUSES) {
      insertStatus.run(s.name, s.color, s.category, s.sort_order);
    }
  }

  // Seed car brands from car_brands.txt if table is empty
  const brandCount = (db.prepare('SELECT COUNT(*) as c FROM car_brands').get() as { c: number }).c;
  if (brandCount === 0) {
    const brandsFile = path.join(app.getAppPath(), 'car_brands.txt');
    if (fs.existsSync(brandsFile)) {
      const lines = fs.readFileSync(brandsFile, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
      const insertBrand = db.prepare('INSERT OR IGNORE INTO car_brands (name, sort_order) VALUES (?, ?)');
      lines.forEach((name, i) => insertBrand.run(name, i));
    }
  }

  registerHandlers();
}

function registerHandlers(): void {
  // ── AUTH ──────────────────────────────────────────────────────────────────

  ipcMain.handle('auth:isFirstRun', () => {
    const row = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
    return row.c === 0;
  });

  ipcMain.handle('auth:setPin', async (_e, pin: string) => {
    const hash = await bcrypt.hash(pin, 10);
    db.prepare('DELETE FROM users').run();
    db.prepare('INSERT INTO users (pin_hash) VALUES (?)').run(hash);
    return true;
  });

  ipcMain.handle('auth:verifyPin', async (_e, pin: string) => {
    const row = db.prepare('SELECT pin_hash FROM users LIMIT 1').get() as { pin_hash: string } | undefined;
    if (!row) return false;
    return bcrypt.compare(pin, row.pin_hash);
  });

  // ── STATUSES ──────────────────────────────────────────────────────────────

  ipcMain.handle('statuses:getAll', () => {
    return db.prepare('SELECT * FROM statuses WHERE is_active=1 ORDER BY sort_order').all();
  });

  // ── CLIENTS ───────────────────────────────────────────────────────────────

  ipcMain.handle('clients:getAll', (_e, filters: { statusId?: number; archived?: boolean; overdue?: boolean } = {}) => {
    let sql = `
      SELECT c.*,
             s.name  AS status_name,
             s.color AS status_color,
             (SELECT o.contract_number FROM orders o WHERE o.client_id=c.id ORDER BY o.id LIMIT 1) AS contract_number,
             (SELECT o.brand||' '||IFNULL(o.model,'') FROM orders o WHERE o.client_id=c.id ORDER BY o.id LIMIT 1) AS car
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.archived !== undefined) {
      sql += ' AND c.is_archived=?';
      params.push(filters.archived ? 1 : 0);
    }
    if (filters.statusId !== undefined) {
      sql += ' AND c.status_id=?';
      params.push(filters.statusId);
    }
    if (filters.overdue) {
      sql += " AND c.next_action_date IS NOT NULL AND c.next_action_date < date('now') AND c.is_archived=0";
    }
    sql += ' ORDER BY c.updated_at DESC';
    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('clients:getById', (_e, id: number) => {
    return db.prepare(`
      SELECT c.*,
             s.name  AS status_name,
             s.color AS status_color
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      WHERE c.id=?
    `).get(id);
  });

  ipcMain.handle('clients:create', (_e, data: Record<string, unknown>) => {
    const stmt = db.prepare(`
      INSERT INTO clients (full_name,phone,email,source,comment,status_id,next_action,next_action_date,is_archived)
      VALUES (@full_name,@phone,@email,@source,@comment,@status_id,@next_action,@next_action_date,0)
    `);
    const result = stmt.run({
      full_name: data.full_name ?? '',
      phone: data.phone ?? null,
      email: data.email ?? null,
      source: data.source ?? null,
      comment: data.comment ?? null,
      status_id: data.status_id ?? 1,
      next_action: data.next_action ?? null,
      next_action_date: data.next_action_date ?? null,
    });
    _writeHistory(result.lastInsertRowid as number, 'create', 'Клиент создан');
    return result.lastInsertRowid;
  });

  ipcMain.handle('clients:update', (_e, id: number, data: Record<string, unknown>) => {
    const old = db.prepare('SELECT * FROM clients WHERE id=?').get(id) as Record<string, unknown> | undefined;
    const fields = Object.keys(data).filter(k => !['id','created_at','updated_at','status_name','status_color','contract_number','car'].includes(k));
    if (!fields.length) return false;
    const set = fields.map(f => `${f}=@${f}`).join(', ');
    db.prepare(`UPDATE clients SET ${set}, updated_at=datetime('now') WHERE id=@__id`).run({ ...data, __id: id });

    // Log changes
    for (const f of fields) {
      if (old && String(old[f]) !== String(data[f])) {
        _writeHistory(id, 'update', `Изменено поле «${f}»`, String(old[f] ?? ''), String(data[f] ?? ''));
      }
    }
    return true;
  });

  ipcMain.handle('clients:archive', (_e, id: number) => {
    db.prepare("UPDATE clients SET is_archived=1, updated_at=datetime('now') WHERE id=?").run(id);
    _writeHistory(id, 'archive', 'Клиент перемещён в архив');
    return true;
  });

  ipcMain.handle('clients:delete', (_e, id: number) => {
    db.prepare('DELETE FROM clients WHERE id=?').run(id);
    return true;
  });

  ipcMain.handle('clients:search', (_e, q: string) => {
    const like = `%${q}%`;
    return db.prepare(`
      SELECT DISTINCT c.*,
             s.name  AS status_name,
             s.color AS status_color
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      LEFT JOIN orders o ON o.client_id=c.id
      LEFT JOIN contacts ct ON ct.client_id=c.id
      WHERE c.is_archived=0
        AND (
          c.full_name LIKE ?
          OR c.phone LIKE ?
          OR c.email LIKE ?
          OR o.contract_number LIKE ?
          OR o.brand LIKE ?
          OR o.model LIKE ?
          OR ct.value LIKE ?
        )
      ORDER BY c.updated_at DESC
      LIMIT 100
    `).all(like, like, like, like, like, like, like);
  });

  // ── ORDERS ────────────────────────────────────────────────────────────────

  ipcMain.handle('orders:getByClientId', (_e, clientId: number) => {
    return db.prepare('SELECT * FROM orders WHERE client_id=? ORDER BY id').all(clientId);
  });

  ipcMain.handle('orders:create', (_e, data: Record<string, unknown>) => {
    const stmt = db.prepare(`
      INSERT INTO orders (client_id,contract_number,brand,model,year,configuration,description,price,comment,delivery_date_est,delivery_date_actual,payment_date,payment_status)
      VALUES (@client_id,@contract_number,@brand,@model,@year,@configuration,@description,@price,@comment,@delivery_date_est,@delivery_date_actual,@payment_date,@payment_status)
    `);
    const result = stmt.run({
      client_id: data.client_id,
      contract_number: data.contract_number ?? null,
      brand: data.brand ?? null,
      model: data.model ?? null,
      year: data.year ?? null,
      configuration: data.configuration ?? null,
      description: data.description ?? null,
      price: data.price ?? null,
      comment: data.comment ?? null,
      delivery_date_est: data.delivery_date_est ?? null,
      delivery_date_actual: data.delivery_date_actual ?? null,
      payment_date: data.payment_date ?? null,
      payment_status: data.payment_status ?? null,
    });
    _writeHistory(data.client_id as number, 'order_create',
      `Добавлен заказ: ${data.brand ?? ''} ${data.model ?? ''}`.trim());
    return result.lastInsertRowid;
  });

  ipcMain.handle('orders:update', (_e, id: number, data: Record<string, unknown>) => {
    const old = db.prepare('SELECT * FROM orders WHERE id=?').get(id) as Record<string, unknown> | undefined;
    const fields = Object.keys(data).filter(k => !['id','created_at','updated_at','client_id'].includes(k));
    if (!fields.length) return false;
    const set = fields.map(f => `${f}=@${f}`).join(', ');
    db.prepare(`UPDATE orders SET ${set}, updated_at=datetime('now') WHERE id=@__id`).run({ ...data, __id: id });

    if (old && data.contract_number !== undefined && old.contract_number !== data.contract_number) {
      _writeHistory(old.client_id as number, 'contract_change',
        `Номер договора изменён`, String(old.contract_number ?? ''), String(data.contract_number ?? ''));
    }
    return true;
  });

  ipcMain.handle('orders:delete', (_e, id: number) => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id) as Record<string, unknown> | undefined;
    db.prepare('DELETE FROM orders WHERE id=?').run(id);
    if (order) _writeHistory(order.client_id as number, 'order_delete', `Заказ удалён: ${order.brand ?? ''} ${order.model ?? ''}`);
    return true;
  });

  // ── CONTACTS ──────────────────────────────────────────────────────────────

  ipcMain.handle('contacts:getByClientId', (_e, clientId: number) => {
    return db.prepare('SELECT * FROM contacts WHERE client_id=? ORDER BY is_primary DESC, id').all(clientId);
  });

  ipcMain.handle('contacts:create', (_e, data: Record<string, unknown>) => {
    const result = db.prepare(`
      INSERT INTO contacts (client_id,type,value,label,is_primary)
      VALUES (@client_id,@type,@value,@label,@is_primary)
    `).run({
      client_id: data.client_id,
      type: data.type,
      value: data.value,
      label: data.label ?? null,
      is_primary: data.is_primary ?? 0,
    });
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

  // ── HISTORY ───────────────────────────────────────────────────────────────

  ipcMain.handle('history:getByClientId', (_e, clientId: number) => {
    return db.prepare('SELECT * FROM history WHERE client_id=? ORDER BY id DESC LIMIT 100').all(clientId);
  });

  // ── DASHBOARD ─────────────────────────────────────────────────────────────

  ipcMain.handle('dashboard:getStats', () => {
    const now = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const activeClients = (db.prepare(
      "SELECT COUNT(*) as c FROM clients WHERE is_archived=0"
    ).get() as { c: number }).c;

    const needsAttention = (db.prepare(
      "SELECT COUNT(*) as c FROM clients WHERE is_archived=0 AND next_action_date IS NOT NULL AND next_action_date < ?"
    ).get(now) as { c: number }).c;

    const todayTasks = (db.prepare(
      "SELECT COUNT(*) as c FROM clients WHERE is_archived=0 AND next_action_date=?"
    ).get(now) as { c: number }).c;

    const carsInTransit = (db.prepare(
      "SELECT COUNT(DISTINCT o.client_id) as c FROM orders o JOIN clients c ON c.id=o.client_id WHERE c.is_archived=0 AND c.status_id=(SELECT id FROM statuses WHERE name='Автомобиль в пути' LIMIT 1)"
    ).get() as { c: number }).c;

    const newClientsThisWeek = (db.prepare(
      "SELECT COUNT(*) as c FROM clients WHERE date(created_at)>=?"
    ).get(weekAgo) as { c: number }).c;

    return { activeClients, needsAttention, todayTasks, carsInTransit, newClientsThisWeek };
  });

  // ── CAR BRANDS ────────────────────────────────────────────────────────────

  ipcMain.handle('carBrands:getAll', () => {
    return db.prepare('SELECT * FROM car_brands ORDER BY sort_order, name').all();
  });

  // ── CUSTOM FIELDS ─────────────────────────────────────────────────────────

  ipcMain.handle('customFields:getAll', (_e, entityType: string) => {
    return db.prepare('SELECT * FROM custom_fields WHERE entity_type=? AND is_active=1 ORDER BY sort_order').all(entityType);
  });

  ipcMain.handle('customFields:getValues', (_e, fieldIds: number[], entityId: number) => {
    if (!fieldIds.length) return [];
    const placeholders = fieldIds.map(() => '?').join(',');
    return db.prepare(
      `SELECT * FROM custom_field_values WHERE field_id IN (${placeholders}) AND entity_id=?`
    ).all(...fieldIds, entityId);
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
}

// Internal helper — not exposed via IPC
function _writeHistory(clientId: number, action: string, description: string, oldValue?: string, newValue?: string) {
  db.prepare(`
    INSERT INTO history (client_id,action,description,old_value,new_value)
    VALUES (?,?,?,?,?)
  `).run(clientId, action, description, oldValue ?? null, newValue ?? null);
}
