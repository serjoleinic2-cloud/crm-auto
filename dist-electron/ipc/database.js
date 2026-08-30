"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.getSetting = getSetting;
exports.setSetting = setSetting;
exports.initDatabase = initDatabase;
exports.writeHistory = writeHistory;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const schema_1 = require("../schema");
let db;
function getDb() { return db; }
// ── SETTINGS (generic key/value) ─────────────────────────────────────────────
function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? row.value : null;
}
function setSetting(key, value) {
    db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value);
}
function initDatabase() {
    const userDataPath = electron_1.app.getPath('userData');
    const dbPath = path_1.default.join(userDataPath, 'crm-auto.db');
    db = new better_sqlite3_1.default(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema_1.CREATE_TABLES_SQL);
    // Migration: add is_deleted / deleted_at if missing (for existing DBs)
    const clientCols = db.pragma('table_info(clients)').map(c => c.name);
    if (!clientCols.includes('is_deleted')) {
        db.prepare('ALTER TABLE clients ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0').run();
    }
    if (!clientCols.includes('deleted_at')) {
        db.prepare('ALTER TABLE clients ADD COLUMN deleted_at TEXT').run();
    }
    // Migration: orders new fields
    const orderCols = db.pragma('table_info(orders)').map(c => c.name);
    const orderMigrations = [
        { col: 'order_status_id', sql: 'ALTER TABLE orders ADD COLUMN order_status_id INTEGER REFERENCES order_statuses(id) ON DELETE SET NULL' },
        { col: 'broker_name', sql: 'ALTER TABLE orders ADD COLUMN broker_name TEXT' },
        { col: 'broker_phone', sql: 'ALTER TABLE orders ADD COLUMN broker_phone TEXT' },
        { col: 'broker_comment', sql: 'ALTER TABLE orders ADD COLUMN broker_comment TEXT' },
        { col: 'broker_date', sql: 'ALTER TABLE orders ADD COLUMN broker_date TEXT' },
        { col: 'inspection_done', sql: 'ALTER TABLE orders ADD COLUMN inspection_done INTEGER NOT NULL DEFAULT 0' },
        { col: 'inspection_comment', sql: 'ALTER TABLE orders ADD COLUMN inspection_comment TEXT' },
        { col: 'issue_date', sql: 'ALTER TABLE orders ADD COLUMN issue_date TEXT' },
    ];
    for (const m of orderMigrations) {
        if (!orderCols.includes(m.col)) {
            try {
                db.prepare(m.sql).run();
            }
            catch (e) {
                console.error('Migration error:', e);
            }
        }
    }
    // Seed statuses
    const statusCount = db.prepare('SELECT COUNT(*) as c FROM statuses').get().c;
    if (statusCount === 0) {
        const ins = db.prepare('INSERT INTO statuses (name,color,category,sort_order) VALUES (?,?,?,?)');
        for (const s of schema_1.DEFAULT_STATUSES)
            ins.run(s.name, s.color, s.category, s.sort_order);
    }
    // Seed order statuses
    const orderStatusCount = db.prepare('SELECT COUNT(*) as c FROM order_statuses').get().c;
    if (orderStatusCount === 0) {
        const ins = db.prepare('INSERT INTO order_statuses (name,color,sort_order) VALUES (?,?,?)');
        for (const s of schema_1.DEFAULT_ORDER_STATUSES)
            ins.run(s.name, s.color, s.sort_order);
    }
    // Seed car brands
    const brandCount = db.prepare('SELECT COUNT(*) as c FROM car_brands').get().c;
    if (brandCount === 0) {
        const brandsFile = path_1.default.join(electron_1.app.getAppPath(), 'car_brands.txt');
        if (fs_1.default.existsSync(brandsFile)) {
            const lines = fs_1.default.readFileSync(brandsFile, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
            const ins = db.prepare('INSERT OR IGNORE INTO car_brands (name,sort_order) VALUES (?,?)');
            lines.forEach((name, i) => ins.run(name, i));
        }
    }
    // Seed document types
    const docTypeCount = db.prepare('SELECT COUNT(*) as c FROM document_types').get().c;
    if (docTypeCount === 0) {
        const ins = db.prepare('INSERT INTO document_types (code,name,folder_name,sort_order,is_system) VALUES (@code,@name,@folder_name,@sort_order,@is_system)');
        for (const t of schema_1.DEFAULT_DOCUMENT_TYPES)
            ins.run({ ...t, is_system: t.is_system });
    }
    // Seed default base data path (Documents/CRM-Auto Data)
    if (getSetting('base_data_path') === null) {
        setSetting('base_data_path', path_1.default.join(electron_1.app.getPath('documents'), 'CRM-Auto Data'));
    }
    registerHandlers();
}
function registerHandlers() {
    // ── STATUSES ──────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('statuses:getAll', () => db.prepare('SELECT * FROM statuses WHERE is_active=1 ORDER BY sort_order').all());
    // ── ORDER STATUSES ─────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('orderStatuses:getAll', () => db.prepare('SELECT * FROM order_statuses WHERE is_active=1 ORDER BY sort_order').all());
    // ── REMINDERS ──────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('reminders:getAll', (_e, filters) => {
        let sql = 'SELECT r.*, c.full_name as client_name FROM reminders r JOIN clients c ON c.id=r.client_id WHERE 1=1';
        const params = [];
        if (filters?.clientId !== undefined) {
            sql += ' AND r.client_id=?';
            params.push(filters.clientId);
        }
        if (filters?.overdue) {
            sql += " AND r.is_completed=0 AND r.due_date < date('now')";
        }
        if (filters?.today) {
            sql += " AND r.is_completed=0 AND r.due_date=date('now')";
        }
        if (filters?.upcoming) {
            sql += " AND r.is_completed=0 AND r.due_date > date('now')";
        }
        sql += ' ORDER BY r.due_date IS NULL, r.due_date, r.created_at DESC';
        return db.prepare(sql).all(...params);
    });
    electron_1.ipcMain.handle('reminders:getById', (_e, id) => db.prepare('SELECT * FROM reminders WHERE id=?').get(id));
    electron_1.ipcMain.handle('reminders:create', (_e, data) => {
        const result = db.prepare(`
      INSERT INTO reminders (client_id, title, description, due_date, auto_created)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.client_id, data.title, data.description ?? null, data.due_date ?? null, data.auto_created ?? 0);
        return result.lastInsertRowid;
    });
    electron_1.ipcMain.handle('reminders:update', (_e, id, data) => {
        const fields = Object.keys(data).filter(k => ['title', 'description', 'due_date', 'is_completed'].includes(k));
        if (!fields.length)
            return false;
        const set = fields.map(f => `${f}=@${f}`).join(', ');
        const vals = { __id: id };
        for (const f of fields)
            vals[f] = data[f];
        if ('is_completed' in data && data.is_completed === 1) {
            vals['completed_at'] = new Date().toISOString();
            db.prepare(`UPDATE reminders SET ${set}, completed_at=@completed_at WHERE id=@__id`).run(vals);
        }
        else {
            db.prepare(`UPDATE reminders SET ${set} WHERE id=@__id`).run(vals);
        }
        return true;
    });
    electron_1.ipcMain.handle('reminders:delete', (_e, id) => {
        db.prepare('DELETE FROM reminders WHERE id=?').run(id);
        return true;
    });
    electron_1.ipcMain.handle('reminders:getStats', () => {
        const now = new Date().toISOString().split('T')[0];
        return {
            overdue: db.prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0 AND due_date < ?").get(now).c,
            today: db.prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0 AND due_date=?").get(now).c,
            total: db.prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0").get().c,
        };
    });
    // ── CLIENTS ───────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('clients:getAll', (_e, filters = {}) => {
        let sql = `
      SELECT c.*,
             s.name  AS status_name,
             s.color AS status_color,
             (SELECT o.contract_number FROM orders o WHERE o.client_id=c.id ORDER BY o.id LIMIT 1) AS contract_number,
             (SELECT trim(IFNULL(o.brand,'')||' '||IFNULL(o.model,'')) FROM orders o WHERE o.client_id=c.id ORDER BY o.id LIMIT 1) AS car,
             IFNULL(cn.status,'not_requested') AS consent_status
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      LEFT JOIN consent cn ON cn.client_id=c.id
      WHERE 1=1
    `;
        const params = [];
        if (filters.trash) {
            sql += ' AND c.is_deleted=1';
        }
        else {
            sql += ' AND c.is_deleted=0';
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
        }
        sql += ' ORDER BY c.updated_at DESC';
        return db.prepare(sql).all(...params);
    });
    electron_1.ipcMain.handle('clients:getById', (_e, id) => db.prepare(`
      SELECT c.*, s.name AS status_name, s.color AS status_color,
             IFNULL(cn.status,'not_requested') AS consent_status
      FROM clients c
      LEFT JOIN statuses s ON s.id=c.status_id
      LEFT JOIN consent cn ON cn.client_id=c.id
      WHERE c.id=?
    `).get(id));
    electron_1.ipcMain.handle('clients:create', (_e, data) => {
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
        const clientId = result.lastInsertRowid;
        db.prepare("INSERT OR IGNORE INTO consent (client_id, status) VALUES (?, 'not_requested')").run(clientId);
        _writeHistory(clientId, 'create', 'Клиент создан');
        return clientId;
    });
    electron_1.ipcMain.handle('clients:update', (_e, id, data) => {
        const old = db.prepare('SELECT * FROM clients WHERE id=?').get(id);
        const skip = ['id', 'created_at', 'updated_at', 'status_name', 'status_color', 'contract_number', 'car', 'consent_status', 'is_deleted', 'deleted_at'];
        const fields = Object.keys(data).filter(k => !skip.includes(k));
        if (!fields.length)
            return false;
        const set = fields.map(f => `${f}=@${f}`).join(', ');
        db.prepare(`UPDATE clients SET ${set}, updated_at=datetime('now') WHERE id=@__id`).run({ ...data, __id: id });
        for (const f of fields) {
            if (old && String(old[f]) !== String(data[f])) {
                _writeHistory(id, 'update', `Изменено «${f}»`, String(old[f] ?? ''), String(data[f] ?? ''));
            }
        }
        return true;
    });
    electron_1.ipcMain.handle('clients:archive', (_e, id) => {
        db.prepare("UPDATE clients SET is_archived=1, updated_at=datetime('now') WHERE id=?").run(id);
        _writeHistory(id, 'archive', 'Клиент перемещён в архив');
        return true;
    });
    // Soft delete — move to trash
    electron_1.ipcMain.handle('clients:trash', (_e, id) => {
        db.prepare("UPDATE clients SET is_deleted=1, deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id);
        _writeHistory(id, 'trash', 'Клиент перемещён в корзину');
        return true;
    });
    // Restore from trash
    electron_1.ipcMain.handle('clients:restore', (_e, id) => {
        db.prepare("UPDATE clients SET is_deleted=0, deleted_at=NULL, updated_at=datetime('now') WHERE id=?").run(id);
        _writeHistory(id, 'restore', 'Клиент восстановлен из корзины');
        return true;
    });
    // Hard delete from trash only
    electron_1.ipcMain.handle('clients:deleteForever', (_e, id) => {
        db.prepare('DELETE FROM clients WHERE id=? AND is_deleted=1').run(id);
        return true;
    });
    electron_1.ipcMain.handle('clients:search', (_e, q) => {
        const like = `%${q}%`;
        return db.prepare(`
      SELECT DISTINCT c.*, s.name AS status_name, s.color AS status_color,
             IFNULL(cn.status,'not_requested') AS consent_status
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
    // Live search — returns as user types (same logic, lower limit)
    electron_1.ipcMain.handle('clients:suggest', (_e, q) => {
        if (!q || q.trim().length < 1)
            return [];
        const like = `%${q}%`;
        return db.prepare(`
      SELECT DISTINCT c.id, c.full_name, c.phone,
             s.name AS status_name, s.color AS status_color,
             trim(IFNULL(o.brand,'')||' '||IFNULL(o.model,'')) AS car,
             o.contract_number
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
    electron_1.ipcMain.handle('orders:getByClientId', (_e, clientId) => db.prepare(`
      SELECT o.*, os.name as order_status_name, os.color as order_status_color
      FROM orders o
      LEFT JOIN order_statuses os ON os.id=o.order_status_id
      WHERE o.client_id=?
      ORDER BY o.id
    `).all(clientId));
    electron_1.ipcMain.handle('orders:getById', (_e, id) => db.prepare(`
      SELECT o.*, os.name as order_status_name, os.color as order_status_color
      FROM orders o
      LEFT JOIN order_statuses os ON os.id=o.order_status_id
      WHERE o.id=?
    `).get(id));
    electron_1.ipcMain.handle('orders:create', (_e, data) => {
        const result = db.prepare(`
      INSERT INTO orders (client_id,contract_number,brand,model,year,configuration,description,price,comment,delivery_date_est,delivery_date_actual,payment_date,payment_status,order_status_id,broker_name,broker_phone,broker_comment,broker_date,inspection_done,inspection_comment,issue_date)
      VALUES (@client_id,@contract_number,@brand,@model,@year,@configuration,@description,@price,@comment,@delivery_date_est,@delivery_date_actual,@payment_date,@payment_status,@order_status_id,@broker_name,@broker_phone,@broker_comment,@broker_date,@inspection_done,@inspection_comment,@issue_date)
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
        });
        const orderId = result.lastInsertRowid;
        _writeHistory(data.client_id, 'order_create', `Создан заказ: ${[data.brand, data.model].filter(Boolean).join(' ')}`);
        return orderId;
    });
    electron_1.ipcMain.handle('orders:update', (_e, id, data) => {
        const old = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        const skip = ['id', 'created_at', 'updated_at', 'client_id', 'order_status_name', 'order_status_color'];
        const fields = Object.keys(data).filter(k => !skip.includes(k));
        if (!fields.length)
            return false;
        const set = fields.map(f => `${f}=@${f}`).join(', ');
        db.prepare(`UPDATE orders SET ${set}, updated_at=datetime('now') WHERE id=@__id`).run({ ...data, __id: id });
        if (old) {
            const clientId = old.client_id;
            // Contract number changed
            if ('contract_number' in data && old.contract_number !== data.contract_number) {
                _writeHistory(clientId, 'contract_change', 'Номер договора изменён', String(old.contract_number ?? ''), String(data.contract_number ?? ''));
            }
            // Price changed
            if ('price' in data && old.price !== data.price) {
                _writeHistory(clientId, 'price_change', 'Цена изменена', String(old.price ?? ''), String(data.price ?? ''));
            }
            // Payment status changed
            if ('payment_status' in data && old.payment_status !== data.payment_status) {
                const labels = { not_paid: 'Не оплачено', pending: 'Ожидается оплата', paid: 'Оплачено', partial: 'Частично оплачено', cancelled: 'Отменено' };
                _writeHistory(clientId, 'payment_status', `Статус оплаты: ${labels[old.payment_status] ?? old.payment_status} → ${labels[data.payment_status] ?? data.payment_status}`);
            }
            // Order status changed
            if ('order_status_id' in data && old.order_status_id !== data.order_status_id) {
                const oldStatus = db.prepare('SELECT name FROM order_statuses WHERE id=?').get(old.order_status_id);
                const newStatus = db.prepare('SELECT name FROM order_statuses WHERE id=?').get(data.order_status_id);
                _writeHistory(clientId, 'order_status', `Статус заказа: ${oldStatus?.name ?? '—'} → ${newStatus?.name ?? '—'}`);
                // Auto-reminders based on status
                if (newStatus?.name === 'На таможне') {
                    db.prepare(`INSERT INTO reminders (client_id, title, description, auto_created) VALUES (?, ?, ?, 1)`)
                        .run(clientId, 'Доверенность брокеру', `Для клиента нужна доверенность брокеру`);
                }
                if (newStatus?.name === 'Прибыл в офис') {
                    db.prepare(`INSERT INTO reminders (client_id, title, description, auto_created) VALUES (?, ?, ?, 1)`)
                        .run(clientId, 'Позвонить клиенту', 'Сообщить о прибытии автомобиля');
                }
            }
            // Delivery actual date
            if ('delivery_date_actual' in data && !old.delivery_date_actual && data.delivery_date_actual) {
                _writeHistory(clientId, 'arrival', 'Автомобиль прибыл в офис');
            }
            // Issue date
            if ('issue_date' in data && !old.issue_date && data.issue_date) {
                _writeHistory(clientId, 'issue', 'Автомобиль выдан клиенту');
            }
        }
        return true;
    });
    electron_1.ipcMain.handle('orders:delete', (_e, id) => {
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        db.prepare('DELETE FROM orders WHERE id=?').run(id);
        if (order)
            _writeHistory(order.client_id, 'order_delete', `Заказ удалён: ${[order.brand, order.model].filter(Boolean).join(' ')}`);
        return true;
    });
    // ── CONTACTS ──────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('contacts:getByClientId', (_e, clientId) => db.prepare('SELECT * FROM contacts WHERE client_id=? ORDER BY is_primary DESC, id').all(clientId));
    electron_1.ipcMain.handle('contacts:create', (_e, data) => {
        const result = db.prepare('INSERT INTO contacts (client_id,type,value,label,is_primary) VALUES (@client_id,@type,@value,@label,@is_primary)').run({ client_id: data.client_id, type: data.type, value: data.value, label: data.label ?? null, is_primary: data.is_primary ?? 0 });
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
    // ── CONSENT ───────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('consent:getByClientId', (_e, clientId) => db.prepare('SELECT * FROM consent WHERE client_id=?').get(clientId));
    electron_1.ipcMain.handle('consent:update', (_e, clientId, data) => {
        const existing = db.prepare('SELECT * FROM consent WHERE client_id=?').get(clientId);
        if (!existing) {
            db.prepare("INSERT INTO consent (client_id,status,received_date,scan_path,comment) VALUES (?,?,?,?,?)")
                .run(clientId, data.status ?? 'not_requested', data.received_date ?? null, data.scan_path ?? null, data.comment ?? null);
        }
        else {
            const fields = [];
            const vals = { __id: clientId };
            const allowed = ['status', 'received_date', 'scan_path', 'comment'];
            for (const f of allowed) {
                if (f in data) {
                    fields.push(`${f}=@${f}`);
                    vals[f] = data[f];
                }
            }
            if (fields.length) {
                db.prepare(`UPDATE consent SET ${fields.join(',')}, updated_at=datetime('now') WHERE client_id=@__id`).run(vals);
            }
        }
        const statusLabels = {
            not_requested: 'Не запрашивалось', sent: 'Отправлено клиенту', received: 'Получено', verified: 'Проверено',
        };
        if ('status' in data) {
            _writeHistory(clientId, 'consent_update', `Согласие на ПД: ${statusLabels[data.status] ?? data.status}`);
        }
        return true;
    });
    // ── HISTORY ───────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('history:getByClientId', (_e, clientId) => db.prepare('SELECT * FROM history WHERE client_id=? ORDER BY id DESC LIMIT 100').all(clientId));
    // ── DASHBOARD ─────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('dashboard:getStats', () => {
        const now = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        return {
            activeClients: db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_archived=0 AND is_deleted=0").get().c,
            needsAttention: db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_archived=0 AND is_deleted=0 AND next_action_date IS NOT NULL AND next_action_date < ?").get(now).c,
            todayTasks: db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_archived=0 AND is_deleted=0 AND next_action_date=?").get(now).c,
            carsInTransit: db.prepare("SELECT COUNT(DISTINCT o.client_id) as c FROM orders o JOIN clients c ON c.id=o.client_id WHERE c.is_archived=0 AND c.is_deleted=0 AND o.order_status_id=(SELECT id FROM order_statuses WHERE name='Автомобиль в пути' LIMIT 1)").get().c,
            newClientsThisWeek: db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_deleted=0 AND date(created_at)>=?").get(weekAgo).c,
            pendingConsent: db.prepare("SELECT COUNT(*) as c FROM consent WHERE status='not_requested'").get().c,
            trashCount: db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_deleted=1").get().c,
            overdueReminders: db.prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0 AND due_date < ?").get(now).c,
            pendingPayment: db.prepare("SELECT COUNT(*) as c FROM orders o JOIN clients c ON c.id=o.client_id WHERE c.is_deleted=0 AND o.payment_status='pending'").get().c,
            atCustoms: db.prepare("SELECT COUNT(*) as c FROM orders o JOIN clients c ON c.id=o.client_id WHERE c.is_deleted=0 AND o.order_status_id=(SELECT id FROM order_statuses WHERE name='На таможне' LIMIT 1)").get().c,
            inOffice: db.prepare("SELECT COUNT(*) as c FROM orders o JOIN clients c ON c.id=o.client_id WHERE c.is_deleted=0 AND o.order_status_id=(SELECT id FROM order_statuses WHERE name='Прибыл в офис' LIMIT 1)").get().c,
        };
    });
    // ── CAR BRANDS ────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('carBrands:getAll', () => db.prepare('SELECT * FROM car_brands ORDER BY sort_order, name').all());
    // ── SETTINGS ──────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('settings:get', (_e, key) => getSetting(key));
    electron_1.ipcMain.handle('settings:set', (_e, key, value) => { setSetting(key, value); return true; });
    // ── CUSTOM FIELDS ─────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('customFields:getAll', (_e, entityType) => db.prepare('SELECT * FROM custom_fields WHERE entity_type=? AND is_active=1 ORDER BY sort_order').all(entityType));
    electron_1.ipcMain.handle('customFields:getValues', (_e, fieldIds, entityId) => {
        if (!fieldIds.length)
            return [];
        const ph = fieldIds.map(() => '?').join(',');
        return db.prepare(`SELECT * FROM custom_field_values WHERE field_id IN (${ph}) AND entity_id=?`).all(...fieldIds, entityId);
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
function writeHistory(clientId, action, description, oldValue, newValue) {
    _writeHistory(clientId, action, description, oldValue, newValue);
}
function _writeHistory(clientId, action, description, oldValue, newValue) {
    try {
        db.prepare('INSERT INTO history (client_id,action,description,old_value,new_value) VALUES (?,?,?,?,?)')
            .run(clientId, action, description, oldValue ?? null, newValue ?? null);
    }
    catch { /* ignore history errors */ }
}
