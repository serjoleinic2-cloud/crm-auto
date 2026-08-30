import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { setSetting } from './database';
import { getClientFolder, getBasePath } from './storagePaths';

export function registerFilesHandlers(): void {
  // Kept for backward compatibility — opens the client's root folder in Explorer
  ipcMain.handle('files:openClientFolder', (_e, clientId: number, clientName: string) => {
    const folder = getClientFolder(clientId, clientName);
    shell.openPath(folder);
    return folder;
  });

  // Open an arbitrary file with the OS-default application
  ipcMain.handle('files:openFile', (_e, filePath: string) => {
    if (!fs.existsSync(filePath)) return { error: 'Файл не найден на диске' };
    shell.openPath(filePath);
    return true;
  });

  // Open the standard Windows "choose file(s)" dialog. Returns absolute paths, [] if cancelled.
  ipcMain.handle('files:pickFiles', async (e, opts?: { multi?: boolean }) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      properties: opts?.multi === false ? ['openFile'] : ['openFile', 'multiSelections'],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  // Choose a folder (used for changing the base data storage path)
  ipcMain.handle('files:pickFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('files:getBasePath', () => getBasePath());

  ipcMain.handle('files:setBasePath', (_e, newPath: string) => {
    fs.mkdirSync(newPath, { recursive: true });
    setSetting('base_data_path', newPath);
    return true;
  });
}
