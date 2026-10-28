import {Buffer} from 'buffer';
import contract from './vendor/contract.js';
import consent from './vendor/consent.js';
import filenames from './vendor/document-filenames.js';
import formats from './vendor/input-formats.js';
import stages from './vendor/stages.js';
const normalize=data=>{
 const next={...data};
 for(const key of ['passportSeries','passportCode','phone','managerPhone','payment'])if(next[key])next[key]=formats.formatValue(key,next[key]);
 return next;
};
globalThis.ContractDocuments={stages,formats,normalize,generate(kind,input){
 const data=normalize(input);let bytes,name;
 if(kind==='contract'){bytes=contract.buildContract('contract.docx',data);name=filenames.contractFilename(data)}
 else if(kind==='consent'){bytes=consent.buildConsent('consent.docx',data);name='Согласие.docx'}
 else throw Error('Неизвестный документ.');
 return {name,base64:Buffer.from(bytes).toString('base64')};
}};
