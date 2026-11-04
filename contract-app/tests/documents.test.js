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
 assert.equal(contractFilename({...fixture,number:'123'}),'№123_Договор_Испытательный_Тест_Макетович.docx');
 assert.equal(contractFilename({...fixture,number:'№ 123'}),'№123_Договор_Испытательный_Тест_Макетович.docx');
 assert.equal(contractFilename({...fixture,fullName:'Испытательный Тест'}),'№TEST-001_Договор_Испытательный_Тест.docx');
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
  const xml=documentXml(buildContract(contractTemplate,data));const text=plain(xml);
  assert.ok(text.includes(data.fullName));assert.ok(text.includes(data.address));assert.ok(text.includes(data.payment));
  assert.match(text,/паспорт .+?, выдан .+?, дата выдачи/);
  assert.match(text,/НДС 5%/);assert.doesNotMatch(text,/НДС не облагается/);
  assert.doesNotMatch(text,/переписку с только с/);
  const introParagraph=xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g).find(p=>p.includes('Устава'));
  assert.ok(introParagraph,'the agent introduction paragraph is present');
  assert.ok(plain(introParagraph).includes(`с одной стороны, и\u00a0${data.fullName}`),
   'the conjunction stays with the client surname at the beginning of a wrapped line');
  const detailsParagraph=xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)
   .find(p=>!p.includes('Устава')&&plain(p).includes(data.address));
  assert.ok(detailsParagraph,'the principal details block is present');
  assert.match(detailsParagraph,/<w:spacing w:after="240"\/>/,
   'the INN is separated from the passport and address block by a blank line');
  const datedHeadings=xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)
   .filter(p=>plain(p).includes(`№ ${data.number} от`));
  assert.equal(datedHeadings.length,2,'both appendix headings include the contract number and date');
  for(const headingXml of datedHeadings){
   const heading=plain(headingXml);
   assert.ok(heading.includes(`№ ${data.number} от «${data.date.slice(8,10)}» ${['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][Number(data.date.slice(5,7))-1]} ${data.date.slice(0,4)} г.`),
    'the date inside guillemets has no extra spaces');
   assert.match(headingXml,/<w:jc w:val="right"\/>/,'the dated heading does not stretch spaces across the line');
  }
  assert.doesNotMatch(datedHeadings.join(' '),/«\s+\d{2}\s+»/);
  const paymentParagraph=xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g).find(p=>p.replace(/<[^>]*>/g,'').startsWith('1.12 ')) ;assert.match(paymentParagraph,/<w:jc w:val="left"\/>/);
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

test('gearbox value remains inside its table cell',()=>{
 const xml=documentXml(buildContract(contractTemplate,{...fixture,gearbox:'Вариатор'}));
 const paragraph=xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g).find(p=>p.includes('Вариатор'));
 assert.ok(paragraph);assert.match(paragraph,/<w:ind w:left="0" w:right="0" w:firstLine="0"\/>/);
 assert.doesNotMatch(paragraph,/<w:ind[^>]*w:left="-/);
});
test('principal passport details keep punctuation and collapse accidental extra spaces',()=>{
 const data={...fixture,fullName:'  Испытательный   Тест   Макетович  ',
  passportAuthority:' Тестовое   отделение   МВД ',address:'г.  Тестовый,   ул. Примерная, д. 1 '};
 const text=plain(documentXml(buildContract(contractTemplate,data)));
 assert.ok(text.includes('Испытательный Тест Макетович, 15.01.1990 года рождения, паспорт 00 00 000000, выдан Тестовое отделение МВД, дата выдачи 20.02.2010, код подразделения: 000-000, зарегистрированный (ая) по адресу: г. Тестовый, ул. Примерная, д. 1'));
});
