import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'app/src/main/assets');
fs.mkdirSync(out,{recursive:true});
const templates={};for(const name of ['contract.docx','consent.docx'])templates[name]=fs.readFileSync(path.join(root,'web/templates',name)).toString('base64');
await build({entryPoints:[path.join(root,'web/core.js')],bundle:true,platform:'browser',format:'iife',target:'chrome90',outfile:path.join(out,'core.js'),minify:true,legalComments:'none',inject:[path.join(root,'web/buffer-inject.js')],plugins:[{name:'embedded-docx',setup(build){build.onResolve({filter:/^fs$/},()=>({path:'templates',namespace:'local-docx'}));build.onLoad({filter:/.*/,namespace:'local-docx'},()=>({contents:`const templates=${JSON.stringify(templates)};module.exports={readFileSync(path){const name=path.split(/[\\\\/]/).pop();if(!templates[name])throw Error('Unknown bundled template');return Buffer.from(templates[name],'base64')}};`,loader:'js'}));}}]});
for(const file of ['index.html','style.css','app.js','logo.svg'])fs.copyFileSync(path.join(root,'web',file),path.join(out,file));
console.log('Built offline assets without network dependencies.');

const notices=[];
for(const name of ['docxtemplater','pizzip','buffer','pako','@xmldom/xmldom','base64-js','ieee754']){
 const folder=path.join(root,'node_modules',name);if(!fs.existsSync(folder))continue;
 const licenses=fs.readdirSync(folder).filter(name=>/^licen[cs]e/i.test(name));
 for(const license of licenses){const file=path.join(folder,license);if(fs.statSync(file).isFile())notices.push(name+' — '+license+'\n'+fs.readFileSync(file,'utf8'))}
}
fs.writeFileSync(path.join(out,'THIRD_PARTY_NOTICES.txt'),notices.join('\n\n--------------------\n\n'));
