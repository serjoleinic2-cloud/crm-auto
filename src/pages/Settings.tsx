import { useEffect, useState } from 'react';
import { ipcService } from '../services/ipcService';
import {
  FolderOpen, Download, Upload, CheckCircle, AlertTriangle,
  Mail, Eye, EyeOff, Send, RefreshCw, HardDrive, Search, FolderInput
} from 'lucide-react';

interface BackupStats {
  email: string;
  hasPassword: boolean;
  lastEmailBackup: string | null;
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
  gdrivePath: string;
  lastGdriveBackup: string | null;
}

interface TelegramState {
  configured: boolean;
  connected: boolean;
  running: boolean;
  chatId: string | null;
  chatTitle: string | null;
  apiId: string;
  phone: string;
  authStep: 'idle' | 'code' | 'password' | 'connected' | 'error';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = () => (window as any).electronAPI;

function formatDt(iso: string | null) {
  if (!iso) return 'никогда';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function Settings() {
  const [basePath, setBasePath] = useState('');
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gdrivePaths, setGdrivePaths] = useState<string[]>([]);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveBackingUp, setGdriveBackingUp] = useState(false);
  const [telegram, setTelegram] = useState<TelegramState | null>(null);
  const [telegramApiId, setTelegramApiId] = useState('');
  const [telegramApiHash, setTelegramApiHash] = useState('');
  const [telegramPhone, setTelegramPhone] = useState('');
  const [telegramCode, setTelegramCode] = useState('');
  const [telegramPassword, setTelegramPassword] = useState('');
  const [telegramChats, setTelegramChats] = useState<{ id: string; title: string }[]>([]);
  const [telegramBusy, setTelegramBusy] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [p, s, telegramState] = await Promise.all([
      ipcService.files.getBasePath(),
      api().backup.getStats(),
      api().telegram.getState(),
    ]);
    setBasePath(p || '');
    setStats(s);
    setEmail(s.email || '');
    setTelegram(telegramState);
    setTelegramApiId(telegramState.apiId || '');
    setTelegramPhone(telegramState.phone || '');
  };

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const handleManualBackup = async () => {
    const r = await api().backup.create();
    if (r?.success) flash('ok', `Копия базы сохранена: ${r.path}`);
    else if (!r?.canceled) flash('err', r?.error ?? 'Ошибка');
  };

  const handleFullBackup = async () => {
    const r = await api().backup.createFull();
    if (r?.success) flash('ok', `Полная копия (база и документы) сохранена: ${r.path}`);
    else if (!r?.canceled) flash('err', r?.error ?? 'Ошибка');
  };

  const handleRestore = async () => {
    if (!confirm('Восстановить данные из резервной копии?\n\nПеред восстановлением текущая БД будет сохранена автоматически.')) return;
    const r = await api().backup.restore();
    if (r?.success) flash('ok', 'Восстановлено. Перезапустите приложение.');
    else if (!r?.canceled) flash('err', r?.error ?? 'Ошибка');
  };

  const handleSaveEmail = async () => {
    if (!email.includes('@gmail.com')) { flash('err', 'Введите Gmail адрес'); return; }
    if (!appPassword && !stats?.hasPassword) { flash('err', 'Введите пароль приложения'); return; }
    setSaving(true);
    try {
      await api().backup.saveEmailSettings({ email, appPassword: appPassword || '' });
      flash('ok', 'Email настройки сохранены');
      load();
    } finally { setSaving(false); }
  };

  const handleSendEmail = async () => {
    setSending(true);
    try {
      const r = await api().backup.sendEmail();
      if (r?.success) { flash('ok', `Копия отправлена на ${stats?.email}`); load(); }
      else flash('err', r?.error ?? 'Ошибка отправки');
    } finally { setSending(false); }
  };

  const handleDetectGdrive = async () => {
    setGdriveLoading(true);
    try {
      const paths = await api().backup.detectGdrive();
      setGdrivePaths(paths);
      if (!paths.length) flash('err', 'Google Drive не найден автоматически. Выберите папку вручную.');
    } finally { setGdriveLoading(false); }
  };

  const handlePickGdrive = async () => {
    const r = await api().backup.pickGdriveFolder();
    if (r?.path) {
      await api().backup.saveGdrivePath(r.path);
      flash('ok', `Папка Google Drive выбрана: ${r.path}`);
      load();
    }
  };

  const handleSelectGdrive = async (p: string) => {
    await api().backup.saveGdrivePath(p);
    flash('ok', 'Папка Google Drive сохранена');
    load();
  };

  const handleGdriveBackup = async () => {
    setGdriveBackingUp(true);
    try {
      const r = await api().backup.copyToGdrive();
      if (r?.success) { flash('ok', 'Копия базы скопирована в Google Drive'); load(); }
      else flash('err', r?.error ?? 'Ошибка');
    } finally { setGdriveBackingUp(false); }
  };

  const handleFullGdriveBackup = async () => {
    setGdriveBackingUp(true);
    try {
      const r = await api().backup.copyFullToGdrive();
      if (r?.success) { flash('ok', 'Полная копия с документами сохранена в Google Drive'); load(); }
      else flash('err', r?.error ?? 'Ошибка');
    } finally { setGdriveBackingUp(false); }
  };

  const loadTelegramChats = async () => {
    const result = await api().telegram.listChats();
    if (result?.error) { flash('err', result.error); return; }
    setTelegramChats(result || []);
  };

  const beginTelegram = async () => {
    setTelegramBusy(true);
    try {
      const result = await api().telegram.beginAuth({ apiId: telegramApiId, apiHash: telegramApiHash, phone: telegramPhone });
      if (result?.error) flash('err', result.error);
      else if (result?.step === 'code') flash('ok', 'Код отправлен в Telegram. Введите его ниже.');
      const next = await api().telegram.getState(); setTelegram(next);
    } finally { setTelegramBusy(false); }
  };

  const submitTelegramCode = async () => {
    setTelegramBusy(true);
    try {
      const result = await api().telegram.submitCode(telegramCode);
      if (result?.error) flash('err', result.error);
      else if (result?.step === 'password') flash('ok', 'Введите пароль двухэтапной защиты Telegram.');
      else if (result?.step === 'connected') { flash('ok', 'Telegram подключён. Выберите группу.'); await loadTelegramChats(); }
      const next = await api().telegram.getState(); setTelegram(next);
    } finally { setTelegramBusy(false); }
  };

  const submitTelegramPassword = async () => {
    setTelegramBusy(true);
    try {
      const result = await api().telegram.submitPassword(telegramPassword);
      if (result?.error) flash('err', result.error);
      else if (result?.step === 'connected') { flash('ok', 'Telegram подключён. Выберите группу.'); await loadTelegramChats(); }
      const next = await api().telegram.getState(); setTelegram(next);
    } finally { setTelegramBusy(false); }
  };

  const selectTelegramChat = async (chat: { id: string; title: string }) => {
    const result = await api().telegram.selectChat(chat);
    if (result?.error) flash('err', result.error);
    else { flash('ok', `Группа «${chat.title}» подключена. Проверка работает и при свёрнутом окне CRM.`); await load(); }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Настройки</h1>

      {msg && (
        <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-xl ${
          msg.type === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {msg.type === 'ok' ? <CheckCircle size={16} className="shrink-0 mt-0.5"/> : <AlertTriangle size={16} className="shrink-0 mt-0.5"/>}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Data folder */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-900">Папка данных</h3>
        <p className="text-sm text-gray-500">База данных, документы клиентов и резервные копии.</p>
        <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 font-mono break-all">{basePath || '...'}</div>
        <button onClick={() => ipcService.files.openBaseFolder()} className="btn-secondary text-sm flex items-center gap-1.5">
          <FolderOpen size={14}/> Открыть в проводнике
        </button>
      </div>

      {/* Telegram VIN monitor */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Send size={16} className="text-sky-600"/> Telegram: VIN-контроль</h3>
            <p className="text-sm text-gray-500 mt-1">CRM читает новые сообщения выбранной группы через ваш личный аккаунт и сопоставляет последние 6 цифр VIN.</p>
          </div>
          {telegram?.running ? (
            <span className="shrink-0 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1">Работает</span>
          ) : (
            <span className="shrink-0 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-full px-2.5 py-1">Не настроено</span>
          )}
        </div>

        {!telegram?.connected ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Получите API ID и API Hash на my.telegram.org → API development tools. Данные и сессия хранятся только на этом компьютере в защищённом виде.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <input className="input" value={telegramApiId} onChange={e => setTelegramApiId(e.target.value)} placeholder="API ID" inputMode="numeric" />
              <input className="input" value={telegramApiHash} onChange={e => setTelegramApiHash(e.target.value)} placeholder="API Hash" />
            </div>
            <div className="flex flex-wrap gap-2">
              <input className="input flex-1 min-w-[190px]" value={telegramPhone} onChange={e => setTelegramPhone(e.target.value)} placeholder="Телефон: +7…" />
              <button onClick={beginTelegram} disabled={telegramBusy} className="btn-save text-sm flex items-center gap-1.5">
                <Send size={14}/> {telegramBusy ? 'Подключение…' : 'Получить код'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-green-800">
              <CheckCircle size={16} className="shrink-0"/> Telegram подключён: {telegram.phone}
            </div>
            {telegram.chatTitle ? (
              <div className="text-sm text-gray-700">Проверяемая группа: <span className="font-medium">{telegram.chatTitle}</span></div>
            ) : (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">Выберите группу, в которую приходят VIN.</div>
            )}
            <button onClick={loadTelegramChats} disabled={telegramBusy} className="btn-secondary text-sm flex items-center gap-1.5">
              <RefreshCw size={14}/> Выбрать группу
            </button>
            {telegramChats.length > 0 && (
              <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {telegramChats.map(chat => (
                  <button key={chat.id} onClick={() => selectTelegramChat(chat)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-sky-50 flex items-center justify-between gap-3">
                    <span className="truncate">{chat.title}</span>
                    {telegram.chatId === chat.id && <CheckCircle size={15} className="text-green-600 shrink-0"/>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {telegram?.authStep === 'code' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <input className="input flex-1 min-w-[180px]" value={telegramCode} onChange={e => setTelegramCode(e.target.value)} placeholder="Код из Telegram" inputMode="numeric" autoFocus />
            <button onClick={submitTelegramCode} disabled={telegramBusy || !telegramCode.trim()} className="btn-save text-sm">Подтвердить код</button>
          </div>
        )}
        {telegram?.authStep === 'password' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <input className="input flex-1 min-w-[180px]" value={telegramPassword} onChange={e => setTelegramPassword(e.target.value)} placeholder="Пароль двухэтапной защиты" type="password" autoFocus />
            <button onClick={submitTelegramPassword} disabled={telegramBusy || !telegramPassword} className="btn-save text-sm">Подтвердить пароль</button>
          </div>
        )}

        <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">При единственном совпадении VIN автомобиля в статусе «Автомобиль в пути» CRM переведёт его в «Автомобиль прибыл», создаст задачу звонка и покажет уведомление. Свернуть окно можно; полностью закрывать CRM нельзя.</p>
      </div>

      {/* Local backup */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Локальные резервные копии</h3>
          <button onClick={load} className="text-gray-400 hover:text-gray-600"><RefreshCw size={14}/></button>
        </div>
        <p className="text-sm text-gray-500">
          Полная копия сохраняет базу и все документы клиентов в одном ZIP-файле.
        </p>
        {stats && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Ежедневных', count: stats.dailyCount, sub: '30 дней' },
              { label: 'Еженедельных', count: stats.weeklyCount, sub: '3 месяца' },
              { label: 'Ежемесячных', count: stats.monthlyCount, sub: '6 месяцев' },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-primary-600">{s.count}</div>
                <div className="text-xs text-gray-600 font-medium">{s.label}</div>
                <div className="text-[10px] text-gray-400">{s.sub}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleFullBackup} className="btn-save text-sm flex items-center gap-1.5">
            <HardDrive size={14}/> Полная копия (ZIP)
          </button>
          <button onClick={handleManualBackup} className="btn-secondary text-sm flex items-center gap-1.5">
            <Download size={14}/> Только база
          </button>
          <button onClick={handleRestore} className="btn-secondary text-sm flex items-center gap-1.5">
            <Upload size={14}/> Восстановить
          </button>
        </div>
      </div>

      {/* Google Drive */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <HardDrive size={16} className="text-blue-500"/> Google Drive
        </h3>

        {stats?.gdrivePath ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
              <CheckCircle size={15} className="text-green-600 shrink-0 mt-0.5"/>
              <div className="text-sm">
                <div className="font-medium text-green-800">Google Drive подключён</div>
                <div className="text-xs text-green-700 font-mono mt-0.5 break-all">{stats.gdrivePath}</div>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Последняя синхронизация: <span className="font-medium text-gray-700">{formatDt(stats.lastGdriveBackup)}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleFullGdriveBackup}
                disabled={gdriveBackingUp}
                className="btn-save text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {gdriveBackingUp
                  ? <><RefreshCw size={14} className="animate-spin"/> Упаковка...</>
                  : <><HardDrive size={14}/> Полная копия с файлами</>}
              </button>
              <button
                onClick={handleGdriveBackup}
                disabled={gdriveBackingUp}
                className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download size={14}/> Только база
              </button>
              <button onClick={handlePickGdrive} className="btn-secondary text-sm flex items-center gap-1.5">
                <FolderInput size={14}/> Сменить папку
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Полная копия — один ZIP с базой и всеми папками клиентов. Она обновляет файл
              <code className="bg-gray-100 px-1 rounded ml-1">crm-full-backup-latest.zip</code> в папке CRM Auto Backups.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Укажи папку Google Drive, затем нажимай «Полная копия с файлами». Google Drive синхронизирует её в облако.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleDetectGdrive}
                disabled={gdriveLoading}
                className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {gdriveLoading
                  ? <><RefreshCw size={14} className="animate-spin"/> Поиск...</>
                  : <><Search size={14}/> Найти автоматически</>}
              </button>
              <button onClick={handlePickGdrive} className="btn-secondary text-sm flex items-center gap-1.5">
                <FolderInput size={14}/> Выбрать вручную
              </button>
            </div>

            {gdrivePaths.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-600">Найдены папки:</div>
                {gdrivePaths.map(p => (
                  <button
                    key={p}
                    onClick={() => handleSelectGdrive(p)}
                    className="w-full text-left text-xs px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-800 font-mono transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gmail backup */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Mail size={16} className="text-red-500"/> Резервная копия на Gmail
          <span className="text-xs font-normal text-gray-400">(дополнительно)</span>
        </h3>
        <p className="text-sm text-gray-500">
          Отправить копию базы данных себе на почту. Нужен <strong>пароль приложения</strong> Google.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1">
          <div className="font-semibold">Как получить пароль приложения:</div>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
            <li>myaccount.google.com → Безопасность</li>
            <li>Включи двухэтапную аутентификацию</li>
            <li>«Пароли приложений» → Создать → Название: CRM Auto</li>
            <li>Скопируй 16-значный код</li>
          </ol>
        </div>
        <div className="space-y-2">
          <div>
            <label className="label text-xs">Gmail адрес</label>
            <input type="email" className="input text-sm" placeholder="example@gmail.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs flex items-center gap-2">
              Пароль приложения {stats?.hasPassword && <span className="text-green-600 text-[10px]">✓ сохранён</span>}
            </label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} className="input text-sm pr-9"
                placeholder={stats?.hasPassword ? '••••••••••••••••' : 'xxxx xxxx xxxx xxxx'}
                value={appPassword} onChange={e => setAppPassword(e.target.value)} />
              <button onClick={() => setShowPass(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>
          <button onClick={handleSaveEmail} disabled={saving} className="btn-save text-sm disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
        {stats?.email && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <div className="text-xs text-gray-500">
              Последняя отправка: <span className="font-medium text-gray-700">{formatDt(stats.lastEmailBackup)}</span>
            </div>
            <button onClick={handleSendEmail} disabled={sending || !stats.hasPassword}
              className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
              {sending ? <><RefreshCw size={14} className="animate-spin"/> Отправка...</> : <><Send size={14}/> Отправить сейчас</>}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-1">О программе</h3>
        <p className="text-sm text-gray-500">CRM Auto — локальная CRM для менеджера по продаже автомобилей под заказ.</p>
        <p className="text-xs text-gray-400 mt-2">Версия 1.3.0</p>
      </div>
    </div>
  );
}

interface BackupStats {
  email: string;
  hasPassword: boolean;
  lastEmailBackup: string | null;
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
}
