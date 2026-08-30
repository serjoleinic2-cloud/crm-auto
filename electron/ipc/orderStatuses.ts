import { ipcMain } from 'electron';
import { getDb } from './database';

export function registerOrderStatusesHandlers(): void {
  ipcMain.handle('orderStatuses:getAll', () =>
    getDb().prepare('SELECT * FROM order_statuses WHERE is_active=1 ORDER BY sort_order').all()
  );
}
