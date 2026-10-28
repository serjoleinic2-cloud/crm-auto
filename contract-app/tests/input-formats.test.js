'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {formatValue}=require('../input-formats');

test('passport series keeps zeros and groups four digits',()=>{
 for(const [raw,expected] of [['0000','00 00'],['12 34','12 34'],['1','1'],['123','12 3'],['123456','12 34'],['','']])assert.equal(formatValue('passportSeries',raw),expected);
});
test('department code groups six digits',()=>{
 for(const [raw,expected] of [['222333','222-333'],['222-333','222-333'],['22','22'],['2223','222-3'],['abc222 333','222-333'],['','']])assert.equal(formatValue('passportCode',raw),expected);
});
test('both phones accept national digits, +7 and domestic 8',()=>{
 for(const key of ['phone','managerPhone']) {
  for(const raw of ['1122993388','71122993388','81122993388','+7 (112) 299-33-88'])assert.equal(formatValue(key,raw),'+7 112 299 33 88');
  assert.equal(formatValue(key,''),'');
  assert.equal(formatValue(key,'+7'),'+7');
  assert.equal(formatValue(key,'+7 1122'),'+7 112 2');
 }
});
test('format is stable across draft restoration and review',()=>{
 for(const [key,value] of [['phone','+7 112 299 33 88'],['passportSeries','00 00'],['passportCode','222-333']])assert.equal(formatValue(key,formatValue(key,value)),value);
 assert.equal(formatValue('fullName','Тестов Тест'),'Тестов Тест');
});

test('payment formats integer rubles without losing digits',()=>{
 for(const [raw,expected] of [['1950000','1.950.000 р.'],['1.950.000 р.','1.950.000 р.'],['195000','195.000 р.'],['1 950 000','1.950.000 р.'],['0001950000','1.950.000 р.'],['0','0 р.'],['',''],['1','1 р.'],['999','999 р.'],['1000','1.000 р.']])assert.equal(formatValue('payment',raw),expected);
 assert.equal(formatValue('payment',formatValue('payment','1950000')),'1.950.000 р.');
});
