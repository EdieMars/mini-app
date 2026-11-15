// Тест подсказки о прошедших днях периода. Даты считаются от «сегодня», поэтому тест не привязан к числу.
// Запуск из папки mini-app-git:  node tests/test_pastdays.cjs
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
  function ddmm(d) {
    return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function day(shift) {
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + shift); return d;
  }
  function visible(el) { return !!el && !el.classList.contains('hidden'); }
  function setPeriod(from, to) {
    document.getElementById('from').value = ddmm(from);
    document.getElementById('to').value = to ? ddmm(to) : '';
    document.getElementById('b').value = '40';
    document.getElementById('l').value = '40';
    document.getElementById('d').value = '25';
    document.getElementById('calculate').click();
  }
  try {
    var y = day(-1), t = day(0), tm = day(1);
    var hint = document.getElementById('pastHint');

    // 1. период в будущем — подсказки нет
    setPeriod(tm, day(2));
    check('будущий период: подсказки нет', visible(hint), false);

    // 2. период с прошедшим днём — подсказка есть, числа не тронуты
    setPeriod(y, tm);
    check('прошедший день: подсказка показана', visible(hint), true);
    check('подсказка называет число прошедших дней', /1 день/.test(hint.textContent), true);
    check('подсказка называет дату', hint.textContent.indexOf(ddmm(y)) >= 0, true);
    check('подсказка предлагает кнопку', !!document.getElementById('startToday'), true);
    check('кнопка подписана сегодняшним числом',
      document.getElementById('startToday').textContent.indexOf(ddmm(t)) >= 0, true);
    check('поле «с какого» не переписано молча',
      document.getElementById('from').value, ddmm(y));

    // 3. остатки работают вместе с подсказкой
    var rows = document.querySelectorAll('#resultList .item');
    var totalBefore = parseInt(document.getElementById('resultTotal').querySelector('b').textContent, 10);
    var first = rows[0];
    var need = parseInt(first.querySelector('[data-role="qty"]').textContent, 10);
    var inp = first.querySelector('.item-stock');
    inp.value = String(need);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    var totalAfter = parseInt(document.getElementById('resultTotal').querySelector('b').textContent, 10);
    check('остаток закрыл позицию', totalBefore - totalAfter, 1);
    check('подсказка не пропала от остатков', visible(hint), true);

    // 4. кнопка «считать с сегодня» обрезает прошедшие дни
    document.getElementById('startToday').click();
    check('период стал с сегодня', document.getElementById('from').value, ddmm(t));
    check('подсказка исчезла', visible(hint), false);
    check('строки заказа пересчитаны', document.querySelectorAll('#resultList .item').length > 0, true);

    // 5. один прошедший день среди нескольких — считаем их верно
    setPeriod(day(-3), day(-1));
    check('весь период позади: подсказка показана', visible(hint), true);
    check('посчитано 3 дня', /3 дня/.test(hint.textContent), true);
  } catch (e) { out.errors.push('исключение: ' + e.message); }
  var pre = document.createElement('pre'); pre.id = 'TESTOUT'; pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>`;

const tmp = path.join(APP, '_pastdays_test.html');
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
console.log(res.errors.length ? '\nИТОГ: ' + res.errors.length + ' проблем' : '\nИТОГ: подсказка работает');
process.exit(res.errors.length ? 1 : 0);
