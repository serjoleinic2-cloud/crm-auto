import fs from 'node:fs';
import PizZip from 'pizzip';
export function fixGearboxIndent(bytes){
 const zip=new PizZip(bytes),xml=zip.file('word/document.xml').asText();let found=0;
 const updated=xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g,paragraph=>{
  if(!paragraph.includes('{gearbox}'))return paragraph;
  found++;if(paragraph.includes('<w:ind w:left="0" w:right="0" w:firstLine="0"/>'))return paragraph;if(!paragraph.includes('<w:ind w:left="-567"/>'))throw Error('Unexpected gearbox paragraph formatting');
  return paragraph.replace('<w:ind w:left="-567"/>','<w:ind w:left="0" w:right="0" w:firstLine="0"/>');
 });
 if(found!==1)throw Error('Expected one gearbox paragraph');
 zip.file('word/document.xml',updated);return zip.generate({type:'nodebuffer',compression:'DEFLATE'});
}
if(process.argv[1]&&new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\','/'))){const file=process.argv[2];fs.writeFileSync(file,fixGearboxIndent(fs.readFileSync(file)));}
