import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getBasePath } from './storagePaths';

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:create', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const basePath = getBasePath();
    const dbPath = path.join(basePath, 'crm.db');

    if (!fs.existsSync(dbPath)) {
      return { error: 'База данных не найдена' };
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultName = `crm-backup-${ts}.db`;

    const result = await dialog.showSaveDialog(win as BrowserWindow, {
      title: 'Сохранить резервную копию',
      defaultPath: defaultName,
      filters: [{ name: 'База данных CRM', extensions: ['db'] }],
    });

    if (result.canceled || !result.filePath) return { canceled: true };

    try {
      fs.copyFileSync(dbPath, result.filePath);
      return { success: true, path: result.filePath };
    } catch (err) {
      return { error: `Ошибка создания резервной копии: ${(err as Error).message}` };
    }
  });

  ipcMain.handle('backup:restore', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const basePath = getBasePath();
    const dbPath = path.join(basePath, 'crm.db');

    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Выбрать резервную копию',
      filters: [{ name: 'База данных CRM', extensions: ['db'] }],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths.length) return { canceled: true };

    try {
      // Backup current before restore
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const autoBackup = path.join(basePath, `crm-before-restore-${ts}.db`);
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, autoBackup);
      fs.copyFileSync(result.filePaths[0], dbPath);
      return { success: true };
    } catch (err) {
      return { error: `Ошибка восстановления: ${(err as Error).message}` };
    }
  });

  ipcMain.handle('backup:getDbPath', () => {
    return path.join(getBasePath(), 'crm.db');
  });

  ipcMain.handle('backup:autoBackupOnLaunch', () => {
    try {
      const basePath = getBasePath();
      const dbPath = path.join(basePath, 'crm.db');
      if (!fs.existsSync(dbPath)) return;
      const backupsDir = path.join(basePath, 'auto-backups');
      fs.mkdirSync(backupsDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 10);
      const dest = path.join(backupsDir, `crm-${ts}.db`);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(dbPath, dest);
      }
      // Keep only last 7 daily backups
      const files = fs.readdirSync(backupsDir)
        .filter(f => f.endsWith('.db'))
        .sort()
        .reverse();
      for (const f of files.slice(7)) {
        fs.unlinkSync(path.join(backupsDir, f));
      }
    } catch (_) { /* silent */ }
  });
}
