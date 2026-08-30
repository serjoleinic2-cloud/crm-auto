import { AlertTriangle } from 'lucide-react';

interface Props {
  count: number;
  fileName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteFilesModal({ count, fileName, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div className="font-semibold text-gray-900">
            {count > 1 ? `Удалить ${count} файла(ов)?` : 'Удалить файл?'}
          </div>
        </div>
        {fileName && count === 1 && (
          <p className="text-sm text-gray-600 mb-2"><span className="font-medium">{fileName}</span></p>
        )}
        <p className="text-sm text-gray-500 mb-5">
          Файл{count > 1 ? 'ы будут' : ' будет'} физически удал{count > 1 ? 'ены' : 'ён'} с компьютера.
          Восстановить {count > 1 ? 'их' : 'его'} через CRM будет невозможно.
        </p>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="flex-1 btn-danger font-semibold">Удалить</button>
          <button onClick={onCancel} className="flex-1 btn-secondary">Отмена</button>
        </div>
      </div>
    </div>
  );
}
