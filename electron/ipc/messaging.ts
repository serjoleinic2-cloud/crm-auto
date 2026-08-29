import { ipcMain, shell } from 'electron';

export function registerMessagingHandlers(): void {
  ipcMain.handle('messaging:open', (_e, type: string, value: string) => {
    let url = '';
    switch (type) {
      case 'telegram':  url = `https://t.me/${value.replace('@', '')}`; break;
      case 'whatsapp':  url = `https://wa.me/${value.replace(/\D/g, '')}`; break;
      case 'max':       url = `https://max.ru/${value.replace('@', '')}`; break;
      case 'phone':     url = `tel:${value}`; break;
      case 'email':     url = `mailto:${value}`; break;
      default:          url = value.startsWith('http') ? value : `https://${value}`;
    }
    if (url) shell.openExternal(url);
    return true;
  });
}
