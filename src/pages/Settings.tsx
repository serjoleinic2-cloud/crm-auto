import { useEffect, useState } from 'react';
import { ipcService } from '../services/ipcService';
import { FolderOpen, FolderInput } from 'lucide-react';

export default function Settings() {
  const [basePath, setBasePath] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPath();
  }, []);

  const loadPath = async () => {
    setLoading(true);
    try {
      const path = await ipcService.files.getBasePath();
      setBasePath(path || '');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFolder = () => {
    ipcService.files.openClientFolder(0, ''); // opens base data folder
  };

  const handlePickFolder = async () => {
    const newPath = await ipcService.files.pickFolder();
    if (newPath) {
      await ipcService.files.setBasePath(newPath);
      setBasePath(newPath);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Настройки</h1>

      <div className="card space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Папка данных CRM</h3>
          <p className="text-sm text-gray-500 mb-3">
            База данных SQLite, документы клиентов и фотографии хранятся в этой папке.
            Она не удаляется при обновлении или переустановке приложения.
          </p>

          {loading ? (
            <div className="text-sm text-gray-400">Загрузка...</div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 font-mono break-all">
              {basePath || 'Не задано'}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button onClick={handleOpenFolder} className="btn-secondary text-sm flex items-center gap-1.5">
              <FolderOpen size={15} /> Открыть папку данных
            </button>
            <button onClick={handlePickFolder} className="btn-primary text-sm flex items-center gap-1.5">
              <FolderInput size={15} /> Выбрать папку
            </button>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="font-semibold text-gray-900 mb-2">О программе</h3>
          <div className="text-sm text-gray-500 space-y-1">
            <p><span className="font-medium text-gray-700">CRM Auto</span> — локальная CRM для менеджера по продаже автомобилей под заказ.</p>
            <p>Все данные хранятся на вашем компьютере и не отправляются в интернет.</p>
            <p className="text-xs text-gray-400 mt-2">Версия 1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  );
}
