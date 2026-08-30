import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getSetting } from './database';

export function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Без имени';
}

export function getBasePath(): string {
  const stored = getSetting('base_data_path');
  return stored || path.join(app.getPath('documents'), 'CRM-Auto Data');
}

export function getClientFolder(clientId: number, clientName: string): string {
  const folder = path.join(getBasePath(), 'Клиенты', `${clientId}_${safeName(clientName)}`);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

export function getDocumentTypeFolder(clientId: number, clientName: string, typeFolderName: string): string {
  const folder = path.join(getClientFolder(clientId, clientName), 'Документы', safeName(typeFolderName));
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

/** Copies a source file into destFolder, avoiding name collisions, returns the new absolute path. */
export function copyFileUnique(sourcePath: string, destFolder: string): string {
  fs.mkdirSync(destFolder, { recursive: true });
  const originalName = path.basename(sourcePath);
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  let candidate = originalName;
  let counter = 1;
  while (fs.existsSync(path.join(destFolder, candidate))) {
    candidate = `${base} (${counter})${ext}`;
    counter++;
  }
  const destPath = path.join(destFolder, candidate);
  fs.copyFileSync(sourcePath, destPath);
  return destPath;
}
