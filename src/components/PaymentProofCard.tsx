import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Trash2, Upload } from 'lucide-react';
import { ipcService } from '../services/ipcService';
import type { ClientDocument, Order, PaymentInstallment } from '../types';
import { formatMoneyInput, parseMoneyInput } from '../utils/formatters';

interface Props {
  doc: ClientDocument;
  orders: Order[];
  onChanged: () => void;
  onOrdersRefresh: () => void;
  onHistoryRefresh: () => void;
  onClientRefresh: () => void;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export default function PaymentProofCard({
  doc,
  orders,
  onChanged,
  onOrdersRefresh,
  onHistoryRefresh,
  onClientRefresh,
}: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id ?? 0);
  const [mode, setMode] = useState<'single' | 'installments'>('single');
  const [payments, setPayments] = useState<PaymentInstallment[]>([]);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [receiptPath, setReceiptPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locallyConfirmed, setLocallyConfirmed] = useState(false);
  const [ftsReserve, setFtsReserve] = useState('');
  const [reserveSaved, setReserveSaved] = useState(false);

  useEffect(() => {
    if (!orders.length) {
      setSelectedOrderId(0);
      return;
    }
    if (!orders.some(order => order.id === selectedOrderId)) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrderId]);

  useEffect(() => {
    const order = orders.find(item => item.id === selectedOrderId);
    setFtsReserve(order?.fts_reserve ? formatMoneyInput(String(order.fts_reserve)) : '');
  }, [selectedOrderId, orders]);

  useEffect(() => {
    let cancelled = false;
    setLocallyConfirmed(false);
    setError('');
    if (!selectedOrderId) {
      setPayments([]);
      return () => { cancelled = true; };
    }
    ipcService.payments.getByOrder(selectedOrderId)
      .then(data => {
        if (!cancelled) {
          setMode(data.mode);
          setPayments(data.items);
          setLocallyConfirmed(data.items.some(item => item.is_final === 1));
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [selectedOrderId, orders]);

  const selectedOrder = orders.find(order => order.id === selectedOrderId);
  const confirmed = locallyConfirmed;
  const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const contractTotal = Number(selectedOrder?.price ?? 0);
  const ftsReserveValue = Math.max(0, parseMoneyInput(ftsReserve) || 0);
  const companyTarget = Math.max(0, contractTotal - ftsReserveValue);
  const remainingToCompany = Math.max(0, companyTarget - paidTotal);
  const latestPayment = payments[payments.length - 1];
  const receiptName = receiptPath.split(/[\\/]/).pop() || '';
  const paymentFilePaths = useMemo(
    () => new Set(payments.map(payment => payment.file_path).filter(Boolean)),
    [payments],
  );
  const olderUnlinkedFiles = doc.files.filter(file => !paymentFilePaths.has(file.file_path));

  const refreshPaymentData = async () => {
    if (!selectedOrderId) return;
    const data = await ipcService.payments.getByOrder(selectedOrderId);
    setMode(data.mode);
    setPayments(data.items);
    setLocallyConfirmed(data.items.some(item => item.is_final === 1));
  };

  const saveFtsReserve = async () => {
    if (!selectedOrderId) return;
    const value = Math.max(0, parseMoneyInput(ftsReserve) || 0);
    if (contractTotal > 0 && value > contractTotal) {
      setError('Резерв ФТС не может быть больше стоимости автомобиля.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await ipcService.orders.update(selectedOrderId, { fts_reserve: value || null });
      setReserveSaved(true);
      setTimeout(() => setReserveSaved(false), 1800);
      onOrdersRefresh();
      onHistoryRefresh();
    } finally {
      setBusy(false);
    }
  };

  const changeMode = async (nextMode: 'single' | 'installments') => {
    if (!selectedOrderId || confirmed) return;
    setBusy(true);
    setError('');
    try {
      const result = await ipcService.payments.setMode(selectedOrderId, nextMode);
      if (result.error) setError(result.error);
      else setMode(nextMode);
    } finally {
      setBusy(false);
    }
  };

  const selectReceipt = async () => {
    const files = await ipcService.files.pickFiles({ multi: false });
    if (files[0]) setReceiptPath(files[0]);
  };

  const addPayment = async () => {
    const parsedAmount = parseMoneyInput(amount);
    if (!selectedOrderId) {
      setError('Сначала выберите заказ.');
      return;
    }
    if (!parsedAmount || !paidAt || !receiptPath) {
      setError('Укажите сумму, дату платежа и выберите файл чека.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await ipcService.payments.add({
        order_id: selectedOrderId,
        amount: parsedAmount,
        paid_at: paidAt,
        receipt_path: receiptPath,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      await refreshPaymentData();
      setAmount('');
      setReceiptPath('');
      onChanged();
      onOrdersRefresh();
      onHistoryRefresh();
    } finally {
      setBusy(false);
    }
  };

  const deletePayment = async (id: number) => {
    if (!window.confirm('Удалить запись этого платежа? Сам файл останется в папке клиента.')) return;
    setBusy(true);
    setError('');
    try {
      const result = await ipcService.payments.delete(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      await refreshPaymentData();
      onChanged();
      onOrdersRefresh();
      onHistoryRefresh();
    } finally {
      setBusy(false);
    }
  };

  const confirmFinalPayment = async (payment: PaymentInstallment) => {
    const question = 'Подтвердить, что это последний платёж, полученный нами, и автомобиль можно переводить на следующий этап? Резерв ФТС клиент внесёт позднее.';
    if (!window.confirm(question)) return;
    setBusy(true);
    setError('');
    try {
      const result = await ipcService.payments.confirmFinal(payment.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPayments(items => items.map(item => ({ ...item, is_final: item.id === payment.id ? 1 : 0 })));
      setLocallyConfirmed(true);
      onChanged();
      onOrdersRefresh();
      onHistoryRefresh();
      onClientRefresh();
    } finally {
      setBusy(false);
    }
  };

  const badge = confirmed
    ? { label: 'Получен · оплачено', className: 'bg-green-100 text-green-700' }
    : payments.length
      ? { label: mode === 'installments' ? 'Получен · частично' : 'Чек получен', className: 'bg-amber-100 text-amber-700' }
      : { label: 'Не получен', className: 'bg-gray-100 text-gray-600' };

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-gray-900">{doc.name}</h4>
          <p className="text-[11px] text-gray-500">Каждый чек сохраняется с суммой и датой оплаты.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
      </div>

      {!orders.length ? (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-700">Сначала создайте заказ для клиента.</div>
      ) : (
        <>
          {orders.length > 1 && (
            <div>
              <label className="label text-xs">Заказ</label>
              <select className="input text-sm" value={selectedOrderId} onChange={event => setSelectedOrderId(Number(event.target.value))}>
                {orders.map(order => (
                  <option key={order.id} value={order.id}>
                    {[order.brand, order.model].filter(Boolean).join(' ') || 'Автомобиль'}{order.contract_number ? ` · договор №${order.contract_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || confirmed} onClick={() => changeMode('single')} className={`rounded-lg border px-3 py-1.5 text-sm ${mode === 'single' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'} disabled:opacity-60`}>
              Оплата разом
            </button>
            <button type="button" disabled={busy || confirmed} onClick={() => changeMode('installments')} className={`rounded-lg border px-3 py-1.5 text-sm ${mode === 'installments' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'} disabled:opacity-60`}>
              Оплата частями
            </button>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-2.5">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="label text-xs">Резерв ФТС — клиент внесёт в личном кабинете позже</label>
                <input
                  className="input text-sm"
                  inputMode="numeric"
                  value={ftsReserve}
                  onChange={event => setFtsReserve(formatMoneyInput(event.target.value))}
                  placeholder="Например: 400 000"
                />
              </div>
              <button type="button" onClick={saveFtsReserve} disabled={busy} className="btn-save h-9 shrink-0 text-sm">Сохранить</button>
            </div>
            {reserveSaved && <p className="mt-1 text-[11px] text-green-600">✓ Резерв ФТС сохранён</p>}
            <p className="mt-1 text-[11px] text-gray-500">Эта сумма не входит в платёж нам и не блокирует запуск сделки.</p>
          </div>

          {!confirmed && (
            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">Дата оплаты</label>
                  <input type="date" className="input text-sm" value={paidAt} onChange={event => setPaidAt(event.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Сумма</label>
                  <input className="input text-sm" inputMode="numeric" value={amount} onChange={event => setAmount(formatMoneyInput(event.target.value))} placeholder="0" />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="label text-xs">Файл чека</label>
                  <button
                    type="button"
                    onClick={selectReceipt}
                    className="flex h-9 w-full items-center gap-1.5 overflow-hidden rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    <Upload size={14} className="shrink-0" />
                    <span className="truncate">{receiptName || 'Выбрать файл чека'}</span>
                  </button>
                </div>
                <button type="button" onClick={addPayment} disabled={busy} className="btn-save h-9 shrink-0 text-sm">
                  {busy ? 'Добавление…' : 'Добавить платёж'}
                </button>
              </div>
            </div>
          )}

          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

          {payments.length === 0 ? (
            <div className="rounded-lg bg-gray-50 py-3 text-center text-xs text-gray-400">Чеки ещё не добавлены</div>
          ) : (
            <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
              {payments.map(payment => (
                <div key={payment.id} className="space-y-1.5 px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-600">{new Date(payment.paid_at + 'T00:00:00').toLocaleDateString('ru-RU')}</span>
                    <span className="font-medium">{formatMoneyInput(String(payment.amount))} ₽</span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => payment.file_path && ipcService.files.openFile(payment.file_path)} className="min-w-0 flex-1 truncate text-left text-blue-600 hover:underline">
                      {payment.file_name || 'Открыть чек'}
                    </button>
                    {payment.is_final ? (
                      <span className="whitespace-nowrap rounded bg-green-100 px-2 py-1 text-[11px] text-green-700">Последний · подтверждён</span>
                    ) : (
                      <>
                        <button type="button" disabled={busy} onClick={() => confirmFinalPayment(payment)} className="whitespace-nowrap rounded bg-green-50 px-2 py-1 text-[11px] text-green-700 hover:bg-green-100">
                          {mode === 'installments' ? 'Последний платёж' : 'Подтвердить оплату'}
                        </button>
                        <button type="button" disabled={busy} onClick={() => deletePayment(payment.id)} className="rounded bg-red-50 p-1.5 text-red-500 hover:bg-red-100" title="Удалить запись">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {olderUnlinkedFiles.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="mb-1.5 text-[11px] text-amber-800">Ранее прикреплённые чеки без суммы и даты:</p>
              <div className="flex flex-wrap gap-2">
                {olderUnlinkedFiles.map(file => (
                  <button key={file.id} type="button" onClick={() => ipcService.files.openFile(file.file_path)} className="flex max-w-full items-center gap-1 truncate text-xs text-blue-700 hover:underline">
                    <ExternalLink size={11} className="shrink-0" /> <span className="truncate">{file.original_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-500">
            {mode === 'installments'
              ? 'Добавляйте каждый чек отдельно. Полная оплата фиксируется только кнопкой «Последний платёж».'
              : 'Добавьте чек и подтвердите полную оплату.'}
          </p>
        </>
      )}
    </div>
  );
}
