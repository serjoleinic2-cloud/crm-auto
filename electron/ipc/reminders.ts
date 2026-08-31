import { ipcMain } from 'electron';
import { getDb } from './database';

export function registerRemindersHandlers(): void {
  ipcMain.handle('reminders:getAll', (_e, filters?: { clientId?: number; overdue?: boolean; today?: boolean; upcoming?: boolean }) => {
    let sql = 'SELECT r.*, c.full_name as client_name FROM reminders r JOIN clients c ON c.id=r.client_id WHERE 1=1';
    const params: unknown[] = [];
    if (filters?.clientId !== undefined) { sql += ' AND r.client_id=?'; params.push(filters.clientId); }
    if (filters?.overdue) { sql += " AND r.is_completed=0 AND r.due_date < date('now')"; }
    if (filters?.today) { sql += " AND r.is_completed=0 AND r.due_date=date('now')"; }
    if (filters?.upcoming) { sql += " AND r.is_completed=0 AND r.due_date > date('now')"; }
    sql += ' ORDER BY r.due_date IS NULL, r.due_date, r.created_at DESC';
    return getDb().prepare(sql).all(...params);
  });

  ipcMain.handle('reminders:getById', (_e, id: number) =>
    getDb().prepare('SELECT * FROM reminders WHERE id=?').get(id)
  );

  ipcMain.handle('reminders:create', (_e, data: { client_id: number; title: string; description?: string; due_date?: string; due_time?: string; auto_created?: number }) => {
    const result = getDb().prepare(`
      INSERT INTO reminders (client_id, title, description, due_date, due_time, auto_created)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.client_id, data.title, data.description ?? null, data.due_date ?? null, data.due_time ?? null, data.auto_created ?? 0);
    return result.lastInsertRowid;
  });

  ipcMain.handle('reminders:update', (_e, id: number, data: Partial<{ title: string; description: string; due_date: string; due_time: string; is_completed: number }>) => {
    const fields = Object.keys(data).filter(k => ['title','description','due_date','due_time','is_completed'].includes(k));
    if (!fields.length) return false;
    const set = fields.map(f => `${f}=@${f}`).join(', ');
    const vals: Record<string, unknown> = { __id: id };
    for (const f of fields) vals[f] = data[f as keyof typeof data];
    if ('is_completed' in data && data.is_completed === 1) {
      vals['completed_at'] = new Date().toISOString();
      getDb().prepare(`UPDATE reminders SET ${set}, completed_at=@completed_at WHERE id=@__id`).run(vals);
    } else {
      getDb().prepare(`UPDATE reminders SET ${set} WHERE id=@__id`).run(vals);
    }
    return true;
  });

  ipcMain.handle('reminders:delete', (_e, id: number) => {
    getDb().prepare('DELETE FROM reminders WHERE id=?').run(id);
    return true;
  });

  ipcMain.handle('reminders:getStats', () => {
    const now = new Date().toISOString().split('T')[0];
    return {
      overdue: (getDb().prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0 AND due_date < ?").get(now) as { c: number }).c,
      today:   (getDb().prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0 AND due_date=?").get(now) as { c: number }).c,
      total:   (getDb().prepare("SELECT COUNT(*) as c FROM reminders WHERE is_completed=0").get() as { c: number }).c,
    };
  });
}
