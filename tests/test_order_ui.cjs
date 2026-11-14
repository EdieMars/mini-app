// Тест оформления: итог заказа, сворачивание категорий, плитки разделов.
// Запуск из папки mini-app-git:  node tests/test_order_ui.cjs
'use strict';

const fs = require('fs');
const path = require('path');
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
  function vis(el) { return !!el && !el.classList.contains('hidden') && el.offsetParent !== null; }
  try {
    // заказ на 1 день
    document.getElementById('from').value = '16.11';
    document.getElementById('to').value = '';
    document.getElementById('b').value = '40';
    document.getElementById('l').value = '40';
    document.getElementById('d').value = '25';
    document.getElementById('calculate').click();

    check('результат показан', vis(document.getElementById('output')), true);
    var groups = document.querySelectorAll('#resultList section.group');
    check('категорий в заказе', groups.length > 0, true);
    check('у категории есть кнопка-заголовок', groups[0].querySelectorAll('.group-head').length, 1);
    check('заголовок раскрыт', groups[0].querySelector('.group-head').getAttribute('aria-expanded'), 'true');

    var body = groups[0].querySelector('.group-body');
    check('позиции видны до сворачивания', vis(body), true);
    groups[0].querySelector('.group-head').click();
    check('после клика свернулось', groups[0].classList.contains('collapsed'), true);
    check('позиции спрятаны', vis(body), false);
    check('aria-expanded = false', groups[0].querySelector('.group-head').getAttribute('aria-expanded'), 'false');
    groups[0].querySelector('.group-head').click();
    check('повторный клик развернул', vis(body), true);

    var total = document.getElementById('resultTotal');
    check('итог: число выделено', total.querySelectorAll('b').length, 1);
    check('итог: есть слово «позиций»', /позици/.test(total.textContent), true);
    check('итог: размер числа больше подписи',
      parseFloat(getComputedStyle(total.querySelector('b')).fontSize) >
      parseFloat(getComputedStyle(total).fontSize), true);

    // техкарты: разделы плитками
    document.querySelector('.nav button[data-screen="cards"]').click();
    var cats = document.getElementById('cardCats');
    check('разделы: сетка', getComputedStyle(cats).display, 'grid');
    check('разделы: два столбца', getComputedStyle(cats).gridTemplateColumns.split(' ').length, 2);
    check('разделы: все 8 на месте', cats.querySelectorAll('.category').length, 8);

    // пустой день меню
    var D = window.DATA, saved = D.menu.slice();
    D.menu.length = 0;
    document.querySelector('.nav button[data-screen="menu"]').click();
    document.getElementById('weekDate').value = '20.11';
    document.getElementById('weekDate').dispatchEvent(new Event('change'));
    var menuText = document.getElementById('menuDay').textContent;
    check('пустой день: понятная подсказка', /На этот день меню нет/.test(menuText), true);
    D.menu.push.apply(D.menu, saved);
  } catch (e) { out.errors.push('исключение: ' + e.message); }
  var pre = document.createElement('pre'); pre.id = 'TESTOUT'; pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>`;

const tmp = path.join(APP, '_order_ui_test.html');
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

const m = dom.match(/<pre id="TESTOUT">([\s\S]*?)<\/pre>/);
if (!m) { console.log('ПЛОХО: тест не отработал'); process.exit(1); }
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
res.steps.forEach(s => console.log(s));
console.log(res.errors.length ? '\nИТОГ: ' + res.errors.length + ' проблем' : '\nИТОГ: оформление работает');
process.exit(res.errors.length ? 1 : 0);
