import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcService } from '../services/ipcService';
import type { Client } from '../types';
import { ArrowLeft, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatDateTime } from '../utils/formatters';

export default function Trash() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ type: 'delete'; client: Client } | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await ipcService.clients.getAll({ trash: true } as Parameters<typeof ipcService.clients.getAll>[0]);
    setClients(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (client: Client) => {
    await ipcService.clients.restore(client.id);
    await load();
  };

  const handleDeleteForever = async (client: Client) => {
    await ipcService.clients.deleteForever(client.id);
    setConfirm(null);
    await load();
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-900">Корзина</h1>
        {clients.length > 0 && (
          <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">{clients.length}</span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Загрузка...</div>
      ) : clients.length === 0 ? (
        <div className="card text-center py-12">
          <Trash2 size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Корзина пуста</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">
            Клиенты в корзине можно восстановить или удалить окончательно вместе со всеми данными.
          </p>
          <div className="space-y-2">
            {clients.map(c => (
              <div key={c.id} className="card flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{c.full_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                    {c.phone && <span>{c.phone}</span>}
                    {c.car && c.car.trim() && <span>{c.car}</span>}
                    {c.deleted_at && <span>Удалён: {formatDateTime(c.deleted_at)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRestore(c)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                  >
                    <RotateCcw size={13} /> Восстановить
                  </button>
                  <button
                    onClick={() => setConfirm({ type: 'delete', client: c })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 size={13} /> Удалить навсегда
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Удалить окончательно?</div>
                <div className="text-sm text-gray-500 mt-0.5">{confirm.client.full_name}</div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Будут удалены все данные клиента: заказы, контакты, история, документы.
              Восстановить невозможно.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteForever(confirm.client)}
                className="flex-1 btn-danger font-semibold">
                Удалить навсегда
              </button>
              <button onClick={() => setConfirm(null)} className="flex-1 btn-secondary">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
