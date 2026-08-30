import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('electronAPI', {
  clients: {
    getAll:         (filters?: object)               => invoke('clients:getAll', filters),
    getById:        (id: number)                     => invoke('clients:getById', id),
    create:         (data: object)                   => invoke('clients:create', data),
    update:         (id: number, data: object)       => invoke('clients:update', id, data),
    archive:        (id: number)                     => invoke('clients:archive', id),
    trash:          (id: number)                     => invoke('clients:trash', id),
    restore:        (id: number)                     => invoke('clients:restore', id),
    deleteForever:  (id: number)                     => invoke('clients:deleteForever', id),
    search:         (query: string)                  => invoke('clients:search', query),
    suggest:        (query: string)                  => invoke('clients:suggest', query),
  },
  orders: {
    getByClientId:  (clientId: number)               => invoke('orders:getByClientId', clientId),
    create:         (data: object)                   => invoke('orders:create', data),
    update:         (id: number, data: object)       => invoke('orders:update', id, data),
    delete:         (id: number)                     => invoke('orders:delete', id),
  },
  contacts: {
    getByClientId:  (clientId: number)               => invoke('contacts:getByClientId', clientId),
    create:         (data: object)                   => invoke('contacts:create', data),
    delete:         (id: number)                     => invoke('contacts:delete', id),
    setPrimary:     (clientId: number, contactId: number) => invoke('contacts:setPrimary', clientId, contactId),
  },
  consent: {
    getByClientId:  (clientId: number)               => invoke('consent:getByClientId', clientId),
    update:         (clientId: number, data: object) => invoke('consent:update', clientId, data),
  },
  history: {
    getByClientId:  (clientId: number)               => invoke('history:getByClientId', clientId),
  },
  statuses: { getAll: () => invoke('statuses:getAll') },
  dashboard: { getStats: () => invoke('dashboard:getStats') },
  carBrands: { getAll: () => invoke('carBrands:getAll') },
  customFields: {
    getAll:    (entityType: string)                         => invoke('customFields:getAll', entityType),
    getValues: (fieldIds: number[], entityId: number)       => invoke('customFields:getValues', fieldIds, entityId),
    setValue:  (fieldId: number, entityId: number, v: string) => invoke('customFields:setValue', fieldId, entityId, v),
  },
});
