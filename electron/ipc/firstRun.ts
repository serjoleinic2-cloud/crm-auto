import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDb } from './database';

const NEW_CLIENT_STATUS = {
  name: 'Новый клиент',
  color: '#64748b',
  category: 'lead',
  sortOrder: 0,
};

export function ensureFirstRunReferenceData(): void {
  const db = getDb();

  const hasNewClientStatus = db.prepare(
    'SELECT 1 FROM statuses WHERE name=? AND is_active=1 LIMIT 1'
  ).get(NEW_CLIENT_STATUS.name);

  if (!hasNewClientStatus) {
    db.prepare(
      'INSERT INTO statuses (name,color,category,sort_order,is_active) VALUES (?,?,?,?,1)'
    ).run(
      NEW_CLIENT_STATUS.name,
      NEW_CLIENT_STATUS.color,
      NEW_CLIENT_STATUS.category,
      NEW_CLIENT_STATUS.sortOrder,
    );
  }

  const brandCount = (db.prepare('SELECT COUNT(*) AS count FROM car_brands').get() as { count: number }).count;
  if (brandCount > 0) return;

  const brandsFile = path.join(app.getAppPath(), 'car_brands.txt');
  if (!fs.existsSync(brandsFile)) return;

  const brands = fs.readFileSync(brandsFile, 'utf-8')
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'ru'));

  const insert = db.prepare('INSERT OR IGNORE INTO car_brands (name,sort_order) VALUES (?,?)');
  const addBrands = db.transaction(() => {
    brands.forEach((brand, index) => insert.run(brand, index));
  });
  addBrands();
}
