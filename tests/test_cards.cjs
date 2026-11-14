// Тест вкладки «Техкарты»: разделы возвращаются, есть «К разделам», счётчик, пустой поиск.
// Запуск из папки mini-app-git:  node tests/test_cards.cjs
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
  function vis(id) { var el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); }
  function check(name, got, want) {
    if (got === want) out.steps.push('OK ' + name);
    else { out.steps.push('ПЛОХО ' + name + ': получили ' + got + ', ждали ' + want); out.errors.push(name); }
  }
  function goCards() { document.querySelector('.nav button[data-screen="cards"]').click(); }
  function note() { return document.getElementById('cardNote').textContent; }
  function backBtn() { return document.getElementById('backCats'); }

  try {
    goCards();
    check('вход: разделы видны', vis('cardCats'), true);
    check('вход: список пуст и скрыт', vis('cardList'), false);

    document.querySelector('#cardCats .category').click();
    check('категория выбрана: разделы скрыты', vis('cardCats'), false);
    check('категория выбрана: список виден', vis('cardList'), true);
    check('есть кнопка «К разделам»', !!backBtn(), true);
    check('счётчик «Найдено»', /^Найдено: \\d+/.test(note()), true);

    backBtn().click();
    check('«К разделам»: разделы вернулись', vis('cardCats'), true);
    check('«К разделам»: список скрыт', vis('cardList'), false);

    document.querySelector('#cardCats .category').click();
    document.querySelector('#cardList button[data-page]').click();
    check('карта открылась', /Количество порций/.test(document.getElementById('cardDetail').textContent), true);
    document.getElementById('backCards').click();
    check('из карты: список с кнопкой «К разделам»', !!backBtn() && vis('cardList'), true);

    document.querySelector('.nav button[data-screen="order"]').click();
    goCards();
    check('ушли и вернулись: разделы видны', vis('cardCats'), true);

    document.getElementById('cardQuery').value = 'абракадабра-из-трех-слов';
    document.getElementById('search').click();
    check('пустой поиск: подпись', /Ничего не найдено/.test(note()), true);
    check('пустой поиск: есть «К разделам»', !!backBtn(), true);
    backBtn().click();
    check('после пустого поиска разделы вернулись', vis('cardCats'), true);

    document.getElementById('cardQuery').value = 'котлета';
    document.getElementById('search').click();
    check('поиск «котлета»: счётчик', /^Найдено: [1-9]/.test(note()), true);
  } catch (e) { out.errors.push('исключение: ' + e.message); }

  var pre = document.createElement('pre');
  pre.id = 'TESTOUT';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>`;

const tmp = path.join(APP, '_cards_test.html');
fs.writeFileSync(tmp, html.replace('</body>', inject + '</body>'), 'utf8');

const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find(b => fs.existsSync(b));
if (!browser) { console.log('браузер не найден — тест пропущен'); process.exit(0); }

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
console.log(res.errors.length ? '\nИТОГ: ' + res.errors.length + ' проблем' : '\nИТОГ: «Техкарты» работают как задумано');
process.exit(res.errors.length ? 1 : 0);
