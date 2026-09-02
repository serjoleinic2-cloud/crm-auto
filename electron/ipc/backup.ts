import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getBasePath } from './storagePaths';

// ── helpers ────────────────────────────────────────────────────────────────

function getWeekNumber(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function pruneFiles(dir: string, prefix: string, keep: number) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.db'))
      .sort().reverse();
    for (const f of files.slice(keep)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    }
  } catch (_) {}
}

// ── settings ───────────────────────────────────────────────────────────────

function getSettingsPath() {
  return path.join(getBasePath(), 'crm-settings.json');
}

function loadSettings(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8')); }
  catch (_) { return {}; }
}

function saveSettings(data: Record<string, string>) {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify({ ...loadSettings(), ...data }, null, 2));
  } catch (_) {}
}

// ── Google Drive path detection ────────────────────────────────────────────

function detectGoogleDrivePaths(): string[] {
  const home = os.homedir();
  const candidates: string[] = [];

  if (process.platform === 'win32') {
    // Google Drive for Desktop — Windows
    // Обычно монтируется как G:\ или отдельный диск
    for (const drive of ['G', 'H', 'I', 'D', 'E', 'F']) {
      candidates.push(`${drive}:\\My Drive`);
      candidates.push(`${drive}:\\Мой диск`);
    }
    // Старый Google Drive (Backup and Sync)
    candidates.push(path.join(home, 'Google Drive'));
    candidates.push(path.join(home, 'Гугл Диск'));
    // Google Drive for Desktop — папка внутри пользователя
    candidates.push(path.join(home, 'Google Drive', 'My Drive'));
    candidates.push(path.join(home, 'Google Drive (My Drive)'));
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(home, 'Google Drive', 'My Drive'));
    candidates.push(path.join(home, 'Google Drive'));
    candidates.push('/Volumes/GoogleDrive/My Drive');
    candidates.push('/Volumes/Google Drive/My Drive');
  } else {
    candidates.push(path.join(home, 'Google Drive'));
    candidates.push(path.join(home, 'GoogleDrive'));
  }

  return candidates.filter(p => {
    try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
  });
}

// ── handlers ───────────────────────────────────────────────────────────────

export function registerBackupHandlers(): void {

  // Manual backup → save dialog
  ipcMain.handle('backup:create', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const dbPath = path.join(getBasePath(), 'crm.db');
    if (!fs.existsSync(dbPath)) return { error: 'База данных не найдена' };

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const result = await dialog.showSaveDialog(win as BrowserWindow, {
      title: 'Сохранить резервную копию',
      defaultPath: `crm-backup-${ts}.db`,
      filters: [{ name: 'База данных CRM', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      fs.copyFileSync(dbPath, result.filePath);
      return { success: true, path: result.filePath };
    } catch (err) {
      return { error: `Ошибка: ${(err as Error).message}` };
    }
  });

  // Restore from file
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
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, path.join(basePath, `crm-before-restore-${ts}.db`));
      }
      fs.copyFileSync(result.filePaths[0], dbPath);
      return { success: true };
    } catch (err) {
      return { error: `Ошибка: ${(err as Error).message}` };
    }
  });

  // Auto-backup: daily×30, weekly×12, monthly×12
  ipcMain.handle('backup:auto', () => {
    try {
      const basePath = getBasePath();
      const dbPath = path.join(basePath, 'crm.db');
      if (!fs.existsSync(dbPath)) return;
      const dir = path.join(basePath, 'auto-backups');
      fs.mkdirSync(dir, { recursive: true });
      const now = new Date();
      const d = now.toISOString().slice(0, 10);
      const w = getWeekNumber(now);
      const m = now.toISOString().slice(0, 7);

      const daily = path.join(dir, `daily-${d}.db`);
      if (!fs.existsSync(daily)) { fs.copyFileSync(dbPath, daily); }
      pruneFiles(dir, 'daily-', 30);

      const weekly = path.join(dir, `weekly-${w}.db`);
      if (!fs.existsSync(weekly)) { fs.copyFileSync(dbPath, weekly); }
      pruneFiles(dir, 'weekly-', 12);

      const monthly = path.join(dir, `monthly-${m}.db`);
      if (!fs.existsSync(monthly)) { fs.copyFileSync(dbPath, monthly); }
      pruneFiles(dir, 'monthly-', 6);

      return { success: true };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  // Settings: save/load gmail
  ipcMain.handle('backup:saveEmailSettings', (_e, settings: { email: string; appPassword: string }) => {
    saveSettings({ gmailEmail: settings.email, gmailAppPassword: settings.appPassword });
    return true;
  });

  ipcMain.handle('backup:loadEmailSettings', () => {
    const s = loadSettings();
    return { email: s.gmailEmail ?? '', hasPassword: !!s.gmailAppPassword };
  });

  // Send backup to Gmail
  ipcMain.handle('backup:sendEmail', async () => {
    const settings = loadSettings();
    if (!settings.gmailEmail || !settings.gmailAppPassword) {
      return { error: 'Email и пароль приложения не настроены' };
    }
    const dbPath = path.join(getBasePath(), 'crm.db');
    if (!fs.existsSync(dbPath)) return { error: 'База данных не найдена' };

    try {
      // Dynamic import to avoid bundling issues
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        service: 'gmail',
        auth: {
          user: settings.gmailEmail,
          pass: settings.gmailAppPassword,
        },
      });

      const ts = new Date().toLocaleDateString('ru-RU');
      const filename = `crm-backup-${new Date().toISOString().slice(0,10)}.db`;

      await transporter.sendMail({
        from: settings.gmailEmail,
        to: settings.gmailEmail,
        subject: `📦 CRM Auto — резервная копия ${ts}`,
        text: `Автоматическая резервная копия базы данных CRM Auto от ${ts}.\n\nДля восстановления: Настройки → Восстановить из копии.`,
        attachments: [{
          filename,
          content: fs.readFileSync(dbPath),
        }],
      });

      saveSettings({ lastEmailBackup: new Date().toISOString() });
      return { success: true };
    } catch (err) {
      return { error: `Ошибка отправки: ${(err as Error).message}` };
    }
  });

  // Get last email backup date
  ipcMain.handle('backup:getStats', () => {
    const s = loadSettings();
    const basePath = getBasePath();
    const dir = path.join(basePath, 'auto-backups');
    let dailyCount = 0, weeklyCount = 0, monthlyCount = 0;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.db'));
      dailyCount   = files.filter(f => f.startsWith('daily-')).length;
      weeklyCount  = files.filter(f => f.startsWith('weekly-')).length;
      monthlyCount = files.filter(f => f.startsWith('monthly-')).length;
    } catch (_) {}
    return {
      email: s.gmailEmail ?? '',
      hasPassword: !!s.gmailAppPassword,
      lastEmailBackup: s.lastEmailBackup ?? null,
      dailyCount,
      weeklyCount,
      monthlyCount,
      gdrivePath: s.gdrivePath ?? '',
      lastGdriveBackup: s.lastGdriveBackup ?? null,
    };
  });

  // Detect Google Drive folder automatically
  ipcMain.handle('backup:detectGdrive', () => {
    return detectGoogleDrivePaths();
  });

  // Pick Google Drive folder manually
  ipcMain.handle('backup:pickGdriveFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Выбрать папку Google Drive',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { path: result.filePaths[0] };
  });

  // Save Google Drive path
  ipcMain.handle('backup:saveGdrivePath', (_e, gdrivePath: string) => {
    saveSettings({ gdrivePath });
    return true;
  });

  // Copy backup to Google Drive folder
  ipcMain.handle('backup:copyToGdrive', () => {
    const s = loadSettings();
    if (!s.gdrivePath) return { error: 'Папка Google Drive не настроена' };
    if (!fs.existsSync(s.gdrivePath)) return { error: `Папка не найдена: ${s.gdrivePath}` };

    const dbPath = path.join(getBasePath(), 'crm.db');
    if (!fs.existsSync(dbPath)) return { error: 'База данных не найдена' };

    try {
      const gdriveDir = path.join(s.gdrivePath, 'CRM Auto Backups');
      fs.mkdirSync(gdriveDir, { recursive: true });

      const now = new Date();
      const d = now.toISOString().slice(0, 10);
      const w = getWeekNumber(now);
      const m = now.toISOString().slice(0, 7);

      // Same rotation logic but in Google Drive
      const daily = path.join(gdriveDir, `daily-${d}.db`);
      if (!fs.existsSync(daily)) fs.copyFileSync(dbPath, daily);
      pruneFiles(gdriveDir, 'daily-', 30);

      const weekly = path.join(gdriveDir, `weekly-${w}.db`);
      if (!fs.existsSync(weekly)) fs.copyFileSync(dbPath, weekly);
      pruneFiles(gdriveDir, 'weekly-', 24); // 6 months

      const monthly = path.join(gdriveDir, `monthly-${m}.db`);
      if (!fs.existsSync(monthly)) fs.copyFileSync(dbPath, monthly);
      pruneFiles(gdriveDir, 'monthly-', 6);

      saveSettings({ lastGdriveBackup: new Date().toISOString() });
      return { success: true, gdriveDir };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });
}
