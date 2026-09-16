import { ipcMain, Notification, safeStorage } from 'electron';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { getDb, writeHistory } from './database';

type AuthStep = 'idle' | 'code' | 'password' | 'connected' | 'error';
type Resolver = (value: string) => void;

let telegramClient: TelegramClient | null = null;
let listenerAttached = false;
let auth: {
  step: AuthStep;
  error?: string;
  resolveCode?: Resolver;
  resolvePassword?: Resolver;
  codeRequested?: Promise<void>;
  passwordRequested?: Promise<void>;
  resolveCodeRequested?: () => void;
  resolvePasswordRequested?: () => void;
  connected?: Promise<void>;
  resolveConnected?: () => void;
  failed?: Promise<void>;
  resolveFailed?: () => void;
} | null = null;

const SETTING = {
  apiId: 'telegram_api_id',
  apiHash: 'telegram_api_hash_encrypted',
  phone: 'telegram_phone',
  session: 'telegram_session_encrypted',
  chatId: 'telegram_chat_id',
  chatTitle: 'telegram_chat_title',
} as const;

function defer() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string | null): void {
  getDb().prepare(`INSERT INTO settings (key,value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Защищённое хранилище Windows недоступно.');
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(value: string | null): string | null {
  if (!value || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { return null; }
}

function config() {
  return {
    apiId: Number(getSetting(SETTING.apiId)) || null,
    apiHash: decrypt(getSetting(SETTING.apiHash)),
    phone: getSetting(SETTING.phone),
    session: decrypt(getSetting(SETTING.session)),
    chatId: getSetting(SETTING.chatId),
    chatTitle: getSetting(SETTING.chatTitle),
  };
}

function state() {
  const current = config();
  return {
    configured: Boolean(current.apiId && current.apiHash && current.phone),
    connected: Boolean(telegramClient && auth?.step === 'connected'),
    running: Boolean(telegramClient && listenerAttached && current.chatId),
    chatId: current.chatId,
    chatTitle: current.chatTitle,
    apiId: current.apiId ? String(current.apiId) : '',
    phone: current.phone || '',
    authStep: auth?.step || 'idle',
  };
}

function extractVinSuffixes(text: string): string[] {
  return [...new Set(text.match(/\b\d{6}\b/g) || [])];
}

function processMessage(chatId: string, messageId: number, text: string): void {
  const configuredChat = config().chatId;
  if (!configuredChat || configuredChat !== chatId) return;
  const vins = extractVinSuffixes(text);
  if (!vins.length) return;
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS telegram_processed_messages (
    chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, processed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(chat_id, message_id)
  )`);
  const known = db.prepare('SELECT 1 FROM telegram_processed_messages WHERE chat_id=? AND message_id=?').get(chatId, messageId);
  if (known) return;
  db.prepare('INSERT INTO telegram_processed_messages (chat_id,message_id) VALUES (?,?)').run(chatId, messageId);

  const arrivedStatus = db.prepare("SELECT id FROM statuses WHERE name='Автомобиль прибыл' AND is_active=1 LIMIT 1").get() as { id: number } | undefined;
  if (!arrivedStatus) return;
  for (const vin of vins) {
    const matches = db.prepare(`
      SELECT o.id AS order_id, o.client_id, o.brand, o.model, c.full_name
      FROM orders o
      JOIN clients c ON c.id=o.client_id
      JOIN statuses s ON s.id=o.order_status_id
      WHERE o.vin=? AND c.is_deleted=0 AND c.is_archived=0 AND s.name='Автомобиль в пути'
    `).all(vin) as { order_id: number; client_id: number; brand: string | null; model: string | null; full_name: string }[];
    if (matches.length !== 1) continue;
    const match = matches[0];
    db.transaction(() => {
      db.prepare("UPDATE orders SET order_status_id=?, updated_at=datetime('now') WHERE id=?").run(arrivedStatus.id, match.order_id);
      db.prepare("UPDATE clients SET status_id=?, is_archived=0, updated_at=datetime('now') WHERE id=?").run(arrivedStatus.id, match.client_id);
      db.prepare(`INSERT INTO reminders (client_id,order_id,title,description,due_date,auto_created)
        VALUES (?,?,?,?,date('now'),1)`).run(
          match.client_id, match.order_id,
          `Позвонить клиенту: автомобиль прибыл — ${match.full_name}`,
          `Telegram: найден VIN ${vin}.`,
        );
    })();
    writeHistory(match.client_id, 'telegram_vin_arrival', `Telegram: VIN ${vin} найден. Автомобиль переведён на этап «Автомобиль прибыл».`);
    new Notification({ title: 'CRM Auto: автомобиль прибыл', body: `${match.full_name} · ${(match.brand || '')} ${(match.model || '')} · VIN ${vin}`.trim() }).show();
  }
}

function attachListener(): void {
  if (!telegramClient || listenerAttached) return;
  telegramClient.addEventHandler((event: any) => {
    const chatId = event?.message?.chatId?.toString();
    const messageId = Number(event?.message?.id);
    const text = String(event?.message?.message || '');
    if (chatId && Number.isInteger(messageId) && text) processMessage(chatId, messageId, text);
  }, new NewMessage({}));
  listenerAttached = true;
}

async function persistAuthenticatedClient(): Promise<void> {
  if (!telegramClient) return;
  setSetting(SETTING.session, encrypt((telegramClient.session as StringSession).save()));
  if (auth) auth.step = 'connected';
  else auth = { step: 'connected' };
  listenerAttached = false;
  attachListener();
}

async function waitForNextStep(): Promise<{ step: AuthStep; error?: string }> {
  if (!auth) return { step: 'error', error: 'Подключение не начато.' };
  await Promise.race([auth.connected!, auth.passwordRequested!, auth.failed!]);
  return { step: auth.step, error: auth.error };
}

export function registerTelegramHandlers(): void {
  ipcMain.handle('telegram:getState', () => state());

  ipcMain.handle('telegram:beginAuth', async (_event, input: { apiId: string; apiHash: string; phone: string }) => {
    const apiId = Number(input.apiId);
    if (!Number.isInteger(apiId) || apiId <= 0 || !input.apiHash.trim() || !input.phone.trim()) {
      return { error: 'Укажите API ID, API Hash и номер телефона.' };
    }
    if (!safeStorage.isEncryptionAvailable()) return { error: 'Защищённое хранилище Windows недоступно.' };
    if (telegramClient) { try { await telegramClient.disconnect(); } catch { /* ignore */ } }
    telegramClient = new TelegramClient(new StringSession(''), apiId, input.apiHash.trim(), { connectionRetries: 5 });
    listenerAttached = false;
    const codeReady = defer(); const passwordReady = defer(); const connected = defer(); const failed = defer();
    auth = {
      step: 'idle', codeRequested: codeReady.promise, passwordRequested: passwordReady.promise,
      connected: connected.promise, failed: failed.promise,
      resolveCodeRequested: codeReady.resolve, resolvePasswordRequested: passwordReady.resolve,
      resolveConnected: connected.resolve, resolveFailed: failed.resolve,
    };
    setSetting(SETTING.apiId, String(apiId));
    setSetting(SETTING.apiHash, encrypt(input.apiHash.trim()));
    setSetting(SETTING.phone, input.phone.trim());
    void telegramClient.start({
      phoneNumber: async () => input.phone.trim(),
      phoneCode: async () => {
        auth!.step = 'code'; auth!.resolveCodeRequested!();
        return new Promise<string>(resolve => { if (auth) auth.resolveCode = resolve; });
      },
      password: async () => {
        auth!.step = 'password'; auth!.resolvePasswordRequested!();
        return new Promise<string>(resolve => { if (auth) auth.resolvePassword = resolve; });
      },
      onError: async error => {
        if (auth) { auth.step = 'error'; auth.error = error.message; auth.resolveFailed!(); }
        return true;
      },
    }).then(async () => {
      await persistAuthenticatedClient();
      connected.resolve();
    }).catch(error => {
      if (auth) { auth.step = 'error'; auth.error = error instanceof Error ? error.message : String(error); auth.resolveFailed!(); }
    });
    await Promise.race([codeReady.promise, failed.promise]);
    return auth?.step === 'error' ? { error: auth.error || 'Не удалось отправить код.' } : { step: 'code' };
  });

  ipcMain.handle('telegram:submitCode', async (_event, code: string) => {
    if (!auth?.resolveCode || auth.step !== 'code') return { error: 'Код сейчас не ожидается.' };
    auth.resolveCode(code.trim()); auth.resolveCode = undefined;
    return waitForNextStep();
  });

  ipcMain.handle('telegram:submitPassword', async (_event, password: string) => {
    if (!auth?.resolvePassword || auth.step !== 'password') return { error: 'Пароль сейчас не ожидается.' };
    auth.resolvePassword(password); auth.resolvePassword = undefined;
    return waitForNextStep();
  });

  ipcMain.handle('telegram:listChats', async () => {
    if (!telegramClient || auth?.step !== 'connected') return { error: 'Сначала подключите Telegram.' };
    const dialogs = await telegramClient.getDialogs({ limit: 200 });
    return dialogs.filter(dialog => dialog.isGroup || dialog.isChannel).map(dialog => ({
      id: dialog.id?.toString() || '', title: dialog.title || dialog.name || 'Без названия',
    })).filter(dialog => dialog.id);
  });

  ipcMain.handle('telegram:selectChat', (_event, chat: { id: string; title: string }) => {
    if (!chat?.id) return { error: 'Выберите группу.' };
    setSetting(SETTING.chatId, chat.id);
    setSetting(SETTING.chatTitle, chat.title || 'Telegram группа');
    attachListener();
    return { success: true };
  });
}

export async function resumeTelegramListener(): Promise<void> {
  const current = config();
  if (!current.apiId || !current.apiHash || !current.session) return;
  try {
    telegramClient = new TelegramClient(new StringSession(current.session), current.apiId, current.apiHash, { connectionRetries: 5 });
    await telegramClient.connect();
    if (await telegramClient.checkAuthorization()) await persistAuthenticatedClient();
  } catch {
    telegramClient = null;
  }
}
