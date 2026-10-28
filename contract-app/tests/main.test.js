'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function createApp(result) {
  const handlers = new Map();
  const saved = [];
  const calls = [];
  const owner = { isDestroyed: () => false, focus: () => calls.push('window-focus'), webContents: { focus: () => calls.push('contents-focus') } };
  class BrowserWindow {
    static fromWebContents(sender) { assert.equal(sender, 'test-renderer'); return owner; }
    constructor() { this.webContents = { setWindowOpenHandler() {} }; }
    loadFile() {}
  }
  const electron = {
    app: { whenReady: () => Promise.resolve(), on() {} }, BrowserWindow,
    session: { defaultSession: { webRequest: { onBeforeRequest() {} } } },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: { showSaveDialog: async (parent, options) => {
      assert.equal(parent, owner);
      assert.ok(options.filters[0].extensions.length);
      calls.push('dialog');
      if (result instanceof Error) throw result;
      return result;
    } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'), {
    __dirname: path.join(__dirname, '..'),
    require: name => name === 'electron' ? electron : name === 'fs' ? {
      writeFileSync: (file, buffer, options) => saved.push({file, buffer, options})
    } : name.startsWith('./') ? require(path.join(__dirname, '..', name)) : require(name)
  });
  await Promise.resolve();
  return { handlers, saved, calls };
}
const fixture = {
  number:'TEST-001',date:'2026-10-28',managerPhone:'+7 112 299 33 88',
  fullName:'Тестов Тест Тестович',birthDate:'1990-01-15',phone:'+7 112 299 33 88',
  email:'test@example.invalid',inn:'000000000000',passportSeries:'00 00',passportNumber:'000000',
  passportDate:'2010-02-20',passportAuthority:'Тестовый отдел',passportCode:'222-333',
  address:'г. Тестовый, ул. Примерная, д. 1',body:'Седан',brand:'Тест',model:'Пример',
  carYear:'2024',engine:'2000',engineType:'Бензин',drive:'Передний',gearbox:'АКПП',
  configuration:'Тест',color:'Белый',payment:'100000'
};
for (const channel of ['contract:save', 'consent:save']) {
  test(`${channel}: parented dialog, real document, restored focus`, async () => {
    const app = await createApp({canceled:false,filePath:'test-output'});
    const result = await app.handlers.get(channel)({sender:'test-renderer'}, fixture);
    assert.equal(result.ok, true);
    assert.deepEqual(app.calls, ['dialog','window-focus','contents-focus']);
    assert.equal(app.saved.length, 1);
    assert.equal(app.saved[0].options.flag, 'wx');
    assert.ok(app.saved[0].buffer.length > 1000);
    assert.equal(app.saved[0].buffer.subarray(0, channel === 'contract:save' ? 2 : 4).toString(), channel === 'contract:save' ? 'PK' : '%PDF');
  });
  test(`${channel}: cancel restores focus without writing`, async () => {
    const app = await createApp({canceled:true});
    const result = await app.handlers.get(channel)({sender:'test-renderer'}, fixture);
    assert.equal(result.cancelled, true);
    assert.deepEqual(app.calls, ['dialog','window-focus','contents-focus']);
    assert.equal(app.saved.length, 0);
  });
  test(`${channel}: dialog failure restores focus and reports the error`, async () => {
    const app = await createApp(new Error('Test dialog failure'));
    const result = await app.handlers.get(channel)({sender:'test-renderer'}, fixture);
    assert.equal(result.error, 'Test dialog failure');
    assert.deepEqual(app.calls, ['dialog','window-focus','contents-focus']);
    assert.equal(app.saved.length, 0);
  });
  test(`${channel}: invalid data returns an error without opening a dialog`, async () => {
    const app = await createApp({canceled:false,filePath:'unused'});
    const result = await app.handlers.get(channel)({sender:'test-renderer'}, {});
    assert.match(result.error, /Заполните/);
    assert.equal(app.calls.length, 0);
    assert.equal(app.saved.length, 0);
  });
}
