'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const PizZip=require('pizzip');
const windowsContract=require('../web/vendor/contract');const windowsConsent=require('../web/vendor/consent');
const {fixture,longFixture}=require('./fixtures.cjs');
const root=path.resolve(__dirname,'..');
function browserCore(){const sandbox={console,setTimeout,clearTimeout,TextEncoder,TextDecoder,atob,btoa,Blob};sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'app/src/main/assets/core.js'),'utf8'),sandbox);return sandbox.ContractDocuments;}
function equalOOXML(a,b){const first=new PizZip(a),second=new PizZip(b);const files=Object.keys(first.files).filter(name=>!first.files[name].dir);assert.deepEqual(files.sort(),Object.keys(second.files).filter(name=>!second.files[name].dir).sort());for(const name of files)assert.ok(first.file(name).asUint8Array().toString()===second.file(name).asUint8Array().toString(),name);}
test('vendored Windows code and templates retain their recorded SHA-256',()=>{
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'web/vendor/provenance.json')));
 assert.match(provenance.windowsCommit,/^[a-f0-9]{40}$/);
 for(const [file,hash] of Object.entries(provenance.sha256)){
  const copied=path.join(root,'web',file.startsWith('templates/')?file:'vendor/'+file);const bytes=fs.readFileSync(copied);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash);
  const original=path.join(root,'../contract-app',file);if(fs.existsSync(original))assert.ok(bytes.equals(fs.readFileSync(original)),file);
 }
});
for(const [label,data] of [['normal',fixture],['long',longFixture]])for(const kind of ['contract','consent'])test(`offline browser generates identical Windows OOXML: ${kind}, ${label}`,()=>{
 const browser=browserCore(),file=browser.generate(kind,data);assert.ok(file.name.endsWith('.docx'));const result=Buffer.from(file.base64,'base64');
 const expected=kind==='contract'?windowsContract.buildContract(path.join(root,'web/templates/contract.docx'),data):windowsConsent.buildConsent(path.join(root,'web/templates/consent.docx'),data);
 equalOOXML(result,expected);
 const output=path.join(root,'.local/test-documents');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,`${kind}-${label}.docx`),result);
 const text=new PizZip(result).file('word/document.xml').asText().replace(/<[^>]*>/g,'');assert.ok(text.includes(data.fullName));assert.ok(text.includes(data.address));
 if(kind==='consent'){assert.equal(text.split(data.fullName).length-1,1);assert.ok(text.includes('________ г.'));assert.ok(!text.includes('2026'));}
});
test('formatting and filenames use the unchanged Windows rules',()=>{
 const core=browserCore();assert.equal(core.formats.formatValue('payment','1950000'),'1.950.000 р.');assert.equal(core.formats.formatValue('passportSeries','0000'),'00 00');assert.equal(core.formats.formatValue('phone','81122993388'),'+7 112 299 33 88');assert.equal(core.formats.formatValue('passportCode','222333'),'222-333');
 assert.equal(core.generate('contract',{...fixture,number:'123'}).name,'№123_Договор_Тест_Макетович_Испытательный.docx');
 assert.throws(()=>core.generate('contract',{}),/Заполните/);assert.throws(()=>core.generate('consent',{...fixture,passportDate:'2026-02-30'}),/неверная дата/);
});
test('the manifest contains no network permission and opts out of backups',()=>{
 const manifest=fs.readFileSync(path.join(root,'app/src/main/AndroidManifest.xml'),'utf8');assert.doesNotMatch(manifest,/android.permission.INTERNET|ACCESS_NETWORK_STATE|WRITE_EXTERNAL_STORAGE/);assert.match(manifest,/android:allowBackup="false"/);assert.match(manifest,/android:fullBackupContent="false"/);assert.match(manifest,/android:exported="false"/);
 const rules=fs.readFileSync(path.join(root,'app/src/main/res/xml/data_extraction_rules.xml'),'utf8');assert.match(rules,/<cloud-backup/);assert.match(rules,/<device-transfer/);
});
