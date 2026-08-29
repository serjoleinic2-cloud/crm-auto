import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

export default function Documents() {
  const navigate = useNavigate();
  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-900">Документы</h1>
      </div>
      <div className="card text-center py-12">
        <FileText size={48} className="text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">Генерация документов</p>
        <p className="text-sm text-gray-400 mt-2">Будет реализовано в следующем этапе</p>
      </div>
    </div>
  );
}
