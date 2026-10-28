'use strict';
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const {formatDate} = require('./contract');

function buildConsent(templatePath, data) {
 const required={fullName:'ФИО клиента',passportSeries:'серию паспорта',passportNumber:'номер паспорта',passportDate:'дату выдачи паспорта',passportAuthority:'орган, выдавший паспорт',passportCode:'код подразделения',address:'адрес регистрации'};
 const missing=Object.keys(required).filter(k=>!String(data[k]??'').trim()).map(k=>required[k]);
 if(missing.length) throw new Error('Заполните: '+missing.join(', ')+'.');
 const values={
  fullName:String(data.fullName).trim(),
  passportText:`${String(data.passportSeries).trim()} ${String(data.passportNumber).trim()}`,
  passportDateText:formatDate(data.passportDate),
  passportAuthority:String(data.passportAuthority).trim(),
  passportCode:String(data.passportCode).trim(),
  address:String(data.address).trim()
 };
 const doc=new Docxtemplater(new PizZip(fs.readFileSync(templatePath)), {
  paragraphLoop:true,linebreaks:true,
  nullGetter:()=>{throw new Error('В шаблоне согласия обнаружено незаполненное поле.')}
 });
 doc.render(values);
 return doc.getZip().generate({type:'nodebuffer',compression:'DEFLATE'});
}
module.exports={buildConsent};
