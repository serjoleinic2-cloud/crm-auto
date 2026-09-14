import { ipcMain } from 'electron';
import { getDb } from './database';

type MetricRow = { count?: number; amount?: number };
type FilterInput = { orderId?: number | null };
type SelectedFilter = { orderId: number | null };
type FilterSql = { clause: string; values: number[] };
type VehicleRow = {
  id: number;
  brand: string | null;
  model: string | null;
  contract_number: string | null;
  full_name: string;
  is_archived: number;
};

function selectedMonth(value?: string): string {
  return value && /^\d{4}-\d{2}$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
    .replace('.', '');
}

function numberValue(row: MetricRow | undefined, key: keyof MetricRow): number {
  return Number(row?.[key] ?? 0);
}

function paymentProofExists(alias = 'o'): string {
  return `${alias}.payment_status='paid'`;
}

function normalizeFilters(input?: FilterInput): SelectedFilter {
  const orderId = Number(input?.orderId);
  return { orderId: Number.isInteger(orderId) && orderId > 0 ? orderId : null };
}

function makeOrderFilter(filters: SelectedFilter, alias = 'o'): FilterSql {
  return filters.orderId
    ? { clause: ` AND ${alias}.id=?`, values: [filters.orderId] }
    : { clause: '', values: [] };
}

function makeVehicleLabel(row: VehicleRow): string {
  const car = [row.brand, row.model].filter(Boolean).join(' ') || 'Автомобиль без названия';
  const details = [
    row.contract_number ? `договор №${row.contract_number}` : '',
    row.full_name,
    row.is_archived ? 'архив' : '',
  ].filter(Boolean);
  return [car, ...details].join(' — ');
}

export function registerStatisticsHandlers(): void {
  ipcMain.handle('statistics:getSummary', (_e, inputMonth?: string, inputFilters?: FilterInput) => {
    const db = getDb();
    const month = selectedMonth(inputMonth);
    const filters = normalizeFilters(inputFilters);
    const orderFilter = makeOrderFilter(filters);
    const paidProof = paymentProofExists();

    const vehicles = (db.prepare(`
      SELECT o.id, o.brand, o.model, o.contract_number, c.full_name, c.is_archived
      FROM orders o
      JOIN clients c ON c.id=o.client_id
      WHERE c.is_deleted=0
      ORDER BY c.is_archived ASC,
               COALESCE(o.payment_date, o.contract_date, o.created_at) DESC,
               o.id DESC
    `).all() as VehicleRow[]).map(row => ({
      id: row.id,
      label: makeVehicleLabel(row),
      archived: Boolean(row.is_archived),
    }));

    const ordered = numberValue(db.prepare(`
      SELECT COUNT(*) AS count
      FROM orders o JOIN clients c ON c.id=o.client_id
      WHERE c.is_deleted=0
        AND substr(COALESCE(o.contract_date, o.created_at), 1, 7)=?
        ${orderFilter.clause}
    `).get(month, ...orderFilter.values) as MetricRow | undefined, 'count');

    const issued = numberValue(db.prepare(`
      SELECT COUNT(*) AS count
      FROM orders o
      JOIN clients c ON c.id=o.client_id
      LEFT JOIN statuses s ON s.id=o.order_status_id
      WHERE c.is_deleted=0
        AND s.name='Выдан'
        AND substr(COALESCE(o.issue_date, o.updated_at), 1, 7)=?
        ${orderFilter.clause}
    `).get(month, ...orderFilter.values) as MetricRow | undefined, 'count');

    const paid = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(o.price), 0) AS amount
      FROM orders o JOIN clients c ON c.id=o.client_id
      WHERE c.is_deleted=0
        AND o.payment_status='paid'
        AND substr(o.payment_date, 1, 7)=?
        AND ${paidProof}
        ${orderFilter.clause}
    `).get(month, ...orderFilter.values) as MetricRow | undefined;

    const extras = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(e.price), 0) AS amount
      FROM extras e
      JOIN orders o ON o.id=e.order_id
      JOIN clients c ON c.id=o.client_id
      WHERE c.is_deleted=0
        AND substr(e.created_at, 1, 7)=?
        ${orderFilter.clause}
    `).get(month, ...orderFilter.values) as MetricRow | undefined;

    const months = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5));
    const monthly = months.map(monthKey => {
      const payment = db.prepare(`
        SELECT COALESCE(SUM(o.price), 0) AS amount
        FROM orders o JOIN clients c ON c.id=o.client_id
        WHERE c.is_deleted=0
          AND o.payment_status='paid'
          AND substr(o.payment_date, 1, 7)=?
          AND ${paidProof}
          ${orderFilter.clause}
      `).get(monthKey, ...orderFilter.values) as MetricRow | undefined;
      const monthExtras = db.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(e.price), 0) AS amount
        FROM extras e
        JOIN orders o ON o.id=e.order_id
        JOIN clients c ON c.id=o.client_id
        WHERE c.is_deleted=0
          AND substr(e.created_at, 1, 7)=?
          ${orderFilter.clause}
      `).get(monthKey, ...orderFilter.values) as MetricRow | undefined;
      return {
        month: monthKey,
        label: monthLabel(monthKey),
        salesAmount: numberValue(payment, 'amount'),
        extrasAmount: numberValue(monthExtras, 'amount'),
        extrasCount: numberValue(monthExtras, 'count'),
      };
    });

    const stageRows = db.prepare(`
      SELECT s.name AS name, s.color AS color, COUNT(*) AS count
      FROM orders o
      JOIN clients c ON c.id=o.client_id
      JOIN statuses s ON s.id=o.order_status_id
      WHERE c.is_deleted=0
        AND c.is_archived=0
        AND ${paidProof}
        AND s.name IN ('Автомобиль в пути', 'Автомобиль прибыл', 'Допы', 'Подготовка к выдаче')
        ${orderFilter.clause}
      GROUP BY s.id, s.name, s.color
      ORDER BY s.sort_order
    `).all(...orderFilter.values) as { name: string; color: string; count: number }[];

    return {
      month,
      monthLabel: monthLabel(month),
      filters,
      vehicles,
      selected: {
        ordered,
        issued,
        issuedPercent: ordered > 0 ? Math.round((issued / ordered) * 100) : 0,
        paidCount: numberValue(paid, 'count'),
        salesAmount: numberValue(paid, 'amount'),
        extrasCount: numberValue(extras, 'count'),
        extrasAmount: numberValue(extras, 'amount'),
      },
      monthly,
      stages: stageRows,
    };
  });
}
