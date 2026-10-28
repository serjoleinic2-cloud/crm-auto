'use strict';
const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const {formatDate} = require('./contract');
async function buildConsent(pdfPath, fontPath, data) {
 const required={fullName:'ФИО клиента',passportSeries:'серию паспорта',passportNumber:'номер паспорта',passportDate:'дату выдачи паспорта',passportAuthority:'орган, выдавший паспорт',passportCode:'код подразделения',address:'адрес регистрации'};
 const missing=Object.keys(required).filter(k=>!String(data[k]??'').trim()).map(k=>required[k]);
 if(missing.length) throw new Error('Заполните: '+missing.join(', ')+'.');
 const doc=await PDFDocument.load(fs.readFileSync(pdfPath)); doc.registerFontkit(fontkit);
 const font=await doc.embedFont(fs.readFileSync(fontPath),{subset:true});
 const page=doc.getPage(0), height=page.getHeight(), size=8.5;
 function draw(text,x,top,width) {
  if(font.widthOfTextAtSize(text,size)>width) throw new Error('Поле слишком длинное для бланка согласия. Проверьте данные.');
  page.drawText(text,{x,y:height-top-10,size,font,color:rgb(0,0,0)});
 }
 function drawWrapped(text,x,top,firstWidth) {
  const words=text.trim().split(/\s+/), lines=['']; let idx=0;
  for(const word of words){const candidate=lines[idx] ? lines[idx]+' '+word : word; const width=idx===0?firstWidth:462;
   if(font.widthOfTextAtSize(candidate,size)>width){if(idx===1 || font.widthOfTextAtSize(word,size)>462) throw new Error('Данные не помещаются в бланк согласия. Проверьте длину адреса и органа выдачи.');idx=1;lines.push(word)} else lines[idx]=candidate;
  }
  draw(lines[0],x,top,firstWidth);if(lines[1]) draw(lines[1],85.2,top+12.65,462);
 }
 draw(data.fullName.trim(),100,96.8,445);
 draw('Паспорт гражданина РФ',270,135.8,270);
 draw(`${data.passportSeries.trim()} ${data.passportNumber.trim()}`,160,148.5,380);
 draw(formatDate(data.passportDate),151,161.1,390);
 drawWrapped(`${data.passportAuthority.trim()}, ${data.passportCode.trim()}`,342,173.8,204);
 drawWrapped(data.address.trim(),281,199.1,265);
 return Buffer.from(await doc.save());
}
module.exports={buildConsent};
