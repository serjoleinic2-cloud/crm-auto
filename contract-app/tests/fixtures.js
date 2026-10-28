'use strict';
const fixture={
 number:'TEST-001',date:'2026-10-28',managerPhone:'+7 000 000 00 00',
 fullName:'Испытательный Тест Макетович',birthDate:'1990-01-15',phone:'+7 000 000 00 01',
 email:'test@example.invalid',inn:'000000000000',passportSeries:'00 00',passportNumber:'000000',
 passportDate:'2010-02-20',passportAuthority:'Тестовый отдел',passportCode:'000-000',
 address:'г. Тестовый, ул. Примерная, д. 1',body:'Седан',brand:'Тест',model:'Пример',
 carYear:'2024',engine:'2000',engineType:'Бензин',drive:'Передний',gearbox:'АКПП',
 configuration:'Тест',color:'Белый',payment:'1.950.000 р.'
};
const longFixture={...fixture,number:'TEST-LONG',
 fullName:'Испытательный-Демонстрационный-Образцовый Константин-Александр Владиславович-Всеволодович',
 passportAuthority:'Тестовое управление выдачи документов демонстрационного района города Образцового по региону Проверочных Данных',
 address:'Российская Федерация, Тестовая область, демонстрационный муниципальный округ, город Образцовый, улица Длинного Испытательного Наименования, дом 123, корпус 45, строение 6, квартира 789'
};
module.exports={fixture,longFixture};
