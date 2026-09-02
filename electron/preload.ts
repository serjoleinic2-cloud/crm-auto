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
    getAll:         ()                               => invoke('orders:getAll'),
    getByClientId:  (clientId: number)               => invoke('orders:getByClientId', clientId),
    getById:        (id: number)                       => invoke('orders:getById', id),
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
  orderStatuses: { getAll: () => invoke('orderStatuses:getAll') },
  dashboard: { getStats: () => invoke('dashboard:getStats') },
  carBrands: { getAll: () => invoke('carBrands:getAll') },
  settings: {
    get: (key: string)                => invoke('settings:get', key),
    set: (key: string, value: string) => invoke('settings:set', key, value),
  },
  files: {
    openClientFolder: (clientId: number, clientName: string) => invoke('files:openClientFolder', clientId, clientName),
    openFile:         (filePath: string)                      => invoke('files:openFile', filePath),
    pickFiles:        (opts?: { multi?: boolean })             => invoke('files:pickFiles', opts),
    pickFolder:       ()                                       => invoke('files:pickFolder'),
    getBasePath:      ()                                       => invoke('files:getBasePath'),
    setBasePath:      (newPath: string)                        => invoke('files:setBasePath', newPath),
  },
  documentTypes: {
    getAll:  ()                                            => invoke('documentTypes:getAll'),
    create:  (data: { name: string; folder_name?: string }) => invoke('documentTypes:create', data),
    delete:  (id: number)                                  => invoke('documentTypes:delete', id),
  },
  documents: {
    getByClientId:  (clientId: number)                                                 => invoke('documents:getByClientId', clientId),
    updateStatus:   (clientId: number, documentTypeId: number, status: string)          => invoke('documents:updateStatus', clientId, documentTypeId, status),
    updateComment:  (clientId: number, documentTypeId: number, comment: string)         => invoke('documents:updateComment', clientId, documentTypeId, comment),
    addFiles:       (clientId: number, documentTypeId: number, filePaths: string[], orderId?: number | null) =>
      invoke('documents:addFiles', clientId, documentTypeId, filePaths, orderId),
    addFilesBulk:   (clientId: number, entries: { documentTypeId: number; filePaths: string[] }[]) =>
      invoke('documents:addFilesBulk', clientId, entries),
    deleteFile:     (fileId: number)                                                    => invoke('documents:deleteFile', fileId),
    generate:       ()                                                                  => invoke('documents:generate'),
  },
  reminders: {
    getAll:    (filters?: object) => invoke('reminders:getAll', filters),
    getById:   (id: number)       => invoke('reminders:getById', id),
    create:    (data: object)     => invoke('reminders:create', data),
    update:    (id: number, data: object) => invoke('reminders:update', id, data),
    delete:    (id: number)       => invoke('reminders:delete', id),
    getStats:  ()                 => invoke('reminders:getStats'),
  },
  customFields: {
    getAll:    (entityType: string)                         => invoke('customFields:getAll', entityType),
    getValues: (fieldIds: number[], entityId: number)       => invoke('customFields:getValues', fieldIds, entityId),
    setValue:  (fieldId: number, entityId: number, v: string) => invoke('customFields:setValue', fieldId, entityId, v),
  },
  contracts: {
    getNextNumber:    ()                                          => invoke('contracts:getNextNumber'),
    getPassportData:  (clientId: number)                          => invoke('contracts:getPassportData', clientId),
    savePassportData: (clientId: number, data: object)            => invoke('contracts:savePassportData', clientId, data),
    generate:         (data: object)                              => invoke('contracts:generate', data),
    openFile:         (filePath: string)                          => invoke('contracts:openFile', filePath),
  },
  backup: {
    create:             () => invoke('backup:create'),
    restore:            () => invoke('backup:restore'),
    getDbPath:          () => invoke('backup:getDbPath'),
    autoBackupOnLaunch: () => invoke('backup:autoBackupOnLaunch'),
  },
});
