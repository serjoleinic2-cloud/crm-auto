function api() {
  if (typeof window === 'undefined' || !window.electronAPI) throw new Error('electronAPI not available');
  return window.electronAPI;
}

export const ipcService = {
  clients: {
    getAll:         (f?: Parameters<Window['electronAPI']['clients']['getAll']>[0]) => api().clients.getAll(f),
    getById:        (id: number) => api().clients.getById(id),
    create:         (d: Parameters<Window['electronAPI']['clients']['create']>[0]) => api().clients.create(d),
    update:         (id: number, d: Parameters<Window['electronAPI']['clients']['update']>[1]) => api().clients.update(id, d),
    archive:        (id: number) => api().clients.archive(id),
    trash:          (id: number) => api().clients.trash(id),
    restore:        (id: number) => api().clients.restore(id),
    deleteForever:  (id: number) => api().clients.deleteForever(id),
    search:         (q: string) => api().clients.search(q),
    suggest:        (q: string) => api().clients.suggest(q),
  },
  orders: {
    getByClientId: (id: number) => api().orders.getByClientId(id),
    create:        (d: Parameters<Window['electronAPI']['orders']['create']>[0]) => api().orders.create(d),
    update:        (id: number, d: Parameters<Window['electronAPI']['orders']['update']>[1]) => api().orders.update(id, d),
    delete:        (id: number) => api().orders.delete(id),
  },
  contacts: {
    getByClientId: (id: number) => api().contacts.getByClientId(id),
    create:        (d: Parameters<Window['electronAPI']['contacts']['create']>[0]) => api().contacts.create(d),
    delete:        (id: number) => api().contacts.delete(id),
    setPrimary:    (cid: number, ctid: number) => api().contacts.setPrimary(cid, ctid),
  },
  consent: {
    getByClientId: (id: number) => api().consent.getByClientId(id),
    update:        (id: number, d: Parameters<Window['electronAPI']['consent']['update']>[1]) => api().consent.update(id, d),
  },
  history:      { getByClientId: (id: number) => api().history.getByClientId(id) },
  statuses:     { getAll: () => api().statuses.getAll() },
  dashboard:    { getStats: () => api().dashboard.getStats() },
  carBrands:    { getAll: () => api().carBrands.getAll() },
  settings: {
    get: (key: string) => api().settings.get(key),
    set: (key: string, value: string) => api().settings.set(key, value),
  },
  files: {
    openClientFolder: (clientId: number, clientName: string) => api().files.openClientFolder(clientId, clientName),
    openFile:         (filePath: string) => api().files.openFile(filePath),
    pickFiles:        (opts?: { multi?: boolean }) => api().files.pickFiles(opts),
    pickFolder:       () => api().files.pickFolder(),
    getBasePath:      () => api().files.getBasePath(),
    setBasePath:      (newPath: string) => api().files.setBasePath(newPath),
  },
  documentTypes: {
    getAll: () => api().documentTypes.getAll(),
    create: (d: Parameters<Window['electronAPI']['documentTypes']['create']>[0]) => api().documentTypes.create(d),
  },
  documents: {
    getByClientId: (clientId: number) => api().documents.getByClientId(clientId),
    updateStatus:  (clientId: number, documentTypeId: number, status: Parameters<Window['electronAPI']['documents']['updateStatus']>[2]) =>
      api().documents.updateStatus(clientId, documentTypeId, status),
    updateComment: (clientId: number, documentTypeId: number, comment: string) => api().documents.updateComment(clientId, documentTypeId, comment),
    addFiles:      (clientId: number, documentTypeId: number, filePaths: string[], orderId?: number | null) =>
      api().documents.addFiles(clientId, documentTypeId, filePaths, orderId),
    addFilesBulk:  (clientId: number, entries: { documentTypeId: number; filePaths: string[] }[]) => api().documents.addFilesBulk(clientId, entries),
    deleteFile:    (fileId: number) => api().documents.deleteFile(fileId),
  },
  customFields: {
    getAll:    (t: string) => api().customFields.getAll(t),
    getValues: (fids: number[], eid: number) => api().customFields.getValues(fids, eid),
    setValue:  (fid: number, eid: number, v: string) => api().customFields.setValue(fid, eid, v),
  },
};
