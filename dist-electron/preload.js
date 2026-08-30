"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const invoke = (channel, ...args) => electron_1.ipcRenderer.invoke(channel, ...args);
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    clients: {
        getAll: (filters) => invoke('clients:getAll', filters),
        getById: (id) => invoke('clients:getById', id),
        create: (data) => invoke('clients:create', data),
        update: (id, data) => invoke('clients:update', id, data),
        archive: (id) => invoke('clients:archive', id),
        trash: (id) => invoke('clients:trash', id),
        restore: (id) => invoke('clients:restore', id),
        deleteForever: (id) => invoke('clients:deleteForever', id),
        search: (query) => invoke('clients:search', query),
        suggest: (query) => invoke('clients:suggest', query),
    },
    orders: {
        getByClientId: (clientId) => invoke('orders:getByClientId', clientId),
        create: (data) => invoke('orders:create', data),
        update: (id, data) => invoke('orders:update', id, data),
        delete: (id) => invoke('orders:delete', id),
    },
    contacts: {
        getByClientId: (clientId) => invoke('contacts:getByClientId', clientId),
        create: (data) => invoke('contacts:create', data),
        delete: (id) => invoke('contacts:delete', id),
        setPrimary: (clientId, contactId) => invoke('contacts:setPrimary', clientId, contactId),
    },
    consent: {
        getByClientId: (clientId) => invoke('consent:getByClientId', clientId),
        update: (clientId, data) => invoke('consent:update', clientId, data),
    },
    history: {
        getByClientId: (clientId) => invoke('history:getByClientId', clientId),
    },
    statuses: { getAll: () => invoke('statuses:getAll') },
    dashboard: { getStats: () => invoke('dashboard:getStats') },
    carBrands: { getAll: () => invoke('carBrands:getAll') },
    settings: {
        get: (key) => invoke('settings:get', key),
        set: (key, value) => invoke('settings:set', key, value),
    },
    files: {
        openClientFolder: (clientId, clientName) => invoke('files:openClientFolder', clientId, clientName),
        openFile: (filePath) => invoke('files:openFile', filePath),
        pickFiles: (opts) => invoke('files:pickFiles', opts),
        pickFolder: () => invoke('files:pickFolder'),
        getBasePath: () => invoke('files:getBasePath'),
        setBasePath: (newPath) => invoke('files:setBasePath', newPath),
    },
    documentTypes: {
        getAll: () => invoke('documentTypes:getAll'),
        create: (data) => invoke('documentTypes:create', data),
    },
    documents: {
        getByClientId: (clientId) => invoke('documents:getByClientId', clientId),
        updateStatus: (clientId, documentTypeId, status) => invoke('documents:updateStatus', clientId, documentTypeId, status),
        updateComment: (clientId, documentTypeId, comment) => invoke('documents:updateComment', clientId, documentTypeId, comment),
        addFiles: (clientId, documentTypeId, filePaths, orderId) => invoke('documents:addFiles', clientId, documentTypeId, filePaths, orderId),
        addFilesBulk: (clientId, entries) => invoke('documents:addFilesBulk', clientId, entries),
        deleteFile: (fileId) => invoke('documents:deleteFile', fileId),
        generate: () => invoke('documents:generate'),
    },
    customFields: {
        getAll: (entityType) => invoke('customFields:getAll', entityType),
        getValues: (fieldIds, entityId) => invoke('customFields:getValues', fieldIds, entityId),
        setValue: (fieldId, entityId, v) => invoke('customFields:setValue', fieldId, entityId, v),
    },
});
