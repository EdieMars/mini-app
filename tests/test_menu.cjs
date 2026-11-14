// Тест меню-слайдера: в headless-браузере подсовываем искусственные свайпы и проверяем,
// что видимый день меняется верно, в том числе при переходе через конец недели.
// Запуск из папки mini-app:  node tests/test_menu.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = [__dirname, path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')]
  .find(d => fs.existsSync(path.join(d, 'index.html')));
if (!APP) { console.error('не нашёл index.html'); process.exit(1); }

const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

const inject = `
<script>
(function () {
  var out = { steps: [], errors: [] };
  function log(name, extra) { out.steps.push(name + (extra ? ': ' + extra : '')); }
  function visibleCard() {
    var track = document.getElementById('menuList');
    var w = document.getElementById('dayView').clientWidth || 320;
    var m = track.style.transform.match(/translate3d\\((-?[\\d.]+)px/);
    var idx = Math.round(Math.abs(parseFloat(m ? m[1] : 0)) / w);
    var card = track.children[idx];
    return card ? card.querySelector('.dayhead') : null;
  }
  function cardDate() {
    var h = visibleCard();
    var m = h && h.textContent.match(/(\\d{2}\\.\\d{2})/);
    return m ? m[1] : '?';
  }
  function cardDay() {
    var h = visibleCard();
    var m = h && h.textContent.match(/день (\\d+)/);
    return m ? parseInt(m[1], 10) : -1;
  }
  function onDot() {
    var dots = document.getElementById('dayDots').children, k = -1;
    for (var i = 0; i < dots.length; i++) if (dots[i].classList.contains('on')) k = i;
    return k;
  }
  function swipe(dx) {
    var el = document.getElementById('dayView');
    function ev(type, x) {
      el.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: 300,
        pointerId: 7, pointerType: 'touch', isPrimary: true
      }));
    }
    ev('pointerdown', 200);
    ev('pointermove', 200 + dx * 0.4);
    ev('pointermove', 200 + dx);
    ev('pointerup', 200 + dx);
  }
  function expect(name, got, want) {
    if (String(got) === String(want)) log('OK ' + name);
    else { log('ПЛОХО ' + name, 'получили ' + got + ', ждали ' + want); out.errors.push(name); }
  }
  function ddmm(d) {
    return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function cycleDay(d) {
    var start = new Date(2026, 10, 16);
    var n = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000) % 28;
    if (n < 0) n += 28;
    return n + 1;
  }
  window.addEventListener('error', function (e) { out.errors.push('исключение: ' + e.message); });

  try {
    document.getElementById('tab-menu').click();
    var today = new Date();
    expect('открылся сегодняшний день', cardDate(), ddmm(today));
    expect('активная точка — сегодня', onDot(), (today.getDay() + 6) % 7);

    swipe(-150);
    expect('свайп влево → следующий день', cardDate(),
      ddmm(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)));
    swipe(150);
    expect('свайп вправо → обратно', cardDate(), ddmm(today));

    // серия вперёд, в том числе через конец недели
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var ok = true;
    for (var i = 0; i < 12; i++) {
      swipe(-150);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      if (cardDate() !== ddmm(d)) { ok = false; log('ПЛОХО серия вперёд на шаге ' + (i + 1), cardDate() + ' вместо ' + ddmm(d)); break; }
    }
    if (ok) log('OK 12 свайпов вперёд — даты идут подряд');

    ok = true;
    for (var j = 0; j < 20; j++) {
      swipe(150);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
      if (cardDate() !== ddmm(d)) { ok = false; log('ПЛОХО серия назад на шаге ' + (j + 1), cardDate() + ' вместо ' + ddmm(d)); break; }
    }
    if (ok) log('OK 20 свайпов назад — даты идут подряд');

    expect('номер дня цикла верный', cardDay(), cycleDay(d));

    document.getElementById('dayDots').children[0].click();
    expect('точка «Пн» → понедельник', onDot(), 0);
    var wd = (d.getDay() + 6) % 7;
    expect('это правда понедельник', cardDate(), ddmm(new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd)));

    document.getElementById('thisWeek').click();
    expect('кнопка «Сегодня»', cardDate(), ddmm(new Date()));
  } catch (e) {
    out.errors.push('исключение: ' + e.message);
  }

  var box = document.createElement('pre');
  box.id = 'TESTOUT';
  box.textContent = JSON.stringify(out);
  document.body.appendChild(box);
})();
<\/script>
`;

const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = browsers.find(b => fs.existsSync(b));
if (!browser) { console.log('браузер (Edge/Chrome) не найден — тест меню пропущен'); process.exit(0); }

const tmp = path.join(APP, '_menu_test_tmp.html');
fs.writeFileSync(tmp, html.replace('</body>', inject + '</body>'), 'utf8');
let dom = '';
try {
  dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=5000', '--dump-dom',
    'file:///' + tmp.replace(/\\/g, '/')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) { dom = (e.stdout || '').toString(); }
fs.unlinkSync(tmp);

const m = dom.match(/<pre id="TESTOUT">([\s\S]*?)<\/pre>/);
if (!m) { console.log('ПЛОХО тест не отработал (нет результата)'); process.exit(1); }
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
res.steps.forEach(s => console.log(s));
console.log(res.errors.length ? `\nИТОГ: ${res.errors.length} проблем` : '\nИТОГ: меню работает как задумано');
process.exit(res.errors.length ? 1 : 0);
