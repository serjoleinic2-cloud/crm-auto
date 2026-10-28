'use strict';
(function (root) {
  const formats = {
    passportSeries: { groups:[2,2], separator:' ', placeholder:'00 00', pattern:'[0-9]{2} [0-9]{2}' },
    passportCode: { groups:[3,3], separator:'-', placeholder:'222-333', pattern:'[0-9]{3}-[0-9]{3}' },
    phone: { groups:[3,3,2,2], separator:' ', placeholder:'+7 112 299 33 88', pattern:'\\+7 [0-9]{3} [0-9]{3} [0-9]{2} [0-9]{2}', phone:true }
  };
  function specFor(key) { return formats[key === 'managerPhone' ? 'phone' : key]; }
  function digitsFor(value, spec) {
    let digits=String(value || '').replace(/\D/g,'');
    let prefix=0;
    if(spec.phone && (/^\s*\+7/.test(value) || (digits.length>=11 && /^[78]/.test(digits)) || /^[78]$/.test(digits))) {
      digits=digits.slice(1); prefix=1;
    }
    return {digits:digits.slice(0,spec.groups.reduce((sum,n)=>sum+n,0)),prefix};
  }
  function formatValue(key, value) {
    const spec=specFor(key);
    if(!spec)return value;
    const {digits,prefix}=digitsFor(value,spec);
    if(!digits)return spec.phone && prefix ? '+7' : '';
    let offset=0;
    const parts=[];
    for(const length of spec.groups){
      const part=digits.slice(offset,offset+length);
      if(part)parts.push(part);
      offset+=length;
    }
    return (spec.phone?'+7 ':'')+parts.join(spec.separator);
  }
  function formatInput(input, key) {
    const spec=specFor(key);
    if(!spec)return;
    const raw=input.value;
    const caret=input.selectionStart;
    const {prefix}=digitsFor(raw,spec);
    const count=caret===null ? null : Math.max(0,raw.slice(0,caret).replace(/\D/g,'').length-prefix);
    input.value=formatValue(key,raw);
    if(count!==null){
      let position=spec.phone?Math.min(3,input.value.length):0;
      let remaining=count;
      while(position<input.value.length && remaining>0){
        if(/[0-9]/.test(input.value[position]))remaining--;
        position++;
      }
      input.setSelectionRange(position,position);
    }
  }
  function attach(input,key) {
    const spec=specFor(key);
    if(!spec)return;
    input.inputMode='numeric';
    input.placeholder=spec.placeholder;
    input.pattern=spec.pattern;
    input.title='Формат: '+spec.placeholder;
    input.value=formatValue(key,input.value);
    // Delete an adjacent digit when Backspace/Delete meets an inserted separator.
    input.addEventListener('beforeinput',event=>{
      if(!['deleteContentBackward','deleteContentForward'].includes(event.inputType))return;
      const start=input.selectionStart,end=input.selectionEnd;
      if(start===null || start!==end)return;
      const backwards=event.inputType==='deleteContentBackward';
      let index=backwards?start-1:start;
      if(index<0 || index>=input.value.length || /[0-9]/.test(input.value[index]))return;
      while(index>=0 && index<input.value.length && !/[0-9]/.test(input.value[index]))index+=backwards?-1:1;
      if(index<0 || index>=input.value.length || (spec.phone && index<2))return;
      event.preventDefault();
      input.setRangeText('',index,index+1,'start');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    input.addEventListener('input',()=>formatInput(input,key));
  }
  const api={formatValue,attach};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.contractInputFormats=api;
})(globalThis);
