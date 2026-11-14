// Автотест разбора даты (calc.js parseDate). Запуск: node tests/test_date.cjs
// Ничего из Python не нужно — проверяет только ввод дат, в том числе без точки (iPhone).
'use strict';

const fs = require('fs');
const path = require('path');

// calc.js ищем рядом с тестом или на уровень выше (тест может лежать в tests/)
const APP_DIR = [__dirname, path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')]
  .find(d => fs.existsSync(path.join(d, 'calc.js')));
if (!APP_DIR) { console.error('не нашёл calc.js'); process.exit(1); }
global.window = {};
eval(fs.readFileSync(path.join(APP_DIR, 'calc.js'), 'utf8'));
const A = global.window.APP;

const same = [
  ['16.11', '16.11.2026'],
  ['1611', '16.11.2026'],
  ['16 11', '16.11.2026'],
  ['16/11', '16.11.2026'],
  ['16-11', '16.11.2026'],
  ['16,11', '16.11.2026'],
  [' 16.11 ', '16.11.2026'],
  ['16.11.2026', '16.11.2026'],
  ['16.11.26', '16.11.2026'],
  ['16.11.2026.', '16.11.2026'],
  ['16112026', '16.11.2026'],
  ['0111', '01.11.2026'],
];

const bad = ['', '16', '3111', '3211', '16.13', 'abc', '16.11.x', '1,2,3'];

let failed = 0;
same.forEach(([input, want]) => {
  let got;
  try { got = A.fmtDate(A.parseDate(input)); } catch (e) { got = 'ОШИБКА: ' + e.message; }
  if (got === want) console.log(`OK   "${input}" -> ${got}`);
  else { failed++; console.log(`ПЛОХО "${input}" -> ${got}, ждали ${want}`); }
});
bad.forEach(input => {
  let ok = false;
  try { A.parseDate(input); } catch (e) { ok = true; }
  if (ok) console.log(`OK   "${input}" отвергнута`);
  else { failed++; console.log(`ПЛОХО "${input}" принята, а должна быть ошибка`); }
});

// диапазон без точек, как набирают на айфоне
try {
  const days = A.datesToDays(A.parseDate('1611'), A.parseDate('1811'));
  const got = days.join(',');
  if (got === '1,2,3') console.log(`OK   1611–1811 -> дни ${got}`);
  else { failed++; console.log(`ПЛОХО 1611–1811 -> дни ${got}, ждали 1,2,3`); }
} catch (e) {
  failed++; console.log('ПЛОХО 1611–1811: ' + e.message);
}

// переход через конец цикла
try {
  const days = A.datesToDays(A.parseDate('2811'), A.parseDate('0112'));
  const got = days.join(',');
  if (got === '13,14,15,16') console.log(`OK   2811–0112 -> дни ${got}`);
  else { failed++; console.log(`ПЛОХО 2811–0112 -> дни ${got}, ждали 13,14,15,16`); }
} catch (e) {
  failed++; console.log('ПЛОХО 2811–0112: ' + e.message);
}

console.log(failed ? `\nИТОГ: ${failed} провалов` : '\nИТОГ: всё сходится');
process.exit(failed ? 1 : 0);
