import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { initDatabase } from './ipc/database';
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
  registerMessagingHandlers();
  registerFilesHandlers();
  registerDocumentsHandlers();
  registerBackupHandlers();
  registerOrderStatusesHandlers();
  registerRemindersHandlers();
  registerContractsHandlers();
  createWindow();

  // Auto-backup daily on launch (silent, keeps 7 days)
  setTimeout(() => {
    const { getBasePath } = require('./ipc/storagePaths');
    const { getDb } = require('./ipc/database');
    try {
      const fs = require('fs');
      const path = require('path');
      const basePath = getBasePath();
      const dbPath = path.join(basePath, 'crm.db');
      if (!fs.existsSync(dbPath)) return;
      const backupsDir = path.join(basePath, 'auto-backups');
      fs.mkdirSync(backupsDir, { recursive: true });
      const ts = new Date().toISOString().slice(0, 10);
      const dest = path.join(backupsDir, `crm-${ts}.db`);
      if (!fs.existsSync(dest)) fs.copyFileSync(dbPath, dest);
      const files = fs.readdirSync(backupsDir).filter((f: string) => f.endsWith('.db')).sort().reverse();
      for (const f of files.slice(7)) fs.unlinkSync(path.join(backupsDir, f));
    } catch (_) { /* silent */ }
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
