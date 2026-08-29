import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-900">Настройки</h1>
      </div>
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <SettingsIcon size={20} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">Общие настройки</h2>
        </div>
        <p className="text-sm text-gray-500">Настройки статусов, справочников и резервных копий будут добавлены в следующем этапе.</p>
      </div>
    </div>
  );
}
