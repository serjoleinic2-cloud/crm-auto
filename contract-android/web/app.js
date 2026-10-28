'use strict';
(()=>{
 const core=ContractDocuments,stages=core.stages;
 const parse=value=>{const result=JSON.parse(value);if(result.error)throw Error(result.error);return result};
 let state,data,step=0;
 const $=selector=>document.querySelector(selector);
 const notify=message=>{$('#status').textContent=message;$('#status').hidden=!message};
 try{state=parse(Android.getState());data=core.normalize(state.draft||{})}catch{notify('Не удалось прочитать черновик. Закройте и откройте приложение.');return}
 const persist=()=>{try{parse(Android.saveDraft(JSON.stringify(data)))}catch{notify('Не удалось сохранить черновик на телефоне. Проверьте свободное место.')}};
 const focus=()=>{$('#heading').focus();window.scrollTo(0,0)};
 function documents(){
  const list=$('#document-list');list.replaceChildren();$('#documents').hidden=!state.documents?.length;
  for(const doc of state.documents||[]){const row=document.createElement('div');row.className='document';const label=document.createElement('p');label.textContent=doc.name;const button=document.createElement('button');button.type='button';button.textContent='Переслать';button.dataset.share=doc.id;button.onclick=()=>{try{parse(Android.shareDocument(doc.id));notify('Выберите приложение в системном меню «Переслать».')}catch(error){notify(error.message)}};row.append(label,button);list.append(row)}
 }
 function render(){
  $('#heading').textContent=stages[step].title;$('#progress').textContent=`Шаг ${step+1} из ${stages.length}`;
  const nav=$('#steps');nav.replaceChildren();stages.forEach((stage,index)=>{const button=document.createElement('button');button.type='button';button.textContent=`${index+1}. ${stage.title}`;button.setAttribute('aria-current',step===index?'step':'false');button.onclick=()=>{step=index;render();focus()};nav.append(button)});
  const fields=$('#fields');fields.replaceChildren();
  if(step===stages.length-1){for(const group of stages.slice(0,-1)){const section=document.createElement('section');section.className='review-group';const heading=document.createElement('h3');heading.textContent=group.title;section.append(heading);for(const [key,label] of group.fields){const row=document.createElement('p');row.className='review-row';const title=document.createElement('span');title.textContent=label;row.append(title,document.createTextNode(data[key]||'Не заполнено'));section.append(row)}fields.append(section)}}
  for(const [key,label,type] of stages[step].fields){const wrapper=document.createElement('label');wrapper.textContent=label;const input=document.createElement('input');input.name=key;input.type=type;input.value=data[key]||'';input.autocomplete='off';input.setAttribute('autocorrect','off');input.required=!['mileage','other'].includes(key);core.formats.attach(input,key);input.addEventListener('input',()=>{data[key]=input.value;persist()});wrapper.append(input);fields.append(wrapper)}
  $('#back').hidden=step===0;$('#next').hidden=step===stages.length-1;$('#create').hidden=step!==stages.length-1;documents();
 }
 $('#form').onsubmit=event=>{event.preventDefault();if(!$('#form').reportValidity())return;if(step<stages.length-1){step++;render();focus()}};
 $('#back').onclick=()=>{if(step>0){step--;render();focus()}};
 $('#new').onclick=()=>{$('#reset-dialog').hidden=false;$('#reset-cancel').focus()};
 $('#reset-cancel').onclick=()=>{$('#reset-dialog').hidden=true;$('#new').focus()};
 $('#reset-confirm').onclick=()=>{try{state=parse(Android.newDraft());data=state.draft;step=0;$('#reset-dialog').hidden=true;notify('Новый договор. Телефон менеджера сохранён.');render();focus()}catch(error){notify(error.message)}};
 async function generate(kind){
  document.querySelectorAll('.generate').forEach(button=>button.disabled=true);notify('Создаём документ на телефоне…');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{const file=core.generate(kind,data);parse(Android.saveDocument(file.base64,file.name,kind));state=parse(Android.getState());documents();notify('Word-документ готов. Нажмите «Переслать» ниже.');$('#documents').scrollIntoView({block:'start',behavior:'smooth'})}catch(error){notify(error.message||'Не удалось создать документ.')}finally{document.querySelectorAll('.generate').forEach(button=>button.disabled=false)}
 }
 $('#contract').onclick=()=>generate('contract');$('#consent').onclick=()=>generate('consent');
 window.onNativeError=message=>notify(message);
 window.androidBack=()=>{if(!$('#reset-dialog').hidden){$('#reset-cancel').click();return true}if(step>0){step--;render();focus();return true}return false};
 render();persist();
})();
