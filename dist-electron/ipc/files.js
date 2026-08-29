"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFilesHandlers = registerFilesHandlers;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function registerFilesHandlers() {
    electron_1.ipcMain.handle('files:openClientFolder', (_e, clientId, clientName) => {
        const safe = clientName.replace(/[<>:"/\\|?*]/g, '_');
        const folder = path_1.default.join(electron_1.app.getPath('documents'), 'CRM-Auto', `${clientId}_${safe}`);
        fs_1.default.mkdirSync(folder, { recursive: true });
        electron_1.shell.openPath(folder);
        return folder;
    });
}
