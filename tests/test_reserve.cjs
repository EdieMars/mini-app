// Тест остатков: вычитание ДО округления, сохранение при пересчёте, копия без закрытых позиций.
// Запуск из папки mini-app-git:  node tests/test_reserve.cjs
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
  function qtyText(row) { return row.querySelector('[data-role="qty"]').textContent.trim(); }
  function rowOf(name) {
    var all = document.querySelectorAll('#resultList .item'), found = null;
    Array.prototype.forEach.call(all, function (r) { if (!found && r.getAttribute('data-product') === name) found = r; });
    return found;
  }
  function type(input, v) {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  try {
    var A = window.APP, D = window.DATA;

    // заказ на один день: 16.11.2026 = день 1
    document.getElementById('from').value = '16.11';
    document.getElementById('to').value = '';
    document.getElementById('b').value = '40';
    document.getElementById('l').value = '40';
    document.getElementById('d').value = '25';
    document.getElementById('calculate').click();

    var raw = A.calcRaw(D.menu, D.recipes, [1], { 'Завтрак': 40, 'Обед': 40, 'Ужин': 25 }, 0);
    var rows = document.querySelectorAll('#resultList .item');
    check('строки заказа появились', rows.length > 0, true);
    check('у строки есть поле «есть»', rows[0].querySelectorAll('.item-stock').length, 1);

    var first = rows[0];
    var firstName = first.getAttribute('data-product');
    var firstUnit = first.getAttribute('data-unit');
    check('до остатков число = «сырое» вверх',
      qtyText(first), Math.ceil(raw[firstName] - 1e-9) + ' ' + firstUnit);

    var totalBefore = parseInt(document.getElementById('resultTotal').querySelector('b').textContent, 10);

    // 1. дробный остаток округляется ВНИЗ: 0,8 кг считаем как 0 — заказ больше, зато не пусто
    var frac = null;
    Array.prototype.forEach.call(rows, function (r) {
      var n = r.getAttribute('data-product'), v = raw[n];
      if (!frac && v > 3 && Math.abs(v - Math.round(v)) > 0.1) frac = { row: r, name: n, v: v };
    });
    check('есть позиция с дробным количеством', !!frac, true);
    if (frac) {
      var u = frac.row.getAttribute('data-unit');
      type(frac.row.querySelector('.item-stock'), '0,8');
      check('0,8 зачли как 0 — число не уменьшилось',
        qtyText(frac.row), Math.ceil(frac.v - 1e-9) + ' ' + u);
      check('подпись «зачли 0»',
        frac.row.querySelector('[data-role="note"]').textContent, 'зачли 0');
      type(frac.row.querySelector('.item-stock'), '2,7');
      check('2,7 зачли как 2',
        qtyText(frac.row), Math.ceil(frac.v - 2 - 1e-9) + ' ' + u);
      type(frac.row.querySelector('.item-stock'), '2');
      check('целые 2 кг вычтены полностью',
        qtyText(frac.row), Math.ceil(frac.v - 2 - 1e-9) + ' ' + u);
      check('подписи нет при целом остатке',
        frac.row.querySelector('[data-role="note"]').textContent, '');
      type(frac.row.querySelector('.item-stock'), '');
      check('пустое поле вернуло исходное число',
        qtyText(frac.row), Math.ceil(frac.v - 1e-9) + ' ' + u);
    }

    // 2. позиция закрывается остатком целиком
    var need = Math.ceil(raw[firstName] - 1e-9);
    type(first.querySelector('.item-stock'), String(need));
    check('закрытая позиция помечена', first.classList.contains('closed'), true);
    check('закрытая позиция показывает 0', qtyText(first), '0 ' + firstUnit);
    var totalAfter = parseInt(document.getElementById('resultTotal').querySelector('b').textContent, 10);
    check('итог уменьшился на 1', totalBefore - totalAfter, 1);

    // 3. больше, чем нужно, — не уходит в минус
    type(first.querySelector('.item-stock'), '999');
    check('999 не даёт минуса', qtyText(first), '0 ' + firstUnit);
    type(first.querySelector('.item-stock'), String(need));

    // 4. пересчёт сохраняет введённые остатки
    document.getElementById('calculate').click();
    var again = rowOf(firstName);
    check('после пересчёта остаток на месте', again.querySelector('.item-stock').value, String(need));
    check('после пересчёта позиция всё ещё закрыта', again.classList.contains('closed'), true);

    // 5. копирование идёт из расчёта, закрытой позиции там нет
    var cap = null;
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: function (s) { cap = s; return Promise.resolve(); } }
      });
    } catch (e) {}
    document.getElementById('copy').click();
    var txt = cap || document.getElementById('copyText').value || '';
    check('копия начинается с «Заказ на»', txt.indexOf('Заказ на') === 0, true);
    check('закрытой позиции нет в копии', txt.indexOf(firstName) < 0, true);
    check('в копии есть позиции', txt.indexOf('—') > 0, true);

    // 6. штучный товар: остаток в штуках
    var piece = null;
    Array.prototype.forEach.call(document.querySelectorAll('#resultList .item'), function (r) {
      if (!piece && r.getAttribute('data-unit') === 'шт') piece = r;
    });
    check('есть позиция в штуках', !!piece, true);
    if (piece) {
      var pn = piece.getAttribute('data-product'), pv = raw[pn];
      type(piece.querySelector('.item-stock'), '1');
      check('остаток 1 шт вычтен',
        qtyText(piece), Math.ceil(pv - 1 - 1e-9) + ' шт');
    }
  } catch (e) { out.errors.push('исключение: ' + e.message); }
  var pre = document.createElement('pre'); pre.id = 'TESTOUT'; pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>`;

const tmp = path.join(APP, '_reserve_test.html');
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
console.log(res.errors.length ? '\nИТОГ: ' + res.errors.length + ' проблем' : '\nИТОГ: остатки работают');
process.exit(res.errors.length ? 1 : 0);
