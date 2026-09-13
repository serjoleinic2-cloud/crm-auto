import { ipcMain } from 'electron';
import { getDb } from './database';

type MetricRow = { count?: number; amount?: number };
type FilterInput = { brand?: string; car?: string };
type FilterSql = { clause: string; values: string[] };

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
  return `EXISTS (
    SELECT 1 FROM documents d
    JOIN document_types dt ON dt.id=d.document_type_id
    WHERE d.client_id=${alias}.client_id
      AND dt.code='payment_proof'
      AND d.status='received'
  )`;
}

function normalizeFilters(input?: FilterInput): Required<FilterInput> {
  return {
    brand: input?.brand?.trim() || '',
    car: input?.car?.trim() || '',
  };
}

function makeOrderFilter(filters: Required<FilterInput>, alias = 'o'): FilterSql {
  const conditions: string[] = [];
  const values: string[] = [];
  const carName = `TRIM(COALESCE(${alias}.brand, '') || ' ' || COALESCE(${alias}.model, ''))`;

  if (filters.brand) {
    conditions.push(`TRIM(COALESCE(${alias}.brand, ''))=?`);
    values.push(filters.brand);
  }
  if (filters.car) {
    conditions.push(`${carName}=?`);
    values.push(filters.car);
  }

  return {
    clause: conditions.length ? ` AND ${conditions.join(' AND ')}` : '',
    values,
  };
}

export function registerStatisticsHandlers(): void {
  ipcMain.handle('statistics:getSummary', (_e, inputMonth?: string, inputFilters?: FilterInput) => {
    const db = getDb();
    const month = selectedMonth(inputMonth);
    const filters = normalizeFilters(inputFilters);
    const orderFilter = makeOrderFilter(filters);
    const paidProof = paymentProofExists();

    const brands = (db.prepare(`
      SELECT DISTINCT TRIM(COALESCE(o.brand, '')) AS name
      FROM orders o JOIN clients c ON c.id=o.client_id
      WHERE c.is_deleted=0
        AND TRIM(COALESCE(o.brand, '')) <> ''
      ORDER BY name COLLATE NOCASE
    `).all() as { name: string }[]).map(row => row.name);

    const cars = (db.prepare(`
      SELECT DISTINCT TRIM(COALESCE(o.brand, '') || ' ' || COALESCE(o.model, '')) AS name
      FROM orders o JOIN clients c ON c.id=o.client_id
      WHERE c.is_deleted=0
        AND TRIM(COALESCE(o.brand, '') || ' ' || COALESCE(o.model, '')) <> ''
        ${filters.brand ? "AND TRIM(COALESCE(o.brand, ''))=?" : ''}
      ORDER BY name COLLATE NOCASE
    `).all(...(filters.brand ? [filters.brand] : [])) as { name: string }[]).map(row => row.name);

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
      brands,
      cars,
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
