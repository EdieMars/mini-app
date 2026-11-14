// Тест данных: единицы выхода лежат в data.js (menu[].out_units), а не в названии блюда.
// Запуск из папки mini-app-git:  node tests/test_data_units.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const OK_UNITS = ['г', 'мл', 'шт'];
const errors = [];

// --- 1. проверки самого файла данных ---
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(APP, 'data.js'), 'utf8'), ctx);
const D = ctx.window.DATA;

let checked = 0;
const stats = {};
D.menu.forEach((r, i) => {
  const out = String(r.out || '').trim();
  if (!out) return;                       // блюдо без выхода — не проверяем
  checked++;
  const parts = out.split('/');
  if (!Array.isArray(r.out_units)) { errors.push(`строка ${i} (${r.dish}): нет out_units`); return; }
  if (r.out_units.length !== parts.length) {
    errors.push(`строка ${i} (${r.dish}): единиц ${r.out_units.length}, частей ${parts.length}`);
  }
  r.out_units.forEach(u => {
    if (OK_UNITS.indexOf(u) < 0) errors.push(`строка ${i} (${r.dish}): единица «${u}»`);
    stats[u] = (stats[u] || 0) + 1;
  });
  if (r.out_units.indexOf('шт') >= 0 && !/^\d+$/.test(parts[0])) {
    errors.push(`строка ${i} (${r.dish}): штучное, но выход «${out}»`);
  }
});

console.log('строк с выходом проверено: ' + checked);
console.log('единицы: ' + Object.keys(stats).sort().map(u => u + ' — ' + stats[u]).join(', '));

// --- 2. проверка на экране: единица берётся из данных, даже если название новое ---
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const inject = `
<script>
(function () {
  var out = { steps: [], errors: [] };
  function check(n, got, want) {
    if (got === want) out.steps.push('OK ' + n);
    else { out.steps.push('ПЛОХО ' + n + ': ' + got + ' вместо ' + want); out.errors.push(n); }
  }
  try {
    var D = window.DATA, A = window.APP;
    var day = A.dateToDay(new Date());
    // новое блюдо, которого нет в правилах по названию; единица — из данных
    D.menu.push({ day_no: day, meal: 'Завтрак', dish: 'Какао с молоком', out: '200', out_units: ['мл'] });
    // блюдо без единиц в данных — должно сработать старое правило (г)
    D.menu.push({ day_no: day, meal: 'Завтрак', dish: 'Пудинг пробный', out: '150' });
    document.querySelector('.nav button[data-screen="menu"]').click();

    var rows = [].slice.call(document.querySelectorAll('#menuDay .dish'));
    function find(name) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].querySelector('.name').textContent.trim() === name) return rows[i];
      }
      return null;
    }
    var cacao = find('Какао с молоком'), puding = find('Пудинг пробный');
    check('какао найдено на экране', !!cacao, true);
    check('какао: единица из данных', cacao && cacao.querySelector('.out').textContent.trim(), '200 мл');
    check('без единиц в данных: старый способ', puding && puding.querySelector('.out').textContent.trim(), '150 г');
  } catch (e) { out.errors.push('исключение: ' + e.message); }
  var pre = document.createElement('pre'); pre.id = 'R'; pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>`;

const tmp = path.join(APP, '_units_data_test.html');
fs.writeFileSync(tmp, html.replace('</body>', inject + '</body>'), 'utf8');
const browser = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(b => fs.existsSync(b));
let dom = '';
try {
  dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + path.join(require('os').tmpdir(), 'e' + Date.now()),
    '--virtual-time-budget=6000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) { dom = (e.stdout || '').toString(); }
fs.unlinkSync(tmp);

const m = dom.match(/<pre id="R">([\s\S]*?)<\/pre>/);
if (!m) { console.log('ПЛОХО: браузерная часть не отработала'); process.exit(1); }
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
res.steps.forEach(s => console.log(s));
res.errors.forEach(e => { console.log('ПЛОХО ' + e); errors.push(e); });

console.log(errors.length ? '\nИТОГ: ' + errors.length + ' проблем' : '\nИТОГ: единицы лежат в данных');
process.exit(errors.length ? 1 : 0);
