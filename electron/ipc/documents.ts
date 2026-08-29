// Documents generation — Phase 2
import { ipcMain } from 'electron';

export function registerDocumentsHandlers(): void {
  ipcMain.handle('documents:generate', () => {
    return { error: 'Генерация документов будет реализована в следующем этапе' };
  });
}
