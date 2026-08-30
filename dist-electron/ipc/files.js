"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFilesHandlers = registerFilesHandlers;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const database_1 = require("./database");
const storagePaths_1 = require("./storagePaths");
function registerFilesHandlers() {
    // Kept for backward compatibility — opens the client's root folder in Explorer
    electron_1.ipcMain.handle('files:openClientFolder', (_e, clientId, clientName) => {
        const folder = (0, storagePaths_1.getClientFolder)(clientId, clientName);
        electron_1.shell.openPath(folder);
        return folder;
    });
    // Open an arbitrary file with the OS-default application
    electron_1.ipcMain.handle('files:openFile', (_e, filePath) => {
        if (!fs_1.default.existsSync(filePath))
            return { error: 'Файл не найден на диске' };
        electron_1.shell.openPath(filePath);
        return true;
    });
    // Open the standard Windows "choose file(s)" dialog. Returns absolute paths, [] if cancelled.
    electron_1.ipcMain.handle('files:pickFiles', async (e, opts) => {
        const win = electron_1.BrowserWindow.fromWebContents(e.sender) ?? undefined;
        const result = await electron_1.dialog.showOpenDialog(win, {
            properties: opts?.multi === false ? ['openFile'] : ['openFile', 'multiSelections'],
        });
        if (result.canceled)
            return [];
        return result.filePaths;
    });
    // Choose a folder (used for changing the base data storage path)
    electron_1.ipcMain.handle('files:pickFolder', async (e) => {
        const win = electron_1.BrowserWindow.fromWebContents(e.sender) ?? undefined;
        const result = await electron_1.dialog.showOpenDialog(win, {
            properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || !result.filePaths.length)
            return null;
        return result.filePaths[0];
    });
    electron_1.ipcMain.handle('files:getBasePath', () => (0, storagePaths_1.getBasePath)());
    electron_1.ipcMain.handle('files:setBasePath', (_e, newPath) => {
        fs_1.default.mkdirSync(newPath, { recursive: true });
        (0, database_1.setSetting)('base_data_path', newPath);
        return true;
    });
}
