'use strict';
const stages = [
  {title:'Договор', fields:[['number','Номер договора','text'],['date','Дата договора','date'],['managerPhone','Телефон менеджера','tel']]},
  {title:'Клиент', fields:[['fullName','Фамилия, имя, отчество','text'],['birthDate','Дата рождения','date'],['phone','Телефон клиента','tel'],['email','Электронная почта клиента','email'],['inn','ИНН','text']]},
  {title:'Паспорт и адрес', fields:[['passportSeries','Серия паспорта','text'],['passportNumber','Номер паспорта','text'],['passportDate','Дата выдачи','date'],['passportAuthority','Кем выдан','text'],['passportCode','Код подразделения','text'],['address','Адрес регистрации','text']]},
  {title:'Автомобиль', fields:[['body','Тип кузова','text'],['brand','Марка','text'],['model','Модель','text'],['carYear','Год выпуска','number'],['engine','Объём или мощность двигателя','text'],['engineType','Тип двигателя','text'],['drive','Привод','text'],['gearbox','КПП','text'],['configuration','Комплектация','text'],['color','Цвет','text'],['mileage','Пробег','text'],['payment','Сумма платежа','text'],['other','Иное','text']]},
  {title:'Проверка', fields:[]}
];
module.exports=stages;
