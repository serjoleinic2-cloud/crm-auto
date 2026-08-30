import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { getDb, writeHistory } from './database';
import { getClientFolder, safeName } from './storagePaths';

// ── helpers ──────────────────────────────────────────────────────────────────

function getTemplatePath(): string {
  // Works both in dev (project root) and packaged (extraResources)
  const fromResources = path.join(process.resourcesPath ?? '', 'templates', 'contract_template_vars.docx');
  const fromAppPath   = path.join(app.getAppPath(), 'templates', 'contract_template_vars.docx');
  return fs.existsSync(fromResources) ? fromResources : fromAppPath;
}

function padZero(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format ISO date string to Russian-style «DD» Month YYYY */
function formatDateRussian(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = [
    'Января','Февраля','Марта','Апреля','Мая','Июня',
    'Июля','Августа','Сентября','Октября','Ноября','Декабря',
  ];
  return `${padZero(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format ISO date string to DD.MM.YYYY */
function formatDateDot(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${padZero(d.getDate())}.${padZero(d.getMonth()+1)}.${d.getFullYear()}`;
}

/** Get initials from full name: "Иванова Мария Петровна" → "М.П. Иванова" */
function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return fullName;
  if (parts.length === 1) return fullName;
  const lastName = parts[0];
  const firstInit = parts[1] ? parts[1][0] + '.' : '';
  const middleInit = parts[2] ? parts[2][0] + '.' : '';
  return `${firstInit}${middleInit} ${lastName}`.trim();
}

// ── contract data interface ───────────────────────────────────────────────────

export interface ContractData {
  clientId: number;
  orderId: number;
  contractNumber: string;
  contractDate: string;      // ISO date
  dealAmount: string;        // as entered by manager
  agentFee: string;          // вознаграждение
}

// ── registration ──────────────────────────────────────────────────────────────

export function registerContractsHandlers(): void {

  // Get next contract number suggestion
  ipcMain.handle('contracts:getNextNumber', () => {
    const db = getDb();
    const rows = db.prepare('SELECT contract_number FROM orders WHERE contract_number IS NOT NULL').all() as { contract_number: string }[];
    let max = 0;
    for (const r of rows) {
      const n = parseInt(r.contract_number.replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return String(max + 1);
  });

  // Get client passport data
  ipcMain.handle('contracts:getPassportData', (_e, clientId: number) => {
    const db = getDb();
    return db.prepare('SELECT * FROM client_passport_data WHERE client_id=?').get(clientId) ?? null;
  });

  // Save client passport data
  ipcMain.handle('contracts:savePassportData', (_e, clientId: number, data: Record<string, string>) => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM client_passport_data WHERE client_id=?').get(clientId);
    if (existing) {
      db.prepare(`
        UPDATE client_passport_data SET
          birth_date=@birth_date, inn=@inn,
          passport_number=@passport_number, passport_issued_by=@passport_issued_by,
          passport_issue_date=@passport_issue_date, passport_code=@passport_code,
          registration_address=@registration_address,
          updated_at=datetime('now')
        WHERE client_id=@client_id
      `).run({ ...data, client_id: clientId });
    } else {
      db.prepare(`
        INSERT INTO client_passport_data
          (client_id, birth_date, inn, passport_number, passport_issued_by,
           passport_issue_date, passport_code, registration_address)
        VALUES
          (@client_id, @birth_date, @inn, @passport_number, @passport_issued_by,
           @passport_issue_date, @passport_code, @registration_address)
      `).run({ ...data, client_id: clientId });
    }
    return true;
  });

  // Generate contract docx
  ipcMain.handle('contracts:generate', async (_e, contractData: ContractData) => {
    try {
      const db = getDb();

      // Load client
      const client = db.prepare('SELECT * FROM clients WHERE id=?').get(contractData.clientId) as
        { id: number; full_name: string; phone: string|null; email: string|null } | undefined;
      if (!client) return { error: 'Клиент не найден' };

      // Load passport data
      const passport = db.prepare('SELECT * FROM client_passport_data WHERE client_id=?').get(contractData.clientId) as
        Record<string, string> | undefined;

      // Load order
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(contractData.orderId) as
        Record<string, unknown> | undefined;
      if (!order) return { error: 'Заказ не найден' };

      // Load template
      const templatePath = getTemplatePath();
      if (!fs.existsSync(templatePath)) {
        return { error: `Шаблон договора не найден: ${templatePath}` };
      }

      // Build variable map
      const contractDateFormatted = formatDateRussian(contractData.contractDate);

      const variables: Record<string, string> = {
        CONTRACT_NUMBER:    contractData.contractNumber,
        CONTRACT_DATE:      contractDateFormatted,
        CLIENT_FULL_NAME:   client.full_name,
        CLIENT_PHONE:       client.phone || '',
        CLIENT_EMAIL:       client.email || '',
        CLIENT_INITIALS:    getInitials(client.full_name),
        CLIENT_BIRTH_DATE:  passport?.birth_date  ? formatDateDot(passport.birth_date)       : '',
        CLIENT_INN:         passport?.inn          || '',
        PASSPORT_NUMBER:    passport?.passport_number     || '',
        PASSPORT_ISSUED_BY: passport?.passport_issued_by  || '',
        PASSPORT_ISSUE_DATE:passport?.passport_issue_date ? formatDateDot(passport.passport_issue_date) : '',
        PASSPORT_CODE:      passport?.passport_code       || '',
        REGISTRATION_ADDRESS: passport?.registration_address || '',
        CAR_BRAND:          String(order.brand         || ''),
        CAR_MODEL:          String(order.model         || ''),
        CAR_YEAR:           String(order.year          || ''),
        CAR_BODY_TYPE:      String(order.body_type     || ''),
        CAR_ENGINE:         String(order.engine        || ''),
        CAR_ENGINE_TYPE:    String(order.engine_type   || ''),
        CAR_DRIVE:          String(order.drive         || ''),
        CAR_TRANSMISSION:   String(order.transmission  || ''),
        CAR_CONFIGURATION:  String(order.configuration || ''),
        CAR_COLOR:          String(order.color         || ''),
        CAR_MILEAGE:        String(order.mileage       || ''),
        CAR_OTHER:          String(order.car_other     || ''),
        DEAL_AMOUNT:        contractData.dealAmount,
        AGENT_FEE:          contractData.agentFee || '100 000 (сто тысяч) рублей',
      };

      // Read template
      const templateBuf = fs.readFileSync(templatePath);

      // Dynamic import of pizzip/docxtemplater (CommonJS in electron)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PizZip = require('pizzip');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Docxtemplater = require('docxtemplater');

      const zip = new PizZip(templateBuf);
      const docx = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
      });

      docx.render(variables);

      const outBuf: Buffer = docx.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

      // Save to client folder
      const clientName = client.full_name;
      const clientFolder = getClientFolder(contractData.clientId, clientName);
      const contractFolder = path.join(clientFolder, 'Документы', 'Договор');
      fs.mkdirSync(contractFolder, { recursive: true });

      // Filename with version suffix if file exists
      const baseFileName = `Договор_№${safeName(contractData.contractNumber)}_${contractData.clientId}`;
      let fileName = `${baseFileName}.docx`;
      let counter = 1;
      while (fs.existsSync(path.join(contractFolder, fileName))) {
        fileName = `${baseFileName}_v${counter}.docx`;
        counter++;
      }
      const filePath = path.join(contractFolder, fileName);
      fs.writeFileSync(filePath, outBuf);

      // Save to DB as document file
      const contractTypeRow = db.prepare("SELECT id FROM document_types WHERE code='contract'").get() as { id: number } | undefined;
      if (contractTypeRow) {
        let docRow = db.prepare('SELECT id FROM documents WHERE client_id=? AND document_type_id=?')
          .get(contractData.clientId, contractTypeRow.id) as { id: number } | undefined;
        if (!docRow) {
          const ins = db.prepare(`
            INSERT INTO documents (client_id, document_type_id, order_id, status)
            VALUES (?, ?, ?, 'received')
          `).run(contractData.clientId, contractTypeRow.id, contractData.orderId);
          docRow = { id: ins.lastInsertRowid as number };
        } else {
          db.prepare(`UPDATE documents SET status='received', updated_at=datetime('now') WHERE id=?`).run(docRow.id);
        }
        const stat = fs.statSync(filePath);
        db.prepare(`
          INSERT INTO document_files (document_id, file_path, file_name, original_name, size)
          VALUES (?, ?, ?, ?, ?)
        `).run(docRow.id, filePath, fileName, fileName, stat.size);
      }

      // Update order contract number and deal amount
      db.prepare(`
        UPDATE orders SET contract_number=?, deal_amount=?, contract_date=?, updated_at=datetime('now')
        WHERE id=?
      `).run(contractData.contractNumber, contractData.dealAmount, contractData.contractDate, contractData.orderId);

      // History
      writeHistory(
        contractData.clientId,
        'contract_generated',
        `Создан договор №${contractData.contractNumber} от ${contractDateFormatted} (${fileName})`,
      );

      return { success: true, filePath, fileName };
    } catch (err: unknown) {
      console.error('[contracts:generate]', err);
      const msg = err instanceof Error ? err.message : String(err);
      return { error: `Ошибка генерации договора: ${msg}` };
    }
  });

  // Open generated contract file
  ipcMain.handle('contracts:openFile', async (_e, filePath: string) => {
    const { shell } = await import('electron');
    try {
      await shell.openPath(filePath);
      return true;
    } catch (err) {
      return { error: String(err) };
    }
  });
}
