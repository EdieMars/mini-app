// Тест: в «Меню» у каждого блюда выход справа и с единицами (г / мл / шт).
// Запуск из папки mini-app:  node tests/test_menu_units.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

const inject = `
<script>
(function () {
  var out = { rows: 0, pairs: {}, bad: [], style: null, errors: [] };
  window.addEventListener('error', function (e) { out.errors.push('исключение: ' + e.message); });
  try {
    document.querySelector('.nav button[data-screen="menu"]').click();
    var inp = document.getElementById('weekDate');
    for (var n = 0; n < 28; n++) {
      var d = new Date(2026, 10, 16 + n);
      inp.value = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
      inp.dispatchEvent(new Event('change'));
      var dishes = document.querySelectorAll('#menuDay .dish');
      for (var i = 0; i < dishes.length; i++) {
        var nm = dishes[i].querySelector('.name').textContent.trim();
        var ov = dishes[i].querySelector('.out');
        var ot = ov ? ov.textContent.trim() : '';
        out.rows++;
        out.pairs[nm + ' | ' + ot] = 1;
        if (!ov) out.bad.push('нет выхода: ' + nm);
        else if (!/(г|мл|шт)$/.test(ot)) out.bad.push(nm + ' → «' + ot + '»');
      }
    }
    var one = document.querySelector('#menuDay .dish');
    var cs = getComputedStyle(one), co = getComputedStyle(one.querySelector('.out'));
    out.style = { display: cs.display, textAlign: co.textAlign, whiteSpace: co.whiteSpace };
  } catch (e) { out.errors.push('исключение: ' + e.message); }
  var pre = document.createElement('pre');
  pre.id = 'TESTOUT';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>
`;

const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = browsers.find(b => fs.existsSync(b));
if (!browser) { console.log('браузер не найден — тест пропущен'); process.exit(0); }

const tmp = path.join(APP, '_units_test_tmp.html');
fs.writeFileSync(tmp, html.replace('</body>', inject + '</body>'), 'utf8');
let dom = '';
try {
  dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=8000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) { dom = (e.stdout || '').toString(); }
fs.unlinkSync(tmp);

const m = dom.match(/<pre id="TESTOUT">([\s\S]*?)<\/pre>/);
if (!m) { console.log('ПЛОХО: тест не отработал (нет результата)'); process.exit(1); }
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

const pairs = Object.keys(res.pairs).sort((a, b) => a.localeCompare(b, 'ru'));
pairs.forEach(p => console.log('  ' + p));
console.log('\nСтрок проверено: ' + res.rows + ', разных пар: ' + pairs.length);
console.log('Вёрстка: display=' + res.style.display + ', text-align=' + res.style.textAlign +
  ', white-space=' + res.style.whiteSpace);
res.errors.forEach(e => console.log('ОШИБКА ' + e));
res.bad.slice(0, 15).forEach(b => console.log('ПЛОХО ' + b));
const ok = !res.bad.length && !res.errors.length && res.style.display === 'flex' && res.style.textAlign === 'right';
console.log(ok ? '\nИТОГ: выход справа и с единицами у всех строк' : '\nИТОГ: ' + (res.bad.length + res.errors.length) + ' проблем');
process.exit(ok ? 0 : 1);
