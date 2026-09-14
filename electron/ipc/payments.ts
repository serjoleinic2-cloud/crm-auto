import { ipcMain } from 'electron';
import { getDb } from './database';

export function registerPaymentsHandlers(): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS payment_installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0, paid_at TEXT NOT NULL,
    is_final INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  ipcMain.handle('payments:getByOrder', (_e, orderId: number) =>
    db.prepare('SELECT * FROM payment_installments WHERE order_id=? ORDER BY paid_at,id').all(orderId));
  ipcMain.handle('payments:add', (_e, data: { order_id:number; amount:number; paid_at:string }) =>
    db.prepare('INSERT INTO payment_installments (order_id,amount,paid_at) VALUES (?,?,?)').run(data.order_id,data.amount,data.paid_at).lastInsertRowid);
  ipcMain.handle('payments:delete', (_e, id:number) => db.prepare('DELETE FROM payment_installments WHERE id=?').run(id).changes>0);
  ipcMain.handle('payments:confirmFinal', (_e, id:number) => {
    const row=db.prepare('SELECT order_id,paid_at FROM payment_installments WHERE id=?').get(id) as {order_id:number;paid_at:string}|undefined;
    if(!row) return {error:'Платёж не найден'};
    const transit=db.prepare("SELECT id FROM statuses WHERE name='Автомобиль в пути' AND is_active=1 LIMIT 1").get() as {id:number}|undefined;
    db.transaction(()=>{db.prepare('UPDATE payment_installments SET is_final=0 WHERE order_id=?').run(row.order_id);db.prepare('UPDATE payment_installments SET is_final=1 WHERE id=?').run(id);db.prepare('UPDATE orders SET payment_status=?, payment_date=?, order_status_id=COALESCE(?,order_status_id), updated_at=datetime(\'now\') WHERE id=?').run('paid',row.paid_at,transit?.id??null,row.order_id);})()
    return {success:true};
  });
}