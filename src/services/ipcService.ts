function api() {
  if (typeof window === 'undefined' || !window.electronAPI) throw new Error('electronAPI not available');
  return window.electronAPI;
}

export const ipcService = {
  clients: {
    getAll:  (f?: Parameters<Window['electronAPI']['clients']['getAll']>[0]) => api().clients.getAll(f),
    getById: (id: number) => api().clients.getById(id),
    create:  (d: Parameters<Window['electronAPI']['clients']['create']>[0]) => api().clients.create(d),
    update:  (id: number, d: Parameters<Window['electronAPI']['clients']['update']>[1]) => api().clients.update(id, d),
    archive: (id: number) => api().clients.archive(id),
    delete:  (id: number) => api().clients.delete(id),
    search:  (q: string) => api().clients.search(q),
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
  customFields: {
    getAll:    (t: string) => api().customFields.getAll(t),
    getValues: (fids: number[], eid: number) => api().customFields.getValues(fids, eid),
    setValue:  (fid: number, eid: number, v: string) => api().customFields.setValue(fid, eid, v),
  },
};
