// Backup — Phase 2
import { ipcMain } from 'electron';

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:create', () => {
    return { error: 'Резервное копирование будет реализовано в следующем этапе' };
  });
}
