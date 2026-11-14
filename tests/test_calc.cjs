// Автотест расчёта заказа: calc.js против Python-эталона (order_core.calc).
// Запуск из папки mini-app:  node tests/test_calc.cjs
// Код выхода 1, если хоть один заказ разошёлся.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '..');

// эталон живёт в папке бота — ищем её в привычных местах
const BOT_DIR = [process.env.KITCHEN_BOT,
  path.resolve(APP_DIR, '..', 'бот'),
  'C:\\Users\\pchel\\Desktop\\Кухня\\бот',
  '/opt/zakaz-bot'].filter(Boolean)
  .find(p => fs.existsSync(path.join(p, 'order_core.py')));
if (!BOT_DIR) {
  console.log('папка бота не найдена — тест пропущен (укажи KITCHEN_BOT)');
  process.exit(0);
}

const PYTHON = [process.env.PYTHON_BIN,
  'C:\\Users\\pchel\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe',
  'python', 'python3'].filter(Boolean)
  .find(p => !/[\\/]/.test(p) || fs.existsSync(p));

// ---------- calc.js + data.js в песочнице ----------
global.window = {};
eval(fs.readFileSync(path.join(APP_DIR, 'data.js'), 'utf8'));
eval(fs.readFileSync(path.join(APP_DIR, 'calc.js'), 'utf8'));
const A = global.window.APP, D = global.window.DATA;

// ---------- 50 контрольных заказов ----------
const full = []; for (let i = 1; i <= 28; i++) full.push(i);
const daySets = [
  { label: '1-3', days: [1, 2, 3] },
  { label: '15-17', days: [15, 16, 17] },
  { label: '7', days: [7] },
  { label: '28-3 (стык)', days: [28, 1, 2, 3] },
  { label: '26-2 (стык)', days: [26, 27, 28, 1, 2] },
  { label: '1', days: [1] },
  { label: '14', days: [14] },
  { label: '28', days: [28] },
  { label: 'полный цикл', days: full },
  { label: '10-14', days: [10, 11, 12, 13, 14] },
];
const peopleSets = [
  { label: '5/5/5, запас 0', people: { 'Завтрак': 5, 'Обед': 5, 'Ужин': 5 }, reserve: 0 },
  { label: '5/5/5, запас 5', people: { 'Завтрак': 5, 'Обед': 5, 'Ужин': 5 }, reserve: 5 },
  { label: '40/40/25, запас 0', people: { 'Завтрак': 40, 'Обед': 40, 'Ужин': 25 }, reserve: 0 },
  { label: '40/40/25, запас 5', people: { 'Завтрак': 40, 'Обед': 40, 'Ужин': 25 }, reserve: 5 },
  { label: '100/100/100, запас 0', people: { 'Завтрак': 100, 'Обед': 100, 'Ужин': 100 }, reserve: 0 },
];

const cases = [];
daySets.forEach(ds => peopleSets.forEach(ps => cases.push({ days: ds.days, people: ps.people, reserve: ps.reserve, label: `дни ${ds.label}; ${ps.label}` })));
if (cases.length !== 50) { console.error('ожидалось 50 заказов, собралось ' + cases.length); process.exit(1); }

// ---------- эталон: один вызов Python на все заказы ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitchen-test-'));
const casesFile = path.join(tmp, 'cases.json');
const resultsFile = path.join(tmp, 'results.json');
const helperFile = path.join(tmp, 'pyref.py');
fs.writeFileSync(casesFile, JSON.stringify(cases.map(c => ({ days: c.days, people: c.people, reserve: c.reserve }))), 'utf8');
fs.writeFileSync(helperFile, [
  'import json, sys',
  'sys.path.insert(0, ' + JSON.stringify(BOT_DIR) + ')',
  'import order_core as oc',
  'rows, rec = oc.load()',
  'cases = json.load(open(sys.argv[1], encoding="utf-8"))',
  'out = [oc.calc(rows, rec, c["days"], c["people"], c["reserve"]) for c in cases]',
  'json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)',
].join('\n'), 'utf8');

execFileSync(PYTHON, ['-X', 'utf8', helperFile, casesFile, resultsFile], { stdio: ['ignore', 'inherit', 'inherit'] });
const expected = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

// ---------- сравнение ----------
let failed = 0;
cases.forEach((c, i) => {
  const js = A.calc(D.menu, D.recipes, c.days, c.people, c.reserve);
  const py = expected[i];
  const keys = Array.from(new Set(Object.keys(js).concat(Object.keys(py)))).sort();
  const diffs = [];
  keys.forEach(p => {
    const a = js[p] || 0, b = py[p] || 0;
    if (a !== b) diffs.push(`    ${p}: calc.js = ${a}, эталон = ${b}`);
  });
  if (diffs.length) {
    failed++;
    console.log(`РАСХОЖДЕНИЕ #${i + 1}: ${c.label}`);
    console.log(diffs.join('\n'));
  } else {
    console.log(`OK #${i + 1}: ${c.label} (${Object.keys(py).length} позиций)`);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\nИТОГ: ${failed} из ${cases.length} заказов разошлись` : `\nИТОГ: все ${cases.length} заказов совпали с эталоном`);
process.exit(failed ? 1 : 0);
