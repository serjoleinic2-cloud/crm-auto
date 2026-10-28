'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const PizZip=require('pizzip');
const {buildConsent}=require('../consent');
const {buildContract}=require('../contract');
const {contractFilename}=require('../document-filenames');
const {fixture,longFixture}=require('./fixtures');
const consentTemplate=path.join(__dirname,'../templates/consent.docx');
const contractTemplate=path.join(__dirname,'../templates/contract.docx');
function documentXml(buffer){return new PizZip(buffer).file('word/document.xml').asText()}
function plain(xml){return xml.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}

test('contract filename reorders surname-first input and keeps number',()=>{
 assert.equal(contractFilename({...fixture,number:'123'}),'№123_Договор_Тест_Макетович_Испытательный.docx');
 assert.equal(contractFilename({...fixture,number:'№ 123'}),'№123_Договор_Тест_Макетович_Испытательный.docx');
 assert.equal(contractFilename({...fixture,fullName:'Испытательный Тест'}),'№TEST-001_Договор_Тест_Испытательный.docx');
});
test('contract filename strips forbidden Windows characters and limits length',()=>{
 const name=contractFilename({...longFixture,number:'№12/3:*?<>|"\\\u0001',fullName:longFixture.fullName+' А'.repeat(300)});
 assert.ok(name.startsWith('№123_Договор_'));
 assert.ok(name.endsWith('.docx'));
 assert.ok(name.length<=185);
 assert.doesNotMatch(name,/[<>:"/\\|?*\x00-\x1f]/);
});
for(const data of [fixture,longFixture]){
 test(`consent is an editable Word document and fills only top fields (${data.number})`,()=>{
  const buffer=buildConsent(consentTemplate,data),xml=documentXml(buffer),text=plain(xml);
  assert.equal(buffer.subarray(0,2).toString(),'PK');
  assert.ok(text.includes(data.fullName));assert.ok(text.includes(data.address));assert.ok(text.includes(data.passportAuthority));
  assert.ok(text.includes('00 00 000000'));assert.ok(text.includes('20.02.2010'));
  assert.equal(text.split(data.fullName).length-1,1);
  const footer=text.slice(text.indexOf('Подпись субъекта (представителя субъекта)'));
  assert.doesNotMatch(footer,/2026|Испытательный|00 00|000000/);
  assert.ok(footer.includes('________ г.'));assert.ok(footer.includes('полностью, подпись'));
  assert.ok(text.includes('Выражаю ______________________ на трансграничную передачу моих персональных данных.'));
  assert.ok(text.includes('(согласие/несогласие)'));
  assert.doesNotMatch(xml,/<w:drawing|<w:pict|<w:documentProtection/);
  assert.doesNotMatch(text,/\{(?:fullName|address|passport)/);
 });
 test(`contract template still fills the introduced client (${data.number})`,()=>{
  const text=plain(documentXml(buildContract(contractTemplate,data)));
  assert.ok(text.includes(data.fullName));assert.ok(text.includes(data.address));assert.ok(text.includes(data.payment));
 });
}
test('generation never reuses a previous client or autofills a signature',()=>{
 const previous={...fixture,fullName:'Первый-Синтетический Тест Старый',address:'Старый-Адрес-Синтетический'};
 buildConsent(consentTemplate,previous);buildContract(contractTemplate,previous);
 for(const buffer of [buildConsent(consentTemplate,longFixture),buildContract(contractTemplate,longFixture)]){
  const zip=new PizZip(buffer);
  for(const file of Object.keys(zip.files).filter(name=>name.endsWith('.xml'))){
   assert.doesNotMatch(zip.file(file).asText(),/Первый-Синтетический|Старый-Адрес-Синтетический/);
  }
 }
});
test('consent validates dates and required fields',()=>{
 assert.throws(()=>buildConsent(consentTemplate,{}),/Заполните/);
 assert.throws(()=>buildConsent(consentTemplate,{...fixture,passportDate:'2026-02-30'}),/неверная дата/);
});
