// Проверки API расчёта в приложении: дни, запас по умолчанию, ошибка без рецептуры.
// Запуск из папки mini-app-git:  node tests/test_calc_api.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.resolve(__dirname, '..');
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(APP, 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(APP, 'calc.js'), 'utf8'), ctx);
const A = ctx.window.APP, D = ctx.window.DATA;

let ok = 0;
const bad = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('OK   ' + name); }
  else { bad.push(name); console.log('ПЛОХО ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

// 1. дни: как в боте
check('«15-17»', JSON.stringify(A.parseDays('15-17')) === '[15,16,17]', A.parseDays('15-17'));
check('«с 15 по 17»', JSON.stringify(A.parseDays('с 15 по 17')) === '[15,16,17]', A.parseDays('с 15 по 17'));
check('«15..17»', JSON.stringify(A.parseDays('15..17')) === '[15,16,17]', A.parseDays('15..17'));
check('«15 – 17»', JSON.stringify(A.parseDays('15 – 17')) === '[15,16,17]', A.parseDays('15 – 17'));
check('«дни 15-17»', JSON.stringify(A.parseDays('дни 15-17')) === '[15,16,17]', A.parseDays('дни 15-17'));
check('«28-3» через стык', JSON.stringify(A.parseDays('28-3')) === '[28,1,2,3]', A.parseDays('28-3'));

// 2. запас не передан — не NaN и не пустой заказ
const people = { 'Завтрак': 10, 'Обед': 10, 'Ужин': 10 };
const withoutReserve = A.calcRaw(D.menu, D.recipes, [1], people);
const withZero = A.calcRaw(D.menu, D.recipes, [1], people, 0);
check('calcRaw без запаса не пустой', Object.keys(withoutReserve).length > 0,
  Object.keys(withoutReserve).length);
check('calcRaw без запаса = с запасом 0',
  JSON.stringify(withoutReserve) === JSON.stringify(withZero));
const anyNaN = Object.keys(withoutReserve).some(k => !isFinite(withoutReserve[k]));
check('calcRaw без запаса: без NaN', !anyNaN);

// 3. булочка — своя выпечка, в заказ не попадает
const all = A.calc(D.menu, D.recipes, (function () { var a = []; for (var i = 1; i <= 28; i++) a.push(i); return a; })(),
  { 'Завтрак': 40, 'Обед': 40, 'Ужин': 25 });
check('булочка не заказывается', all['Булочка'] === undefined, all['Булочка']);

// 4. нет рецептуры: все блюда и дни в ошибке
const broken = JSON.parse(JSON.stringify(D.recipes));
delete broken['каша овсяная'];
delete broken['омлет классический'];
let err = '';
try { A.calc(D.menu, broken, [1, 2], { 'Завтрак': 10, 'Обед': 10, 'Ужин': 10 }); }
catch (e) { err = e.message; }
check('ошибка называет несколько блюд',
  err.indexOf('Каша овсяная') >= 0 && err.indexOf('Омлет классический') >= 0, err);
check('ошибка называет дни', /дни: 1–2|дни: 1, 2|дни: 1/.test(err), err);

console.log('\nИТОГ: ' + ok + ' проверок прошло, ' + bad.length + ' проблем');
process.exit(bad.length ? 1 : 0);
