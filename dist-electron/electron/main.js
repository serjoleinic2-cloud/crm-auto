"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const database_1 = require("./ipc/database");
const messaging_1 = require("./ipc/messaging");
const files_1 = require("./ipc/files");
const documents_1 = require("./ipc/documents");
const backup_1 = require("./ipc/backup");
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1366,
        height: 768,
        minWidth: 1024,
        minHeight: 600,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        titleBarStyle: 'default',
        show: false,
    });
    win.once('ready-to-show', () => win.show());
    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    }
    else {
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('tel:')) {
            electron_1.shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    return win;
}
electron_1.app.whenReady().then(() => {
    (0, database_1.initDatabase)();
    (0, messaging_1.registerMessagingHandlers)();
    (0, files_1.registerFilesHandlers)();
    (0, documents_1.registerDocumentsHandlers)();
    (0, backup_1.registerBackupHandlers)();
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
