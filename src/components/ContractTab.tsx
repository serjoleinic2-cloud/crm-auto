import { useState, useEffect, useCallback } from 'react';
import { ipcService } from '../services/ipcService';
import { FileText, Save, AlertTriangle, CheckCircle, FolderOpen, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { Client, Order, ClientPassportData, ContractGenerateData } from '../types';

interface ContractTabProps {
  client: Client;
  orders: Order[];
  onHistoryRefresh: () => void;
  onDocumentsRefresh: () => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const EMPTY_PASSPORT: ClientPassportData = {
  client_id: 0,
  birth_date: null,
  inn: null,
  passport_number: null,
  passport_issued_by: null,
  passport_issue_date: null,
  passport_code: null,
  registration_address: null,
};

interface MissingField { label: string }

// ── sub-components ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}

function Field({ label, value, onChange, type = 'text', placeholder, required }: FieldProps) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <input
        type={type}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function ContractTab({ client, orders, onHistoryRefresh, onDocumentsRefresh }: ContractTabProps) {
  const [passport, setPassport] = useState<ClientPassportData>({ ...EMPTY_PASSPORT, client_id: client.id });
  const [passportSaved, setPassportSaved] = useState(false);
  const [passportLoading, setPassportLoading] = useState(true);
  const [passportOpen, setPassportOpen] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<number>(orders[0]?.id ?? 0);
  const [carOpen, setCarOpen] = useState(true);
  const [carForm, setCarForm] = useState<Partial<Order>>({});

  const [contractNumber, setContractNumber] = useState('');
  const [contractDate, setContractDate] = useState(todayISO());
  const [dealAmount, setDealAmount] = useState('');
  const [agentFee, setAgentFee] = useState('100 000 (сто тысяч) рублей');

  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ success: true; filePath: string; fileName: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [savingPassport, setSavingPassport] = useState(false);
  const [savingCar, setSavingCar] = useState(false);

  // Load passport data and next contract number
  useEffect(() => {
    let cancelled = false;
    setPassportLoading(true);
    setLoadError(null);

    async function load() {
      try {
        const [data, nextNumber] = await Promise.all([
          ipcService.contracts.getPassportData(client.id),
          ipcService.contracts.getNextNumber(),
        ]);
        if (cancelled) return;
        if (data) setPassport({ ...data, client_id: client.id });
        setContractNumber(nextNumber);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setPassportLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [client.id]);

  // Sync car form when order changes
  useEffect(() => {
    const order = orders.find(o => o.id === selectedOrderId);
    if (order) {
      setCarForm({ ...order });
      if (order.deal_amount) setDealAmount(order.deal_amount);
      if (order.contract_number) setContractNumber(order.contract_number);
      if (order.contract_date) setContractDate(order.contract_date);
    }
  }, [selectedOrderId, orders]);

  // First order as default
  useEffect(() => {
    if (orders.length && !selectedOrderId) setSelectedOrderId(orders[0].id);
  }, [orders]);

  // ── passport save ──────────────────────────────────────────────────────────

  const savePassport = useCallback(async () => {
    setSavingPassport(true);
    try {
      await ipcService.contracts.savePassportData(client.id, passport);
      setPassportSaved(true);
      setTimeout(() => setPassportSaved(false), 2500);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPassport(false);
    }
  }, [client.id, passport]);

  // ── car form save ──────────────────────────────────────────────────────────

  const saveCar = useCallback(async () => {
    if (!selectedOrderId) return;
    setSavingCar(true);
    try {
      await ipcService.orders.update(selectedOrderId, carForm);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCar(false);
    }
  }, [selectedOrderId, carForm]);

  // ── validation ─────────────────────────────────────────────────────────────

  const getMissing = (): MissingField[] => {
    const missing: MissingField[] = [];
    if (!passport.passport_number?.trim())       missing.push({ label: 'Серия и номер паспорта' });
    if (!passport.passport_issued_by?.trim())    missing.push({ label: 'Кем выдан паспорт' });
    if (!passport.passport_issue_date?.trim())   missing.push({ label: 'Дата выдачи паспорта' });
    if (!passport.registration_address?.trim())  missing.push({ label: 'Адрес регистрации' });
    if (!dealAmount.trim())                       missing.push({ label: 'Сумма сделки' });
    if (!contractNumber.trim())                   missing.push({ label: 'Номер договора' });
    if (!selectedOrderId)                         missing.push({ label: 'Заказ не выбран' });
    const order = orders.find(o => o.id === selectedOrderId);
    if (!order?.brand?.trim() && !order?.model?.trim()) missing.push({ label: 'Марка или модель автомобиля' });
    return missing;
  };

  // ── generate flow ──────────────────────────────────────────────────────────

  const handleGenerateClick = () => {
    setErrorMsg('');
    setResult(null);
    const missing = getMissing();
    if (missing.length > 0) {
      setErrorMsg('__missing__');
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmGenerate = async () => {
    setShowConfirm(false);
    setGenerating(true);
    setErrorMsg('');

    let res: Awaited<ReturnType<typeof ipcService.contracts.generate>>;
    try {
      // Save car form first
      if (selectedOrderId) {
        await ipcService.orders.update(selectedOrderId, {
          ...carForm,
          deal_amount: dealAmount,
          contract_number: contractNumber,
          contract_date: contractDate,
        });
      }

      const data: ContractGenerateData = {
        clientId: client.id,
        orderId: selectedOrderId,
        contractNumber,
        contractDate,
        dealAmount,
        agentFee,
      };

      res = await ipcService.contracts.generate(data);
    } catch (e) {
      setGenerating(false);
      setErrorMsg(e instanceof Error ? e.message : String(e));
      return;
    }

    setGenerating(false);

    if ('error' in res) {
      setErrorMsg(res.error);
    } else {
      setResult(res);
      onHistoryRefresh();
      onDocumentsRefresh();
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  const missing = getMissing();
  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  if (loadError) {
    return (
      <div className="card border border-red-300 bg-red-50 text-red-800 text-sm flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-medium mb-1">Не удалось загрузить данные для договора</p>
          <p className="text-xs text-red-700">{loadError}</p>
        </div>
      </div>
    );
  }

  if (passportLoading) {
    return <div className="text-sm text-gray-500 p-4">Загрузка данных...</div>;
  }

  return (
    <div className="space-y-4">

      {/* ── ORDER SELECT ──────────────────────────────────────────────── */}
      {orders.length > 1 && (
        <div className="card">
          <label className="label">Заказ для договора</label>
          <select
            className="input"
            value={selectedOrderId}
            onChange={e => setSelectedOrderId(Number(e.target.value))}
          >
            {orders.map(o => (
              <option key={o.id} value={o.id}>
                {[o.brand, o.model, o.year].filter(Boolean).join(' ')}
                {o.contract_number ? ` — №${o.contract_number}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {orders.length === 0 && (
        <div className="card text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 flex items-center gap-2">
          <AlertTriangle size={16} />
          Добавьте заказ на вкладке «Заказы» перед созданием договора.
        </div>
      )}

      {/* ── CONTRACT NUMBER / DATE / AMOUNT ───────────────────────────── */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-800 text-sm">Реквизиты договора</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Номер договора"
            value={contractNumber}
            onChange={setContractNumber}
            required
            placeholder="Например: 111"
          />
          <Field
            label="Дата договора"
            value={contractDate}
            onChange={setContractDate}
            type="date"
            required
          />
        </div>
        <Field
          label="Сумма сделки (платёж по поручению)"
          value={dealAmount}
          onChange={setDealAmount}
          required
          placeholder="Например: 2 100 000"
        />
        <Field
          label="Вознаграждение агента (пункт 3.1)"
          value={agentFee}
          onChange={setAgentFee}
          placeholder="100 000 (сто тысяч) рублей"
        />
      </div>

      {/* ── PASSPORT DATA ─────────────────────────────────────────────── */}
      <div className="card">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setPassportOpen(v => !v)}
        >
          <h3 className="font-semibold text-gray-800 text-sm">Паспортные данные клиента</h3>
          {passportOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {passportOpen && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Дата рождения"
                value={passport.birth_date || ''}
                onChange={v => setPassport(p => ({ ...p, birth_date: v }))}
                type="date"
              />
              <Field
                label="ИНН"
                value={passport.inn || ''}
                onChange={v => setPassport(p => ({ ...p, inn: v }))}
                placeholder="12 цифр"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Серия и номер паспорта"
                value={passport.passport_number || ''}
                onChange={v => setPassport(p => ({ ...p, passport_number: v }))}
                required
                placeholder="45 07 369547"
              />
              <Field
                label="Код подразделения"
                value={passport.passport_code || ''}
                onChange={v => setPassport(p => ({ ...p, passport_code: v }))}
                placeholder="772-124"
              />
            </div>
            <Field
              label="Кем выдан"
              value={passport.passport_issued_by || ''}
              onChange={v => setPassport(p => ({ ...p, passport_issued_by: v }))}
              required
              placeholder="ОТДЕЛОМ ВНУТРЕННИХ ДЕЛ..."
            />
            <Field
              label="Дата выдачи"
              value={passport.passport_issue_date || ''}
              onChange={v => setPassport(p => ({ ...p, passport_issue_date: v }))}
              type="date"
              required
            />
            <div>
              <label className="label">Адрес регистрации <span className="text-red-500">*</span></label>
              <textarea
                className="input min-h-[60px] resize-y"
                value={passport.registration_address || ''}
                placeholder="г. Москва, ул. ..., д. ..., кв. ..."
                onChange={e => setPassport(p => ({ ...p, registration_address: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary text-sm flex items-center gap-1"
                onClick={savePassport}
                disabled={savingPassport}
              >
                <Save size={14} />
                {savingPassport ? 'Сохранение...' : 'Сохранить паспортные данные'}
              </button>
              {passportSaved && (
                <span className="text-green-600 text-sm flex items-center gap-1">
                  <CheckCircle size={14} /> Сохранено
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── CAR DETAILS ───────────────────────────────────────────────── */}
      {selectedOrder && (
        <div className="card">
          <button
            className="flex items-center justify-between w-full text-left"
            onClick={() => setCarOpen(v => !v)}
          >
            <h3 className="font-semibold text-gray-800 text-sm">Характеристики автомобиля</h3>
            {carOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {carOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Марка</label>
                  <input className="input" value={carForm.brand || ''} onChange={e => setCarForm(f => ({ ...f, brand: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Модель</label>
                  <input className="input" value={carForm.model || ''} onChange={e => setCarForm(f => ({ ...f, model: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Год выпуска</label>
                  <input className="input" type="number" value={carForm.year || ''} onChange={e => setCarForm(f => ({ ...f, year: parseInt(e.target.value) || null }))} />
                </div>
                <div>
                  <label className="label">Тип кузова</label>
                  <input className="input" value={carForm.body_type || ''} onChange={e => setCarForm(f => ({ ...f, body_type: e.target.value }))} placeholder="Кроссовер" />
                </div>
                <div>
                  <label className="label">Цвет</label>
                  <input className="input" value={carForm.color || ''} onChange={e => setCarForm(f => ({ ...f, color: e.target.value }))} placeholder="Белый" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Объём / мощность двигателя</label>
                  <input className="input" value={carForm.engine || ''} onChange={e => setCarForm(f => ({ ...f, engine: e.target.value }))} placeholder="2.0л / 150 л.с." />
                </div>
                <div>
                  <label className="label">Тип двигателя</label>
                  <input className="input" value={carForm.engine_type || ''} onChange={e => setCarForm(f => ({ ...f, engine_type: e.target.value }))} placeholder="Бензин" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Привод</label>
                  <input className="input" value={carForm.drive || ''} onChange={e => setCarForm(f => ({ ...f, drive: e.target.value }))} placeholder="Полный" />
                </div>
                <div>
                  <label className="label">КПП</label>
                  <input className="input" value={carForm.transmission || ''} onChange={e => setCarForm(f => ({ ...f, transmission: e.target.value }))} placeholder="Автомат" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Комплектация</label>
                  <input className="input" value={carForm.configuration || ''} onChange={e => setCarForm(f => ({ ...f, configuration: e.target.value }))} placeholder="Comfort" />
                </div>
                <div>
                  <label className="label">Пробег (при наличии)</label>
                  <input className="input" value={carForm.mileage || ''} onChange={e => setCarForm(f => ({ ...f, mileage: e.target.value }))} placeholder="0 км" />
                </div>
              </div>
              <div>
                <label className="label">Иное (1.13)</label>
                <input className="input" value={carForm.car_other || ''} onChange={e => setCarForm(f => ({ ...f, car_other: e.target.value }))} placeholder="7 мест, панорамная крыша..." />
              </div>
              <button
                className="btn-secondary text-sm flex items-center gap-1"
                onClick={saveCar}
                disabled={savingCar}
              >
                <Save size={14} />
                {savingCar ? 'Сохранение...' : 'Сохранить характеристики'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── MISSING FIELDS WARNING ────────────────────────────────────── */}
      {errorMsg === '__missing__' && missing.length > 0 && (
        <div className="card border border-yellow-300 bg-yellow-50">
          <div className="flex items-start gap-2 text-yellow-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium mb-1">Для создания договора необходимо заполнить:</p>
              <ul className="text-sm list-disc list-inside space-y-0.5">
                {missing.map(m => <li key={m.label}>{m.label}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── GENERATE ERROR ────────────────────────────────────────────── */}
      {errorMsg && errorMsg !== '__missing__' && (
        <div className="card border border-red-300 bg-red-50 text-red-800 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ── SUCCESS ───────────────────────────────────────────────────── */}
      {result && (
        <div className="card border border-green-300 bg-green-50">
          <div className="flex items-start gap-2 text-green-800 mb-3">
            <CheckCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Договор создан: {result.fileName}</p>
              <p className="text-xs text-green-700 mt-0.5">Файл сохранён в папку клиента и добавлен в документы</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary text-sm flex items-center gap-1"
              onClick={() => ipcService.contracts.openFile(result.filePath)}
            >
              <FileText size={14} /> Открыть договор
            </button>
            <button
              className="btn-secondary text-sm flex items-center gap-1"
              onClick={() => ipcService.files.openClientFolder(client.id, client.full_name)}
            >
              <FolderOpen size={14} /> Открыть папку
            </button>
            <button
              className="btn-secondary text-sm flex items-center gap-1"
              onClick={() => { setResult(null); ipcService.contracts.getNextNumber().then(n => setContractNumber(n)); }}
            >
              <RefreshCw size={14} /> Создать новую версию
            </button>
          </div>
        </div>
      )}

      {/* ── GENERATE BUTTON ───────────────────────────────────────────── */}
      {!result && (
        <button
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
          onClick={handleGenerateClick}
          disabled={generating || orders.length === 0}
        >
          {generating ? (
            <><RefreshCw size={18} className="animate-spin" /> Создаётся договор...</>
          ) : (
            <><FileText size={18} /> Создать договор</>
          )}
        </button>
      )}

      {/* ── CONFIRM MODAL ─────────────────────────────────────────────── */}
      {showConfirm && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Проверьте данные договора</h2>
              <button onClick={() => setShowConfirm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <Row label="Номер договора" value={contractNumber} />
              <Row label="Дата договора" value={contractDate} />
              <Row label="Клиент" value={client.full_name} />
              <Row
                label="Автомобиль"
                value={[selectedOrder.brand, selectedOrder.model, selectedOrder.year ? String(selectedOrder.year) : ''].filter(Boolean).join(' ')}
              />
              <Row label="Сумма сделки" value={dealAmount} />
            </div>
            <div className="flex gap-2 p-4 border-t justify-end">
              <button className="btn-secondary" onClick={() => setShowConfirm(false)}>Отмена</button>
              <button className="btn-primary flex items-center gap-1" onClick={handleConfirmGenerate}>
                <FileText size={14} /> Создать договор
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-36 shrink-0">{label}:</span>
      <span className="font-medium text-gray-900">{value || '—'}</span>
    </div>
  );
}
