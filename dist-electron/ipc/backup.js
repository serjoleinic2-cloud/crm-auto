"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBackupHandlers = registerBackupHandlers;
// Backup — Phase 2
const electron_1 = require("electron");
function registerBackupHandlers() {
    electron_1.ipcMain.handle('backup:create', () => {
        return { error: 'Резервное копирование будет реализовано в следующем этапе' };
    });
}
