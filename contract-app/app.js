'use strict';
const stages = [
  {title:'Договор', fields:[['number','Номер договора','text'],['date','Дата договора','date'],['managerPhone','Телефон менеджера','tel']]},
  {title:'Клиент', fields:[['fullName','Фамилия, имя, отчество','text'],['birthDate','Дата рождения','date'],['phone','Телефон клиента','tel'],['email','Электронная почта клиента','email'],['inn','ИНН','text']]},
  {title:'Паспорт и адрес', fields:[['passportSeries','Серия паспорта','text'],['passportNumber','Номер паспорта','text'],['passportDate','Дата выдачи','date'],['passportAuthority','Кем выдан','text'],['passportCode','Код подразделения','text'],['address','Адрес регистрации','text']]},
  {title:'Автомобиль', fields:[['body','Тип кузова','text'],['brand','Марка','text'],['model','Модель','text'],['carYear','Год выпуска','number'],['engine','Объём или мощность двигателя','text'],['engineType','Тип двигателя','text'],['drive','Привод','text'],['gearbox','КПП','text'],['configuration','Комплектация','text'],['color','Цвет','text'],['mileage','Пробег','text'],['payment','Сумма платежа','text'],['other','Иное','text']]},
  {title:'Проверка', fields:[]}
];
let step=0;
let data={};
const status=document.querySelector('#status');
function notify(message){ status.textContent=message; }
function focusStep(){ (fields.querySelector('input') || document.querySelector('#heading')).focus(); }
try { data=JSON.parse(localStorage.getItem('contract-draft') || '{}'); } catch { data={}; }
const form=document.querySelector('#form'), fields=document.querySelector('#fields');
function render(){
 document.querySelector('#heading').textContent=stages[step].title;
 const nav=document.querySelector('#steps'); nav.replaceChildren();
 stages.forEach((stage,i)=>{const b=document.createElement('button'); b.type='button'; b.textContent=`${i+1}. ${stage.title}`; b.setAttribute('aria-current', i===step?'step':'false'); b.onclick=()=>{step=i;render();focusStep()}; nav.append(b)});
 fields.replaceChildren();
 if(step===stages.length-1){
   stages.slice(0,-1).forEach(group=>{const section=document.createElement('section');const h=document.createElement('h3');h.textContent=group.title;section.append(h);group.fields.forEach(([key,label])=>{const row=document.createElement('p');row.textContent=label+': '+(data[key] || 'не заполнено');section.append(row)});fields.append(section)});
 }
 stages[step].fields.forEach(([key,label,type])=>{const wrapper=document.createElement('label'); wrapper.textContent=label; const input=document.createElement('input'); input.name=key; input.type=type; input.value=data[key]||''; input.autocomplete='off'; input.addEventListener('input',()=>{data[key]=input.value;localStorage.setItem('contract-draft',JSON.stringify(data))}); wrapper.append(input); fields.append(wrapper)});
 document.querySelector('#back').hidden=step===0;
 document.querySelector('#next').textContent=step===stages.length-1?'Создать договор':'Далее';
}
form.addEventListener('submit', async e=>{e.preventDefault(); if(step<stages.length-1){step++;render();focusStep();return} const button=document.querySelector('#next');button.disabled=true;try{const result=await window.contractApp.saveContract(data);if(result.error) notify(result.error);else if(result.ok) notify('Договор сохранён. Проверьте все страницы и данные перед отправкой.')}catch(err){notify('Не удалось создать договор: '+err.message)}finally{button.disabled=false}});
document.querySelector('#back').onclick=()=>{step--;render();focusStep()}; render();

document.querySelector('#consent').onclick=async()=>{try{const result=await window.contractApp.saveConsent(data);if(result.error)notify(result.error);else if(result.ok)notify('Согласие сохранено. Проверьте заполнение перед печатью.')}catch(err){notify('Не удалось создать согласие: '+err.message)}};

const newDialog=document.querySelector('#new-dialog');
document.querySelector('#new').onclick=()=>{newDialog.returnValue='cancel';newDialog.showModal()};
newDialog.addEventListener('close',()=>{
 if(newDialog.returnValue!=='new')return;
 data={managerPhone:data.managerPhone||''};
 localStorage.setItem('contract-draft',JSON.stringify(data));
 step=0;render();notify('Начат новый договор.');focusStep();
});
