'use strict';
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function dateParts(value) {
 const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
 if (!m) throw new Error('Проверьте даты договора, рождения и выдачи паспорта.');
 const year=Number(m[1]), month=Number(m[2]), day=Number(m[3]);
 const date=new Date(Date.UTC(year, month-1, day));
 if(date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day) throw new Error('Указана неверная дата.');
 return {day:m[3], month:months[month-1], year:m[1], formatted:`${m[3]}.${m[2]}.${m[1]}`};
}
function normalizeText(value) { return String(value ?? '').trim().replace(/\s+/g,' '); }
function buildContract(templatePath, data) {
 const required={number:'номер договора',date:'дату договора',managerPhone:'телефон менеджера',fullName:'ФИО клиента',birthDate:'дату рождения',phone:'телефон клиента',email:'почту клиента',inn:'ИНН',passportSeries:'серию паспорта',passportNumber:'номер паспорта',passportDate:'дату выдачи паспорта',passportAuthority:'кем выдан паспорт',passportCode:'код подразделения',address:'адрес регистрации'};
 const missing=Object.keys(required).filter(k=>!String(data[k]??'').trim()).map(k=>required[k]);
 if(missing.length) throw new Error('Заполните: '+missing.join(', ')+'.');
 const date=dateParts(data.date), birth=dateParts(data.birthDate), passportDate=dateParts(data.passportDate);
 const names=data.fullName.trim().split(/\s+/);
 if(names.length<2) throw new Error('Укажите фамилию и имя клиента.');
 const shortName=names.slice(1).map(n=>n[0].toUpperCase()+'.').join('')+' '+names[0];
 const passportText=`${normalizeText(data.passportSeries)} ${normalizeText(data.passportNumber)}`;
 const clientDetails=`${normalizeText(data.fullName)}, ${birth.formatted} года рождения, паспорт ${passportText}, выдан ${normalizeText(data.passportAuthority)}, дата выдачи ${passportDate.formatted}, код подразделения: ${normalizeText(data.passportCode)}, зарегистрированный (ая) по адресу: ${normalizeText(data.address)}`;
 const phoneForDocument=String(data.phone??'').replace(/^(\+7)\s+/, '$1\u00a0');
 const optionalVehicleFields=['body','brand','model','carYear','engine','engineType','drive','gearbox','configuration','color','mileage','payment','other'];
 const values={...data,...Object.fromEntries(optionalVehicleFields.map(key=>[key,data[key]??''])), phone:phoneForDocument, day:date.day,month:date.month,year:date.year,monthYear:`${date.month} ${date.year} `,birthDateText:birth.formatted,passportText,passportDateText:passportDate.formatted,clientDetails,shortName,innLine:`ИНН/ ${data.inn.trim()}`,agentEmail:'ZakazLisaRulit@yandex.ru'};
 const doc=new Docxtemplater(new PizZip(fs.readFileSync(templatePath)), {paragraphLoop:true,linebreaks:true,nullGetter:()=>{throw new Error('В шаблоне обнаружено незаполненное поле.')}});
 doc.render(values);
 return doc.getZip().generate({type:'nodebuffer',compression:'DEFLATE'});
}
module.exports={buildContract,formatDate:value=>dateParts(value).formatted};
