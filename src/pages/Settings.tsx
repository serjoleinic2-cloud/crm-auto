import { useEffect, useState } from 'react';
import { ipcService } from '../services/ipcService';
import { FolderOpen, FolderInput, Download, Upload, CheckCircle, AlertTriangle } from 'lucide-react';

export default function Settings() {
  const [basePath, setBasePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [backupMsg, setBackupMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => { loadPath(); }, []);

  const loadPath = async () => {
    setLoading(true);
    try {
      const path = await ipcService.files.getBasePath();
      setBasePath(path || '');
    } finally {
      setLoading(false);
    }
  };

  const msg = (type: 'ok' | 'err', text: string) => {
    setBackupMsg({ type, text });
    setTimeout(() => setBackupMsg(null), 4000);
  };

  const handleBackup = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).electronAPI;
    const result = await api.backup.create();
    if (result?.success) msg('ok', `Резервная копия сохранена: ${result.path}`);
    else if (!result?.canceled) msg('err', result?.error ?? 'Ошибка');
  };

  const handleRestore = async () => {
    if (!confirm('Восстановить данные из резервной копии?\n\nТекущая версия базы данных будет сохранена автоматически перед восстановлением.')) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).electronAPI;
    const result = await api.backup.restore();
    if (result?.success) {
      msg('ok', 'База данных восстановлена. Перезапустите приложение.');
    } else if (!result?.canceled) msg('err', result?.error ?? 'Ошибка');
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>

      {/* Storage path */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-900">Папка данных CRM</h3>
        <p className="text-sm text-gray-500">
          База данных SQLite, документы клиентов и резервные копии хранятся здесь.
          Папка не удаляется при обновлении приложения.
        </p>
        {loading ? (
          <div className="text-sm text-gray-400">Загрузка...</div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 font-mono break-all">{basePath || 'Не задано'}</div>
        )}
        <div className="flex gap-2">
          <button onClick={() => ipcService.files.openClientFolder(0, '')} className="btn-secondary text-sm flex items-center gap-1.5">
            <FolderOpen size={15} /> Открыть папку
          </button>
          <button onClick={async () => {
            const newPath = await ipcService.files.pickFolder();
            if (newPath) { await ipcService.files.setBasePath(newPath); setBasePath(newPath); }
          }} className="btn-primary text-sm flex items-center gap-1.5">
            <FolderInput size={15} /> Выбрать папку
          </button>
        </div>
      </div>

      {/* Backup */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-900">Резервное копирование</h3>
        <p className="text-sm text-gray-500">
          CRM автоматически создаёт ежедневную резервную копию при каждом запуске и хранит последние 7 копий
          в папке <span className="font-mono text-xs">auto-backups</span> внутри папки данных.
          Дополнительно можно сохранить копию вручную в любое место.
        </p>

        {backupMsg && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            backupMsg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {backupMsg.type === 'ok' ? <CheckCircle size={15}/> : <AlertTriangle size={15}/>}
            {backupMsg.text}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleBackup} className="btn-primary text-sm flex items-center gap-1.5">
            <Download size={15} /> Сохранить копию
          </button>
          <button onClick={handleRestore} className="btn-secondary text-sm flex items-center gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50">
            <Upload size={15} /> Восстановить из копии
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-2">О программе</h3>
        <div className="text-sm text-gray-500 space-y-1">
          <p><span className="font-medium text-gray-700">CRM Auto</span> — локальная CRM для менеджера по продаже автомобилей под заказ.</p>
          <p>Все данные хранятся на вашем компьютере и не отправляются в интернет.</p>
          <p className="text-xs text-gray-400 mt-2">Версия 1.2.0</p>
        </div>
      </div>
    </div>
  );
}
