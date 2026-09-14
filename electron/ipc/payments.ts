import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDb, writeHistory } from './database';
import { copyFileUnique, getDocumentsFolder } from './storagePaths';

type PaymentMode = 'single' | 'installments';

type InstallmentInput = {
  order_id: number;
  amount: number;
  paid_at: string;
  receipt_path: string;
};

function ensureColumn(table: string, name: string, definition: string): void {
  const db = getDb();
  const columns = db.pragma(`table_info(${table})`) as { name: string }[];
  if (!columns.some(column => column.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

export function registerPaymentsHandlers(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount REAL NOT NULL DEFAULT 0,
      paid_at TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0,
      file_path TEXT,
      file_name TEXT,
      document_file_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payment_installments_order
      ON payment_installments(order_id);
  `);
  ensureColumn('orders', 'payment_mode', "TEXT NOT NULL DEFAULT 'single'");
  ensureColumn('payment_installments', 'file_path', 'TEXT');
  ensureColumn('payment_installments', 'file_name', 'TEXT');
  ensureColumn('payment_installments', 'document_file_id', 'INTEGER');

  ipcMain.handle('payments:getByOrder', (_e, orderId: number) => {
    const order = db.prepare('SELECT payment_mode, payment_status FROM orders WHERE id=?').get(orderId) as
      { payment_mode?: PaymentMode; payment_status?: string | null } | undefined;
    const mode = (order?.payment_mode ?? 'single') as PaymentMode;
    const items = db.prepare('SELECT * FROM payment_installments WHERE order_id=? ORDER BY paid_at,id').all(orderId) as
      { is_final: number }[];
    const hasFinalPayment = items.some(item => item.is_final === 1);
    if (order?.payment_status === 'paid' && !hasFinalPayment) {
      const normalizedStatus = items.length > 0 && mode === 'installments' ? 'partial' : 'pending';
      db.prepare("UPDATE orders SET payment_status=?, payment_date=NULL, updated_at=datetime('now') WHERE id=?")
        .run(normalizedStatus, orderId);
    }
    return { mode, items };
  });

  ipcMain.handle('payments:setMode', (_e, orderId: number, mode: PaymentMode) => {
    if (!['single', 'installments'].includes(mode)) return { error: 'Неизвестный способ оплаты' };
    const hasFinalPayment = Boolean(db.prepare(
      'SELECT 1 FROM payment_installments WHERE order_id=? AND is_final=1 LIMIT 1'
    ).get(orderId));
    const hasAnyPayment = Boolean(db.prepare(
      'SELECT 1 FROM payment_installments WHERE order_id=? LIMIT 1'
    ).get(orderId));
    const paymentStatus = hasFinalPayment ? 'paid' : hasAnyPayment && mode === 'installments' ? 'partial' : 'pending';
    db.prepare(`
      UPDATE orders SET payment_mode=?, payment_status=?,
        payment_date=CASE WHEN ? THEN payment_date ELSE NULL END,
        updated_at=datetime('now')
      WHERE id=?
    `).run(mode, paymentStatus, hasFinalPayment ? 1 : 0, orderId);
    return { success: true };
  });

  ipcMain.handle('payments:add', (_e, input: InstallmentInput) => {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Укажите сумму платежа' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paid_at)) return { error: 'Укажите дату платежа' };
    if (!input.receipt_path || !fs.existsSync(input.receipt_path)) return { error: 'Выберите файл чека' };

    const order = db.prepare(`
      SELECT o.id, o.client_id, c.full_name
      FROM orders o JOIN clients c ON c.id=o.client_id
      WHERE o.id=?
    `).get(input.order_id) as { id: number; client_id: number; full_name: string } | undefined;
    if (!order) return { error: 'Заказ не найден' };

    const destination = copyFileUnique(
      input.receipt_path,
      getDocumentsFolder(order.client_id, order.full_name),
    );
    const fileName = path.basename(destination);
    const originalName = path.basename(input.receipt_path);
    const size = fs.statSync(destination).size;

    const result = db.transaction(() => {
      const type = db.prepare("SELECT id FROM document_types WHERE code='payment_proof'").get() as { id: number } | undefined;
      let documentFileId: number | null = null;
      if (type) {
        let document = db.prepare('SELECT id FROM documents WHERE client_id=? AND document_type_id=?')
          .get(order.client_id, type.id) as { id: number } | undefined;
        if (!document) {
          const created = db.prepare(`
            INSERT INTO documents (client_id,order_id,document_type_id,status,received_date)
            VALUES (?,? ,?,'received',?)
          `).run(order.client_id, order.id, type.id, input.paid_at);
          document = { id: Number(created.lastInsertRowid) };
        } else {
          db.prepare("UPDATE documents SET status='received', received_date=COALESCE(received_date,?), updated_at=datetime('now') WHERE id=?")
            .run(input.paid_at, document.id);
        }
        const file = db.prepare(`
          INSERT INTO document_files (document_id,file_path,file_name,original_name,size)
          VALUES (?,?,?,?,?)
        `).run(document.id, destination, fileName, originalName, size);
        documentFileId = Number(file.lastInsertRowid);
      }

      const inserted = db.prepare(`
        INSERT INTO payment_installments (order_id,amount,paid_at,file_path,file_name,document_file_id)
        VALUES (?,?,?,?,?,?)
      `).run(order.id, amount, input.paid_at, destination, fileName, documentFileId);
      db.prepare(`
        UPDATE orders
        SET payment_status=CASE
              WHEN EXISTS (
                SELECT 1 FROM payment_installments pi
                WHERE pi.order_id=orders.id AND pi.is_final=1
              ) THEN 'paid'
              WHEN payment_mode='installments' THEN 'partial'
              ELSE 'pending'
            END,
            payment_date=CASE
              WHEN EXISTS (
                SELECT 1 FROM payment_installments pi
                WHERE pi.order_id=orders.id AND pi.is_final=1
              ) THEN payment_date
              ELSE NULL
            END,
            updated_at=datetime('now')
        WHERE id=?
      `).run(order.id);
      return inserted;
    })();

    writeHistory(order.client_id, 'payment_installment',
      `Добавлен платёж: ${amount.toLocaleString('ru-RU')} ₽ от ${input.paid_at}`);
    return { success: true, id: Number(result.lastInsertRowid) };
  });

  ipcMain.handle('payments:delete', (_e, id: number) => {
    const item = db.prepare(`
      SELECT pi.*, o.client_id FROM payment_installments pi
      JOIN orders o ON o.id=pi.order_id WHERE pi.id=?
    `).get(id) as {
      is_final: number; document_file_id: number | null;
      client_id: number; order_id: number;
    } | undefined;
    if (!item) return { error: 'Платёж не найден' };
    if (item.is_final) return { error: 'Подтверждённый последний платёж удалить нельзя' };

    db.transaction(() => {
      db.prepare('DELETE FROM payment_installments WHERE id=?').run(id);
      if (item.document_file_id) db.prepare('DELETE FROM document_files WHERE id=?').run(item.document_file_id);
      db.prepare(`
        UPDATE orders
        SET payment_status=CASE
              WHEN EXISTS (
                SELECT 1 FROM payment_installments pi
                WHERE pi.order_id=orders.id AND pi.is_final=1
              ) THEN 'paid'
              WHEN EXISTS (
                SELECT 1 FROM payment_installments pi
                WHERE pi.order_id=orders.id
              ) AND payment_mode='installments' THEN 'partial'
              ELSE 'pending'
            END,
            payment_date=CASE
              WHEN EXISTS (
                SELECT 1 FROM payment_installments pi
                WHERE pi.order_id=orders.id AND pi.is_final=1
              ) THEN payment_date
              ELSE NULL
            END,
            updated_at=datetime('now')
        WHERE id=?
      `).run(item.order_id);
      db.prepare(`
        UPDATE documents
        SET status='not_requested', received_date=NULL, updated_at=datetime('now')
        WHERE client_id=?
          AND document_type_id=(SELECT id FROM document_types WHERE code='payment_proof')
          AND NOT EXISTS (
            SELECT 1 FROM document_files df WHERE df.document_id=documents.id
          )
      `).run(item.client_id);
    })();
    writeHistory(item.client_id, 'payment_installment', 'Удалена запись о частичном платеже');
    return { success: true };
  });

  ipcMain.handle('payments:confirmFinal', (_e, id: number) => {
    const row = db.prepare(`
      SELECT pi.order_id, pi.paid_at, pi.file_path, o.client_id, o.order_status_id,
             s.name AS status_name
      FROM payment_installments pi
      JOIN orders o ON o.id=pi.order_id
      LEFT JOIN statuses s ON s.id=o.order_status_id
      WHERE pi.id=?
    `).get(id) as {
      order_id: number; paid_at: string; file_path: string | null;
      client_id: number; order_status_id: number | null; status_name: string | null;
    } | undefined;
    if (!row) return { error: 'Платёж не найден' };
    if (!row.file_path || !fs.existsSync(row.file_path)) return { error: 'Файл последнего чека не найден' };

    const transit = db.prepare(
      "SELECT id FROM statuses WHERE name='Автомобиль в пути' AND is_active=1 LIMIT 1"
    ).get() as { id: number } | undefined;
    if (!transit) return { error: 'Не найден этап «Автомобиль в пути»' };

    const beforePayment = !row.status_name || [
      'Новый клиент', 'Думает', 'Документы получены',
      'Договор подписан', 'Ожидает оплату', 'Оплачен',
    ].includes(row.status_name);

    db.transaction(() => {
      db.prepare('UPDATE payment_installments SET is_final=0 WHERE order_id=?').run(row.order_id);
      db.prepare('UPDATE payment_installments SET is_final=1 WHERE id=?').run(id);
      db.prepare(`
        UPDATE orders SET payment_status='paid', payment_date=?,
          payment_deadline=NULL,
          order_status_id=CASE WHEN ? THEN ? ELSE order_status_id END,
          updated_at=datetime('now')
        WHERE id=?
      `).run(row.paid_at, beforePayment ? 1 : 0, transit.id, row.order_id);
      if (beforePayment) {
        db.prepare("UPDATE clients SET status_id=?, is_archived=0, updated_at=datetime('now') WHERE id=?")
          .run(transit.id, row.client_id);
      }
    })();

    writeHistory(row.client_id, 'payment_status',
      `Полная оплата подтверждена последним чеком от ${row.paid_at}`);
    return { success: true, paymentDate: row.paid_at };
  });
}
