import {fixGearboxIndent} from './fix-gearbox-indent.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),source=path.resolve(root,'../contract-app');
fs.mkdirSync(path.join(root,'web/templates'),{recursive:true});
const entries={};
for(const name of ['contract.js','consent.js','document-filenames.js','input-formats.js']){
 const bytes=fs.readFileSync(path.join(source,name));fs.writeFileSync(path.join(root,'web/vendor',name),bytes);entries[name]=crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
}
for(const name of ['contract.docx','consent.docx']){
 const original=fs.readFileSync(path.join(source,'templates',name));const bytes=name==='contract.docx'?fixGearboxIndent(original):original;fs.writeFileSync(path.join(root,'web/templates',name),bytes);entries['templates/'+name]=crypto.createHash('sha256').update(bytes).digest('hex');
}
const app=fs.readFileSync(path.join(source,'app.js'),'utf8');
const schema=app.slice(app.indexOf('const stages = '),app.indexOf('\nlet step='));
if(!schema.startsWith('const stages = ')||!schema.includes('Сумма платежа'))throw Error('Windows form schema not found');
fs.writeFileSync(path.join(root,'web/vendor/stages.js'),"'use strict';\n"+schema+'\nmodule.exports=stages;\n');
fs.copyFileSync(path.join(source,'assets/logo.svg'),path.join(root,'web/logo.svg'));
fs.copyFileSync(path.join(source,'assets/icon.png'),path.join(root,'app/src/main/res/drawable-nodpi/ic_launcher.png'));
const commit=execFileSync('git',['log','-1','--format=%H','--','.'],{cwd:source,encoding:'utf8'}).trim();
fs.writeFileSync(path.join(root,'web/vendor/provenance.json'),JSON.stringify({windowsCommit:commit,sha256:entries},null,2)+'\n');
console.log('Copied verified Windows generators, formatters and DOCX templates:',commit);

