import { ipcMain } from 'electron';
import fs from 'fs';
import { getDb, writeHistory } from './database';
import { getDocumentTypeFolder, copyFileUnique, safeName } from './storagePaths';
import { DOCUMENT_STATUS_LABELS } from '../schema';

type DocStatus = 'not_required' | 'not_requested' | 'requested' | 'sent' | 'received' | 'verified';

function getClientName(clientId: number): string {
  const db = getDb();
  const row = db.prepare('SELECT full_name FROM clients WHERE id=?').get(clientId) as { full_name: string } | undefined;
  return row?.full_name ?? `client_${clientId}`;
}

function getDocumentType(id: number) {
  const db = getDb();
  return db.prepare('SELECT * FROM document_types WHERE id=?').get(id) as
    { id: number; code: string; name: string; folder_name: string } | undefined;
}

/** Returns the existing documents.id for (clientId, documentTypeId), creating the row if needed. */
function ensureDocumentRow(clientId: number, documentTypeId: number, orderId?: number | null): number {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM documents WHERE client_id=? AND document_type_id=?')
    .get(clientId, documentTypeId) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare(`
    INSERT INTO documents (client_id, document_type_id, order_id, status)
    VALUES (?, ?, ?, 'not_requested')
  `).run(clientId, documentTypeId, orderId ?? null);
  return result.lastInsertRowid as number;
}

export function registerDocumentsHandlers(): void {

  ipcMain.handle('documents:generate', () => {
    return { error: 'Генерация документов будет реализована в следующем этапе' };
  });

  // ── DOCUMENT TYPES (справочник) ──────────────────────────────────────────

  ipcMain.handle('documentTypes:getAll', () =>
    getDb().prepare('SELECT * FROM document_types WHERE is_active=1 ORDER BY sort_order, id').all()
  );

  ipcMain.handle('documentTypes:create', (_e, data: { name: string; folder_name?: string }) => {
    const db = getDb();
    const name = (data.name ?? '').trim();
    if (!name) return { error: 'Название типа документа обязательно' };
    const baseCode = name.toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '') || 'custom';
    let code = baseCode;
    let n = 1;
    while (db.prepare('SELECT id FROM document_types WHERE code=?').get(code)) {
      code = `${baseCode}_${n}`; n++;
    }
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM document_types').get() as { m: number | null }).m ?? 0;
    const result = db.prepare(`
      INSERT INTO document_types (code, name, folder_name, sort_order, is_system, is_active)
      VALUES (?, ?, ?, ?, 0, 1)
    `).run(code, name, safeName(data.folder_name || name), maxOrder + 1);
    return result.lastInsertRowid;
  });

  // ── DOCUMENTS (per client, one row per type) ─────────────────────────────

  ipcMain.handle('documents:getByClientId', (_e, clientId: number) => {
    const db = getDb();
    const types = db.prepare('SELECT * FROM document_types WHERE is_active=1 ORDER BY sort_order, id').all() as
      { id: number; code: string; name: string; folder_name: string; sort_order: number }[];
    const docs = db.prepare('SELECT * FROM documents WHERE client_id=?').all(clientId) as
      { id: number; document_type_id: number; status: string; requested_date: string | null; received_date: string | null; comment: string | null; order_id: number | null }[];
    const docByType = new Map(docs.map(d => [d.document_type_id, d]));
    const docIds = docs.map(d => d.id);
    let filesByDoc = new Map<number, unknown[]>();
    if (docIds.length) {
      const ph = docIds.map(() => '?').join(',');
      const files = db.prepare(`SELECT * FROM document_files WHERE document_id IN (${ph}) ORDER BY id`).all(...docIds) as
        { id: number; document_id: number }[];
      filesByDoc = new Map();
      for (const f of files) {
        const arr = filesByDoc.get(f.document_id) ?? [];
        arr.push(f);
        filesByDoc.set(f.document_id, arr);
      }
    }
    return types.map(t => {
      const d = docByType.get(t.id);
      return {
        document_type_id: t.id,
        code: t.code,
        name: t.name,
        folder_name: t.folder_name,
        sort_order: t.sort_order,
        document_id: d?.id ?? null,
        status: d?.status ?? 'not_requested',
        requested_date: d?.requested_date ?? null,
        received_date: d?.received_date ?? null,
        comment: d?.comment ?? null,
        order_id: d?.order_id ?? null,
        files: d ? (filesByDoc.get(d.id) ?? []) : [],
      };
    });
  });

  ipcMain.handle('documents:updateStatus', (_e, clientId: number, documentTypeId: number, status: DocStatus) => {
    const db = getDb();
    const docId = ensureDocumentRow(clientId, documentTypeId);
    const current = db.prepare('SELECT * FROM documents WHERE id=?').get(docId) as
      { status: string; requested_date: string | null; received_date: string | null };

    const updates: Record<string, unknown> = { status };
    if ((status === 'requested' || status === 'sent') && !current.requested_date) {
      updates.requested_date = new Date().toISOString().split('T')[0];
    }
    if ((status === 'received' || status === 'verified') && !current.received_date) {
      updates.received_date = new Date().toISOString().split('T')[0];
    }
    const fields = Object.keys(updates);
    const set = fields.map(f => `${f}=@${f}`).join(', ');
    db.prepare(`UPDATE documents SET ${set}, updated_at=datetime('now') WHERE id=@__id`).run({ ...updates, __id: docId });

    const type = getDocumentType(documentTypeId);
    const oldLabel = DOCUMENT_STATUS_LABELS[current.status] ?? current.status;
    const newLabel = DOCUMENT_STATUS_LABELS[status] ?? status;
    writeHistory(clientId, 'document_status',
      `Статус документа «${type?.name ?? ''}»: ${oldLabel} → ${newLabel}`, current.status, status);
    return true;
  });

  ipcMain.handle('documents:updateComment', (_e, clientId: number, documentTypeId: number, comment: string) => {
    const db = getDb();
    const docId = ensureDocumentRow(clientId, documentTypeId);
    db.prepare(`UPDATE documents SET comment=?, updated_at=datetime('now') WHERE id=?`).run(comment, docId);
    return true;
  });

  // ── FILES ─────────────────────────────────────────────────────────────────

  // Attach one or more already-selected local file paths to a single document type.
  ipcMain.handle('documents:addFiles', (_e, clientId: number, documentTypeId: number, filePaths: string[], orderId?: number | null) => {
    const db = getDb();
    const type = getDocumentType(documentTypeId);
    if (!type) return { error: 'Неизвестный тип документа' };
    const clientName = getClientName(clientId);
    const docId = ensureDocumentRow(clientId, documentTypeId, orderId);
    const destFolder = getDocumentTypeFolder(clientId, clientName, type.folder_name);

    const attached: unknown[] = [];
    const tx = db.transaction((paths: string[]) => {
      for (const src of paths) {
        if (!fs.existsSync(src)) continue;
        const stat = fs.statSync(src);
        if (!stat.isFile()) continue;
        const destPath = copyFileUnique(src, destFolder);
        const originalName = src.split(/[\\/]/).pop() || destPath.split(/[\\/]/).pop()!;
        const fileName = destPath.split(/[\\/]/).pop()!;
        const result = db.prepare(`
          INSERT INTO document_files (document_id, file_path, file_name, original_name, size)
          VALUES (?, ?, ?, ?, ?)
        `).run(docId, destPath, fileName, originalName, stat.size);
        attached.push({ id: result.lastInsertRowid, document_id: docId, file_path: destPath, file_name: fileName, original_name: originalName, size: stat.size });
      }
      if (attached.length) {
        const current = db.prepare('SELECT status, received_date FROM documents WHERE id=?').get(docId) as { status: string; received_date: string | null };
        if (current.status !== 'verified') {
          db.prepare(`
            UPDATE documents SET status='received', received_date=COALESCE(received_date, date('now')), updated_at=datetime('now')
            WHERE id=?
          `).run(docId);
        }
      }
    });
    tx(filePaths);

    if (attached.length) {
      writeHistory(clientId, 'document_file_add', `Получен документ: ${type.name} (файлов: ${attached.length})`);
    }
    return { document_id: docId, files: attached };
  });

  // Bulk: attach files across multiple document types in a single call
  // entries: [{ documentTypeId, filePaths: string[] }]
  ipcMain.handle('documents:addFilesBulk', (_e, clientId: number, entries: { documentTypeId: number; filePaths: string[] }[]) => {
    const db = getDb();
    const clientName = getClientName(clientId);
    const results: unknown[] = [];

    for (const entry of entries) {
      const type = getDocumentType(entry.documentTypeId);
      if (!type) continue;
      const docId = ensureDocumentRow(clientId, entry.documentTypeId);
      const destFolder = getDocumentTypeFolder(clientId, clientName, type.folder_name);
      const attached: unknown[] = [];

      const tx = db.transaction((paths: string[]) => {
        for (const src of paths) {
          if (!fs.existsSync(src)) continue;
          const stat = fs.statSync(src);
          if (!stat.isFile()) continue;
          const destPath = copyFileUnique(src, destFolder);
          const originalName = src.split(/[\\/]/).pop() || destPath.split(/[\\/]/).pop()!;
          const fileName = destPath.split(/[\\/]/).pop()!;
          const result = db.prepare(`
            INSERT INTO document_files (document_id, file_path, file_name, original_name, size)
            VALUES (?, ?, ?, ?, ?)
          `).run(docId, destPath, fileName, originalName, stat.size);
          attached.push({ id: result.lastInsertRowid, document_id: docId, file_path: destPath, file_name: fileName, original_name: originalName, size: stat.size });
        }
        if (attached.length) {
          const current = db.prepare('SELECT status FROM documents WHERE id=?').get(docId) as { status: string };
          if (current.status !== 'verified') {
            db.prepare(`
              UPDATE documents SET status='received', received_date=COALESCE(received_date, date('now')), updated_at=datetime('now')
              WHERE id=?
            `).run(docId);
          }
        }
      });
      tx(entry.filePaths);

      if (attached.length) {
        writeHistory(clientId, 'document_file_add', `Получен документ: ${type.name} (файлов: ${attached.length})`);
      }
      results.push({ document_type_id: entry.documentTypeId, document_id: docId, files: attached });
    }
    return results;
  });

  // Physically delete a file + its DB row. Confirmation happens on the UI side before this is called.
  ipcMain.handle('documents:deleteFile', (_e, fileId: number) => {
    const db = getDb();
    const file = db.prepare(`
      SELECT df.*, d.client_id, dt.name as type_name
      FROM document_files df
      JOIN documents d ON d.id = df.document_id
      JOIN document_types dt ON dt.id = d.document_type_id
      WHERE df.id=?
    `).get(fileId) as { id: number; file_path: string; document_id: number; client_id: number; type_name: string; original_name: string } | undefined;
    if (!file) return { error: 'Файл не найден' };

    try {
      if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path);
    } catch (err) {
      return { error: `Не удалось удалить файл: ${(err as Error).message}` };
    }
    db.prepare('DELETE FROM document_files WHERE id=?').run(fileId);

    const remaining = (db.prepare('SELECT COUNT(*) as c FROM document_files WHERE document_id=?').get(file.document_id) as { c: number }).c;
    if (remaining === 0) {
      db.prepare(`UPDATE documents SET status='not_requested', received_date=NULL, updated_at=datetime('now') WHERE id=? AND status NOT IN ('not_required')`)
        .run(file.document_id);
    }

    writeHistory(file.client_id, 'document_file_delete', `Удалён документ: ${file.type_name} (${file.original_name})`);
    return true;
  });
}
