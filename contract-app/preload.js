'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('contractApp',{saveContract:data=>ipcRenderer.invoke('contract:save',data),saveConsent:data=>ipcRenderer.invoke('consent:save',data)});
