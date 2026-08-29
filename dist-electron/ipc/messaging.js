"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMessagingHandlers = registerMessagingHandlers;
const electron_1 = require("electron");
function registerMessagingHandlers() {
    electron_1.ipcMain.handle('messaging:open', (_e, type, value) => {
        let url = '';
        switch (type) {
            case 'telegram':
                url = `https://t.me/${value.replace('@', '')}`;
                break;
            case 'whatsapp':
                url = `https://wa.me/${value.replace(/\D/g, '')}`;
                break;
            case 'max':
                url = `https://max.ru/${value.replace('@', '')}`;
                break;
            case 'phone':
                url = `tel:${value}`;
                break;
            case 'email':
                url = `mailto:${value}`;
                break;
            default: url = value.startsWith('http') ? value : `https://${value}`;
        }
        if (url)
            electron_1.shell.openExternal(url);
        return true;
    });
}
