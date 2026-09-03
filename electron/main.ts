import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { initDatabase, registerDatabaseHandlers } from './ipc/database';
import { registerMessagingHandlers } from './ipc/messaging';
import { registerFilesHandlers } from './ipc/files';
import { registerDocumentsHandlers } from './ipc/documents';
import { registerBackupHandlers } from './ipc/backup';
import { registerOrderStatusesHandlers } from './ipc/orderStatuses';
import { registerRemindersHandlers } from './ipc/reminders';
import { registerContractsHandlers } from './ipc/contracts';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'default',
    show: false,
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('tel:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}

app.whenReady().then(() => {
  initDatabase();
  registerDatabaseHandlers();
  registerMessagingHandlers();
  registerFilesHandlers();
  registerDocumentsHandlers();
  registerBackupHandlers();
  registerOrderStatusesHandlers();
  registerRemindersHandlers();
  registerContractsHandlers();
  createWindow();

  // Auto-backup on launch (daily×30, weekly×12, monthly×6)
  setTimeout(() => {
    const { ipcMain: ipc } = require('electron');
    // Trigger via direct import to avoid circular deps
    const bkp = require('./ipc/backup');
    void bkp; // already registered — just call the handler directly
    import('./ipc/storagePaths').then(({ getBasePath }) => {
      const fs = require('fs');
      const path = require('path');
      try {
        const basePath = getBasePath();
        const dbPath = path.join(basePath, 'crm.db');
        if (!fs.existsSync(dbPath)) return;
        const dir = path.join(basePath, 'auto-backups');
        fs.mkdirSync(dir, { recursive: true });
        const now = new Date();
        const d = now.toISOString().slice(0, 10);
        const m = now.toISOString().slice(0, 7);
        // ISO week
        const date2 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const day = date2.getUTCDay() || 7;
        date2.setUTCDate(date2.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(date2.getUTCFullYear(), 0, 1));
        const wk = Math.ceil((((date2.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        const w = `${date2.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
        const cp = (dest: string) => { if (!fs.existsSync(dest)) fs.copyFileSync(dbPath, dest); };
        const prune = (pfx: string, keep: number) => {
          const files = fs.readdirSync(dir).filter((f: string) => f.startsWith(pfx) && f.endsWith('.db')).sort().reverse();
          for (const f of (files as string[]).slice(keep)) try { fs.unlinkSync(path.join(dir, f)); } catch(_){}
        };
        cp(path.join(dir, `daily-${d}.db`));   prune('daily-', 30);
        cp(path.join(dir, `weekly-${w}.db`));  prune('weekly-', 12);
        cp(path.join(dir, `monthly-${m}.db`)); prune('monthly-', 6);

        // Also copy to Google Drive if configured
        const settingsPath = path.join(basePath, 'crm-settings.json');
        if (fs.existsSync(settingsPath)) {
          try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            const gdrivePath = settings.gdrivePath;
            if (gdrivePath && fs.existsSync(gdrivePath)) {
              const gdriveDir = path.join(gdrivePath, 'CRM Auto Backups');
              fs.mkdirSync(gdriveDir, { recursive: true });
              const cpg = (dest: string) => { if (!fs.existsSync(dest)) fs.copyFileSync(dbPath, dest); };
              const pruneg = (pfx: string, keep: number) => {
                const gfiles = fs.readdirSync(gdriveDir).filter((f: string) => f.startsWith(pfx) && f.endsWith('.db')).sort().reverse();
                for (const f of (gfiles as string[]).slice(keep)) try { fs.unlinkSync(path.join(gdriveDir, f)); } catch(_){}
              };
              cpg(path.join(gdriveDir, `daily-${d}.db`));   pruneg('daily-', 30);
              cpg(path.join(gdriveDir, `weekly-${w}.db`));  pruneg('weekly-', 24);
              cpg(path.join(gdriveDir, `monthly-${m}.db`)); pruneg('monthly-', 6);
              // Save last backup time
              settings.lastGdriveBackup = new Date().toISOString();
              fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            }
          } catch (_) {}
        }
      } catch (_) {}
    });
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
