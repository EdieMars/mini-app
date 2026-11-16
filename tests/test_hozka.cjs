// Тест вкладки «Хозка»: список, количества, склонение, копирование, очистка.
// Запуск из папки mini-app-git:  node tests/test_hozka.cjs
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
  function itemByName(name) {
    var all = document.querySelectorAll('#hozkaList .hz-item'), found = null;
    Array.prototype.forEach.call(all, function (r) {
      var inp = r.querySelector('.hz-qty');
      if (!found && inp && inp.getAttribute('data-name') === name) found = r;
    });
    return found;
  }
  function type(name, v) {
    var r = itemByName(name);
    var inp = r.querySelector('.hz-qty');
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function total() {
    return parseInt(document.getElementById('hozkaTotal').querySelector('b').textContent, 10);
  }
  try {
    // 1. вкладка есть
    var nav = document.querySelectorAll('.nav button');
    check('во вкладках 4 кнопки', nav.length, 4);
    var tab = document.querySelector('.nav button[data-screen="hozka"]');
    check('кнопка «Хозка» есть', !!tab, true);
    tab.click();
    check('экран хозки открыт', !document.getElementById('screen-hozka').classList.contains('hidden'), true);
    check('экран заказа скрыт', document.getElementById('screen-order').classList.contains('hidden'), true);

    // 2. список отрисован
    var items = document.querySelectorAll('#hozkaList .hz-item');
    check('позиций в списке больше 60', items.length > 60, true);
    check('три группы', document.querySelectorAll('#hozkaList .hz-group').length, 3);
    check('пункты меню в подсказке тары', /Суп/.test(document.getElementById('hozkaList').textContent), true);

    // 3. количества и итог
    type('Банка 0,485', '2');
    type('Мусорные пакеты 60 л', '5');
    check('итог: две позиции', total(), 2);

    // 4. копия в формате заказа, со склонением
    var cap = null;
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: function (s) { cap = s; return Promise.resolve(); } }
      });
    } catch (e) {}
    document.getElementById('hozkaCopy').click();
    var txt = cap || document.getElementById('copyText').value || '';
    check('копия: обращение к Юлии', txt.indexOf('Юлия, доброе утро!') === 0, true);
    check('копия: строка «Заказ на завтра.»', txt.indexOf('Заказ на завтра.') > 0, true);
    check('копия: 2 коробки', txt.indexOf('Банка 0,485 2 коробки') > 0, true);
    check('копия: 5 штук', txt.indexOf('Мусорные пакеты 60 л 5 штук') > 0, true);

    // 5. склонение на других единицах
    type('Бутылка 1 л + крышка', '1');
    type('Банка 0,485', '1');
    cap = null;
    document.getElementById('hozkaCopy').click();
    txt = cap || document.getElementById('copyText').value || '';
    check('1 упаковка (не «упаковок»)', txt.indexOf('Бутылка 1 л + крышка 1 упаковка') > 0, true);
    check('1 коробка (не «коробок»)', txt.indexOf('Банка 0,485 1 коробка') > 0, true);

    // 6. значения переживают переключение вкладок
    document.querySelector('.nav button[data-screen="order"]').click();
    document.querySelector('.nav button[data-screen="hozka"]').click();
    var again = itemByName('Бутылка 1 л + крышка').querySelector('.hz-qty');
    check('после возврата значение на месте', again.value, '1');
    check('после возврата итог тот же', total(), 3);

    // 7. очистка
    document.getElementById('hozkaClear').click();
    check('после очистки итог 0', total(), 0);
    check('после очистки поля пустые',
      itemByName('Банка 0,485').querySelector('.hz-qty').value, '');
  } catch (e) { out.errors.push('исключение: ' + e.message); }
  var pre = document.createElement('pre'); pre.id = 'TESTOUT'; pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>`;

const tmp = path.join(APP, '_hozka_test.html');
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
console.log(res.errors.length ? '\nИТОГ: ' + res.errors.length + ' проблем' : '\nИТОГ: вкладка хозки работает');
process.exit(res.errors.length ? 1 : 0);
