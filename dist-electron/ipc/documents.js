"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDocumentsHandlers = registerDocumentsHandlers;
// Documents generation — Phase 2
const electron_1 = require("electron");
function registerDocumentsHandlers() {
    electron_1.ipcMain.handle('documents:generate', () => {
        return { error: 'Генерация документов будет реализована в следующем этапе' };
    });
}
