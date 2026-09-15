import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart2, Car, CheckCircle2, CircleDollarSign, Wrench } from 'lucide-react';
import { ipcService } from '../services/ipcService';
import type { StatisticsMonthlyPoint, StatisticsSummary } from '../types';

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`;
}

function MiniBarChart({
  title,
  subtitle,
  points,
  valueKey,
  colorClass,
}: {
  title: string;
  subtitle: string;
  points: StatisticsMonthlyPoint[];
  valueKey: 'salesAmount' | 'extrasAmount';
  colorClass: string;
}) {
  const max = Math.max(1, ...points.map(point => point[valueKey]));

  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="flex h-44 items-end gap-2 border-b border-gray-100 pb-1">
        {points.map(point => {
          const value = point[valueKey];
          const height = value > 0 ? Math.max(8, (value / max) * 100) : 2;
          return (
            <div key={point.month} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1 text-center">
              <div className="whitespace-nowrap text-[10px] text-gray-500">{value > 0 ? formatMoney(value) : '—'}</div>
              <div
                className={`rounded-t-md transition-all ${colorClass}`}
                style={{ height: `${height}%` }}
                title={`${point.label}: ${formatMoney(value)}`}
              />
              <div className="truncate text-[10px] text-gray-500">{point.label.split(' ')[0]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageChart({ stages }: { stages: StatisticsSummary['stages'] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Авто в работе</h2>
        <p className="mt-0.5 text-xs text-gray-500">Текущие этапы оплаченных автомобилей</p>
      </div>
      {total === 0 ? (
        <div className="flex h-36 items-center justify-center text-sm text-gray-400">Нет автомобилей в работе</div>
      ) : (
        <>
          <div className="flex h-4 overflow-hidden rounded-full bg-gray-100">
            {stages.map(stage => (
              <div
                key={stage.name}
                style={{ width: `${(stage.count / total) * 100}%`, backgroundColor: stage.color }}
                title={`${stage.name}: ${stage.count}`}
              />
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {stages.map(stage => {
              const percent = Math.round((stage.count / total) * 100);
              return (
                <div key={stage.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="flex-1 text-gray-600">{stage.name}</span>
                  <span className="font-medium text-gray-900">{stage.count}</span>
                  <span className="w-9 text-right text-gray-400">{percent}%</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function Statistics() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth);
  const [orderId, setOrderId] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [summary, setSummary] = useState<StatisticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ipcService.statistics.getSummary(month, { orderId: orderId ? Number(orderId) : null, brand: brand || null, model: model || null })
      .then(data => { if (active) setSummary(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, orderId, brand, model]);

  const stats = summary?.selected;
  const brands = [...new Set((summary?.vehicles ?? []).map(vehicle => vehicle.brand).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ru'));
  const models = [...new Set((summary?.vehicles ?? []).filter(vehicle => !brand || vehicle.brand === brand).map(vehicle => vehicle.model).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ru'));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900" title="Назад"><ArrowLeft size={20} /></button>
        <div className="min-w-40 flex-1">
          <h1 className="text-xl font-bold text-gray-900">Статистика</h1>
          <p className="mt-0.5 text-sm text-gray-500">Результаты за {summary?.monthLabel ?? 'выбранный месяц'}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input
            type="month"
            className="input w-full text-sm sm:w-36"
            value={month}
            onChange={event => setMonth(event.target.value || currentMonth())}
            aria-label="Месяц статистики"
          />
          <select
            className="input w-full text-sm sm:w-40"
            value={brand}
            onChange={event => { setBrand(event.target.value); setModel(''); setOrderId(''); }}
            aria-label="Марка автомобиля"
          >
            <option value="">Все марки</option>
            {brands.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select
            className="input w-full text-sm sm:w-52"
            value={model}
            onChange={event => { setModel(event.target.value); setOrderId(''); }}
            aria-label="Модель автомобиля"
          >
            <option value="">Все модели</option>
            {models.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select
            className="input w-full text-sm sm:w-80"
            value={orderId}
            onChange={event => setOrderId(event.target.value)}
            aria-label="Автомобиль из заказов"
          >
            <option value="">Все автомобили</option>
            {(summary?.vehicles ?? []).map(vehicle => (
              <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && !summary ? (
        <div className="card flex min-h-64 items-center justify-center text-gray-400">
          <BarChart2 size={28} className="mr-2" /> Загрузка статистики…
        </div>
      ) : !stats || !summary ? (
        <div className="card flex min-h-64 items-center justify-center text-gray-400">Не удалось загрузить статистику</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card border border-blue-100 bg-blue-50/50">
              <Car size={19} className="text-blue-600" />
              <div className="mt-3 text-2xl font-bold text-gray-900">{stats.ordered}</div>
              <div className="text-sm text-gray-600">Заказано авто</div>
              <div className="mt-1 text-[11px] text-gray-400">заказы, не карточки клиентов</div>
            </div>
            <div className="card border border-emerald-100 bg-emerald-50/50">
              <CheckCircle2 size={19} className="text-emerald-600" />
              <div className="mt-3 text-2xl font-bold text-gray-900">{stats.issued}</div>
              <div className="text-sm text-gray-600">Выдано авто</div>
              <div className="mt-1 text-[11px] text-emerald-700">{stats.issuedPercent}% от заказанных</div>
            </div>
            <div className="card border border-violet-100 bg-violet-50/50">
              <CircleDollarSign size={19} className="text-violet-600" />
              <div className="mt-3 truncate text-xl font-bold text-gray-900" title={formatMoney(stats.salesAmount)}>{formatMoney(stats.salesAmount)}</div>
              <div className="text-sm text-gray-600">Сумма по авто</div>
              <div className="mt-1 text-[11px] text-gray-400">{stats.paidCount} подтверждённых оплат</div>
            </div>
            <div className="card border border-orange-100 bg-orange-50/50">
              <Wrench size={19} className="text-orange-600" />
              <div className="mt-3 text-2xl font-bold text-gray-900">{stats.extrasCount}</div>
              <div className="text-sm text-gray-600">Сделано допов</div>
              <div className="mt-1 text-[11px] text-gray-400">Текущие и архивные за месяц</div>
              <div className="mt-1 truncate text-[11px] text-orange-700" title={formatMoney(stats.extrasAmount)}>{formatMoney(stats.extrasAmount)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MiniBarChart
                title="Сумма оплаченных автомобилей"
                subtitle="Динамика подтверждённых оплат за последние шесть месяцев"
                points={summary.monthly}
                valueKey="salesAmount"
                colorClass="bg-violet-500"
              />
            </div>
            <StageChart stages={summary.stages} />
          </div>

          <MiniBarChart
            title="Дополнительное оборудование"
            subtitle="Сумма допов по месяцам. Количество за выбранный месяц — в карточке выше."
            points={summary.monthly}
            valueKey="extrasAmount"
            colorClass="bg-orange-400"
          />

          <div className="text-xs text-gray-400">
            Выберите автомобиль из реальных заказов CRM: в списке указаны автомобиль, договор и клиент. Архивные записи отмечены отдельно.
          </div>
        </>
      )}
    </div>
  );
}
