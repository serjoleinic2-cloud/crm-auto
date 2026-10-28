const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const {buildContract} = require('./contract');
const {contractFilename} = require('./document-filenames');
async function chooseSavePath(event, options) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  try {
    return await dialog.showSaveDialog(owner, options);
  } finally {
    if (owner && !owner.isDestroyed()) {
      owner.focus();
      owner.webContents.focus();
    }
  }
}
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('devtools:') });
  });
  ipcMain.handle('contract:save', async (event, data) => {
    try {
      const buffer=buildContract(path.join(__dirname,'templates','contract.docx'),data);
      const result=await chooseSavePath(event,{title:'Сохранить договор',defaultPath:contractFilename(data),filters:[{name:'Документ Word',extensions:['docx']}]});
      if(result.canceled || !result.filePath) return {cancelled:true};
      fs.writeFileSync(result.filePath,buffer,{flag:'wx'});
      return {ok:true};
    } catch(e) {return {error:e.message || 'Не удалось создать договор.'};}
  });
  ipcMain.handle('consent:save', async (event, data) => {
    try {
      const {buildConsent} = require('./consent');
      const buffer=buildConsent(path.join(__dirname,'templates','consent.docx'),data);
      const result=await chooseSavePath(event,{title:'Сохранить согласие',defaultPath:'Согласие.docx',filters:[{name:'Документ Word',extensions:['docx']}]});
      if(result.canceled || !result.filePath) return {cancelled:true};
      fs.writeFileSync(result.filePath,buffer,{flag:'wx'});
      return {ok:true};
    } catch(e) {return {error:e.message || 'Не удалось создать согласие.'};}
  });
  const window = new BrowserWindow({width:1000,height:760,minWidth:700,minHeight:600,icon:path.join(__dirname,'assets','icon.png'),webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,preload:path.join(__dirname,'preload.js')}});
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed', () => app.quit());
