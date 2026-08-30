"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDocumentsHandlers = registerDocumentsHandlers;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const database_1 = require("./database");
const storagePaths_1 = require("./storagePaths");
const schema_1 = require("../schema");
function getClientName(clientId) {
    const db = (0, database_1.getDb)();
    const row = db.prepare('SELECT full_name FROM clients WHERE id=?').get(clientId);
    return row?.full_name ?? `client_${clientId}`;
}
function getDocumentType(id) {
    const db = (0, database_1.getDb)();
    return db.prepare('SELECT * FROM document_types WHERE id=?').get(id);
}
/** Returns the existing documents.id for (clientId, documentTypeId), creating the row if needed. */
function ensureDocumentRow(clientId, documentTypeId, orderId) {
    const db = (0, database_1.getDb)();
    const existing = db.prepare('SELECT id FROM documents WHERE client_id=? AND document_type_id=?')
        .get(clientId, documentTypeId);
    if (existing)
        return existing.id;
    const result = db.prepare(`
    INSERT INTO documents (client_id, document_type_id, order_id, status)
    VALUES (?, ?, ?, 'not_requested')
  `).run(clientId, documentTypeId, orderId ?? null);
    return result.lastInsertRowid;
}
function registerDocumentsHandlers() {
    electron_1.ipcMain.handle('documents:generate', () => {
        return { error: 'Генерация документов будет реализована в следующем этапе' };
    });
    // ── DOCUMENT TYPES (справочник) ──────────────────────────────────────────
    electron_1.ipcMain.handle('documentTypes:getAll', () => (0, database_1.getDb)().prepare('SELECT * FROM document_types WHERE is_active=1 ORDER BY sort_order, id').all());
    electron_1.ipcMain.handle('documentTypes:create', (_e, data) => {
        const db = (0, database_1.getDb)();
        const name = (data.name ?? '').trim();
        if (!name)
            return { error: 'Название типа документа обязательно' };
        const baseCode = name.toLowerCase()
            .replace(/[^a-zа-я0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '') || 'custom';
        let code = baseCode;
        let n = 1;
        while (db.prepare('SELECT id FROM document_types WHERE code=?').get(code)) {
            code = `${baseCode}_${n}`;
            n++;
        }
        const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM document_types').get().m ?? 0;
        const result = db.prepare(`
      INSERT INTO document_types (code, name, folder_name, sort_order, is_system, is_active)
      VALUES (?, ?, ?, ?, 0, 1)
    `).run(code, name, (0, storagePaths_1.safeName)(data.folder_name || name), maxOrder + 1);
        return result.lastInsertRowid;
    });
    // ── DOCUMENTS (per client, one row per type) ─────────────────────────────
    electron_1.ipcMain.handle('documents:getByClientId', (_e, clientId) => {
        const db = (0, database_1.getDb)();
        const types = db.prepare('SELECT * FROM document_types WHERE is_active=1 ORDER BY sort_order, id').all();
        const docs = db.prepare('SELECT * FROM documents WHERE client_id=?').all(clientId);
        const docByType = new Map(docs.map(d => [d.document_type_id, d]));
        const docIds = docs.map(d => d.id);
        let filesByDoc = new Map();
        if (docIds.length) {
            const ph = docIds.map(() => '?').join(',');
            const files = db.prepare(`SELECT * FROM document_files WHERE document_id IN (${ph}) ORDER BY id`).all(...docIds);
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
    electron_1.ipcMain.handle('documents:updateStatus', (_e, clientId, documentTypeId, status) => {
        const db = (0, database_1.getDb)();
        const docId = ensureDocumentRow(clientId, documentTypeId);
        const current = db.prepare('SELECT * FROM documents WHERE id=?').get(docId);
        const updates = { status };
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
        const oldLabel = schema_1.DOCUMENT_STATUS_LABELS[current.status] ?? current.status;
        const newLabel = schema_1.DOCUMENT_STATUS_LABELS[status] ?? status;
        (0, database_1.writeHistory)(clientId, 'document_status', `Статус документа «${type?.name ?? ''}»: ${oldLabel} → ${newLabel}`, current.status, status);
        return true;
    });
    electron_1.ipcMain.handle('documents:updateComment', (_e, clientId, documentTypeId, comment) => {
        const db = (0, database_1.getDb)();
        const docId = ensureDocumentRow(clientId, documentTypeId);
        db.prepare(`UPDATE documents SET comment=?, updated_at=datetime('now') WHERE id=?`).run(comment, docId);
        return true;
    });
    // ── FILES ─────────────────────────────────────────────────────────────────
    // Attach one or more already-selected local file paths to a single document type.
    electron_1.ipcMain.handle('documents:addFiles', (_e, clientId, documentTypeId, filePaths, orderId) => {
        const db = (0, database_1.getDb)();
        const type = getDocumentType(documentTypeId);
        if (!type)
            return { error: 'Неизвестный тип документа' };
        const clientName = getClientName(clientId);
        const docId = ensureDocumentRow(clientId, documentTypeId, orderId);
        const destFolder = (0, storagePaths_1.getDocumentTypeFolder)(clientId, clientName, type.folder_name);
        const attached = [];
        const tx = db.transaction((paths) => {
            for (const src of paths) {
                if (!fs_1.default.existsSync(src))
                    continue;
                const stat = fs_1.default.statSync(src);
                if (!stat.isFile())
                    continue;
                const destPath = (0, storagePaths_1.copyFileUnique)(src, destFolder);
                const originalName = src.split(/[\\/]/).pop() || destPath.split(/[\\/]/).pop();
                const fileName = destPath.split(/[\\/]/).pop();
                const result = db.prepare(`
          INSERT INTO document_files (document_id, file_path, file_name, original_name, size)
          VALUES (?, ?, ?, ?, ?)
        `).run(docId, destPath, fileName, originalName, stat.size);
                attached.push({ id: result.lastInsertRowid, document_id: docId, file_path: destPath, file_name: fileName, original_name: originalName, size: stat.size });
            }
            if (attached.length) {
                const current = db.prepare('SELECT status, received_date FROM documents WHERE id=?').get(docId);
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
            (0, database_1.writeHistory)(clientId, 'document_file_add', `Получен документ: ${type.name} (файлов: ${attached.length})`);
        }
        return { document_id: docId, files: attached };
    });
    // Bulk: attach files across multiple document types in a single call
    // entries: [{ documentTypeId, filePaths: string[] }]
    electron_1.ipcMain.handle('documents:addFilesBulk', (_e, clientId, entries) => {
        const db = (0, database_1.getDb)();
        const clientName = getClientName(clientId);
        const results = [];
        for (const entry of entries) {
            const type = getDocumentType(entry.documentTypeId);
            if (!type)
                continue;
            const docId = ensureDocumentRow(clientId, entry.documentTypeId);
            const destFolder = (0, storagePaths_1.getDocumentTypeFolder)(clientId, clientName, type.folder_name);
            const attached = [];
            const tx = db.transaction((paths) => {
                for (const src of paths) {
                    if (!fs_1.default.existsSync(src))
                        continue;
                    const stat = fs_1.default.statSync(src);
                    if (!stat.isFile())
                        continue;
                    const destPath = (0, storagePaths_1.copyFileUnique)(src, destFolder);
                    const originalName = src.split(/[\\/]/).pop() || destPath.split(/[\\/]/).pop();
                    const fileName = destPath.split(/[\\/]/).pop();
                    const result = db.prepare(`
            INSERT INTO document_files (document_id, file_path, file_name, original_name, size)
            VALUES (?, ?, ?, ?, ?)
          `).run(docId, destPath, fileName, originalName, stat.size);
                    attached.push({ id: result.lastInsertRowid, document_id: docId, file_path: destPath, file_name: fileName, original_name: originalName, size: stat.size });
                }
                if (attached.length) {
                    const current = db.prepare('SELECT status FROM documents WHERE id=?').get(docId);
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
                (0, database_1.writeHistory)(clientId, 'document_file_add', `Получен документ: ${type.name} (файлов: ${attached.length})`);
            }
            results.push({ document_type_id: entry.documentTypeId, document_id: docId, files: attached });
        }
        return results;
    });
    // Physically delete a file + its DB row. Confirmation happens on the UI side before this is called.
    electron_1.ipcMain.handle('documents:deleteFile', (_e, fileId) => {
        const db = (0, database_1.getDb)();
        const file = db.prepare(`
      SELECT df.*, d.client_id, dt.name as type_name
      FROM document_files df
      JOIN documents d ON d.id = df.document_id
      JOIN document_types dt ON dt.id = d.document_type_id
      WHERE df.id=?
    `).get(fileId);
        if (!file)
            return { error: 'Файл не найден' };
        try {
            if (fs_1.default.existsSync(file.file_path))
                fs_1.default.unlinkSync(file.file_path);
        }
        catch (err) {
            return { error: `Не удалось удалить файл: ${err.message}` };
        }
        db.prepare('DELETE FROM document_files WHERE id=?').run(fileId);
        const remaining = db.prepare('SELECT COUNT(*) as c FROM document_files WHERE document_id=?').get(file.document_id).c;
        if (remaining === 0) {
            db.prepare(`UPDATE documents SET status='not_requested', received_date=NULL, updated_at=datetime('now') WHERE id=? AND status NOT IN ('not_required')`)
                .run(file.document_id);
        }
        (0, database_1.writeHistory)(file.client_id, 'document_file_delete', `Удалён документ: ${file.type_name} (${file.original_name})`);
        return true;
    });
}
