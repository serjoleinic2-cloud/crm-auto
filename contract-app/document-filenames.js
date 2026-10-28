'use strict';
function filenamePart(value) {
 return String(value??'').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'').trim().replace(/\s+/g,'_').replace(/[. _]+$/g,'');
}
function contractFilename(data) {
 const number=filenamePart(String(data.number??'').trim().replace(/^№\s*/,'')) || 'без_номера';
 const names=String(data.fullName??'').trim().split(/\s+/).filter(Boolean);
 const ordered=names.length>1 ? [...names.slice(1),names[0]].join(' ') : names.join(' ');
 const client=filenamePart(ordered) || 'Клиент';
 // Keep the .docx extension and a conservative length for the native Windows dialog.
 const stem=`№${number.slice(0,40)}_Договор_${client}`.slice(0,180).replace(/[. _]+$/g,'');
 return stem+'.docx';
}
module.exports={contractFilename};
