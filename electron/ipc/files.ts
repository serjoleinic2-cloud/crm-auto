import { ipcMain, shell, app } from 'electron';
import path from 'path';
import fs from 'fs';

export function registerFilesHandlers(): void {
  ipcMain.handle('files:openClientFolder', (_e, clientId: number, clientName: string) => {
    const safe = clientName.replace(/[<>:"/\\|?*]/g, '_');
    const folder = path.join(app.getPath('documents'), 'CRM-Auto', `${clientId}_${safe}`);
    fs.mkdirSync(folder, { recursive: true });
    shell.openPath(folder);
    return folder;
  });
}
