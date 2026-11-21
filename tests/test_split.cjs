// Тест деления заказа по поставщикам: два текста, хлеба нет.
// Запуск из папки mini-app-git:  node tests/test_split.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

const inject = `
<script>
(function () {
  var out = { steps: [], errors: [] };
  function check(n, got, want) {
    if (String(got) === String(want)) out.steps.push('OK ' + n);
    else { out.steps.push('ПЛОХО ' + n + ': ' + got + ' вместо ' + want); out.errors.push(n); }
  }
  var cap = null;
  function copy(key) {
    cap = null;
    document.getElementById(key).click();
    return cap || '';
  }
  try {
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: function (s) { cap = s; return Promise.resolve(); } }
      });
    } catch (e) {}

    document.getElementById('from').value = '16.11';
    document.getElementById('to').value = '';
    document.getElementById('b').value = '40';
    document.getElementById('l').value = '40';
    document.getElementById('d').value = '25';
    document.getElementById('calculate').click();

    var bf = document.getElementById('copyBf'), ps = document.getElementById('copyPs');
    check('кнопка Балтфуду есть', !!bf, true);
    check('кнопка Прод стару есть', !!ps, true);
    check('у Балтфуда 27 позиций', /27/.test(bf.textContent), true);
    check('у Прод стару 3 позиции', /3/.test(ps.textContent), true);

    var t1 = copy('copyBf');
    check('Балтфуд: обращение', t1.indexOf('Максим, привет!') === 0, true);
    check('Балтфуд: строка заказа', t1.indexOf('Заказ на завтра.') > 0, true);
    check('Балтфуд: картофель на месте', t1.indexOf('Картофель 15 кг') > 0, true);
    check('Балтфуд: мяса Прод стару нет', t1.indexOf('Кура филе') < 0, true);
    check('Балтфуд: хлеба нет', t1.indexOf('Хлеб') < 0, true);
    check('Балтфуд: булочки нет', t1.indexOf('Булочка') < 0, true);

    var t2 = copy('copyPs');
    check('Прод стар: обращение', t2.indexOf('Андрей, добрый день!') === 0, true);
    check('Прод стар: адрес', t2.indexOf('Рощинская 23') > 0, true);
    check('Прод стар: кура филе', t2.indexOf('Кура филе 5 кг') > 0, true);
    check('Прод стар: свинина', t2.indexOf('Свинина корейка 5 кг') > 0, true);
    check('Прод стар: без овощей', t2.indexOf('Картофель') < 0, true);
    check('Прод стар: хлеба нет', t2.indexOf('Хлеб') < 0, true);

    // день заказа
    var day = document.getElementById('orderDay');
    day.value = 'четверг';
    day.dispatchEvent(new Event('input', { bubbles: true }));
    var t3 = copy('copyPs');
    check('день подставляется', t3.indexOf('Заказ на четверг.') > 0, true);
    day.value = 'завтра';
    day.dispatchEvent(new Event('input', { bubbles: true }));

    // блоки через пустую строку
    check('разделы разделены пустой строкой', /\\n\\n/.test(t1), true);
  } catch (e) { out.errors.push('исключение: ' + e.message); }
  var pre = document.createElement('pre'); pre.id = 'TESTOUT'; pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>`;

const tmp = path.join(APP, '_split_test.html');
fs.writeFileSync(tmp, html.replace('</body>', inject + '</body>'), 'utf8');
const browser = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(b => fs.existsSync(b));
let dom = '';
try {
  dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + path.join(os.tmpdir(), 'e' + Date.now()),
    '--virtual-time-budget=6000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) { dom = (e.stdout || '').toString(); }
fs.unlinkSync(tmp);

const m = dom.match(/<pre id="TESTOUT">([\s\S]*?)<\/pre>/);
if (!m) { console.log('ПЛОХО: тест не отработал'); process.exit(1); }
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
res.steps.forEach(s => console.log(s));
console.log(res.errors.length ? '\nИТОГ: ' + res.errors.length + ' проблем' : '\nИТОГ: деление по поставщикам работает');
process.exit(res.errors.length ? 1 : 0);
