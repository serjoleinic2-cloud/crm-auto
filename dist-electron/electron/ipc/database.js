"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.initDatabase = initDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const schema_1 = require("../schema");
let db;
function getDb() {
    return db;
}
function initDatabase() {
    const userDataPath = electron_1.app.getPath('userData');
    const dbPath = path_1.default.join(userDataPath, 'crm-auto.db');
    db = new better_sqlite3_1.default(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Create tables
    db.exec(schema_1.CREATE_TABLES_SQL);
    // Seed statuses if empty
    const statusCount = db.prepare('SELECT COUNT(*) as c FROM statuses').get().c;
    if (statusCount === 0) {
        const insertStatus = db.prepare('INSERT INTO statuses (name, color, category, sort_order) VALUES (?, ?, ?, ?)');
        for (const s of schema_1.DEFAULT_STATUSES) {
            insertStatus.run(s.name, s.color, s.category, s.sort_order);
        }
    }
    // Seed car brands from car_brands.txt if table is empty
    const brandCount = db.prepare('SELECT COUNT(*) as c FROM car_brands').get().c;
    if (brandCount === 0) {
        const brandsFile = path_1.default.join(electron_1.app.getAppPath(), 'car_brands.txt');
        if (fs_1.default.existsSync(brandsFile)) {
            const lines = fs_1.default.readFileSync(brandsFile, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
            const insertBrand = db.prepare('INSERT OR IGNORE INTO car_brands (name, sort_order) VALUES (?, ?)');
            lines.forEach((name, i) => insertBrand.run(name, i));
        }
    }
    registerHandlers();
}
function registerHandlers() {
    // ── AUTH ──────────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('auth:isFirstRun', () => {
        const row = db.prepare('SELECT COUNT(*) as c FROM users').get();
        return row.c === 0;
    });
    electron_1.ipcMain.handle('auth:setPin', async (_e, pin) => {
        const hash = await bcryptjs_1.default.hash(pin, 10);
        db.prepare('DELETE FROM users').run();
        db.prepare('INSERT INTO users (pin_hash) VALUES (?)').run(hash);
        return true;
    });
    electron_1.ipcMain.handle('auth:verifyPin', async (_e, pin) => {
        const row = db.prepare('SELECT pin_hash FROM users LIMIT 1').get();
        if (!row)
            return false;
        return bcryptjs_1.default.compare(pin, row.pin_hash);
    });
    // ── STATUSES ──────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('statuses:getAll', () => {
        return db.prepare('SELECT * FROM statuses WHERE is_active=1 ORDER BY sort_order').all();
    });
    // ── CLIENTS ───────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('clients:getAll', (_e, filters = {}) => {
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
        const params = [];
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
    electron_1.ipcMain.handle('clients:getById', (_e, id) => {
        return db.prepare(`
      SELECT c.*,
             s.name  AS status_name,
             s.color AS status_color
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      WHERE c.id=?
    `).get(id);
    });
    electron_1.ipcMain.handle('clients:create', (_e, data) => {
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
        _writeHistory(result.lastInsertRowid, 'create', 'Клиент создан');
        return result.lastInsertRowid;
    });
    electron_1.ipcMain.handle('clients:update', (_e, id, data) => {
        const old = db.prepare('SELECT * FROM clients WHERE id=?').get(id);
        const fields = Object.keys(data).filter(k => !['id', 'created_at', 'updated_at', 'status_name', 'status_color', 'contract_number', 'car'].includes(k));
        if (!fields.length)
            return false;
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
    electron_1.ipcMain.handle('clients:archive', (_e, id) => {
        db.prepare("UPDATE clients SET is_archived=1, updated_at=datetime('now') WHERE id=?").run(id);
        _writeHistory(id, 'archive', 'Клиент перемещён в архив');
        return true;
    });
    electron_1.ipcMain.handle('clients:delete', (_e, id) => {
        db.prepare('DELETE FROM clients WHERE id=?').run(id);
        return true;
    });
    electron_1.ipcMain.handle('clients:search', (_e, q) => {
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
    electron_1.ipcMain.handle('orders:getByClientId', (_e, clientId) => {
        return db.prepare('SELECT * FROM orders WHERE client_id=? ORDER BY id').all(clientId);
    });
    electron_1.ipcMain.handle('orders:create', (_e, data) => {
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
        _writeHistory(data.client_id, 'order_create', `Добавлен заказ: ${data.brand ?? ''} ${data.model ?? ''}`.trim());
        return result.lastInsertRowid;
    });
    electron_1.ipcMain.handle('orders:update', (_e, id, data) => {
        const old = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        const fields = Object.keys(data).filter(k => !['id', 'created_at', 'updated_at', 'client_id'].includes(k));
        if (!fields.length)
            return false;
        const set = fields.map(f => `${f}=@${f}`).join(', ');
        db.prepare(`UPDATE orders SET ${set}, updated_at=datetime('now') WHERE id=@__id`).run({ ...data, __id: id });
        if (old && data.contract_number !== undefined && old.contract_number !== data.contract_number) {
            _writeHistory(old.client_id, 'contract_change', `Номер договора изменён`, String(old.contract_number ?? ''), String(data.contract_number ?? ''));
        }
        return true;
    });
    electron_1.ipcMain.handle('orders:delete', (_e, id) => {
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        db.prepare('DELETE FROM orders WHERE id=?').run(id);
        if (order)
            _writeHistory(order.client_id, 'order_delete', `Заказ удалён: ${order.brand ?? ''} ${order.model ?? ''}`);
        return true;
    });
    // ── CONTACTS ──────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('contacts:getByClientId', (_e, clientId) => {
        return db.prepare('SELECT * FROM contacts WHERE client_id=? ORDER BY is_primary DESC, id').all(clientId);
    });
    electron_1.ipcMain.handle('contacts:create', (_e, data) => {
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
        _writeHistory(data.client_id, 'contact_add', `Добавлен контакт ${data.type}: ${data.value}`);
        return result.lastInsertRowid;
    });
    electron_1.ipcMain.handle('contacts:delete', (_e, id) => {
        const c = db.prepare('SELECT * FROM contacts WHERE id=?').get(id);
        db.prepare('DELETE FROM contacts WHERE id=?').run(id);
        if (c)
            _writeHistory(c.client_id, 'contact_delete', `Удалён контакт ${c.type}: ${c.value}`);
        return true;
    });
    electron_1.ipcMain.handle('contacts:setPrimary', (_e, clientId, contactId) => {
        db.prepare('UPDATE contacts SET is_primary=0 WHERE client_id=?').run(clientId);
        db.prepare('UPDATE contacts SET is_primary=1 WHERE id=?').run(contactId);
        return true;
    });
    // ── HISTORY ───────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('history:getByClientId', (_e, clientId) => {
        return db.prepare('SELECT * FROM history WHERE client_id=? ORDER BY id DESC LIMIT 100').all(clientId);
    });
    // ── DASHBOARD ─────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('dashboard:getStats', () => {
        const now = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const activeClients = db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_archived=0").get().c;
        const needsAttention = db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_archived=0 AND next_action_date IS NOT NULL AND next_action_date < ?").get(now).c;
        const todayTasks = db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_archived=0 AND next_action_date=?").get(now).c;
        const carsInTransit = db.prepare("SELECT COUNT(DISTINCT o.client_id) as c FROM orders o JOIN clients c ON c.id=o.client_id WHERE c.is_archived=0 AND c.status_id=(SELECT id FROM statuses WHERE name='Автомобиль в пути' LIMIT 1)").get().c;
        const newClientsThisWeek = db.prepare("SELECT COUNT(*) as c FROM clients WHERE date(created_at)>=?").get(weekAgo).c;
        return { activeClients, needsAttention, todayTasks, carsInTransit, newClientsThisWeek };
    });
    // ── CAR BRANDS ────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('carBrands:getAll', () => {
        return db.prepare('SELECT * FROM car_brands ORDER BY sort_order, name').all();
    });
    // ── CUSTOM FIELDS ─────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('customFields:getAll', (_e, entityType) => {
        return db.prepare('SELECT * FROM custom_fields WHERE entity_type=? AND is_active=1 ORDER BY sort_order').all(entityType);
    });
    electron_1.ipcMain.handle('customFields:getValues', (_e, fieldIds, entityId) => {
        if (!fieldIds.length)
            return [];
        const placeholders = fieldIds.map(() => '?').join(',');
        return db.prepare(`SELECT * FROM custom_field_values WHERE field_id IN (${placeholders}) AND entity_id=?`).all(...fieldIds, entityId);
    });
    electron_1.ipcMain.handle('customFields:setValue', (_e, fieldId, entityId, value) => {
        const existing = db.prepare('SELECT id FROM custom_field_values WHERE field_id=? AND entity_id=?').get(fieldId, entityId);
        if (existing) {
            db.prepare("UPDATE custom_field_values SET value=?, updated_at=datetime('now') WHERE field_id=? AND entity_id=?").run(value, fieldId, entityId);
        }
        else {
            db.prepare('INSERT INTO custom_field_values (field_id,entity_id,value) VALUES (?,?,?)').run(fieldId, entityId, value);
        }
        return true;
    });
}
// Internal helper — not exposed via IPC
function _writeHistory(clientId, action, description, oldValue, newValue) {
    db.prepare(`
    INSERT INTO history (client_id,action,description,old_value,new_value)
    VALUES (?,?,?,?,?)
  `).run(clientId, action, description, oldValue ?? null, newValue ?? null);
}
